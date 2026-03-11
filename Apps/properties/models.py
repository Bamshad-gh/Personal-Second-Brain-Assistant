from django.db import models
from Apps.core.mixins import BaseModel


class CustomPageType(BaseModel):
    """
    User-defined page types with custom properties.
    Phase 2 feature — model defined now, UI built in Phase 2.
    """
    workspace   = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='custom_page_types',
    )
    name        = models.CharField(max_length=100)
    icon        = models.CharField(max_length=10, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        unique_together = [('workspace', 'name')]

    def __str__(self):
        return f'{self.name} ({self.workspace.name})'


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

    def __str__(self):
        return f'{self.name} ({self.prop_type})'


class PropertyValue(BaseModel):
    """
    Actual value of a property on a specific page.
    One row per property per page.
    """
    page       = models.ForeignKey(
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

    def __str__(self):
        return f'{self.definition.name} on {self.page.title}'
