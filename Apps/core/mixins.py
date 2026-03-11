# Apps/core/mixins.py

import uuid
from django.db import models
from .encryption import EncryptionTier


# ══════════════════════════════════════════════════════════════
# UUID
# ══════════════════════════════════════════════════════════════

class UUIDMixin(models.Model):
    """Primary key — unguessable, safe in URLs."""

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    class Meta:
        abstract = True


# ══════════════════════════════════════════════════════════════
# TIMESTAMPS
# ══════════════════════════════════════════════════════════════

class TimeStampMixin(models.Model):
    """
    created_at        — when row was created (server)
    updated_at        — when row was last saved (server, auto)
    client_updated_at — when user actually edited (device clock, Phase 4 sync)
    sync_version      — increments each save, detects stale clients (Phase 4)
    """

    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)
    client_updated_at = models.DateTimeField(null=True, blank=True)
    sync_version      = models.IntegerField(default=0)

    class Meta:
        abstract = True


# ══════════════════════════════════════════════════════════════
# SOFT DELETE
# ══════════════════════════════════════════════════════════════

class SoftDeleteMixin(models.Model):
    """
    Never hard delete. Mark as deleted — keep the row.
    Allows: trash restore, intact backlinks, audit trail.
    Rule: never call .delete() — always use services.py.
    Rule: always filter queries with is_deleted=False.
    """

    is_deleted = models.BooleanField(default=False)

    class Meta:
        abstract = True


# ══════════════════════════════════════════════════════════════
# ENCRYPTION
# ══════════════════════════════════════════════════════════════

class EncryptableMixin(models.Model):
    """
    Applied to: Workspace, Page, Block — independently.
    Any object can be locked regardless of its parent.

    enc_tier options:
        STANDARD  — no encryption, AI works, default
        PRIVATE   — locked by own 12 words, own enc_key_blob
        INHERITED — parent is locked, uses parent key, no own blob
                    set automatically by services, never by user

    Unlock rules:
        Lock workspace → pages/blocks inside become INHERITED
                         one unlock opens everything inside
        Lock page      → blocks inside become INHERITED
                         unlocking page opens all its blocks
        Lock block     → only that block locked, nothing else affected

    enc_key fields only populated when enc_tier = PRIVATE.
    Blank for STANDARD and INHERITED.
    """

    enc_tier = models.CharField(
        max_length=20,
        choices=EncryptionTier.choices,
        default=EncryptionTier.STANDARD,
    )
    is_locked          = models.BooleanField(default=False)
    enc_key_blob       = models.TextField(blank=True)
    enc_key_salt       = models.CharField(max_length=64, blank=True)
    enc_key_hint       = models.CharField(max_length=255, blank=True)
    enc_recovery_blob  = models.TextField(blank=True)
    enc_recovery_salt  = models.CharField(max_length=64, blank=True)
    has_recovery_words = models.BooleanField(default=False)

    class Meta:
        abstract = True

    @property
    def is_encrypted(self):
        return self.enc_tier != EncryptionTier.STANDARD


# ══════════════════════════════════════════════════════════════
# AI PERMISSION
# ══════════════════════════════════════════════════════════════

class AIPermissionMixin(models.Model):
    """
    Applied to: Workspace, Page, Block — independently.

    Consent levels:
        FULL         — AI sees everything (default, standard objects)
        METADATA     — AI sees titles/dates only, never content
        TEMP_DECRYPT — encrypted object, user explicitly opted in
                       browser decrypts temporarily, never written to disk
        DISABLED     — AI cannot touch this object
                       default when object is locked (set by services)

    Voice to text always bypasses this — it is transcription not reading.
    Services check ai_available before every AI call.
    """

    class AIConsent(models.TextChoices):
        FULL         = 'full',         'AI on Full Content'
        METADATA     = 'metadata',     'AI on Metadata Only'
        TEMP_DECRYPT = 'temp_decrypt', 'AI with Temporary Decryption'
        DISABLED     = 'disabled',     'AI Disabled'

    ai_consent = models.CharField(
        max_length=20,
        choices=AIConsent.choices,
        default=AIConsent.FULL,
        # When object is locked → services set this to DISABLED
        # Never change directly — always go through services
    )

    class Meta:
        abstract = True

    @property
    def ai_available(self):
        if not self.is_encrypted:
            return self.ai_consent != self.AIConsent.DISABLED
        return self.ai_consent in (
            self.AIConsent.TEMP_DECRYPT,
            self.AIConsent.METADATA,
        )


# ══════════════════════════════════════════════════════════════
# BASE MODEL — combines primitives, every model inherits this
# ══════════════════════════════════════════════════════════════

class BaseModel(UUIDMixin, TimeStampMixin, SoftDeleteMixin, models.Model):
    """
    Foundation for every model in the project.
    Provides: id, created_at, updated_at,
              client_updated_at, sync_version, is_deleted

    Without encryption/AI:
        class Connection(BaseModel): ...

    With encryption and AI:
        class Workspace(EncryptableMixin, AIPermissionMixin, BaseModel): ...
        class Page(EncryptableMixin, AIPermissionMixin, BaseModel): ...
        class Block(EncryptableMixin, AIPermissionMixin, BaseModel): ...
    """

    class Meta:
        abstract = True
