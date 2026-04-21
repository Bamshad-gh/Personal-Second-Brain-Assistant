

# Create your views here.
# Apps/workspaces/views.py
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db import transaction

from .models import Workspace
from .seeder import seed_workspace_templates
from .serializers import (
    WorkspaceSerializer,
    WorkspaceCreateSerializer,
    WorkspaceUpdateSerializer,
    WorkspaceListSerializer,
)
from Apps.pages.serializers import PageTreeSerializer
from Apps.pages.models import Page
from Apps.blocks.models import Block


class WorkspaceListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/workspaces/     → List all workspaces for current user
    POST /api/workspaces/     → Create a new workspace
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return WorkspaceCreateSerializer
        return WorkspaceListSerializer

    def get_queryset(self):
        """Return only non-deleted workspaces owned by the current user."""
        return Workspace.objects.filter(
            owner=self.request.user,
            is_deleted=False
        ).order_by('-updated_at')

    def perform_create(self, serializer):
        """Set owner to current user when creating."""
        serializer.save(owner=self.request.user)


class WorkspaceDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/workspaces/{id}/  → Get workspace details
    PATCH  /api/workspaces/{id}/  → Update workspace
    DELETE /api/workspaces/{id}/  → Soft delete workspace
    """

    permission_classes = [IsAuthenticated]
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        """Users can only access their own workspaces."""
        return Workspace.objects.filter(
            owner=self.request.user,
            is_deleted=False
        )

    def perform_destroy(self, instance):
        """Soft delete instead of hard delete."""
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])

    def update(self, request, *args, **kwargs):
        """Use WorkspaceUpdateSerializer for updates."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = WorkspaceUpdateSerializer(
            instance,
            data=request.data,
            partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(WorkspaceSerializer(instance).data)


class WorkspacePagesView(APIView):
    """
    GET /api/workspaces/{id}/pages/  → Get all pages in a workspace
    Returns hierarchical page tree for sidebar.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        workspace = get_object_or_404(
            Workspace,
            pk=pk,
            owner=request.user,
            is_deleted=False
        )

        # Get all pages in workspace (excluding deleted)
        pages = workspace.pages.filter(
            is_deleted=False
        ).select_related('parent', 'created_by').order_by('title')

        # Build hierarchical structure
        

        # Get root pages (no parent)
        root_pages = pages.filter(parent__isnull=True)

        serializer = PageTreeSerializer(root_pages, many=True, context={'all_pages': pages})
        return Response(serializer.data)


class WorkspaceStatsView(APIView):
    """
    GET /api/workspaces/{id}/stats/  → Get workspace statistics
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        workspace = get_object_or_404(
            Workspace,
            pk=pk,
            owner=request.user,
            is_deleted=False
        )



        total_pages = Page.objects.filter(
            workspace=workspace,
            is_deleted=False
        ).count()

        total_blocks = Block.objects.filter(
            page__workspace=workspace,
            is_deleted=False
        ).count()

        return Response({
            'workspace_id': str(workspace.id),
            'total_pages': total_pages,
            'total_blocks': total_blocks,
            'storage_used_mb': float(workspace.storage_used_mb),
        })


class SeedTemplatesView(APIView):
    """
    POST /api/workspaces/{pk}/seed-templates/

    Idempotent endpoint — seeds the built-in CLIENT, PROJECT, and INVOICE
    page types into the workspace.  Safe to call multiple times; already-
    existing types are never overwritten or duplicated.

    Returns a list of {"name": str, "created": bool} — one entry per
    template, so the caller can see which ones were newly created vs skipped.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        # 404 (not 403) when the workspace does not belong to this user
        workspace = get_object_or_404(
            Workspace,
            pk=pk,
            owner=request.user,
            is_deleted=False,
        )

        results = seed_workspace_templates(workspace)

        return Response({"seeded": results}, status=status.HTTP_200_OK)


class WorkspaceContextView(APIView):
    """
    GET /api/workspaces/{id}/context/

    Returns concatenated plain text from the most-recently-updated pages
    in this workspace. Used as global context for the AI assistant.

    Skips locked pages (future encryption support).
    Caps output at 8 000 chars so the AI call stays within token budget.

    Response:
      {
        "context":    str,   — concatenated page text
        "page_count": int,   — number of pages included
        "char_count": int    — total characters in context
      }
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        workspace = get_object_or_404(
            Workspace,
            pk=pk,
            owner=request.user,
            is_deleted=False,
        )

        pages = workspace.pages.filter(
            is_deleted=False,
            is_locked=False,
        ).order_by('-updated_at')[:30]

        parts: list[str] = []
        total_chars = 0
        MAX_CHARS   = 8_000

        for page in pages:
            if total_chars >= MAX_CHARS:
                break

            blocks = Block.objects.filter(
                page=page,
                is_deleted=False,
                doc_visible=True,
            ).order_by('order')[:20]

            block_texts: list[str] = []
            for b in blocks:
                text = b.content.get('text') or b.content.get('code') or ''
                if text:
                    block_texts.append(f'[{b.block_type}] {str(text)[:200]}')

            if block_texts:
                page_text = f'## {page.title}\n' + '\n'.join(block_texts)
                parts.append(page_text)
                total_chars += len(page_text)

        context = '\n\n'.join(parts)
        return Response({
            'context':    context,
            'page_count': len(parts),
            'char_count': len(context),
        })