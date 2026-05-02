from django.db import models
from django.conf import settings

from Apps.core.mixins import BaseModel


class EmailIntegration(BaseModel):
    """
    One connected email account per user.
    provider: 'gmail' | 'outlook' | 'smtp'
    OAuth providers store encrypted tokens; SMTP stores encrypted credentials.
    Only one integration per user may have is_default=True.
    """

    user  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='email_integrations',
    )
    provider   = models.CharField(max_length=20)         # 'gmail' | 'outlook' | 'smtp'
    label      = models.CharField(max_length=255, blank=True)
    email      = models.EmailField(blank=True)

    # OAuth token storage (Gmail / Outlook)
    access_token_enc  = models.TextField(blank=True)     # encrypt_token(access_token)
    refresh_token_enc = models.TextField(blank=True)     # encrypt_token(refresh_token)
    token_expiry      = models.DateTimeField(null=True, blank=True)

    # SMTP credential storage
    smtp_host         = models.CharField(max_length=255, blank=True)
    smtp_port         = models.PositiveIntegerField(null=True, blank=True)
    smtp_use_tls      = models.BooleanField(default=True)
    smtp_username     = models.CharField(max_length=255, blank=True)
    smtp_password_enc = models.TextField(blank=True)     # encrypt_token(password)

    is_default = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'is_default']),
            models.Index(fields=['user', 'provider']),
        ]

    def __str__(self):
        return f'{self.provider}:{self.email} ({self.user})'


class GoogleCalendarIntegration(BaseModel):
    """
    OAuth tokens for Google Calendar two-way sync per user.
    Separate from EmailIntegration because Calendar OAuth uses different scopes.
    scope: https://www.googleapis.com/auth/calendar
    """

    user               = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='google_calendar_integration',
    )
    access_token_enc   = models.TextField(blank=True)
    refresh_token_enc  = models.TextField(blank=True)
    token_expiry       = models.DateTimeField(null=True, blank=True)
    synced_calendar_id = models.CharField(max_length=255, blank=True)  # Google Calendar ID

    def __str__(self):
        return f'GoogleCalendar({self.user})'


class LinkedInIntegration(BaseModel):
    """
    LinkedIn OAuth connection per user.
    LinkedIn standard OAuth2 does NOT issue refresh tokens — tokens last 60 days.
    person_urn: urn:li:person:{id} — required to post on behalf of user.
    """

    user             = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='linkedin_integration',
    )
    access_token_enc = models.TextField(blank=True)
    token_expiry     = models.DateTimeField(null=True, blank=True)
    person_urn       = models.CharField(max_length=255, blank=True)   # urn:li:person:XXXXX
    display_name     = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f'LinkedIn({self.display_name or self.user})'


class ScheduledPost(BaseModel):
    """
    A post scheduled for any social platform (platform-agnostic).
    platform: plain CharField so new platforms can be added without migrations.
    status: 'draft' | 'scheduled' | 'sent' | 'failed'
    template supports {{column_name}} placeholders resolved at send time.
    """

    user             = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='scheduled_posts',
    )
    platform         = models.CharField(max_length=30)       # 'linkedin' (extensible)
    status           = models.CharField(max_length=20, default='draft')
    content          = models.TextField()                    # final resolved text
    template         = models.TextField(blank=True)          # raw {{placeholder}} template
    scheduled_at     = models.DateTimeField(null=True, blank=True)  # None = post immediately
    sent_at          = models.DateTimeField(null=True, blank=True)
    error_log        = models.TextField(blank=True)
    platform_post_id = models.CharField(max_length=255, blank=True)
    source_row       = models.ForeignKey(
        'database.DatabaseRow',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='scheduled_posts',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['status', 'scheduled_at']),
        ]

    def __str__(self):
        return f'{self.platform} post by {self.user} [{self.status}]'
