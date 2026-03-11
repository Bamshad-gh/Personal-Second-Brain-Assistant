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

    # ── Display ───────────────────────────────────────────────
    page_type  = models.CharField(max_length=50, choices=PageType.choices, default=PageType.NOTE)
    view_mode  = models.CharField(max_length=20, choices=ViewMode.choices, default=ViewMode.DOCUMENT)
    title      = models.CharField(max_length=500, default='Untitled')
    icon       = models.CharField(max_length=10, blank=True)
    header_pic = models.ImageField(upload_to='page_headers/', blank=True, null=True)
    is_pinned  = models.BooleanField(default=False)

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