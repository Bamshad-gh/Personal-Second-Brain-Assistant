# Apps/blocks/views.py

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Max
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.conf import settings
from datetime import date
import os
import uuid as uuid_lib

from .models import Block, BLOCK_TYPE_REGISTRY
from .serializers import (
    BlockSerializer,
    BlockCreateSerializer,
    BlockUpdateSerializer,
    BlockTreeSerializer,
    BlockReorderSerializer,
)
from Apps.pages.models import Page
from Apps.relations.models import Connection


# ─────────────────────────────────────────────────────────────────────────────
# Connection sync helper
# ─────────────────────────────────────────────────────────────────────────────

def _sync_page_links(block: Block, content_json: dict) -> None:
    """
    Walk the TipTap JSON tree and collect all pageLink node pageids.
    Create missing PAGE_LINK Connection rows and soft-delete stale ones.

    Only touches connections where:
      - conn_type = PAGE_LINK
      - source_page = this block's page
      - metadata does NOT contain 'relation' key  (preserves parent/child connections)

    Called after every block PATCH that includes a 'content' payload.
    """
    if not block.page_id:
        return

    # ── Collect all target page IDs referenced in current content ────────────
    referenced_ids: set[str] = set()

    def walk(node: object) -> None:
        if not isinstance(node, dict):
            return
        if node.get('type') == 'pageLink':
            attrs = node.get('attrs') or {}
            pid = attrs.get('pageid')
            if pid:
                referenced_ids.add(str(pid))
        for child in node.get('content') or []:
            walk(child)

    walk(content_json)

    source_page_id = block.page_id

    # ── Create missing connections ────────────────────────────────────────────
    for target_id in referenced_ids:
        try:
            target_uuid = uuid_lib.UUID(target_id)
        except (ValueError, AttributeError):
            continue
        Connection.objects.get_or_create(
            conn_type=Connection.ConnectionType.PAGE_LINK,
            source_page_id=source_page_id,
            target_page_id=target_uuid,
            defaults={'metadata': {}, 'is_deleted': False},
        )

    # ── Soft-delete stale connections (source = this page, not in current set) ─
    # Excludes connections that have a 'relation' key in metadata
    # (those are parent/child links created by the page signal, not editor links).
    existing = Connection.objects.filter(
        conn_type=Connection.ConnectionType.PAGE_LINK,
        source_page_id=source_page_id,
        is_deleted=False,
    ).exclude(metadata__has_key='relation')

    for conn in existing:
        if conn.target_page_id and str(conn.target_page_id) not in referenced_ids:
            conn.is_deleted = True
            conn.save(update_fields=['is_deleted'])


# ─────────────────────────────────────────────────────────────────────────────
# Block type registry (public metadata)
# ─────────────────────────────────────────────────────────────────────────────

class BlockTypesView(APIView):
    """
    GET /api/blocks/types/

    Returns BLOCK_TYPE_REGISTRY as a flat list of block type metadata objects.
    The frontend uses this to build the slash menu, canvas block panel, and
    any block-type picker dynamically — no hardcoded lists needed.

    No authentication required — this is public, static metadata.

    HOW TO ADD A NEW BLOCK TYPE:
      Add to BLOCK_TYPE_REGISTRY in models.py.
      This endpoint automatically includes it. No other changes needed.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        types = [
            {
                'block_type':   block_type,
                'category':     info['category'],
                'has_children': info['has_children'],
                'canvas_ok':    info['canvas_ok'],
                'doc_ok':       info['doc_ok'],
            }
            for block_type, info in BLOCK_TYPE_REGISTRY.items()
        ]
        return Response(types)


# ─────────────────────────────────────────────────────────────────────────────
# Block CRUD
# ─────────────────────────────────────────────────────────────────────────────

class BlockListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/blocks/?page=<uuid>  → List blocks for a page (flat, ordered)
    POST /api/blocks/              → Create a new block

    pagination_class = None — disables DRF's default page-number pagination
    so ?page=<uuid> passes through to get_queryset() without being parsed
    as an integer page number (which would raise InvalidPage → 404).
    """

    permission_classes = [IsAuthenticated]
    pagination_class   = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BlockCreateSerializer
        return BlockSerializer

    def get_queryset(self):
        page_id = self.request.query_params.get('page')
        queryset = Block.objects.filter(
            page__workspace__owner=self.request.user,
            is_deleted=False,
        ).select_related('page', 'parent')
        if page_id:
            queryset = queryset.filter(page_id=page_id)
        return queryset.order_by('order')

    def perform_create(self, serializer):
        """Auto-assign order = max + 1 when not provided."""
        if 'order' not in self.request.data:
            page_id   = self.request.data.get('page')
            max_order = Block.objects.filter(
                page_id=page_id,
                is_deleted=False,
            ).aggregate(max_order=Max('order'))['max_order'] or 0
            serializer.save(order=max_order + 1)
        else:
            serializer.save()


class BlockDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/blocks/{id}/  → Retrieve block details
    PATCH  /api/blocks/{id}/  → Update block (partial)
    DELETE /api/blocks/{id}/  → Soft-delete block (and all children)
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return BlockUpdateSerializer
        return BlockSerializer

    def get_queryset(self):
        return Block.objects.filter(
            page__workspace__owner=self.request.user,
            is_deleted=False,
        ).select_related('page', 'parent')

    def delete(self, request, *args, **kwargs):
        """
        Soft-delete a block (and all its children recursively).
        Idempotent: if the block is already deleted, return 200 instead of 404.
        A real missing block (wrong owner or wrong pk) still returns 404.
        """
        try:
            instance = Block.objects.get(
                pk=kwargs['pk'],
                page__workspace__owner=request.user,
            )
        except Block.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if instance.is_deleted:
            # Already deleted — idempotent success
            return Response(status=status.HTTP_200_OK)

        def soft_delete_recursive(block):
            for child in block.children.filter(is_deleted=False):
                soft_delete_recursive(child)
            block.is_deleted = True
            block.save(update_fields=['is_deleted'])

        soft_delete_recursive(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop('partial', False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Sync PAGE_LINK connections whenever content is included in the PATCH.
        # Skips canvas_x/y, doc_visible, and other non-content fields.
        content_payload = request.data.get('content')
        if isinstance(content_payload, dict):
            _sync_page_links(instance, content_payload.get('json') or {})

        return Response(BlockSerializer(instance).data)


# ─────────────────────────────────────────────────────────────────────────────
# Block utilities
# ─────────────────────────────────────────────────────────────────────────────

class BlockTreeView(APIView):
    """
    GET /api/blocks/{id}/tree/

    Returns a block with all its non-deleted children nested recursively.
    Used for toggle blocks, kanban containers, and any has_children block type.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        block = get_object_or_404(
            Block,
            pk=pk,
            page__workspace__owner=request.user,
            is_deleted=False,
        )
        return Response(BlockTreeSerializer(block).data)


class BlockReorderView(APIView):
    """
    POST /api/blocks/reorder/

    Batch-updates the order field on multiple blocks in a single transaction.
    Uses fractional ordering — no need to renumber siblings.

    Expected payload: { "blocks": [{"id": "<uuid>", "order": 1.5}, ...] }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BlockReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        blocks_data = serializer.validated_data['blocks']

        with transaction.atomic():
            for item in blocks_data:
                Block.objects.filter(
                    id=item['id'],
                    page__workspace__owner=request.user,
                    is_deleted=False,
                ).update(order=float(item['order']))

        return Response({'message': 'Blocks reordered successfully.'})


class BlockDuplicateView(APIView):
    """
    POST /api/blocks/{id}/duplicate/

    Creates a full copy of the block at order = max_order + 1,
    then recursively duplicates all child blocks under the new parent.
    Canvas position fields are preserved on the duplicate.
    Ownership enforced via page__workspace__owner — returns 404 not 403.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        original = get_object_or_404(
            Block,
            pk=pk,
            page__workspace__owner=request.user,
            is_deleted=False,
        )

        max_order = Block.objects.filter(
            page=original.page,
            is_deleted=False,
        ).aggregate(max_order=Max('order'))['max_order'] or 0

        with transaction.atomic():
            new_block = Block.objects.create(
                page=original.page,
                parent=original.parent,
                block_type=original.block_type,
                content=original.content,
                order=max_order + 1,
                canvas_x=original.canvas_x,
                canvas_y=original.canvas_y,
                canvas_w=original.canvas_w,
                canvas_h=original.canvas_h,
                canvas_z=original.canvas_z,
                doc_visible=original.doc_visible,
                canvas_visible=original.canvas_visible,
                bg_color=original.bg_color,
            )

            def duplicate_children(source: Block, target: Block) -> None:
                for child in source.children.filter(is_deleted=False):
                    new_child = Block.objects.create(
                        page=source.page,
                        parent=target,
                        block_type=child.block_type,
                        content=child.content,
                        order=child.order,
                    )
                    duplicate_children(child, new_child)

            duplicate_children(original, new_block)

        return Response(BlockSerializer(new_block).data, status=status.HTTP_201_CREATED)


class BlockMoveView(APIView):
    """
    POST /api/blocks/{id}/move/

    Moves a block to a different page or re-parents it under a different block.
    When moving to a new page, parent is cleared. When re-parenting, the block
    is moved to the parent's page automatically.
    Ownership enforced via page__workspace__owner — returns 404 not 403.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        block = get_object_or_404(
            Block,
            pk=pk,
            page__workspace__owner=request.user,
            is_deleted=False,
        )

        new_page_id   = request.data.get('page')
        new_parent_id = request.data.get('parent')

        if new_page_id:
            new_page = get_object_or_404(
                Page,
                pk=new_page_id,
                workspace__owner=request.user,
                is_deleted=False,
            )
            block.page   = new_page
            block.parent = None

        if new_parent_id:
            new_parent = get_object_or_404(
                Block,
                pk=new_parent_id,
                page__workspace__owner=request.user,
                is_deleted=False,
            )
            block.parent = new_parent
            block.page   = new_parent.page

        block.save()
        return Response(BlockSerializer(block).data)


class MakeColumnsView(APIView):
    """
    POST /api/blocks/make-columns/

    Converts two existing top-level blocks into a side-by-side column layout:

      1. Creates a column_container block at the target block's position.
      2. Creates two column child blocks inside the container.
      3. Moves target_block into column 1 (left).
      4. Moves source_block into column 2 (right).

    Both original blocks keep their content unchanged — only their
    parent and order fields are updated.

    Ownership: both blocks must belong to the same page and workspace.
    Returns: the serialised column_container block (201 Created).

    Body: { "source_block_id": "<uuid>", "target_block_id": "<uuid>" }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        source_id = request.data.get('source_block_id')
        target_id = request.data.get('target_block_id')

        if not source_id or not target_id:
            return Response(
                {'error': 'source_block_id and target_block_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if source_id == target_id:
            return Response(
                {'error': 'source_block_id and target_block_id must be different.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Ownership enforced via 404 — never leaks existence of other users' blocks
        source = get_object_or_404(
            Block,
            pk=source_id,
            is_deleted=False,
            page__workspace__owner=request.user,
        )
        target = get_object_or_404(
            Block,
            pk=target_id,
            is_deleted=False,
            page__workspace__owner=request.user,
        )

        if source.page_id != target.page_id:
            return Response(
                {'error': 'Both blocks must be on the same page.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # ── 1. Create column_container at the target's current position ──
            container = Block.objects.create(
                page=target.page,
                parent=target.parent,    # inherit target's parent (usually null)
                block_type='column_container',
                content={'widths': [50, 50]},
                order=target.order,
                doc_visible=True,
                canvas_visible=False,
            )

            # ── 2. Create two column children ─────────────────────────────────
            col1 = Block.objects.create(
                page=target.page,
                parent=container,
                block_type='column',
                content={},
                order=1.0,
                doc_visible=True,
                canvas_visible=False,
            )
            col2 = Block.objects.create(
                page=target.page,
                parent=container,
                block_type='column',
                content={},
                order=2.0,
                doc_visible=True,
                canvas_visible=False,
            )

            # ── 3. Move target → column 1 ─────────────────────────────────────
            target.parent = col1
            target.order  = 1.0
            target.save(update_fields=['parent', 'order'])

            # ── 4. Move source → column 2 ─────────────────────────────────────
            source.parent = col2
            source.order  = 1.0
            source.save(update_fields=['parent', 'order'])

        return Response(
            BlockSerializer(container).data,
            status=status.HTTP_201_CREATED,
        )


class AddToColumnView(APIView):
    """
    POST /api/blocks/add-to-column/

    Adds a top-level block as a new column in an existing column_container,
    creating a (1, 2, 3) layout instead of nesting ((1, 2), 3).

    Steps (atomic):
      1. Validate container is a column_container and source is top-level.
      2. Find the last column child — new column order = last.order + 1.0.
      3. Create a new column block inside the container.
      4. Move source block into the new column.
      5. Redistribute widths equally (100 / N) and save container.

    Body:    { "source_block_id": "<uuid>", "container_block_id": "<uuid>" }
    Returns: serialised column_container block (201 Created).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        source_id    = request.data.get('source_block_id')
        container_id = request.data.get('container_block_id')

        if not source_id or not container_id:
            return Response(
                {'error': 'source_block_id and container_block_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source = get_object_or_404(
            Block, pk=source_id, is_deleted=False,
            page__workspace__owner=request.user,
        )
        container = get_object_or_404(
            Block, pk=container_id, is_deleted=False,
            page__workspace__owner=request.user,
        )

        if container.block_type != 'column_container':
            return Response(
                {'error': 'container_block_id must be a column_container block.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if source.parent_id is not None:
            return Response(
                {'error': 'source_block_id must be a top-level block (no parent).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if source.page_id != container.page_id:
            return Response(
                {'error': 'Both blocks must be on the same page.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # ── Existing columns sorted by order ──────────────────────────────
            existing_cols = list(
                Block.objects.filter(
                    parent=container, block_type='column', is_deleted=False
                ).order_by('order')
            )
            new_col_order = (existing_cols[-1].order + 1.0) if existing_cols else 1.0
            n_cols        = len(existing_cols) + 1  # including the new one

            # ── Create new column ─────────────────────────────────────────────
            new_col = Block.objects.create(
                page=container.page,
                parent=container,
                block_type='column',
                content={},
                order=new_col_order,
                doc_visible=True,
                canvas_visible=False,
            )

            # ── Move source into new column ───────────────────────────────────
            source.parent = new_col
            source.order  = 1.0
            source.save(update_fields=['parent', 'order'])

            # ── Redistribute widths equally ───────────────────────────────────
            equal_width = round(100 / n_cols, 4)
            container.content = {**container.content, 'widths': [equal_width] * n_cols}
            container.save(update_fields=['content'])

        return Response(
            BlockSerializer(container).data,
            status=status.HTTP_201_CREATED,
        )


class FileUploadView(APIView):
    """
    POST /api/blocks/upload/

    Accepts a multipart file upload. Saves to MEDIA_ROOT/uploads/YYYY/MM/.
    Returns { url, filename, size, mimetype }.

    Restrictions:
      - Auth required
      - Max file size: 10 MB
      - Allowed MIME types: image/*, application/pdf, video/*
    """

    permission_classes = [IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    MAX_SIZE = 10 * 1024 * 1024  # 10 MB

    ALLOWED_TYPES = {
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'application/pdf',
        'video/mp4', 'video/webm', 'video/ogg',
    }

    # Magic bytes → expected MIME type (first N bytes of file)
    _MAGIC = [
        (b'\xff\xd8\xff',       'image/jpeg'),
        (b'\x89PNG\r\n\x1a\n', 'image/png'),
        (b'GIF87a',             'image/gif'),
        (b'GIF89a',             'image/gif'),
        (b'%PDF-',              'application/pdf'),
    ]

    def _magic_ok(self, header: bytes, claimed: str) -> bool:
        """Verify file header matches claimed content type."""
        # Video containers and SVG use complex/text formats — skip magic check
        if claimed in ('video/mp4', 'video/webm', 'video/ogg', 'image/svg+xml'):
            return True
        # WebP: bytes 0-3 = RIFF, bytes 8-11 = WEBP
        if claimed == 'image/webp':
            return header[:4] == b'RIFF' and header[8:12] == b'WEBP'
        for magic, mime in self._MAGIC:
            if header[:len(magic)] == magic:
                return claimed == mime
        return False

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response(
                {'error': 'No file provided.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if file.size > self.MAX_SIZE:
            return Response(
                {'error': 'File too large. Max size is 10 MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if file.content_type not in self.ALLOWED_TYPES:
            return Response(
                {'error': 'File type not allowed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate actual file content matches declared MIME type
        header = file.read(12)
        file.seek(0)
        if not self._magic_ok(header, file.content_type):
            return Response(
                {'error': 'File content does not match the declared type.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build storage path: uploads/YYYY/MM/<uuid><ext>
        today    = date.today()
        ext      = os.path.splitext(file.name)[1].lower()
        filename = f'{uuid_lib.uuid4().hex}{ext}'
        path     = f'uploads/{today.year}/{today.month:02d}/{filename}'

        saved_path = default_storage.save(path, ContentFile(file.read()))
        url        = request.build_absolute_uri(settings.MEDIA_URL + saved_path)

        return Response(
            {
                'url':      url,
                'filename': file.name,
                'size':     file.size,
                'mimetype': file.content_type,
            },
            status=status.HTTP_201_CREATED,
        )


class CollapseColumnView(APIView):
    """
    POST /api/blocks/collapse-column/

    Atomically removes an empty column from its container, then dissolves
    the container if only one (or zero) columns remain.

      0 cols remain → soft-delete container
      1 col remains → move its content blocks to top-level (container's
                       parent / order position), soft-delete col + container
      2+ cols remain → soft-delete column, redistribute widths equally

    This is done in a single DB transaction so the frontend never sees an
    intermediate state where a content block is orphaned.

    Ownership enforced via page__workspace__owner.
    Body:   { "column_id": "<uuid>" }
    Returns: 200 {}
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        column_id = request.data.get('column_id')
        if not column_id:
            return Response(
                {'error': 'column_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        column = get_object_or_404(
            Block,
            pk=column_id,
            block_type='column',
            is_deleted=False,
            page__workspace__owner=request.user,
        )

        container = column.parent
        if not container or container.block_type != 'column_container':
            return Response(
                {'error': 'Column has no valid column_container parent.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Remaining columns (excluding the one we're collapsing)
            remaining_cols = list(
                Block.objects.filter(
                    parent=container,
                    block_type='column',
                    is_deleted=False,
                ).exclude(pk=column_id).order_by('order')
            )

            # Soft-delete the empty column
            column.is_deleted = True
            column.save(update_fields=['is_deleted'])

            if len(remaining_cols) == 0:
                # Container is now empty — delete it too
                container.is_deleted = True
                container.save(update_fields=['is_deleted'])

            elif len(remaining_cols) == 1:
                # One column left — dissolve: move its content to top-level
                last_col    = remaining_cols[0]
                base_order  = container.order
                top_parent  = container.parent   # None for top-level

                content_blocks = list(
                    Block.objects.filter(
                        parent=last_col,
                        is_deleted=False,
                    ).order_by('order')
                )
                for i, blk in enumerate(content_blocks):
                    blk.parent = top_parent
                    blk.order  = base_order + i * 0.1
                    blk.save(update_fields=['parent', 'order'])

                last_col.is_deleted  = True
                container.is_deleted = True
                last_col.save(update_fields=['is_deleted'])
                container.save(update_fields=['is_deleted'])

            else:
                # 2+ columns remain — redistribute widths equally
                equal_width = 100.0 / len(remaining_cols)
                content = container.content or {}
                content['widths'] = [equal_width] * len(remaining_cols)
                container.content = content
                container.save(update_fields=['content'])

        return Response(status=status.HTTP_200_OK)
