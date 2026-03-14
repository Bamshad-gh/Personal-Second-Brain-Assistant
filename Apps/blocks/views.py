from django.shortcuts import render

# Create your views here.
# Apps/blocks/views.py
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Max

from .models import Block
from .serializers import (
    BlockSerializer,
    BlockCreateSerializer,
    BlockUpdateSerializer,
    BlockTreeSerializer,
    BlockReorderSerializer,
)
from Apps.pages.models import Page


class BlockListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/blocks/     → List blocks (filtered by page)
    POST /api/blocks/     → Create a new block
    """

    permission_classes = [IsAuthenticated]

    # BUG FIX: DRF's global DEFAULT_PAGINATION_CLASS uses ?page= as its page-number
    # query parameter. When the frontend sends GET /api/blocks/?page=<uuid>, DRF tries
    # to parse the UUID as a page number integer → raises InvalidPage → 404.
    # Setting pagination_class = None disables pagination on this view so that
    # ?page=<uuid> is passed straight through to get_queryset() as a filter param.
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BlockCreateSerializer
        return BlockSerializer

    def get_queryset(self):
        """Return blocks from pages in user's workspaces."""
        page_id = self.request.query_params.get('page')

        queryset = Block.objects.filter(
            page__workspace__owner=self.request.user,
            is_deleted=False
        ).select_related('page', 'parent')

        if page_id:
            queryset = queryset.filter(page_id=page_id)

        return queryset.order_by('order')

    def perform_create(self, serializer):
        """Set order to max + 1 if not provided."""
        if 'order' not in self.request.data:
            page_id = self.request.data.get('page')
            max_order = Block.objects.filter(
                page_id=page_id,
                is_deleted=False
            ).aggregate(max_order=Max('order'))['max_order'] or 0
            serializer.save(order=max_order + 1)
        else:
            serializer.save()


class BlockDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/blocks/{id}/  → Get block details
    PATCH  /api/blocks/{id}/  → Update block
    DELETE /api/blocks/{id}/  → Soft delete block
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return BlockUpdateSerializer
        return BlockSerializer

    def get_queryset(self):
        """Users can only access blocks in their workspaces."""
        return Block.objects.filter(
            page__workspace__owner=self.request.user,
            is_deleted=False
        ).select_related('page', 'parent')

    def perform_destroy(self, instance):
        """Soft delete block and all its children."""
        def soft_delete_recursive(block):
            for child in block.children.filter(is_deleted=False):
                soft_delete_recursive(child)
            block.is_deleted = True
            block.save(update_fields=['is_deleted'])

        soft_delete_recursive(instance)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(BlockSerializer(instance).data)


class BlockTreeView(APIView):
    """
    GET /api/blocks/{id}/tree/  → Get block with children (for toggle, kanban)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        block = get_object_or_404(
            Block,
            pk=pk,
            page__workspace__owner=request.user,
            is_deleted=False
        )

        serializer = BlockTreeSerializer(block)
        return Response(serializer.data)


class BlockReorderView(APIView):
    """
    POST /api/blocks/reorder/  → Batch reorder blocks
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
                    is_deleted=False
                ).update(order=float(item['order']))

        return Response({'message': 'Blocks reordered successfully.'})


class BlockDuplicateView(APIView):
    """
    POST /api/blocks/{id}/duplicate/  → Duplicate a block with children
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        original = get_object_or_404(
            Block,
            pk=pk,
            page__workspace__owner=request.user,
            is_deleted=False
        )

        # Get the order for the new block
        max_order = Block.objects.filter(
            page=original.page,
            is_deleted=False
        ).aggregate(max_order=Max('order'))['max_order'] or 0

        with transaction.atomic():
            # Create duplicate
            new_block = Block.objects.create(
                page=original.page,
                parent=original.parent,
                block_type=original.block_type,
                content=original.content,
                order=max_order + 1,
            )

            # Recursively duplicate children
            def duplicate_children(source_block, target_block):
                for child in source_block.children.filter(is_deleted=False):
                    new_child = Block.objects.create(
                        page=source_block.page,
                        parent=target_block,
                        block_type=child.block_type,
                        content=child.content,
                        order=child.order,
                    )
                    duplicate_children(child, new_child)

            duplicate_children(original, new_block)

        return Response(BlockSerializer(new_block).data, status=201)


class BlockMoveView(APIView):
    """
    POST /api/blocks/{id}/move/  → Move block to a different page or parent
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        block = get_object_or_404(
            Block,
            pk=pk,
            page__workspace__owner=request.user,
            is_deleted=False
        )

        new_page_id = request.data.get('page')
        new_parent_id = request.data.get('parent')

        if new_page_id:
            new_page = get_object_or_404(
                Page,
                pk=new_page_id,
                workspace__owner=request.user,
                is_deleted=False
            )
            block.page = new_page
            block.parent = None

        if new_parent_id:
            new_parent = get_object_or_404(
                Block,
                pk=new_parent_id,
                page__workspace__owner=request.user,
                is_deleted=False
            )
            block.parent = new_parent
            block.page = new_parent.page

        block.save()
        return Response(BlockSerializer(block).data)