# Apps/pages/urls.py
from django.urls import path
from .views import (
    PageListCreateView,
    PageDetailView,
    PageEditorView,
    PageChildrenView,
    PageMoveView,
    PageDuplicateView,
    PagePreviewView,
)

urlpatterns = [
    # List & Create
    path('', PageListCreateView.as_view(), name='page-list-create'),

    # Retrieve, Update, Delete
    path('<uuid:pk>/', PageDetailView.as_view(), name='page-detail'),

    # Editor view (page with blocks)
    path('<uuid:pk>/editor/', PageEditorView.as_view(), name='page-editor'),

    # Page children
    path('<uuid:pk>/children/', PageChildrenView.as_view(), name='page-children'),

    # Move page
    path('<uuid:pk>/move/', PageMoveView.as_view(), name='page-move'),

    # Duplicate page
    path('<uuid:pk>/duplicate/', PageDuplicateView.as_view(), name='page-duplicate'),

    # Hover-card preview
    path('<uuid:pk>/preview/', PagePreviewView.as_view(), name='page-preview'),
]