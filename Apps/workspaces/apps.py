# Apps/workspaces/apps.py
#
# AppConfig for the workspaces application.
# ready() imports the signal module so Django registers all receivers
# at startup — required for post_save auto-seeding to work.

from django.apps import AppConfig


class WorkspaceConfig(AppConfig):
    name = 'Apps.workspaces'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self) -> None:
        import Apps.workspaces.signals  # noqa: F401  — registers signal receivers
