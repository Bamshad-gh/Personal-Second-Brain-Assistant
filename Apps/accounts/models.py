from django.db import models
import uuid
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)

# Create your models here.
# users/models.py
# ⚠️ DO THIS BEFORE 'py manage.py migrate'

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

# ── CUSTOM MANAGER ────────────────────────────────────────────────
# Required when you remove username — teaches Django how to create users
class UserManager(BaseUserManager):

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)   # Ali@GMAIL.COM → ali@gmail.com
        user  = self.model(email=email, **extra_fields)
        user.set_password(password)           # hashes password — NEVER store plain text
        user.save(using=self._db)  # Save to DB
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        # Called by: py manage.py createsuperuser
        extra_fields.setdefault('is_staff',     True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)

# ── USER MODEL ────────────────────────────────────────────────────
class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model.

    Why AbstractBaseUser instead of AbstractUser:
        AbstractUser keeps the username field even if unused.
        AbstractBaseUser is a clean slate — we define exactly
        what exists. No hidden fields, no surprises.

    Expandability:
        Add fields freely — avatar, bio, plan, etc.
        Never add workspace or crypto fields here.
        User = identity only. Everything else belongs elsewhere.
    """

    # UUID instead of auto-increment integer.
    # Reason: integers are guessable (/users/1/, /users/2/).
    # UUIDs are not. Collision probability is near zero.
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,      # never changeable after creation
    )

    # Login field — replaces username entirely
    email = models.EmailField(
        unique=True,         # database-level constraint, not just validation
    )

    # Display name — optional, falls back to email prefix in property below
    full_name = models.CharField(max_length=255, blank=True)

    # Profile fields — expandable, add more as needed
    avatar = models.ImageField(
        upload_to='avatars/',
        null=True,
        blank=True,
    )
    bio = models.TextField(blank=True)

    # Required by Django's permission system
    is_active = models.BooleanField(default=True)
    is_staff  = models.BooleanField(default=False)

    # Audit field
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateField(blank=True,null=True)

    objects = UserManager()

    # This tells Django: use email to log in, not username
    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = []    # empty = only email+password needed at createsuperuser

    class Meta:
        verbose_name       = 'User'
        verbose_name_plural = 'Users'
        indexes = [
            models.Index(fields=['email']),
        ]

    def __str__(self):
        return self.email

    @property
    def display_name(self):
        """
        Safe display name — always returns something readable.
        Used in templates: {{ user.display_name }}
        """
        return self.full_name or self.email.split('@')[0]
