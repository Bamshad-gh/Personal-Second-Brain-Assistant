from django.shortcuts import render

# Apps/pages/views.py
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.conf import settings

import os

from .models import Page
from .serializers import (
    PageSerializer,
    PageCreateSerializer,
    PageUpdateSerializer,
    PageTreeSerializer,
    PageListSerializer,
    PageWithBlocksSerializer,
)
from Apps.workspaces.models import Workspace


# ─────────────────────────────────────────────────────────────────────────────
# Helper — extract plain text from TipTap JSON doc
# ─────────────────────────────────────────────────────────────────────────────

def _extract_tiptap_text(node: dict, max_chars: int = 100) -> str:
    """Walk a TipTap JSON doc recursively and collect all text node values."""
    parts: list[str] = []

    def walk(n: object) -> None:
        if not isinstance(n, dict):
            return
        if n.get('type') == 'text':
            parts.append(n.get('text', ''))
        for child in n.get('content', []):
            walk(child)

    walk(node)
    result = ' '.join(parts).strip()
    return result[:max_chars]


# ─────────────────────────────────────────────────────────────────────────────
# Page list + create
# ─────────────────────────────────────────────────────────────────────────────

class PageListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/pages/               → List all pages for current user
    GET  /api/pages/?workspace=<id> → List pages in a specific workspace (for sidebar)
    POST /api/pages/               → Create a new page
    """

    permission_classes = [IsAuthenticated]

    # BUG FIX: Disable pagination so ?workspace=<uuid> works as a plain filter.
    # Without this, DRF's PageNumberPagination would wrap the response in
    # {count, results, next, previous} — the frontend expects a flat array.
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PageCreateSerializer
        return PageListSerializer

    def get_queryset(self):
        """Return pages from user's workspaces."""
        workspace_id = self.request.query_params.get('workspace')

        queryset = Page.objects.filter(
            workspace__owner=self.request.user,
            is_deleted=False
        ).select_related('workspace', 'created_by')

        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)

        return queryset.order_by('-updated_at')

    def perform_create(self, serializer):
        """Set created_by to current user."""
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        """
        Override to return the full PageSerializer response after create.
        BUG FIX: DRF's default create() returns PageCreateSerializer data,
        which is missing many fields (created_by, is_pinned, enc_tier, etc.).
        The frontend needs the full page object to update its cache correctly.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            PageSerializer(serializer.instance).data,
            status=status.HTTP_201_CREATED,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Page detail (retrieve / update / soft-delete)
# ─────────────────────────────────────────────────────────────────────────────

class PageDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/pages/{id}/  → Get page details
    PATCH  /api/pages/{id}/  → Update page
    DELETE /api/pages/{id}/  → Soft delete page
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return PageUpdateSerializer
        return PageSerializer

    def get_queryset(self):
        """Users can only access pages in their workspaces."""
        return Page.objects.filter(
            workspace__owner=self.request.user,
            is_deleted=False
        ).select_related('workspace', 'created_by', 'parent')

    def perform_destroy(self, instance):
        """Soft delete page and all its children."""
        def soft_delete_recursive(page):
            for child in page.children.filter(is_deleted=False):
                soft_delete_recursive(child)
            page.is_deleted = True
            page.save(update_fields=['is_deleted'])

        soft_delete_recursive(instance)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PageSerializer(instance).data)


# ─────────────────────────────────────────────────────────────────────────────
# Page editor (page + blocks)
# ─────────────────────────────────────────────────────────────────────────────

class PageEditorView(generics.RetrieveAPIView):
    """
    GET /api/pages/{id}/editor/  → Get page with all blocks for editor
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PageWithBlocksSerializer

    def get_queryset(self):
        return Page.objects.filter(
            workspace__owner=self.request.user,
            is_deleted=False
        ).prefetch_related('blocks')


# ─────────────────────────────────────────────────────────────────────────────
# Page children
# ─────────────────────────────────────────────────────────────────────────────

class PageChildrenView(APIView):
    """
    GET  /api/pages/{id}/children/  → Get direct children of a page
    POST /api/pages/{id}/children/  → Create a child page
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        parent = get_object_or_404(
            Page,
            pk=pk,
            workspace__owner=request.user,
            is_deleted=False
        )

        children = parent.children.filter(is_deleted=False).order_by('title')
        serializer = PageListSerializer(children, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        parent = get_object_or_404(
            Page,
            pk=pk,
            workspace__owner=request.user,
            is_deleted=False
        )

        serializer = PageCreateSerializer(data={
            **request.data,
            'workspace': parent.workspace_id,
            'parent': parent.id,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)

        return Response(PageSerializer(serializer.instance).data, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# Page move
# ─────────────────────────────────────────────────────────────────────────────

class PageMoveView(APIView):
    """
    POST /api/pages/{id}/move/  → Move page to a new parent or workspace
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        page = get_object_or_404(
            Page,
            pk=pk,
            workspace__owner=request.user,
            is_deleted=False
        )

        new_parent_id = request.data.get('parent')
        new_workspace_id = request.data.get('workspace')

        if new_parent_id:
            new_parent = get_object_or_404(
                Page,
                pk=new_parent_id,
                workspace__owner=request.user,
                is_deleted=False
            )
            page.parent = new_parent
            page.workspace = new_parent.workspace
        elif new_workspace_id:
            new_workspace = get_object_or_404(
                Workspace,
                pk=new_workspace_id,
                owner=request.user,
                is_deleted=False
            )
            page.workspace = new_workspace
            page.parent = None

        page.save()
        return Response(PageSerializer(page).data)


