# Apps/database/views.py
#
# APIViews for the database block system.
#
# Ownership chain: DatabaseView → Block → Page → Workspace → owner
# All querysets filter block__page__workspace__owner=request.user
# Never return 403 — get_object_or_404 with owner check returns 404.
#
# Endpoint map:
#   GET/PATCH   /api/database/<block_id>/                               DatabaseViewDetail
#   GET/POST    /api/database/<block_id>/rows/                          DatabaseRowList
#   PATCH/DEL   /api/database/<block_id>/rows/<row_id>/                 DatabaseRowDetail
#   PATCH       /api/database/<block_id>/rows/<row_id>/cells/<def_id>/  DatabaseCellDetail
#   POST        /api/database/<block_id>/columns/                       DatabaseColumnList
#   PATCH/DEL   /api/database/<block_id>/columns/<col_id>/              DatabaseColumnDetail

from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from Apps.blocks.models import Block
from Apps.pages.models import Page
from Apps.properties.models import PropertyDefinition, PropertyValue

from .models import DatabaseCell, DatabaseColumn, DatabaseRow, DatabaseView
from .serializers import (
    DatabaseCellSerializer,
    DatabaseColumnSerializer,
    DatabaseRowSerializer,
    DatabaseViewSerializer,
)



def _page_to_row(page, view):
    """Convert a Page into a virtual DatabaseRow dict (same shape as DatabaseRowSerializer)."""
    cells = []
    for pv in page.properties.filter(is_deleted=False):
        cells.append({
            'id':           str(pv.id),
            'row':          str(page.id),
            'definition':   str(pv.definition_id),
            'value_text':   pv.value_text,
            'value_number': pv.value_number,
            'value_date':   pv.value_date.isoformat() if pv.value_date else None,
            'value_bool':   pv.value_bool,
            'value_json':   pv.value_json,
        })
    return {
        'id':            str(page.id),
        'database_view': str(view.id),
        'page':          str(page.id),
        'order':         0.0,
        'cells':         cells,
    }


def _get_block(block_id, user):
    """Return the Block, 404 if not owned by user or wrong type."""
    return get_object_or_404(
        Block,
        pk=block_id,
        block_type='database',
        page__workspace__owner=user,
        is_deleted=False,
    )


def _get_or_create_view(block):
    """Auto-create DatabaseView on first access."""
    view, _ = DatabaseView.objects.get_or_create(block=block)
    return view


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Database View
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseViewDetail(APIView):
    """
    GET   /api/database/<block_id>/  → get (or auto-create) the view config
    PATCH /api/database/<block_id>/  → update filters, sorts, hidden_fields, view_type
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, block_id):
        block = _get_block(block_id, request.user)
        view  = _get_or_create_view(block)
        return Response(DatabaseViewSerializer(view).data)

    def patch(self, request, block_id):
        block = _get_block(block_id, request.user)
        view  = _get_or_create_view(block)
        serializer = DatabaseViewSerializer(view, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Rows
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseRowList(APIView):
    """
    GET  /api/database/<block_id>/rows/  → list all rows with their cells
    POST /api/database/<block_id>/rows/  → create a new row (appended at end)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, block_id):
        block = _get_block(block_id, request.user)
        view  = _get_or_create_view(block)
        if view.custom_page_type_id:
            pages = (
                Page.objects
                .filter(
                    custom_page_type=view.custom_page_type,
                    workspace=block.page.workspace,
                    is_deleted=False,
                )
                .prefetch_related('properties__definition')
            )
            return Response([_page_to_row(p, view) for p in pages])
        rows = view.rows.filter(is_deleted=False).prefetch_related('cells')
        return Response(DatabaseRowSerializer(rows, many=True).data)

    def post(self, request, block_id):
        block = _get_block(block_id, request.user)
        view  = _get_or_create_view(block)
        if view.custom_page_type_id:
            page = Page.objects.create(
                workspace=block.page.workspace,
                created_by=request.user,
                title=request.data.get('title', 'Untitled'),
                custom_page_type=view.custom_page_type,
            )
            return Response(_page_to_row(page, view), status=status.HTTP_201_CREATED)
        max_order = view.rows.filter(is_deleted=False).aggregate(
            m=Max('order')
        )['m'] or 0
        row = DatabaseRow.objects.create(
            database_view=view,
            order=max_order + 1.0,
        )
        return Response(DatabaseRowSerializer(row).data, status=status.HTTP_201_CREATED)


