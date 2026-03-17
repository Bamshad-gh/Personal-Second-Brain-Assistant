from django.db import models
from Apps.core.mixins import BaseModel, EncryptableMixin, AIPermissionMixin

class Block(EncryptableMixin, AIPermissionMixin, BaseModel):
    """
    A single unit of content on a page.
    Every visible element — text, code, image, kanban — is a Block.
    Blocks nest under other blocks (toggle children, kanban cards).
    Any block can be independently locked.
    """

    class BlockType(models.TextChoices):
        # ── Text ──────────────────────────────────────────────
        TEXT     = 'text',     'Text'
        HEADING1 = 'heading1', 'Heading 1'
        HEADING2 = 'heading2', 'Heading 2'
        HEADING3 = 'heading3', 'Heading 3'
        QUOTE    = 'quote',    'Quote'
        CALLOUT  = 'callout',  'Callout'
        CODE     = 'code',     'Code'
        DIVIDER  = 'divider',  'Divider'
        # ── Structure ─────────────────────────────────────────
        TODO        = 'todo',        'To-Do'
        TOGGLE      = 'toggle',      'Toggle'
        KANBAN      = 'kanban',      'Kanban'
        TABLE       = 'table',       'Table'
        SPREADSHEET = 'spreadsheet', 'Spreadsheet'
        # ── Media ─────────────────────────────────────────────
        IMAGE = 'image', 'Image'
        VIDEO = 'video', 'Video'
        FILE  = 'file',  'File'
        # ── Data ──────────────────────────────────────────────
        FORM  = 'form',  'Form'
        CHART = 'chart', 'Chart'
        # ── Connections ───────────────────────────────────────
        PAGE_LINK   = 'page_link',   'Page Link'
        LINKED_VIEW = 'linked_view', 'Linked View'
        # ── Canvas (Phase 2) ──────────────────────────────────
        DRAWING = 'drawing', 'Drawing'
        MINDMAP = 'mindmap', 'Mind Map'
        STICKY  = 'sticky',  'Sticky Note'
        # ── Business (Phase 3) ────────────────────────────────
        TIMER         = 'timer',         'Time Tracker'
        INVOICE_BLOCK = 'invoice_block', 'Invoice'

        #  ── other ────────────────────────────────
        BOOKMARK      = 'bookmark',     'Bookmark'
        EQUATION      = 'equation',     'Equation'
        BREADCRUMB    = 'breadcrumb',   'Breadcrumb'
        COLUMN_LAYOUT = 'column_layout','Column Layout'
        AUDIO         = 'audio',        'Audio'
        EMBED         = 'embed',        'Embed'

    # ── Identity ──────────────────────────────────────────────
    page   = models.ForeignKey(
        'pages.Page',
        on_delete=models.CASCADE,
        related_name='blocks',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='children',
        # CASCADE — deleting parent block deletes its children
        # Used for: toggle children, kanban cards, form fields
    )

    # ── Content ───────────────────────────────────────────────
    block_type = models.CharField(max_length=50, choices=BlockType.choices)
    content    = models.JSONField(default=dict)
    # Standard:  {"text": "Hello", "marks": [...]}
    # Encrypted: {"iv": "base64...", "ciphertext": "base64..."}
    # Server stores whatever client sends — never inspects it

    # ── Document order ────────────────────────────────────────
    order = models.FloatField(default=0)
    # Fractional indexing — insert between blocks without renumbering
    # Block A=1.0, Block B=2.0 → insert between = 1.5

    # ── Canvas position (Phase 2) ─────────────────────────────
    canvas_x = models.FloatField(null=True, blank=True)
    canvas_y = models.FloatField(null=True, blank=True)
    canvas_w = models.FloatField(null=True, blank=True)
    canvas_h = models.FloatField(null=True, blank=True)
    canvas_z = models.IntegerField(default=0)

    # ── Visibility ────────────────────────────────────────────
    doc_visible    = models.BooleanField(default=True)
    canvas_visible = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']
        indexes  = [
            models.Index(fields=['page', 'order']),
            models.Index(fields=['page', 'block_type']),
            models.Index(fields=['parent']),
            models.Index(fields=['page', 'is_locked']),
        ]

    def __str__(self):
        return f'{self.block_type} on {self.page.title}'