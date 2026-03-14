# Apps/blocks/urls.py
from django.urls import path
from .views import (
    BlockListCreateView,
    BlockDetailView,
    BlockTreeView,
    BlockReorderView,
    BlockDuplicateView,
    BlockMoveView,
)

urlpatterns = [
    # List & Create
    path('', BlockListCreateView.as_view(), name='block-list-create'),

    # Retrieve, Update, Delete
    path('<uuid:pk>/', BlockDetailView.as_view(), name='block-detail'),

    # Block tree (with children)
    path('<uuid:pk>/tree/', BlockTreeView.as_view(), name='block-tree'),

    # Batch reorder
    path('reorder/', BlockReorderView.as_view(), name='block-reorder'),

    # Duplicate block
    path('<uuid:pk>/duplicate/', BlockDuplicateView.as_view(), name='block-duplicate'),

    # Move block
    path('<uuid:pk>/move/', BlockMoveView.as_view(), name='block-move'),
]