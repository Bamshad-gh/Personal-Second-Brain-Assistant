# Apps/ai_agent/models.py
"""
AI data models: usage logging, chat memory, and per-user quota.

════════════════════════════════════════════════════════════════════
WHERE TO FIND THINGS
════════════════════════════════════════════════════════════════════
  AiUsageLog    — one row per AI API call (tokens, provider, model)
    Populated by:   Apps/ai_agent/views.py → AiActionView + AiChatView
    Token counts:   Apps/ai_agent/services.py → AnthropicProvider / OpenAIProvider
    Read by API:    Apps/ai_agent/views.py → AiUsageView (GET /api/ai/usage/)
    Frontend:       src/components/sidebar/Sidebar.tsx → usage indicator in footer
    API call:       src/lib/api.ts → aiApi.getUsage()
    Type def:       src/types/index.ts → AiUsageSummary

  AiChatMessage — persistent chat history per user+page
    Written by:     Apps/ai_agent/services.py → save_chat_messages()
    Read by:        Apps/ai_agent/services.py → get_chat_history()
    API endpoint:   Apps/ai_agent/views.py → AiChatHistoryView (GET/DELETE /api/ai/chat/history/)

  AiUserQuota   — tier limits enforced before every AI call
    Written by:     Django admin (/admin/ → AI User Quotas)
    Read by:        Apps/ai_agent/services.py → check_quota()
    API endpoint:   Apps/ai_agent/views.py → AiQuotaView (GET /api/ai/quota/)

HOW TO CHANGE A USER'S TIER:
  Django admin → AI User Quotas → find user → change Tier field.
  Or set custom_daily_actions / custom_daily_tokens for a one-off override.
════════════════════════════════════════════════════════════════════
"""
import uuid
from django.db import models
from django.conf import settings


