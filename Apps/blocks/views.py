# Apps/blocks/views.py

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Max
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

    permission_classes = []

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
