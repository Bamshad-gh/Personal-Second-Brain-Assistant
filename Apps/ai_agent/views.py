# Apps/ai_agent/views.py
"""
AI API views.

Endpoints:
  POST /api/ai/action/  → AiActionView  (predefined text actions)
  POST /api/ai/chat/    → AiChatView    (free-form conversation)
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from .serializers import AiActionSerializer, AiChatSerializer
from . import services


class AiActionView(APIView):
    """
    POST /api/ai/action/

    Run a predefined AI action on some text.

    Request body:
      action_type  (required)  — e.g. 'summarize', 'fix_grammar', 'expand'
      content      (optional)  — text to process
      page_id      (optional)  — if no content, fetches text from this page
      extra        (optional)  — e.g. {"language": "Spanish"} for translate

    Response:
      { "result": "AI-generated text" }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AiActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data        = serializer.validated_data
        action_type = data['action_type']
        content     = data.get('content', '')
        page_id     = data.get('page_id')
        extra       = data.get('extra')

        # If content is empty, fetch it from the page
        if not content and page_id:
            content = self._get_page_text(page_id, request.user)
            if content is None:
                return Response(
                    {'error': 'Page not found or you do not have access to it.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

        if not content:
            return Response(
                {'error': 'No content to process. Provide content or a valid page_id.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = services.run_action(action_type, content, extra)
            return Response({'result': result})
        except (ImportError, ValueError) as e:
            # Missing package or invalid action
            return Response({'error': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            return Response(
                {'error': f'AI provider error: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    def _get_page_text(self, page_id, user):
        """Fetch page title + block text content for a given page UUID."""
        try:
            from Apps.pages.models import Page
            page = Page.objects.get(id=page_id, workspace__owner=user, is_deleted=False)
        except Page.DoesNotExist:
            return None

        # Collect text from all non-deleted text blocks on the page
        blocks = page.blocks.filter(is_deleted=False).order_by('order')
        lines = [page.title] if page.title else []
        for block in blocks:
            content = block.content or {}
            # Most text blocks store their text in content['text'] or content['json']
            if isinstance(content.get('text'), str):
                lines.append(content['text'])
            elif isinstance(content.get('json'), dict):
                # TipTap JSON — extract plain text recursively
                lines.append(_extract_tiptap_text(content['json']))

        return '\n'.join(filter(None, lines))


class AiChatView(APIView):
    """
    POST /api/ai/chat/

    Free-form conversation with the AI, optionally grounded in a page's content.

    Request body:
      messages  (required)  — [{"role": "user"|"assistant", "content": "..."}]
      page_id   (optional)  — page UUID to use as context
      context   (optional)  — extra context text

    Response:
      { "reply": "AI response text" }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AiChatSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data     = serializer.validated_data
        messages = [{'role': m['role'], 'content': m['content']} for m in data['messages']]
        page_id  = data.get('page_id')
        context  = data.get('context', '')

        # Optionally enrich context from the page
        if page_id:
            page_text = AiActionView()._get_page_text(page_id, request.user)
            if page_text:
                context = f"{context}\n\n{page_text}".strip()

        try:
            reply = services.run_chat(messages, page_context=context)
            return Response({'reply': reply})
        except (ImportError, ValueError) as e:
            return Response({'error': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            return Response(
                {'error': f'AI provider error: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )


# ─────────────────────────────────────────────────────────────────────────────
# Helper — extract plain text from a TipTap JSON document
# ─────────────────────────────────────────────────────────────────────────────

def _extract_tiptap_text(node: dict) -> str:
    """Recursively extract plain text from a TipTap editor JSON node."""
    if not isinstance(node, dict):
        return ''
    if node.get('type') == 'text':
        return node.get('text', '')
    parts = []
    for child in node.get('content', []):
        parts.append(_extract_tiptap_text(child))
    return ' '.join(filter(None, parts))