class AiUsageLog(models.Model):
    """
    One row per AI API call.

    Tracks token usage so we can:
    - Show users how much AI they've consumed this month
    - Enforce plan limits in the future (free vs paid)
    - Audit AI usage for compliance

    HOW TOKENS WORK:
      input_tokens  = tokens in the prompt/context (what you send to the AI)
      output_tokens = tokens in the AI's response  (what comes back)
      Total cost ≈ (input_tokens × input_price + output_tokens × output_price) / 1_000_000
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ai_usage_logs',
    )

    # Which frontend endpoint triggered this call
    CALL_TYPE_CHOICES = [('action', 'Quick Action'), ('chat', 'Chat')]
    call_type = models.CharField(max_length=16, choices=CALL_TYPE_CHOICES)

    # For 'action' calls — which specific action was run (e.g. 'summarize', 'fix_grammar')
    # Empty string for 'chat' calls
    action_name = models.CharField(max_length=64, blank=True)

    # Which provider and model were used
    # To find provider choices: config/settings/base.py → AI_PROVIDER
    # To find model IDs: config/settings/base.py → AI_MODELS
    provider = models.CharField(max_length=32)
    model    = models.CharField(max_length=64)

    # Token counts returned by the provider's API
    input_tokens  = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['user', 'created_at']),
        ]
        verbose_name     = 'AI Usage Log'
        verbose_name_plural = 'AI Usage Logs'

    def __str__(self):
        return (
            f"{self.user} | {self.call_type}"
            + (f"/{self.action_name}" if self.action_name else "")
            + f" | {self.input_tokens}+{self.output_tokens} tokens"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Chat memory
# ─────────────────────────────────────────────────────────────────────────────

class AiChatMessage(models.Model):
    """
    Stores persistent chat history per user per page.

    Messages are kept in chronological order. When the thread exceeds
    MAX_MESSAGES_PER_THREAD, the oldest half is automatically summarized
    and replaced with a single system summary message to keep context
    manageable without losing important history.

    HOW HISTORY WORKS:
      - services.save_chat_messages() appends every user+assistant exchange
      - services.get_chat_history() retrieves the last N messages
      - services._auto_compact_if_needed() runs after each save
      - AiChatView reads page_id from the request and threads it through

    ROLES:
      'user'      — message sent by the human
      'assistant' — response from the AI
      'system'    — injected by the compaction logic (conversation summaries)
                    Never created directly by the frontend
    """

    MAX_MESSAGES_PER_THREAD = 50  # trigger compaction above this count

    id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ai_chat_messages',
    )
    page = models.ForeignKey(
        'pages.Page',
        on_delete=models.CASCADE,
        related_name='ai_chat_messages',
        null=True,
        blank=True,
    )
    role = models.CharField(
        max_length=16,
        choices=[('user', 'User'), ('assistant', 'Assistant'), ('system', 'System')],
    )
    content    = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes  = [
            models.Index(fields=['user', 'page', 'created_at']),
        ]
        verbose_name        = 'AI Chat Message'
        verbose_name_plural = 'AI Chat Messages'

    def __str__(self):
        preview = self.content[:60] + ('…' if len(self.content) > 60 else '')
        return f"{self.user} | {self.role} | {preview}"


# ─────────────────────────────────────────────────────────────────────────────
# Per-user AI quota
# ─────────────────────────────────────────────────────────────────────────────

class AiUserQuota(models.Model):
    """
    Controls how much AI each user can use per day.
    Enforced by services.check_quota() before every AI call.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    HOW TO CHANGE A USER'S TIER:
      Django admin → AI User Quotas → find user → edit Tier.
      Or set custom_daily_actions / custom_daily_tokens for a one-off
      override that takes priority over the tier defaults.

    HOW TO ADD A NEW TIER:
      1. Add it to TIER_CHOICES below  (e.g. ('enterprise', 'Enterprise'))
      2. Add its limits to TIER_LIMITS (e.g. 'enterprise': {'daily_actions': 5000, ...})
      3. Run makemigrations to capture the new choice
      4. That's it — admin panel picks it up automatically
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    TIER LIMITS (enforced daily, resets at midnight UTC):
      free:      50 actions / day,   5,000 tokens  / day
      pro:      500 actions / day, 100,000 tokens  / day
      unlimited: no limits — check_quota() returns immediately

    CUSTOM OVERRIDES:
      custom_daily_actions / custom_daily_tokens override the tier
      defaults when set (not null). Useful for power users on a free
      plan or restricted users on a pro plan.
    """

    TIER_CHOICES = [
        ('free',      'Free'),
        ('pro',       'Pro'),
        ('unlimited', 'Unlimited'),
    ]

    # ── Default limits per tier ───────────────────────────────────────────────
    # None = unlimited (no check performed for that dimension)
    # To add a tier: add an entry here AND to TIER_CHOICES above, then migrate.
    TIER_LIMITS: dict[str, dict] = {
        'free':      {'daily_actions': 50,   'daily_tokens': 5_000},
        'pro':       {'daily_actions': 500,  'daily_tokens': 100_000},
        'unlimited': {'daily_actions': None, 'daily_tokens': None},
    }

    id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ai_quota',
    )
    tier = models.CharField(max_length=16, choices=TIER_CHOICES, default='free')

    # Optional per-user overrides — null means "use the tier default"
    custom_daily_actions = models.IntegerField(
        null=True, blank=True,
        help_text='Override the tier default. Leave blank to use tier limits.',
    )
    custom_daily_tokens = models.IntegerField(
        null=True, blank=True,
        help_text='Override the tier default. Leave blank to use tier limits.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = 'AI User Quota'
        verbose_name_plural = 'AI User Quotas'

    def __str__(self):
        return f"{self.user} | {self.get_tier_display()}"

    # ── Class methods ─────────────────────────────────────────────────────────

    @classmethod
    def get_or_create_for_user(cls, user):
        """
        Returns the quota object for this user, creating a free-tier one if
        it doesn't exist yet. Safe to call on every AI request.
        """
        quota, _ = cls.objects.get_or_create(user=user)
        return quota

    # ── Instance methods ──────────────────────────────────────────────────────

    def get_daily_limits(self) -> dict:
        """
        Returns the effective daily limits for this user.

        Priority order:
          1. custom_daily_actions / custom_daily_tokens (if set, not None)
          2. TIER_LIMITS[self.tier]
          3. TIER_LIMITS['free']  (fallback if tier not found)

        Returns a dict like: {'daily_actions': 50, 'daily_tokens': 5000}
        A value of None means unlimited for that dimension.
        """
        tier_defaults = self.TIER_LIMITS.get(self.tier, self.TIER_LIMITS['free'])
        return {
            'daily_actions': (
                self.custom_daily_actions
                if self.custom_daily_actions is not None
                else tier_defaults['daily_actions']
            ),
            'daily_tokens': (
                self.custom_daily_tokens
                if self.custom_daily_tokens is not None
                else tier_defaults['daily_tokens']
            ),
        }
