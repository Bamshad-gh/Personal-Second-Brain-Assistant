# Apps/core/encryption.py
#
# Defines encryption tier choices.
# Single source of truth — imported by mixins.py
# and any service that needs to check encryption state.
#
# WHY A SEPARATE FILE:
#     mixins.py imports this
#     services across multiple apps import this
#     if defined inside mixins.py, every import of
#     EncryptionTier would also import all mixin classes
#     keeping it separate avoids that coupling

from django.db import models


class EncryptionTier(models.TextChoices):
    STANDARD  = 'standard',  'Standard'
    # Default for everything
    # No words needed
    # AI works

    PRIVATE   = 'private',   'Private'
    # This specific object is locked
    # Can be set on Workspace, Page, OR Block independently
    # User types words to unlock just this object

    INHERITED = 'inherited', 'Inherited'
    # Only used when parent is PRIVATE
    # Page inside private workspace → inherited automatically
    # Block inside private page → inherited automatically
    # Unlocks when parent unlocks — no extra words needed
    # User never sets this manually — set by services only

    BROWSER   = 'browser',   'Browser Encryption'
    # Phase 4