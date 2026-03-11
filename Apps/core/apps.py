from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = 'Apps.core'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        """
        core app has no signals.
        This method exists for future use.
        No models — only shared utilities.
        """
        pass