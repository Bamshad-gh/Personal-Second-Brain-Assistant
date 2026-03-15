# Apps/ai_agent/views.py
"""
AI API views.

════════════════════════════════════════════════════════════════════
ENDPOINT MAP
════════════════════════════════════════════════════════════════════
  POST /api/ai/action/      → AiActionView    (predefined text actions)
  POST /api/ai/chat/        → AiChatView      (free-form conversation)
  GET  /api/ai/usage/       → AiUsageView     (token usage summary)
  POST /api/ai/transcribe/  → TranscribeView  (Whisper audio → text)
All registered in: Apps/ai_agent/urls.py → config/urls.py
════════════════════════════════════════════════════════════════════
"""

from django.utils import timezone
from django.db.models import Sum

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from .serializers import AiActionSerializer, AiChatSerializer
from .models import AiUsageLog
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
            text, input_tokens, output_tokens = services.run_action(action_type, content, extra)

            # Log usage — wrapped in try/except so a logging failure never breaks AI
            try:
                AiUsageLog.objects.create(
                    user=request.user,
                    call_type='action',
                    action_name=action_type,
                    provider=getattr(services.get_provider(), '__class__', type('', (), {'__name__': 'unknown'})).__name__,
                    model=services.get_model(services.ACTION_MODELS.get(action_type, 'default')),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
            except Exception:
                pass  # Never let logging break the AI response

            return Response({'result': text})

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
            text, input_tokens, output_tokens = services.run_chat(messages, page_context=context)

            # Log usage
            try:
                AiUsageLog.objects.create(
                    user=request.user,
                    call_type='chat',
                    action_name='',
                    provider=getattr(services.get_provider(), '__class__', type('', (), {'__name__': 'unknown'})).__name__,
                    model=services.get_model('default'),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
            except Exception:
                pass

            return Response({'reply': text})

        except (ImportError, ValueError) as e:
            return Response({'error': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            return Response(
                {'error': f'AI provider error: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class AiUsageView(APIView):
    """
    GET /api/ai/usage/

    Returns the current user's AI usage summary.

    Response shape:
      {
        "total_input_tokens":  int,   — all-time input tokens
        "total_output_tokens": int,   — all-time output tokens
        "calls_today":         int,   — calls made today (UTC)
        "calls_this_month":    int,   — calls made this calendar month
        "recent": [                   — last 10 calls
          {
            "call_type":    "action" | "chat",
            "action_name":  str,   — e.g. "summarize", "" for chat
            "model":        str,
            "input_tokens": int,
            "output_tokens": int,
            "created_at":   ISO 8601 string
          }
        ]
      }
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = AiUsageLog.objects.filter(user=request.user)

        now   = timezone.now()
        today = now.date()

        totals = qs.aggregate(
            total_input=Sum('input_tokens'),
            total_output=Sum('output_tokens'),
        )

        calls_today = qs.filter(created_at__date=today).count()
        calls_this_month = qs.filter(
            created_at__year=now.year,
            created_at__month=now.month,
        ).count()

        recent = list(
            qs.values(
                'call_type', 'action_name', 'model',
                'input_tokens', 'output_tokens', 'created_at',
            )[:10]
        )
        # Serialize datetime to ISO string
        for row in recent:
            row['created_at'] = row['created_at'].isoformat()

        return Response({
            'total_input_tokens':  totals['total_input']  or 0,
            'total_output_tokens': totals['total_output'] or 0,
            'calls_today':         calls_today,
            'calls_this_month':    calls_this_month,
            'recent':              recent,
        })


class TranscribeView(APIView):
    """
    POST /api/ai/transcribe/

    Accepts a multipart audio file recorded by the browser's MediaRecorder API
    (webm format). Transcribes it using OpenAI Whisper and returns the text.

    This is the voice-input fallback for browsers that don't support the
    Web Speech API (e.g. Firefox). Chrome/Edge use the native API directly
    and never call this endpoint.

    Request:  multipart/form-data, field "audio" — audio/webm blob
    Response: { "text": "transcribed text..." }

    Errors:
      400 — no file or file too large (Whisper max is 25 MB)
      502 — Whisper API error
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from openai import OpenAI

        audio_file = request.FILES.get('audio')
        if not audio_file:
            return Response(
                {'error': 'No audio file provided. Send a multipart field named "audio".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Whisper rejects files over 25 MB
        if audio_file.size > 25 * 1024 * 1024:
            return Response(
                {'error': 'Audio file too large. Maximum size is 25 MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from django.conf import settings as django_settings
            client = OpenAI(api_key=django_settings.OPENAI_API_KEY)
            transcript = client.audio.transcriptions.create(
                model='whisper-1',
                file=audio_file,
                response_format='text',
            )
            return Response({'text': transcript})
        except Exception as e:
            return Response(
                {'error': f'Transcription error: {str(e)}'},
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
