from django.db import models
from Apps.core.mixins import BaseModel, EncryptableMixin, AIPermissionMixin

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BLOCK TYPE REGISTRY — single source of truth
#
# HOW TO ADD A NEW BLOCK TYPE:
#   1. Add one entry here
#   2. Add renderer in frontend BlockRenderer.tsx
#   3. Add to slash menu in SlashMenu.tsx
#   Nothing else needs to change.
#
# FIELDS:
#   category:     logical group for UI organization
#   has_children: True if this block can contain child blocks
#   canvas_ok:    can appear on canvas (position freely)
#   doc_ok:       can appear in document editor (flows vertically)
#
# VISIBILITY (on the Block model itself):
#   doc_visible=True    → renders in document editor
#   canvas_visible=True → renders on canvas
#   Both True           → shared block, synced between doc and canvas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BLOCK_TYPE_REGISTRY: dict[str, dict] = {
    # ── Text (doc + canvas) ──────────────────────────────────
    # content: { "text": "...", "marks": [{"type":"bold"},...] }
    'paragraph':          {'category': 'text',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    'heading1':           {'category': 'text',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    'heading2':           {'category': 'text',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    'heading3':           {'category': 'text',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    'quote':              {'category': 'text',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    # content: { "text": "...", "emoji": "💡", "color": "blue" }
    'callout':            {'category': 'text',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    # content: {}
    'divider':            {'category': 'text',        'has_children': False, 'canvas_ok': False, 'doc_ok': True},

    # ── List (doc + canvas) ──────────────────────────────────
    # content: { "text": "...", "marks": [] }
    'bullet_item':        {'category': 'list',        'has_children': True,  'canvas_ok': True,  'doc_ok': True},
    'numbered_item':      {'category': 'list',        'has_children': True,  'canvas_ok': True,  'doc_ok': True},
    # content: { "text": "...", "checked": false, "marks": [] }
    'todo_item':          {'category': 'list',        'has_children': True,  'canvas_ok': True,  'doc_ok': True},

    # ── Code (doc + canvas, future: run code) ────────────────
    # content: { "code": "...", "language": "python", "output": null }
    'code':               {'category': 'code',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},

    # ── Table (doc only — TipTap JSON table) ─────────────────
    # content: { "json": {...} }  ← full TipTap JSON with table nodes
    'table':              {'category': 'table',       'has_children': False, 'canvas_ok': False, 'doc_ok': True},

    # ── Media (doc + canvas) ─────────────────────────────────
    # content: { "url": "...", "alt": "...", "width": null }
    'image':              {'category': 'media',       'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    # content: { "url": "...", "filename": "...", "size": 0 }
    'file':               {'category': 'media',       'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    'pdf':                {'category': 'media',       'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    'video':              {'category': 'media',       'has_children': False, 'canvas_ok': True,  'doc_ok': True},

    # ── Layout (doc only — column layout) ────────────────────
    # content: { "columns": 2 }
    'column_container':   {'category': 'layout',      'has_children': True,  'canvas_ok': False, 'doc_ok': True},
    # content: {}  children are any doc_ok blocks
    'column':             {'category': 'layout',      'has_children': True,  'canvas_ok': False, 'doc_ok': True},

    # ── Canvas-only (no document equivalent) ─────────────────
    # sticky: colored note card with text
    # content: { "text": "...", "color": "#422006" }
    'sticky':             {'category': 'canvas_only', 'has_children': False, 'canvas_ok': True,  'doc_ok': False},
    # rich: freeform multi-content block (full TipTap inside canvas)
    # content: { "json": {...} }  ← keeps full TipTap JSON (existing behavior)
    'rich':               {'category': 'canvas_only', 'has_children': False, 'canvas_ok': True,  'doc_ok': False},
    # drawing: future whiteboard/handwriting
    # content: { "strokes": [] }
    'drawing':            {'category': 'canvas_only', 'has_children': False, 'canvas_ok': True,  'doc_ok': False},

    # ── Automation (canvas workflow nodes) ───────────────────
    # Foundation already exists in ai_agent app.
    # These blocks have in/out ports for connecting automation flows.
    # content: { "trigger_type": "manual|schedule|webhook", "config": {} }
    'automation_trigger': {'category': 'automation',  'has_children': False, 'canvas_ok': True,  'doc_ok': False},
    # content: { "action_type": "send_email|create_page|...", "config": {}, "input_port": null }
    'automation_action':  {'category': 'automation',  'has_children': False, 'canvas_ok': True,  'doc_ok': False},
    # content: { "agent_type": "summarize|...", "system_prompt": "", "output": null }
    'ai_agent_block':     {'category': 'automation',  'has_children': False, 'canvas_ok': True,  'doc_ok': False},

    # ── Data (future) ────────────────────────────────────────
    # content: { "schema": [], "view": "table" }
    'database':           {'category': 'data',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    # content: { "columns": [], "rows": [] }
    'spreadsheet':        {'category': 'data',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
    # content: { "fields": [], "submit_label": "Submit" }
    'form':               {'category': 'data',        'has_children': False, 'canvas_ok': False, 'doc_ok': True},
    # content: { "chart_type": "bar|line|pie", "data_source": null }
    'chart':              {'category': 'data',        'has_children': False, 'canvas_ok': True,  'doc_ok': True},
}

VALID_BLOCK_TYPES: list[str] = list(BLOCK_TYPE_REGISTRY.keys())


class Block(EncryptableMixin, AIPermissionMixin, BaseModel):
    """
    A single unit of content on a page.
    Every visible element — text, code, image, kanban — is a Block.
    Blocks nest under other blocks (toggle children, kanban cards).
    Any block can be independently locked.

    block_type is validated against BLOCK_TYPE_REGISTRY at the application
    level (serializer). No Django choices= is used so adding new block types
    requires NO migration — only a registry entry.
    """

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
    block_type = models.CharField(
        max_length=50,
        default='paragraph',
        db_index=True,
        # Validated against BLOCK_TYPE_REGISTRY at application level.
        # No Django choices= so adding new block types needs NO migration.
    )
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

    # ── Canvas styling ────────────────────────────────────────
    bg_color   = models.CharField(max_length=30, blank=True, default='')
    text_color = models.CharField(max_length=30, blank=True, default='')

    # ── Visibility ────────────────────────────────────────────
    doc_visible    = models.BooleanField(default=True)
    canvas_visible = models.BooleanField(default=False)

    # ── Registry-derived properties ───────────────────────────

    @property
    def category(self) -> str:
        return BLOCK_TYPE_REGISTRY.get(self.block_type, {}).get('category', 'text')

    @property
    def has_children(self) -> bool:
        return BLOCK_TYPE_REGISTRY.get(self.block_type, {}).get('has_children', False)

    def get_registry_info(self) -> dict:
        """Returns full registry metadata for this block type."""
        return BLOCK_TYPE_REGISTRY.get(self.block_type, {})

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
