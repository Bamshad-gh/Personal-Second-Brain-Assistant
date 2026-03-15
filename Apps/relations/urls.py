# Apps/relations/urls.py
"""
URL patterns for the Relations app.

Mounted at /api/relations/ in config/urls.py.

Endpoints:
  POST /api/relations/                              → ConnectionCreateView
  GET  /api/relations/pages/{page_id}/backlinks/   → PageBacklinksView
"""

from django.urls import path
from .views import ConnectionCreateView, PageBacklinksView

urlpatterns = [
    # Create a connection (page link) between two pages
    path('', ConnectionCreateView.as_view(), name='connection-create'),

    # Get all pages that link to a given page (backlinks panel)
    path('pages/<uuid:page_id>/backlinks/', PageBacklinksView.as_view(), name='page-backlinks'),
]
