# Apps/ai_agent/models.py
"""
AI usage tracking model.

════════════════════════════════════════════════════════════════════
WHERE TO FIND THINGS
════════════════════════════════════════════════════════════════════
  This model:          Apps/ai_agent/models.py  ← YOU ARE HERE
  Populated by:        Apps/ai_agent/views.py → AiActionView + AiChatView
  Token counts from:   Apps/ai_agent/services.py → AnthropicProvider.chat() / OpenAIProvider.chat()
  Read by API:         Apps/ai_agent/views.py → AiUsageView (GET /api/ai/usage/)
  Frontend display:    src/components/sidebar/Sidebar.tsx → usage indicator in footer
  API call:            src/lib/api.ts → aiApi.getUsage()
  Type definition:     src/types/index.ts → AiUsageSummary
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
