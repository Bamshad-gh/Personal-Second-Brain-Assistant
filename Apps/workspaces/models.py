

# Create your models here.
#_____________________________________________________________________
#                         ---- WorkSpace ----
#____________________________________________________________________

import uuid
from Apps.accounts.models import User
from django.db import models
from django.contrib.auth import get_user_model
from Apps.core.mixins import BaseModel, EncryptableMixin, AIPermissionMixin

User = get_user_model()


class Workspace(EncryptableMixin, AIPermissionMixin, BaseModel):
    """
    The vault. Every page and block lives inside a workspace.
    One user can own many workspaces — each completely isolated.
    Encryption, AI consent, and storage tracked at this level.
    """

    class WorkspaceColor(models.TextChoices):
        WHITE  = 'white',  'White'
        RED    = 'red',    'Red'
        GREEN  = 'green',  'Green'
        YELLOW = 'yellow', 'Yellow'
        BLUE   = 'blue',   'Blue'
        PURPLE = 'purple', 'Purple'

    # ── Identity ──────────────────────────────────────────────
    owner       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspaces')
    name        = models.CharField(max_length=255, default='My Space')
    icon        = models.CharField(max_length=10, blank=True, default='🏠')
    color       = models.CharField(max_length=20, choices=WorkspaceColor.choices, default=WorkspaceColor.WHITE)
    description = models.TextField(max_length=500, blank=True)
    is_personal = models.BooleanField(default=False)

    # ── Storage ───────────────────────────────────────────────
    storage_used_mb = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        # Updated on every file/image upload
        # Checked against plan limit before accepting uploads
    )

    class Meta:
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['owner', 'is_deleted']),
        ]

    def __str__(self):
        return f'{self.name} ({self.owner.email})'