# Apps/relations/urls.py
"""
URL patterns for the Relations app.

Mounted at /api/relations/ in config/urls.py.

Endpoints:
  POST /api/relations/                                        → ConnectionCreateView
  GET  /api/relations/pages/{page_id}/backlinks/             → PageBacklinksView
  GET  /api/relations/workspace/{workspace_id}/graph/        → WorkspaceGraphView
  GET  /api/relations/block-connections/?page={id}           → BlockConnectionListCreateView
  POST /api/relations/block-connections/                     → BlockConnectionListCreateView
  PATCH  /api/relations/block-connections/{pk}/              → BlockConnectionDetailView
  DELETE /api/relations/block-connections/{pk}/              → BlockConnectionDetailView
"""

from django.urls import path
from .views import (
    ConnectionCreateView,
    PageBacklinksView,
    WorkspaceGraphView,
    BlockConnectionListCreateView,
    BlockConnectionDetailView,
)

urlpatterns = [
    # Create a connection (page link) between two pages
    path('', ConnectionCreateView.as_view(), name='connection-create'),

    # Get all pages that link to a given page (backlinks panel)
    path('pages/<uuid:page_id>/backlinks/', PageBacklinksView.as_view(), name='page-backlinks'),

    # Full workspace page graph (nodes + edges) for the knowledge map view
    path('workspace/<uuid:workspace_id>/graph/', WorkspaceGraphView.as_view(), name='workspace-graph'),

    # Canvas arrow connections between blocks
    path('block-connections/', BlockConnectionListCreateView.as_view(), name='block-connection-list'),
    path('block-connections/<uuid:pk>/', BlockConnectionDetailView.as_view(), name='block-connection-detail'),
]
