# Apps/workspaces/urls.py
from django.urls import path
from .views import (
    WorkspaceListCreateView,
    WorkspaceDetailView,
    WorkspacePagesView,
    WorkspaceStatsView,
)

urlpatterns = [
    # List & Create
    path('', WorkspaceListCreateView.as_view(), name='workspace-list-create'),

    # Retrieve, Update, Delete
    path('<uuid:pk>/', WorkspaceDetailView.as_view(), name='workspace-detail'),

    # Workspace pages tree
    path('<uuid:pk>/pages/', WorkspacePagesView.as_view(), name='workspace-pages'),

    # Workspace statistics
    path('<uuid:pk>/stats/', WorkspaceStatsView.as_view(), name='workspace-stats'),
]