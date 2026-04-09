# Apps/blocks/urls.py

from django.urls import path
from .views import (
    BlockListCreateView,
    BlockDetailView,
    BlockTreeView,
    BlockReorderView,
    BlockDuplicateView,
    BlockMoveView,
    BlockTypesView,
)

urlpatterns = [
    # ── Collection endpoints ──────────────────────────────────────────────────
    path('',          BlockListCreateView.as_view(), name='block-list-create'),
    path('types/',    BlockTypesView.as_view(),      name='block-types'),
    path('reorder/',  BlockReorderView.as_view(),    name='block-reorder'),

    # ── Single-block endpoints ────────────────────────────────────────────────
    path('<uuid:pk>/',            BlockDetailView.as_view(),   name='block-detail'),
    path('<uuid:pk>/tree/',       BlockTreeView.as_view(),     name='block-tree'),
    path('<uuid:pk>/duplicate/',  BlockDuplicateView.as_view(), name='block-duplicate'),
    path('<uuid:pk>/move/',       BlockMoveView.as_view(),     name='block-move'),
]
