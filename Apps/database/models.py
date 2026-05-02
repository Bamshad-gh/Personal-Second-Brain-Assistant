# Apps/database/models.py
#
# Models for the database block system.
#
# DatabaseView   — one-to-one with Block; stores view config (filters, sorts)
# DatabaseColumn — bridges DatabaseView → PropertyDefinition with ordering
# DatabaseRow    — a row in a database view; optionally linked to a Page
# DatabaseCell   — a cell value at (row, column/definition) intersection

from django.db import models
from Apps.core.mixins import BaseModel


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Database View
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseView(BaseModel):
    """
    Configuration for a database block.
    Created automatically on first GET of a database block.

    view_type is a plain string (not choices=) so new view types
    (board, gallery, calendar) can be added without migrations.
    """

    block = models.OneToOneField(
        'blocks.Block',
        on_delete=models.CASCADE,
        related_name='database_view',
    )
    custom_page_type = models.ForeignKey(
        'properties.CustomPageType',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='database_views',
    )
    # table | board | gallery — no choices= so adding types needs no migration
    view_type     = models.CharField(max_length=30, default='table')
    filters       = models.JSONField(default=list)
    sorts         = models.JSONField(default=list)
    hidden_fields = models.JSONField(default=list)

    class Meta:
        indexes = [
            models.Index(fields=['block']),
        ]

    def __str__(self) -> str:
        return f'DatabaseView for block {self.block_id}'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Database Column
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseColumn(BaseModel):
    """
    Bridge between a DatabaseView and a PropertyDefinition.
    Stores display order for columns within this specific view.

    Creating a column via the API:
      1. Create a PropertyDefinition (workspace-scoped, custom_page_type=None)
      2. Create a DatabaseColumn linking it to the DatabaseView
    """

    database_view = models.ForeignKey(
        DatabaseView,
        on_delete=models.CASCADE,
        related_name='columns',
    )
    definition = models.ForeignKey(
        'properties.PropertyDefinition',
        on_delete=models.CASCADE,
        related_name='database_columns',
    )
    order = models.FloatField(default=0)

    class Meta:
        ordering = ['order']
        indexes = [
            models.Index(fields=['database_view', 'order']),
        ]

    def __str__(self) -> str:
        return f'{self.definition.name} in view {self.database_view_id}'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Database Row
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseRow(BaseModel):
    """
    A single row in a database view.
    Optionally linked to a Page (for query-mode in Step 4).

    order uses fractional indexing (FloatField) so rows can be
    inserted between existing rows without renumbering.
    """

    database_view = models.ForeignKey(
        DatabaseView,
        on_delete=models.CASCADE,
        related_name='rows',
    )
    page = models.ForeignKey(
        'pages.Page',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='database_rows',
    )
    order = models.FloatField(default=0)

    class Meta:
        ordering = ['order']
        indexes = [
            models.Index(fields=['database_view', 'order']),
        ]

    def __str__(self) -> str:
        return f'Row {self.id} in view {self.database_view_id}'


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Database Cell
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class DatabaseCell(BaseModel):
    """
    A single cell value at the intersection of (row, column).
    Follows the same multi-column value pattern as PropertyValue:
    one typed column per value type, only one is non-null per cell.

    Unique together (row, definition) — one cell per column per row.
    """

    row = models.ForeignKey(
        DatabaseRow,
        on_delete=models.CASCADE,
        related_name='cells',
    )
    definition = models.ForeignKey(
        'properties.PropertyDefinition',
        on_delete=models.CASCADE,
        related_name='database_cells',
    )
    value_text   = models.TextField(blank=True, default='')
    value_number = models.FloatField(null=True, blank=True)
    value_date   = models.DateTimeField(null=True, blank=True)
    value_bool   = models.BooleanField(null=True, blank=True)
    value_json   = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = [('row', 'definition')]
        indexes = [
            models.Index(fields=['row']),
        ]

    def __str__(self) -> str:
        return f'Cell {self.definition.name} / row {self.row_id}'
