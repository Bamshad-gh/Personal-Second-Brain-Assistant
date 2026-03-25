# Apps/ai_agent/admin.py
"""
Django admin registrations for AI models.

HOW TO MANAGE USER TIERS:
  1. Go to /admin/ai_agent/aiuserquota/
  2. Find the user by email (search bar top right)
  3. Change Tier to 'pro' or 'unlimited'
  4. Optionally set custom_daily_actions / custom_daily_tokens for a one-off override
  5. Save — takes effect immediately on the next AI request

HOW TO INSPECT CHAT HISTORY:
  /admin/ai_agent/aichatmessage/ — shows all messages, filterable by role
  You can search by user email or content.
  WARNING: Do NOT bulk-delete messages here without user confirmation.
           Use DELETE /api/ai/chat/history/ instead so the user controls it.

HOW TO AUDIT USAGE:
  /admin/ai_agent/aiusagelog/ — one row per AI API call, sorted newest first
  Filter by call_type (action vs chat) or provider.
"""

from django.contrib import admin
from .models import AiUsageLog, AiUserQuota, AiChatMessage


@admin.register(AiUserQuota)
class AiUserQuotaAdmin(admin.ModelAdmin):
    """
    Manage per-user AI tiers and limits.

    HOW TO ADD A NEW TIER:
      1. Add to AiUserQuota.TIER_CHOICES in models.py
      2. Add limits to AiUserQuota.TIER_LIMITS in models.py
      3. Run makemigrations
      4. The new tier will appear in this dropdown automatically
    """

    list_display  = ['user', 'tier', 'custom_daily_actions', 'custom_daily_tokens', 'updated_at']
    list_filter   = ['tier']
    search_fields = ['user__email']
    list_editable = ['tier', 'custom_daily_actions', 'custom_daily_tokens']
    ordering      = ['-updated_at']
    readonly_fields = ['id', 'created_at', 'updated_at']

    fieldsets = [
        (None, {
            'fields': ['user', 'tier'],
        }),
        ('Custom Overrides', {
            'description': (
                'Leave blank to use tier defaults. '
                'Set a value to override for this specific user.'
            ),
            'fields': ['custom_daily_actions', 'custom_daily_tokens'],
        }),
        ('Metadata', {
            'fields': ['id', 'created_at', 'updated_at'],
            'classes': ['collapse'],
        }),
    ]


@admin.register(AiChatMessage)
class AiChatMessageAdmin(admin.ModelAdmin):
    """
    Inspect persistent chat history.

    WARNING: Deleting messages here is permanent and bypasses user confirmation.
    Prefer DELETE /api/ai/chat/history/?page={id} so users control their own data.
    """

    list_display  = ['user', 'page', 'role', 'content_preview', 'created_at']
    list_filter   = ['role']
    search_fields = ['user__email', 'content']
    ordering      = ['-created_at']
    readonly_fields = ['id', 'created_at']

    def content_preview(self, obj):
        return obj.content[:80] + ('…' if len(obj.content) > 80 else '')
    content_preview.short_description = 'Content'


@admin.register(AiUsageLog)
class AiUsageLogAdmin(admin.ModelAdmin):
    """Read-only audit log — one row per AI API call."""

    list_display  = ['user', 'call_type', 'action_name', 'provider', 'model',
                     'input_tokens', 'output_tokens', 'created_at']
    list_filter   = ['call_type', 'provider']
    search_fields = ['user__email', 'action_name']
    ordering      = ['-created_at']
    readonly_fields = [
        'id', 'user', 'call_type', 'action_name',
        'provider', 'model', 'input_tokens', 'output_tokens', 'created_at',
    ]

    def has_add_permission(self, request):
        return False  # logs are created only by the AI pipeline

    def has_change_permission(self, request, obj=None):
        return False  # audit logs must not be edited
