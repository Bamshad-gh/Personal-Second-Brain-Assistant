from django.db import models
from django.contrib.auth import get_user_model
from Apps.core.mixins import BaseModel, EncryptableMixin, AIPermissionMixin
from Apps.core.encryption import EncryptionTier

User = get_user_model()


class Page(EncryptableMixin, AIPermissionMixin, BaseModel):
    """
    Every document, note, client, project, invoice is a Page.
    Pages nest under other pages (sidebar tree).
    Any page can be independently locked regardless of workspace state.
    """

    class PageType(models.TextChoices):
        # Phase 1
        NOTE      = 'note',      'Note'
        SECURE    = 'secure',    'Secure Page'
        # Phase 2
        TEMPLATE  = 'template',  'Template'
        # Phase 3
        CLIENT    = 'client',    'Client'
        PROJECT   = 'project',   'Project'
        INVOICE   = 'invoice',   'Invoice'
        # Phase 4
        EXPENSE   = 'expense',   'Expense'
        DASHBOARD = 'dashboard', 'Dashboard'

    class ViewMode(models.TextChoices):
        DOCUMENT = 'document', 'Document'
        CANVAS   = 'canvas',   'Canvas'

    class ColorStyle(models.TextChoices):
        NONE   = 'none',   'No color'
        ACCENT = 'accent', 'Accent line only'
        TINT   = 'tint',   'Background tint only'
        BOTH   = 'both',   'Accent line + background tint'

    # ── Relations ─────────────────────────────────────────────
    workspace  = models.ForeignKey(
        'workspaces.Workspace',
        on_delete=models.CASCADE,
        related_name='pages',
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='pages',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )
    custom_page_type = models.ForeignKey(
        'properties.CustomPageType',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='pages',
    )

    # ── Display ───────────────────────────────────────────────
    page_type  = models.CharField(max_length=50, choices=PageType.choices, default=PageType.NOTE)
    view_mode  = models.CharField(max_length=20, choices=ViewMode.choices, default=ViewMode.DOCUMENT)
    title      = models.CharField(max_length=500, default='Untitled')
    icon       = models.CharField(max_length=10, blank=True)
    header_pic     = models.ImageField(upload_to='page_headers/', blank=True, null=True)
    # URL-based cover (gallery picks, external URLs, Unsplash).
    # Resolved on the frontend: header_pic_url takes priority over header_pic file.
    header_pic_url = models.URLField(blank=True, default='')
    is_pinned  = models.BooleanField(default=False)
    # color: per-page hex accent. Empty string = "use type default".
    # Frontend resolves: page.color || type.default_color || '#7c3aed'
    color       = models.CharField(max_length=20, default='', blank=True)
    # color_style: controls where the page color is applied in the content area.
    #   'none'   → color only shown in sidebar/graph, not in the page itself
    #   'accent' → thin colored line below the page title
    #   'tint'   → very faint background tint on the content area (~3% opacity)
    #   'both'   → accent line + background tint (default)
    color_style = models.CharField(
        max_length=10,
        choices=ColorStyle.choices,
        default=ColorStyle.BOTH,
    )

    class Meta:
        ordering = ['-updated_at']
        indexes  = [
            models.Index(fields=['workspace', 'is_deleted']),
            models.Index(fields=['workspace', 'page_type', 'is_deleted']),
            models.Index(fields=['parent', 'is_deleted']),
            models.Index(fields=['workspace', 'is_pinned']),
        ]

    def __str__(self):
        return f'{self.title} [{self.page_type}]'

    def save(self, *args, **kwargs):
        # SECURE pages are always encrypted — enforce on every save
        if self.page_type == self.PageType.SECURE:
            if self.enc_tier == EncryptionTier.STANDARD:
                self.enc_tier   = EncryptionTier.PRIVATE
                self.is_locked  = True
                self.ai_consent = self.AIConsent.DISABLED
        super().save(*args, **kwargs)