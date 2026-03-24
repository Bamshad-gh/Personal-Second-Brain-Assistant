"""
Apps/workspaces/signals.py

What:   Django signal handlers for the Workspace model.

        auto_seed_templates — fires on post_save when a new Workspace is
        created (created=True only).  It calls seed_workspace_templates so
        every new workspace gets the built-in CLIENT, PROJECT, and INVOICE
        page types without any user action.

        This module is imported in WorkspaceConfig.ready() (apps.py) so
        Django registers the signal receivers at startup.
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IMPORTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Workspace
from .seeder import seed_workspace_templates


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SIGNAL HANDLERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@receiver(post_save, sender=Workspace)
def auto_seed_templates(sender, instance, created: bool, **kwargs) -> None:
    """
    Automatically seed built-in page-type templates into every new workspace.

    Guard: `created=True` ensures this only runs once — on INSERT, not on
    every UPDATE.  The seeder itself is also idempotent, so duplicate calls
    are harmless, but we avoid the DB round-trip for updates.
    """
    if created:
        seed_workspace_templates(instance)
