# Apps/ai_agent/urls.py
from django.urls import path
from .views import (
    AiActionsView,
    AiActionView,
    AiChatView,
    AiChatHistoryView,
    AiUsageView,
    AiQuotaView,
    TranscribeView,
)

urlpatterns = [
    # List available actions + metadata (frontend loads dynamically)
    path('actions/', AiActionsView.as_view(), name='ai-actions'),

    # Run a predefined action (summarize, expand, fix_grammar, translate, ...)
    path('action/', AiActionView.as_view(), name='ai-action'),

    # Persistent chat history per page — must come before 'chat/' to avoid shadowing
    path('chat/history/', AiChatHistoryView.as_view(), name='ai-chat-history'),

    # Free-form chat with the AI (optionally grounded in a page's content)
    path('chat/', AiChatView.as_view(), name='ai-chat'),

    # Token usage summary for the current user (sidebar footer indicator)
    path('usage/', AiUsageView.as_view(), name='ai-usage'),

    # Per-user daily quota + today's usage (for quota banner in AiPanel)
    path('quota/', AiQuotaView.as_view(), name='ai-quota'),

    # Whisper transcription — voice fallback for Firefox and non-Chrome browsers
    path('transcribe/', TranscribeView.as_view(), name='ai-transcribe'),
]