# ─────────────────────────────────────────────────────────────────────────────
# Page duplicate
# ─────────────────────────────────────────────────────────────────────────────

class PageDuplicateView(APIView):
    """
    POST /api/pages/{id}/duplicate/  → Duplicate a page with all blocks
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from Apps.blocks.models import Block

        original = get_object_or_404(
            Page,
            pk=pk,
            workspace__owner=request.user,
            is_deleted=False
        )

        with transaction.atomic():
            # Create new page
            new_page = Page.objects.create(
                workspace=original.workspace,
                parent=original.parent,
                created_by=request.user,
                page_type=original.page_type,
                view_mode=original.view_mode,
                title=f"{original.title} (Copy)",
                icon=original.icon,
            )

            # Copy all blocks
            original_blocks = original.blocks.filter(is_deleted=False).order_by('order')

            block_mapping = {}  # old_id -> new_block

            for block in original_blocks:
                new_block = Block.objects.create(
                    page=new_page,
                    parent=block_mapping.get(block.parent_id) if block.parent else None,
                    block_type=block.block_type,
                    content=block.content,
                    order=block.order,
                )
                block_mapping[block.id] = new_block

        return Response(PageSerializer(new_page).data, status=201)


# ─────────────────────────────────────────────────────────────────────────────
# Page preview (hover card)
# ─────────────────────────────────────────────────────────────────────────────

class PagePreviewView(APIView):
    """GET /api/pages/<pk>/preview/ — lightweight preview for hover cards."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from Apps.blocks.models import Block
        from Apps.relations.models import Connection

        page = get_object_or_404(
            Page,
            pk=pk,
            workspace__owner=request.user,
            is_deleted=False,
        )

        # ── Extract plain-text preview from TipTap JSON ──────────────────────
        content_preview = ''
        block = (
            Block.objects
            .filter(page=page, block_type='text', is_deleted=False)
            .order_by('order')
            .first()
        )
        if block and isinstance(block.content, dict):
            tiptap_json = block.content.get('json', {})
            content_preview = _extract_tiptap_text(tiptap_json, max_chars=100)

        # ── Count backlinks ──────────────────────────────────────────────────
        backlink_count = Connection.objects.filter(
            target_page=page,
            conn_type=Connection.ConnectionType.PAGE_LINK,
            is_deleted=False,
        ).count()

        return Response({
            'id':              str(page.id),
            'title':           page.title,
            'icon':            page.icon,
            'page_type':       page.page_type,
            'content_preview': content_preview,
            'backlink_count':  backlink_count,
            'workspace_id':    str(page.workspace_id),
        })


# ─────────────────────────────────────────────────────────────────────────────
# Page cover image — upload / remove
# ─────────────────────────────────────────────────────────────────────────────

class PageCoverView(APIView):
    """
    POST   /api/pages/{id}/cover/  → Upload a cover image (multipart, field: "image")
    DELETE /api/pages/{id}/cover/  → Remove the cover image
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        page = get_object_or_404(
            Page,
            pk=pk,
            workspace__owner=request.user,
            is_deleted=False,
        )

        image = request.FILES.get('image')
        if not image:
            return Response({'detail': 'No image file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        # Clear any existing URL-based cover so file takes precedence
        page.header_pic_url = ''
        page.header_pic = image
        page.save(update_fields=['header_pic', 'header_pic_url'])

        return Response({
            'header_pic': request.build_absolute_uri(page.header_pic.url),
        }, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        page = get_object_or_404(
            Page,
            pk=pk,
            workspace__owner=request.user,
            is_deleted=False,
        )

        page.header_pic = None
        page.header_pic_url = ''
        page.save(update_fields=['header_pic', 'header_pic_url'])

        return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────────────────────────────────
# Gallery — curated shared cover images from media/gallery/
# ─────────────────────────────────────────────────────────────────────────────

class PageGalleryView(APIView):
    """
    GET /api/pages/gallery/
    Returns a list of { id, url, credit } for every image in media/gallery/.
    No authentication required — images are public static assets.
    If the folder does not exist or is empty, returns [].
    """

    permission_classes = [AllowAny]

    def get(self, request):
        gallery_dir = os.path.join(settings.MEDIA_ROOT, 'gallery')

        if not os.path.isdir(gallery_dir):
            return Response([])

        allowed_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
        images = []

        for filename in sorted(os.listdir(gallery_dir)):
            ext = os.path.splitext(filename)[1].lower()
            if ext not in allowed_extensions:
                continue

            relative_path = f'gallery/{filename}'
            url = request.build_absolute_uri(
                settings.MEDIA_URL + relative_path
            )
            images.append({
                'id':     filename,
                'url':    url,
                'credit': '',  # Admin can add metadata via gallery_meta.json in future
            })

        return Response(images)
