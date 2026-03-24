from django.db import models

# Create your models here.
from django.db import models
from Apps.core.mixins import BaseModel


class Connection(BaseModel):
    """
    A relationship between two objects.
    Source and target can be Page or Block independently.
    metadata stores anything connection-type-specific.
    """

    class ConnectionType(models.TextChoices):
        # Phase 1
        PAGE_LINK      = 'page_link',   'Page Link'
        # Canvas
        BLOCK_LINK     = 'block_link',  'Block Link'
        # Phase 2
        FORM_TO_SHEET  = 'form_sheet',  'Form → Spreadsheet'
        CHART_TO_SHEET = 'chart_sheet', 'Chart ← Spreadsheet'
        # Phase 3
        TIMER_TO_PROJECT  = 'timer_proj',  'Timer → Project'
        INVOICE_TO_CLIENT = 'inv_client',  'Invoice → Client'
        DATE_TO_CALENDAR  = 'date_cal',    'Date → Google Calendar'
        EMAIL_TO_PAGE     = 'email_page',  'Email → Page'

    conn_type = models.CharField(max_length=50, choices=ConnectionType.choices)

    # ── Source — one of these is set ──────────────────────────
    source_page  = models.ForeignKey(
        'pages.Page',
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='outgoing_connections',
    )
    source_block = models.ForeignKey(
        'blocks.Block',
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='outgoing_connections',
    )

    # ── Target — one of these is set ──────────────────────────
    target_page  = models.ForeignKey(
        'pages.Page',
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='incoming_connections',
    )
    target_block = models.ForeignKey(
        'blocks.Block',
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='incoming_connections',
    )

    # ── Extra data per connection type ────────────────────────
    metadata = models.JSONField(default=dict)
    # PAGE_LINK:        {"anchor_text": "Project Alpha"}
    # DATE_TO_CALENDAR: {"calendar_event_id": "google-id"}
    # TIMER_TO_PROJECT: {"total_seconds": 3600}

    # ── Canvas arrow fields (BLOCK_LINK only) ─────────────────
    arrow_type = models.CharField(
        max_length=20,
        choices=[('link', 'Visual Link'), ('flow', 'Data Flow')],
        default='link',
    )
    direction = models.CharField(
        max_length=20,
        choices=[('directed', 'Directed'), ('undirected', 'Undirected')],
        default='directed',
    )
    label = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        indexes = [
            models.Index(fields=['conn_type', 'source_page']),
            models.Index(fields=['conn_type', 'target_page']),
        ]

    def __str__(self):
        source = self.source_page or self.source_block
        target = self.target_page or self.target_block
        return f'{self.conn_type}: {source} → {target}'