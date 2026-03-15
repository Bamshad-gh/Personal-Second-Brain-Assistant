# Apps/relations/views.py
"""
Views for the Relations app — Page Links (Phase 1).

What it does:
  Handles creation of page-link connections and retrieval of backlinks.
  Business logic is simple enough to live here (no separate services.py needed).

Endpoints:
  POST /api/relations/                              → create a Connection (page_link)
  GET  /api/relations/pages/{page_id}/backlinks/   → all pages linking to this page

Security rules enforced on every view:
  - permission_classes = [IsAuthenticated] on all views
  - All querysets filter by workspace__owner=request.user
  - Return 404 (not 403) on access denied — never confirm a resource exists to
    unauthorized users (use get_object_or_404 with owner filter baked in)

Files that import this:
  Apps/relations/urls.py
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from Apps.pages.models import Page
from .models import Connection
from .serializers import ConnectionSerializer


# ── POST /api/relations/ ──────────────────────────────────────────────────────

class ConnectionCreateView(APIView):
    """
    POST /api/relations/
    Creates a PAGE_LINK connection between two pages owned by the current user.

    Upserts — get_or_create prevents duplicate links for the same (source, target) pair.
    Returns 201 on create, 200 if the link already existed.

    Request body:
      {
        "conn_type":   "page_link",
        "source_page": "<uuid>",
        "target_page": "<uuid>",
        "metadata":    {}           (optional)
      }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ── Validate required fields ──────────────────────────────────────────
        source_page_id = request.data.get('source_page')
        target_page_id = request.data.get('target_page')
        conn_type      = request.data.get('conn_type', Connection.ConnectionType.PAGE_LINK)

        if not source_page_id or not target_page_id:
            return Response(
                {'detail': 'source_page and target_page are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Verify source page ownership — 404 if not found or not owned ──────
        source_page = get_object_or_404(
            Page,
            pk=source_page_id,
            workspace__owner=request.user,
            is_deleted=False,
        )

        # ── Verify target page ownership — 404 if not found or not owned ──────
        target_page = get_object_or_404(
            Page,
            pk=target_page_id,
            workspace__owner=request.user,
            is_deleted=False,
        )

        # ── Upsert: create connection or return the existing one ───────────────
        connection, created = Connection.objects.get_or_create(
            conn_type=conn_type,
            source_page=source_page,
            target_page=target_page,
            defaults={'metadata': request.data.get('metadata', {})},
        )

        serializer  = ConnectionSerializer(connection)
        http_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=http_status)


# ── GET /api/relations/pages/{page_id}/backlinks/ ─────────────────────────────

class PageBacklinksView(APIView):
    """
    GET /api/relations/pages/{page_id}/backlinks/
    Returns all pages that contain a [[page link]] pointing to this page.

    Security: both the target page and all source pages must belong to request.user.
    The source_page__workspace__owner filter is defence-in-depth — the target
    ownership check already gates access, but the source filter ensures we never
    leak page titles from workspaces the user doesn't own.

    Response shape (list):
      [
        {
          "id":                       "<connection-uuid>",
          "source_page_id":           "<uuid>",
          "source_page_title":        "My Notes",
          "source_page_workspace_id": "<uuid>"
        },
        ...
      ]
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, page_id):
        # ── Verify the target page belongs to this user — 404 if not ──────────
        target_page = get_object_or_404(
            Page,
            pk=page_id,
            workspace__owner=request.user,
            is_deleted=False,
        )

        # ── Fetch all PAGE_LINK connections pointing to this page ─────────────
        # select_related avoids N+1 queries when reading source_page titles
        connections = (
            Connection.objects
            .filter(
                conn_type=Connection.ConnectionType.PAGE_LINK,
                target_page=target_page,
                source_page__workspace__owner=request.user,  # defence-in-depth owner check
                source_page__is_deleted=False,
                is_deleted=False,
            )
            .select_related('source_page', 'source_page__workspace')
            .order_by('source_page__title')  # stable ordering for the UI
        )

        # ── Build the flat response dict the frontend expects ─────────────────
        data = [
            {
                'id':                       str(conn.id),
                'source_page_id':           str(conn.source_page_id),
                'source_page_title':        conn.source_page.title,
                'source_page_workspace_id': str(conn.source_page.workspace_id),
            }
            for conn in connections
        ]

        return Response(data)
