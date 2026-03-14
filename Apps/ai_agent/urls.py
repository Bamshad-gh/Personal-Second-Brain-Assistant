# Apps/ai_agent/urls.py
from django.urls import path
from .views import AiActionView, AiChatView, AiUsageView

urlpatterns = [
    # Run a predefined action (summarize, expand, fix_grammar, translate, ...)
    path('action/', AiActionView.as_view(), name='ai-action'),

    # Free-form chat with the AI (optionally grounded in a page's content)
    path('chat/', AiChatView.as_view(), name='ai-chat'),

    # Token usage summary for the current user (sidebar footer indicator)
    path('usage/', AiUsageView.as_view(), name='ai-usage'),
]