class DatabaseRowDetail(APIView):
    """
    PATCH  /api/database/<block_id>/rows/<row_id>/  → update order or page link
    DELETE /api/database/<block_id>/rows/<row_id>/  → soft delete
    """
    permission_classes = [IsAuthenticated]

    def _get_row(self, block_id, row_id, user):
        block = _get_block(block_id, user)
        view  = _get_or_create_view(block)
        return get_object_or_404(DatabaseRow, pk=row_id, database_view=view, is_deleted=False)

    def patch(self, request, block_id, row_id):
        row = self._get_row(block_id, row_id, request.user)
        serializer = DatabaseRowSerializer(row, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, block_id, row_id):
        block = _get_block(block_id, request.user)
        view  = _get_or_create_view(block)
        if view.custom_page_type_id:
            page = get_object_or_404(
                Page, pk=row_id,
                custom_page_type=view.custom_page_type,
                workspace=block.page.workspace,
            )
            page.is_deleted = True
            page.save(update_fields=['is_deleted'])
            return Response(status=status.HTTP_204_NO_CONTENT)
        row = self._get_row(block_id, row_id, request.user)
        row.is_deleted = True
        row.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Cells
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseCellDetail(APIView):
    """
    PATCH /api/database/<block_id>/rows/<row_id>/cells/<def_id>/
      → upsert cell value (create if not exists, update if exists)
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, block_id, row_id, def_id):
        block = _get_block(block_id, request.user)
        view  = _get_or_create_view(block)
        definition = get_object_or_404(
            PropertyDefinition,
            pk=def_id,
            workspace=block.page.workspace,
            is_deleted=False,
        )

        if view.custom_page_type_id:
            # row_id is a Page id in query mode — upsert a PropertyValue
            page = get_object_or_404(
                Page, pk=row_id,
                custom_page_type=view.custom_page_type,
                workspace=block.page.workspace,
                is_deleted=False,
            )
            pv, _ = PropertyValue.objects.get_or_create(page=page, definition=definition)
            for field in ('value_text', 'value_number', 'value_date', 'value_bool', 'value_json'):
                if field in request.data:
                    setattr(pv, field, request.data[field])
            pv.save()
            return Response({
                'id':           str(pv.id),
                'row':          str(page.id),
                'definition':   str(pv.definition_id),
                'value_text':   pv.value_text,
                'value_number': pv.value_number,
                'value_date':   pv.value_date.isoformat() if pv.value_date else None,
                'value_bool':   pv.value_bool,
                'value_json':   pv.value_json,
            })

        row  = get_object_or_404(DatabaseRow, pk=row_id, database_view=view, is_deleted=False)
        cell, _ = DatabaseCell.objects.get_or_create(row=row, definition=definition)
        serializer = DatabaseCellSerializer(cell, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Columns
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseColumnList(APIView):
    """
    POST /api/database/<block_id>/columns/
      → create a PropertyDefinition + DatabaseColumn in one atomic step
      Body: { name, prop_type, options? }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, block_id):
        block = _get_block(block_id, request.user)
        view  = _get_or_create_view(block)

        name      = request.data.get('name', 'Column')
        prop_type = request.data.get('prop_type', 'text')
        options   = request.data.get('options', [])

        max_order = view.columns.filter(is_deleted=False).aggregate(
            m=Max('order')
        )['m'] or 0

        with transaction.atomic():
            definition = PropertyDefinition.objects.create(
                workspace=block.page.workspace,
                name=name,
                prop_type=prop_type,
                options=options,
            )
            col = DatabaseColumn.objects.create(
                database_view=view,
                definition=definition,
                order=max_order + 1.0,
            )

        return Response(DatabaseColumnSerializer(col).data, status=status.HTTP_201_CREATED)


class DatabaseColumnDetail(APIView):
    """
    PATCH  /api/database/<block_id>/columns/<col_id>/  → rename, retype, reorder
    DELETE /api/database/<block_id>/columns/<col_id>/  → soft delete col + definition
    """
    permission_classes = [IsAuthenticated]

    def _get_col(self, block_id, col_id, user):
        block = _get_block(block_id, user)
        view  = _get_or_create_view(block)
        return get_object_or_404(DatabaseColumn, pk=col_id, database_view=view, is_deleted=False)

    def patch(self, request, block_id, col_id):
        col = self._get_col(block_id, col_id, request.user)
        # Column-level fields (order)
        if 'order' in request.data:
            col.order = request.data['order']
            col.save(update_fields=['order'])
        # Definition-level fields (name, prop_type, options)
        defn = col.definition
        changed = []
        for field in ('name', 'prop_type', 'options'):
            if field in request.data:
                setattr(defn, field, request.data[field])
                changed.append(field)
        if changed:
            defn.save(update_fields=changed)
        return Response(DatabaseColumnSerializer(col).data)

    def delete(self, request, block_id, col_id):
        col = self._get_col(block_id, col_id, request.user)
        with transaction.atomic():
            col.definition.is_deleted = True
            col.definition.save(update_fields=['is_deleted'])
            col.is_deleted = True
            col.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Email
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseEmailView(APIView):
    """
    POST /api/database/<block_id>/email/
    Body: { to: [str], subject: str, body: str }

    Sends an email via Django's email backend when EMAIL_HOST is configured.
    Falls back to returning { emails: [str], subject, body } so the frontend
    can copy the addresses to the clipboard instead.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, block_id):
        _get_block(block_id, request.user)  # ownership check

        to      = request.data.get('to', [])
        subject = request.data.get('subject', '')
        body    = request.data.get('body', '')

        if not isinstance(to, list) or not to:
            return Response({'detail': 'to must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from Apps.integrations.sender import send_email as integration_send_email
            result = integration_send_email(user=request.user, to=to, subject=subject, body=body)
            return Response({'sent': True, 'via': result['via'], 'to': to})
        except Exception as exc:
            # No integration and no EMAIL_HOST — return data so frontend can open mailto:
            return Response({'sent': False, 'emails': to, 'subject': subject, 'body': body})
