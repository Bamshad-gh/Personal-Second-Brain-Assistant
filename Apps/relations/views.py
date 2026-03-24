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
from django.db.models import Q

from Apps.pages.models import Page
from Apps.workspaces.models import Workspace
from Apps.blocks.models import Block
from .models import Connection
from .serializers import ConnectionSerializer, BlockConnectionSerializer


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


# ── GET /api/relations/workspace/{workspace_id}/graph/ ────────────────────────

class WorkspaceGraphView(APIView):
    """
    GET /api/relations/workspace/{workspace_id}/graph/

    Returns the full page graph for a workspace in a single request, avoiding
    the N round-trips that fetching per-page backlinks would require.

    Response shape:
      {
        "nodes": [
          {
            "id":               "<page-uuid>",
            "title":            "My Page",
            "icon":             "📄",
            "custom_page_type": "<type-uuid>" | null,
            "group_color":      "#60a5fa"     | null
          },
          ...
        ],
        "edges": [
          {
            "source": "<page-uuid>",
            "target": "<page-uuid>",
            "type":   "page_link" | "parent" | "child"
          },
          ...
        ]
      }

    Security:
      - Workspace must be owned by request.user (404 otherwise)
      - Only non-deleted pages and connections are returned
      - Edge source/target are both guaranteed to be in this workspace
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, workspace_id):
        # ── Verify workspace ownership ────────────────────────────────────────
        workspace = get_object_or_404(
            Workspace,
            pk=workspace_id,
            owner=request.user,
            is_deleted=False,
        )

        # ── Build node list ───────────────────────────────────────────────────
        # select_related('custom_page_type') avoids N+1 when reading
        # default_color / default_icon for each node.
        pages = (
            Page.objects
            .filter(workspace=workspace, is_deleted=False)
            .select_related('custom_page_type')
        )

        nodes = []
        page_ids = set()
        for page in pages:
            page_ids.add(page.id)

            # Resolve effective color: page override → type default → violet
            effective_color = (
                page.color
                or (page.custom_page_type.default_color if page.custom_page_type else None)
                or '#7c3aed'
            )

            # Resolve effective icon: page override → type default → generic doc
            effective_icon = (
                page.icon
                or (page.custom_page_type.default_icon if page.custom_page_type else None)
                or '📄'
            )

            nodes.append({
                'id':               str(page.id),
                'title':            page.title,
                'icon':             effective_icon,
                'color':            effective_color,
                'custom_page_type': str(page.custom_page_type_id) if page.custom_page_type_id else None,
            })

        # ── Build edge list ───────────────────────────────────────────────────
        # Only include edges where both endpoints are in this workspace.
        connections = (
            Connection.objects
            .filter(
                conn_type=Connection.ConnectionType.PAGE_LINK,
                source_page__in=page_ids,
                target_page__in=page_ids,
                is_deleted=False,
            )
            .only('source_page_id', 'target_page_id', 'metadata')
        )

        edges = [
            {
                'source': str(conn.source_page_id),
                'target': str(conn.target_page_id),
                'type':   conn.metadata.get('relation', 'page_link'),
            }
            for conn in connections
        ]

        return Response({'nodes': nodes, 'edges': edges})


# ── GET+POST /api/relations/block-connections/ ────────────────────────────────

class BlockConnectionListCreateView(APIView):
    """
    GET  /api/relations/block-connections/?page={uuid}
      Returns all non-deleted BLOCK_LINK connections where the source or target
      block belongs to the given page.  Ownership is verified via the source
      block's workspace.

    POST /api/relations/block-connections/
      Creates a new BLOCK_LINK connection between two blocks owned by the user.
      conn_type is always set server-side to 'block_link'.

      Request body:
        {
          "source_block": "<uuid>",
          "target_block": "<uuid>",
          "arrow_type":   "link" | "flow"       (optional, default "link")
          "direction":    "directed"|"undirected" (optional, default "directed")
          "label":        "..."                  (optional)
        }
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        page_id = request.query_params.get('page')
        if not page_id:
            return Response(
                {'detail': 'page query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Return all BLOCK_LINK connections touching this page,
        # owned by the current user (via source block's workspace).
        connections = (
            Connection.objects
            .filter(
                conn_type=Connection.ConnectionType.BLOCK_LINK,
                is_deleted=False,
            )
            .filter(
                Q(source_block__page_id=page_id) | Q(target_block__page_id=page_id)
            )
            .filter(
                source_block__page__workspace__owner=request.user
            )
            .select_related('source_block', 'target_block')
        )

        serializer = BlockConnectionSerializer(connections, many=True)
        return Response(serializer.data)

    def post(self, request):
        source_block_id = request.data.get('source_block')
        target_block_id = request.data.get('target_block')

        if not source_block_id or not target_block_id:
            return Response(
                {'detail': 'source_block and target_block are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify ownership of both blocks — 404 if not found or not owned
        source_block = get_object_or_404(
            Block,
            pk=source_block_id,
            page__workspace__owner=request.user,
            is_deleted=False,
        )
        target_block = get_object_or_404(
            Block,
            pk=target_block_id,
            page__workspace__owner=request.user,
            is_deleted=False,
        )

        connection = Connection.objects.create(
            conn_type=Connection.ConnectionType.BLOCK_LINK,
            source_block=source_block,
            target_block=target_block,
            arrow_type=request.data.get('arrow_type', 'link'),
            direction=request.data.get('direction', 'directed'),
            label=request.data.get('label', ''),
        )

        serializer = BlockConnectionSerializer(connection)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ── PATCH+DELETE /api/relations/block-connections/{pk}/ ───────────────────────

class BlockConnectionDetailView(APIView):
    """
    PATCH  /api/relations/block-connections/{pk}/
      Update label, direction, or arrow_type on a BLOCK_LINK connection.

    DELETE /api/relations/block-connections/{pk}/
      Soft-delete the connection (sets is_deleted=True).

    Ownership: verified via source_block's workspace.  Returns 404 on any
    access-denied case — never confirms the resource exists to non-owners.
    """

    permission_classes = [IsAuthenticated]

    def _get_connection(self, pk, user):
        return get_object_or_404(
            Connection,
            pk=pk,
            conn_type=Connection.ConnectionType.BLOCK_LINK,
            source_block__page__workspace__owner=user,
            is_deleted=False,
        )

    def patch(self, request, pk):
        connection = self._get_connection(pk, request.user)
        serializer = BlockConnectionSerializer(
            connection, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        connection = self._get_connection(pk, request.user)
        connection.is_deleted = True
        connection.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)
