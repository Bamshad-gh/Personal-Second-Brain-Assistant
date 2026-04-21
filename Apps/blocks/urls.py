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
    MakeColumnsView,
    AddToColumnView,
    CollapseColumnView,
    FileUploadView,
)

urlpatterns = [
    # ── Collection endpoints ──────────────────────────────────────────────────
    path('',                  BlockListCreateView.as_view(), name='block-list-create'),
    path('types/',            BlockTypesView.as_view(),      name='block-types'),
    path('reorder/',          BlockReorderView.as_view(),    name='block-reorder'),
    path('make-columns/',     MakeColumnsView.as_view(),     name='block-make-columns'),
    path('add-to-column/',    AddToColumnView.as_view(),     name='block-add-to-column'),
    path('collapse-column/',  CollapseColumnView.as_view(),  name='block-collapse-column'),
    path('upload/',           FileUploadView.as_view(),      name='block-upload'),

    # ── Single-block endpoints ────────────────────────────────────────────────
    path('<uuid:pk>/',            BlockDetailView.as_view(),    name='block-detail'),
    path('<uuid:pk>/tree/',       BlockTreeView.as_view(),      name='block-tree'),
    path('<uuid:pk>/duplicate/',  BlockDuplicateView.as_view(), name='block-duplicate'),
    path('<uuid:pk>/move/',       BlockMoveView.as_view(),      name='block-move'),
]
