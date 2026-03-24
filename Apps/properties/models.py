# Apps/properties/models.py
#
# Models for the properties system:
#   PageTypeGroup      — named, coloured grouping bucket for CustomPageTypes
#   CustomPageType     — user-defined page categories (Client, Project, …)
#   PropertyDefinition — typed field schema scoped to a CustomPageType
#   PropertyValue      — actual field value stored per page

from django.db import models
from Apps.core.mixins import BaseModel


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Page Type Group
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PageTypeGroup(BaseModel):
    """
    Named, coloured bucket that organises CustomPageTypes in the sidebar and
    in the CustomPageTypeManager panel.

    Rules:
      - Soft-delete only (is_deleted=True) — never hard-delete.
      - Before deleting a group, the view sets group=None on all its
        CustomPageTypes so no orphaned FKs remain.
      - Ordering is by (order, created_at) so user-defined order is respected.
    """

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='page_type_groups',
    )
    name  = models.CharField(max_length=100)
    color = models.CharField(max_length=20, default='#7c3aed')  # hex or css var
    order = models.IntegerField(default=0)

    class Meta:
        ordering      = ['order', 'created_at']
        unique_together = [('workspace', 'name')]

    def __str__(self) -> str:
        return f'{self.workspace} / {self.name}'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Custom Page Type
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class CustomPageType(BaseModel):
    """
    User-defined page categories (e.g. Client, Project, Invoice).

    Fields added in Phase 3 extension:
      group     — optional FK to PageTypeGroup; null means "ungrouped"
      is_pinned — controls visibility in the new-page type picker / sidebar
                  groups.  True = show in picker; False = hide from picker
                  (pages of this type still exist, just not offered for new ones)
    """

    workspace = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='custom_page_types',
    )
    name        = models.CharField(max_length=100)
    icon        = models.CharField(max_length=10, blank=True)
    description = models.TextField(blank=True)

    # ── Phase 3 extension ─────────────────────────────────────────────────────
    group = models.ForeignKey(
        PageTypeGroup,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='page_types',
    )
    is_pinned = models.BooleanField(default=True)

    # ── Color + icon defaults ──────────────────────────────────────────────────
    # default_color: hex accent used in graph nodes and page header.
    #   Frontend fallback chain: page.color || type.default_color || '#7c3aed'
    # default_icon: emoji used in the sidebar picker and graph node.
    #   Individual pages can override both via Page.color and Page.icon.
    default_color = models.CharField(max_length=20, default='#7c3aed', blank=True)
    default_icon  = models.CharField(max_length=10,  default='📄',      blank=True)

    class Meta:
        unique_together = [('workspace', 'name')]

    def __str__(self) -> str:
        return f'{self.name} ({self.workspace.name})'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Property Definition
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PropertyDefinition(BaseModel):
    """
    Schema for typed fields on a page type.
    Works for both built-in and custom page types.
    is_global = True means reusable across any page type.
    """

    class PropertyType(models.TextChoices):
        TEXT     = 'text',     'Text'
        NUMBER   = 'number',   'Number'
        DATE     = 'date',     'Date'
        CHECKBOX = 'checkbox', 'Checkbox'
        SELECT   = 'select',   'Select'
        MULTI    = 'multi',    'Multi Select'
        URL      = 'url',      'URL'
        EMAIL    = 'email',    'Email'
        PHONE    = 'phone',    'Phone'
        CURRENCY = 'currency', 'Currency'
        RELATION = 'relation', 'Relation'
        FILE     = 'file',     'File'
        OBJECT   = 'object',   'Object'

    workspace        = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='property_definitions',
    )
    custom_page_type = models.ForeignKey(
        CustomPageType,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='properties',
    )
    page_type  = models.CharField(max_length=50, blank=True)
    name       = models.CharField(max_length=100)
    prop_type  = models.CharField(max_length=50, choices=PropertyType.choices)
    options    = models.JSONField(default=list)
    order      = models.IntegerField(default=0)
    is_global  = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

    def __str__(self) -> str:
        return f'{self.name} ({self.prop_type})'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Property Value
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PropertyValue(BaseModel):
    """
    Actual value of a property on a specific page.
    One row per property per page.
    """

    page = models.ForeignKey(
        'pages.Page',
        on_delete=models.CASCADE,
        related_name='properties',
    )
    definition = models.ForeignKey(
        PropertyDefinition,
        on_delete=models.CASCADE,
    )
    value_text   = models.TextField(blank=True)
    value_number = models.FloatField(null=True, blank=True)
    value_date   = models.DateTimeField(null=True, blank=True)
    value_bool   = models.BooleanField(null=True, blank=True)
    value_json   = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = [('page', 'definition')]

    def __str__(self) -> str:
        return f'{self.definition.name} on {self.page.title}'
