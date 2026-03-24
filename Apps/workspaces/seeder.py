"""
Apps/workspaces/seeder.py

What:   Idempotent seeder that creates PageTypeGroup, CustomPageType, and
        PropertyDefinition rows for every template in WORKSPACE_TEMPLATES.

        "Idempotent" means it is safe to call multiple times — it will never
        create duplicate rows.  Soft-deleted rows are RESTORED (is_deleted set
        back to False) rather than duplicated.

        If a template type was previously soft-deleted (is_deleted=True) it
        is RESTORED (is_deleted set back to False), and any soft-deleted
        PropertyDefinition rows for that type are also restored.

Called by:
  • signals.py  — automatically after a new Workspace is saved (created=True)
  • views.py    — SeedTemplatesView (POST /api/workspaces/{id}/seed-templates/)

Returns:
  list of {"name": str, "created": bool} — one entry per template,
  letting the caller know which types were new vs already-existing/restored.
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IMPORTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

from django.db import transaction

from Apps.properties.models import CustomPageType, PageTypeGroup, PropertyDefinition
from .template_definitions import WORKSPACE_TEMPLATES


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SEEDER FUNCTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@transaction.atomic
def seed_workspace_templates(workspace) -> list[dict]:
    """
    Seed all WORKSPACE_TEMPLATES into `workspace`.

    Step 0: Upsert PageTypeGroup rows for every unique group_name found in
            WORKSPACE_TEMPLATES.  Groups are keyed by (workspace, name) so
            running this twice never creates duplicates.  Soft-deleted groups
            are restored.  Results cached in group_cache for step 1.

    For each template (step 1 onward):
      1. update_or_create CustomPageType by (workspace, name).
         — unique_together constraint guarantees no duplicates.
         — is_deleted=False in defaults restores soft-deleted rows so they
           become visible again.
         — group FK is set/updated from group_cache on every run so that
           types added before the group feature existed get assigned correctly.
      2. If the CustomPageType was just created (created=True), also create
         all PropertyDefinition rows for it.
         — Skips property creation if the type already existed, so any
           user edits to existing properties are preserved.
      3. If the type existed but was soft-deleted (created=False), also
         restore any soft-deleted PropertyDefinition rows for that type.

    Args:
        workspace: Workspace model instance (must already be saved).

    Returns:
        list of {"name": str, "created": bool} — one dict per template.
    """
    results: list[dict] = []

    # ── Step 0: upsert all unique PageTypeGroups ──────────────────────────────
    # Build a cache of {group_name: PageTypeGroup} so the template loop below
    # can assign the FK without extra queries.
    group_cache: dict[str, PageTypeGroup] = {}
    seen_group_names: set[str] = set()

    for tpl in WORKSPACE_TEMPLATES:
        g_name  = tpl.get("group_name")
        g_color = tpl.get("group_color", "#7c3aed")
        if g_name and g_name not in seen_group_names:
            seen_group_names.add(g_name)
            grp, _ = PageTypeGroup.objects.update_or_create(
                workspace=workspace,
                name=g_name,
                defaults={
                    "color":      g_color,
                    "is_deleted": False,
                },
            )
            group_cache[g_name] = grp

    # ── Step 1–3: upsert CustomPageTypes and their PropertyDefinitions ─────────
    for tpl in WORKSPACE_TEMPLATES:

        # ── Step 1: restore or create the page type ───────────────────────────
        # update_or_create includes is_deleted=False in defaults so that:
        #   - New rows are created with is_deleted=False (default behaviour)
        #   - Soft-deleted rows are restored (is_deleted flipped to False)
        #   - Active rows are left unchanged (is_deleted already False)
        # group FK is always updated so types get assigned to groups even if
        # they were created before the group feature was introduced.
        cpt, created = CustomPageType.objects.update_or_create(
            workspace=workspace,
            name=tpl["name"],
            defaults={
                "icon":          tpl["icon"],
                "description":   tpl["description"],
                "is_deleted":    False,
                "group":         group_cache.get(tpl.get("group_name")),
                "default_color": tpl.get("default_color", "#7c3aed"),
                "default_icon":  tpl.get("default_icon",  tpl["icon"]),
            },
        )

        # ── Step 2: create or restore properties ──────────────────────────────
        if created:
            # Brand-new type — create all its properties from scratch
            for prop in tpl["properties"]:
                PropertyDefinition.objects.create(
                    workspace=workspace,
                    custom_page_type=cpt,
                    name=prop["name"],
                    prop_type=prop["prop_type"],
                    options=prop["options"],   # list — matches JSONField default
                    order=prop["order"],
                )
        else:
            # Existing type (possibly just restored) — un-delete any properties
            # that were soft-deleted alongside the type so they reappear too.
            PropertyDefinition.objects.filter(
                custom_page_type=cpt,
                is_deleted=True,
            ).update(is_deleted=False)

        results.append({"name": cpt.name, "created": created})

    return results
