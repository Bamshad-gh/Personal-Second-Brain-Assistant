# Apps/admin_dashboard/apps.py

from django.apps import AppConfig


class AdminDashboardConfig(AppConfig):
    name               = 'Apps.admin_dashboard'
    default_auto_field = 'django.db.models.BigAutoField'
    verbose_name       = 'Admin Dashboard'
