# Apps/pages/signals.py
#
# Post-save signal that creates bidirectional PAGE_LINK Connection records
# whenever a child page is created, so the graph view can traverse
# parent-child relationships without needing a separate edge type.
#
# Wired up in: Apps/pages/apps.py → PagesConfig.ready()
#
# Safety guarantee:
#   The entire signal body is wrapped in try/except so that a failure here
#   NEVER prevents a page from being created successfully.

from django.db.models.signals import post_save
from django.dispatch import receiver

from Apps.relations.models import Connection
from .models import Page


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Signal handler
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@receiver(post_save, sender=Page)
def auto_link_parent_child(sender, instance, created, **kwargs):
    """
    On new page creation: if the page has a parent, create two PAGE_LINK
    Connection records to represent the parent-child edge bidirectionally.

      parent → child  (metadata: {"relation": "parent"})
      child  → parent (metadata: {"relation": "child"})

    Uses get_or_create so calling this twice for the same pair is safe.
    The try/except ensures connection creation never breaks page creation.
    """
    if not created or instance.parent_id is None:
        return

    try:
        # ── parent → child ────────────────────────────────────────────────────
        Connection.objects.get_or_create(
            conn_type=Connection.ConnectionType.PAGE_LINK,
            source_page_id=instance.parent_id,
            target_page_id=instance.id,
            defaults={'metadata': {'relation': 'parent'}},
        )

        # ── child → parent ────────────────────────────────────────────────────
        Connection.objects.get_or_create(
            conn_type=Connection.ConnectionType.PAGE_LINK,
            source_page_id=instance.id,
            target_page_id=instance.parent_id,
            defaults={'metadata': {'relation': 'child'}},
        )
    except Exception:
        # Never let connection creation break page creation
        pass
