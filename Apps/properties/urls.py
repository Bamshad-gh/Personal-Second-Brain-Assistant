# Apps/properties/urls.py
#
# URL patterns for the properties app.
# All routes are mounted under /api/properties/ in config/urls.py.
#
# Pattern rules:
#   - UUID PKs only (<uuid:pk>) — never integer PKs
#   - List/create views use trailing slash, no PK segment
#   - Detail views use <uuid:pk>/ segment

from django.urls import path
from . import views

urlpatterns = [
    # ── Page Type Groups ──────────────────────────────────────────────────────
    path('groups/',           views.PageTypeGroupListCreateView.as_view()),
    path('groups/<uuid:pk>/', views.PageTypeGroupDetailView.as_view()),

    # ── Custom Page Types ─────────────────────────────────────────────────────
    path('custom-types/',           views.CustomPageTypeListCreateView.as_view()),
    path('custom-types/<uuid:pk>/', views.CustomPageTypeDetailView.as_view()),

    # ── Property Definitions ──────────────────────────────────────────────────
    path('definitions/',           views.PropertyDefinitionListView.as_view()),
    path('definitions/<uuid:pk>/', views.PropertyDefinitionDetailView.as_view()),

    # ── Property Values ───────────────────────────────────────────────────────
    path('values/',           views.PropertyValueListView.as_view()),
    path('values/<uuid:pk>/', views.PropertyValueDetailView.as_view()),
]
