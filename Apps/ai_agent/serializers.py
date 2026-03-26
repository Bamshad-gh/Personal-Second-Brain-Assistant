# Apps/ai_agent/serializers.py
"""
Request/response serializers for AI endpoints.

TO ADD A NEW ACTION TYPE:
  Add its definition to services.py → ACTION_DEFINITIONS.
  No changes needed here — action_type is validated by run_action() at runtime.
"""

from rest_framework import serializers


class AiActionSerializer(serializers.Serializer):
    """
    POST /api/ai/action/

    action_type  — which action to run (validated by run_action() in services.py)
    content      — the text to process (required)
    page_id      — optional UUID, used to fetch page text if content not provided
    extra        — optional dict of additional params (e.g. {"language": "Spanish"})
    """

    action_type = serializers.CharField(max_length=64)
    content     = serializers.CharField(required=False, allow_blank=True, default='')
    page_id     = serializers.UUIDField(required=False, allow_null=True, default=None)
    extra       = serializers.DictField(required=False, allow_null=True, default=None)

    def validate(self, data):
        if not data.get('content') and not data.get('page_id'):
            raise serializers.ValidationError(
                "Either 'content' or 'page_id' must be provided."
            )
        return data


class AiChatMessageSerializer(serializers.Serializer):
    """A single message in a chat conversation."""
    role    = serializers.ChoiceField(choices=['user', 'assistant'])
    content = serializers.CharField()


class AiChatSerializer(serializers.Serializer):
    """
    POST /api/ai/chat/

    messages     — full conversation history (role + content pairs)
    page_id      — optional UUID of the current page (used as context for the AI)
    context      — optional extra context text to give the AI
    """

    messages = AiChatMessageSerializer(many=True, min_length=1)
    page_id  = serializers.UUIDField(required=False, allow_null=True, default=None)
    context  = serializers.CharField(required=False, allow_blank=True, default='')
