# Apps/pages/apps.py

from django.apps import AppConfig


class PagesConfig(AppConfig):
    name = 'Apps.pages'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        import Apps.pages.signals  # noqa: F401  — registers post_save signal
