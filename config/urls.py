"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # Authentication endpoints
    path('api/auth/', include('Apps.accounts.urls')),

    # Workspace endpoints
    path('api/workspaces/', include('Apps.workspaces.urls')),

    # Page endpoints
    path('api/pages/', include('Apps.pages.urls')),

    # Block endpoints
    path('api/blocks/', include('Apps.blocks.urls')),

    # AI endpoints (action + chat)
    path('api/ai/', include('Apps.ai_agent.urls')),

    # Relations endpoints (page links, backlinks)
    path('api/relations/', include('Apps.relations.urls')),

    # Properties endpoints (definitions + values)
    path('api/properties/', include('Apps.properties.urls')),

    # Admin dashboard API (staff only — IsAdminUser permission on every view)
    path('api/admin/', include('Apps.admin_dashboard.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)