# Apps/ai_agent/views.py
"""
AI API views.

════════════════════════════════════════════════════════════════════
ENDPOINT MAP
════════════════════════════════════════════════════════════════════
  GET  /api/ai/actions/      → AiActionsView      (list available action metadata)
  POST /api/ai/action/       → AiActionView       (predefined text/code actions)
  POST /api/ai/chat/         → AiChatView         (free-form conversation)
  GET  /api/ai/usage/        → AiUsageView        (token usage summary)
  GET  /api/ai/quota/        → AiQuotaView        (daily quota + today's usage)
  GET/DELETE /api/ai/chat/history/ → AiChatHistoryView (persistent chat history)
  POST /api/ai/transcribe/   → TranscribeView     (Whisper audio → text)
All registered in: Apps/ai_agent/urls.py → config/urls.py
════════════════════════════════════════════════════════════════════
"""

import logging

from django.utils import timezone
from django.db.models import Sum

from rest_framework.views import APIView

logger = logging.getLogger(__name__)
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from django.shortcuts import get_object_or_404

from .serializers import AiActionSerializer, AiChatSerializer
from .models import AiUsageLog, AiUserQuota, AiChatMessage
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

    Error 429:
      { "error": "Daily AI limit reached...", "quota_exceeded": true }
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
            text, input_tokens, output_tokens = services.run_action(
                action_type, content, extra, user=request.user
            )

            # Log usage — wrapped in try/except so a logging failure never breaks AI
            try:
                AiUsageLog.objects.create(
                    user=request.user,
                    call_type='action',
                    action_name=action_type,
                    provider=type(services.get_provider()).__name__,
                    model=services.get_model(services.ACTION_DEFINITIONS.get(action_type, {}).get('tier', 'default')),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
            except Exception:
                pass  # Never let logging break the AI response

            return Response({'result': text})

        except PermissionError as e:
            # Quota exceeded — return 429 with a flag the frontend can check
            return Response(
                {'error': str(e), 'quota_exceeded': True},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except ValueError as e:
            # Invalid action_type — run_action() raises ValueError for unknown actions
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ImportError:
            return Response({'error': 'AI provider package not installed.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                'AI action error user=%s action=%s', request.user.id, action_type
            )
            return Response(
                {'error': 'AI provider error. Please try again.'},
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
    Chat history is automatically persisted per user+page and loaded on each request.

    Request body:
      messages  (required)  — [{"role": "user"|"assistant", "content": "..."}]
      page_id   (optional)  — page UUID to use as context + history thread key
      context   (optional)  — extra context text

    Response:
      { "reply": "AI response text" }

    Error 429:
      { "error": "Daily AI limit reached...", "quota_exceeded": true }
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
            text, input_tokens, output_tokens = services.run_chat(
                messages,
                page_context=context,
                user=request.user,
                page_id=page_id,
            )

            # Log usage
            try:
                AiUsageLog.objects.create(
                    user=request.user,
                    call_type='chat',
                    action_name='',
                    provider=type(services.get_provider()).__name__,
                    model=services.get_model('default'),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
            except Exception:
                pass

            return Response({'reply': text})

        except PermissionError as e:
            return Response(
                {'error': str(e), 'quota_exceeded': True},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except (ImportError, ValueError) as e:
            return Response({'error': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('AI chat error user=%s', request.user.id)
            return Response(
                {'error': 'AI provider error. Please try again.'},
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
            "action_name":  str,
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


class AiQuotaView(APIView):
    """
    GET /api/ai/quota/

    Returns the current user's tier, limits, and today's usage.
    Creates a free-tier quota record if the user doesn't have one yet.

    Response shape:
      {
        "tier":                  "free" | "pro" | "unlimited",
        "daily_actions_limit":   int | null,   — null = unlimited
        "daily_actions_used":    int,           — calls made today (UTC)
        "daily_tokens_limit":    int | null,    — null = unlimited
        "daily_tokens_used":     int            — tokens used today (UTC)
      }
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        quota  = AiUserQuota.get_or_create_for_user(request.user)
        limits = quota.get_daily_limits()

        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_qs    = AiUsageLog.objects.filter(user=request.user, created_at__gte=today_start)

        actions_used = today_qs.count()
        token_agg    = today_qs.aggregate(total=Sum('input_tokens') + Sum('output_tokens'))
        tokens_used  = token_agg['total'] or 0

        return Response({
            'tier':                 quota.tier,
            'daily_actions_limit':  limits['daily_actions'],
            'daily_actions_used':   actions_used,
            'daily_tokens_limit':   limits['daily_tokens'],
            'daily_tokens_used':    tokens_used,
        })


class AiChatHistoryView(APIView):
    """
    GET    /api/ai/chat/history/?page={uuid}
      Returns the last 50 chat messages for this user+page.
      Response: [{"role": "user"|"assistant"|"system", "content": str, "created_at": ISO}, ...]

    DELETE /api/ai/chat/history/?page={uuid}
      Clears all chat messages for this user+page.
      Returns 204 No Content.
      NOTE: This permanently deletes the thread. The frontend should confirm
            with the user before calling this endpoint.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        page_id = request.query_params.get('page')
        qs = AiChatMessage.objects.filter(user=request.user)
        if page_id:
            qs = qs.filter(page_id=page_id)

        messages = list(
            qs.order_by('created_at').values('role', 'content', 'created_at')[:50]
        )
        for msg in messages:
            msg['created_at'] = msg['created_at'].isoformat()

        return Response(messages)

    def delete(self, request):
        page_id = request.query_params.get('page')
        qs = AiChatMessage.objects.filter(user=request.user)
        if page_id:
            qs = qs.filter(page_id=page_id)
        qs.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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


class AiActionsView(APIView):
    """
    GET /api/ai/actions/

    Returns the list of available AI actions with their UI metadata.
    Does NOT return system prompts — those stay server-side.

    Response shape:
      [
        {
          "action_type":    "summarize",
          "label":          "Summarize",
          "description":    "Condense to key points",
          "category":       "text",
          "requires_extra": []
        },
        ...
      ]

    The frontend uses this to render action buttons dynamically, so adding
    a new action in services.py automatically appears in the UI without any
    frontend code changes.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        actions = [
            {
                'action_type':    key,
                'label':          defn['label'],
                'description':    defn['description'],
                'category':       defn['category'],
                'requires_extra': defn.get('requires_extra', []),
            }
            for key, defn in services.ACTION_DEFINITIONS.items()
        ]
        return Response(actions)


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


# ─────────────────────────────────────────────────────────────────────────────
# AI Agent views
# ─────────────────────────────────────────────────────────────────────────────

class AiAgentChatView(APIView):
    """
    POST /api/ai/agent-chat/

    Enhanced chat that returns structured JSON action proposals.
    The AI may propose create/modify actions that require user confirmation
    before the frontend executes them.

    Request body:
      messages  (required) — [{"role": "user"|"assistant", "content": "..."}]
      page_id   (optional) — page UUID used as context + history thread key
      context   (optional) — extra context text (e.g. page content)

    Response:
      Normal message:
        { "type": "message", "message": str,
          "input_tokens": int, "output_tokens": int }

      Action proposal (frontend must confirm before executing):
        { "type": "action", "action": str, "data": dict, "message": str,
          "input_tokens": int, "output_tokens": int }

    Error 429:
      { "error": str, "quota_exceeded": true }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        messages = request.data.get('messages', [])
        page_id  = request.data.get('page_id')
        context  = request.data.get('context', '')

        if not messages:
            return Response(
                {'error': 'messages field is required and must be non-empty.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optionally enrich context from the page (same helper used by AiChatView)
        if page_id and not context:
            page_text = AiActionView()._get_page_text(page_id, request.user)
            if page_text:
                context = page_text

        try:
            parsed, input_tok, output_tok = services.run_agent_chat(
                messages=messages,
                page_context=context,
                user=request.user,
                page_id=page_id,
            )
        except PermissionError as e:
            return Response(
                {'error': str(e), 'quota_exceeded': True},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except Exception as e:
            logger.exception('AiAgentChatView: run_agent_chat failed')
            return Response(
                {'error': f'Agent error: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Log usage — wrapped so a logging failure never breaks the response
        try:
            AiUsageLog.objects.create(
                user=request.user,
                call_type='chat',
                action_name='agent_chat',
                provider=type(services.get_provider()).__name__,
                model=services.get_model('default'),
                input_tokens=input_tok,
                output_tokens=output_tok,
            )
        except Exception:
            pass

        return Response({
            **parsed,
            'input_tokens':  input_tok,
            'output_tokens': output_tok,
        })


class PageCreateWithBlocksView(APIView):
    """
    POST /api/ai/execute/create-page/

    Creates a page with an initial set of blocks in one atomic transaction.
    Called by the frontend after the user approves an AI 'create_page' proposal.

    Request body:
      workspace_id  (required) — UUID of the target workspace
      title         (required) — page title string
      blocks        (optional) — list of { block_type, content } objects

    Response:
      Full PageSerializer representation of the new page (201).

    Errors:
      404 — workspace not found or not owned by the requesting user
      400 — missing workspace_id
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from Apps.workspaces.models import Workspace
        from Apps.pages.models import Page
        from Apps.blocks.models import Block, VALID_BLOCK_TYPES
        from Apps.pages.serializers import PageSerializer
        from django.db import transaction

        workspace_id = request.data.get('workspace_id')
        if not workspace_id:
            return Response(
                {'error': 'workspace_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        title       = request.data.get('title', 'Untitled')
        blocks_data = request.data.get('blocks', [])

        workspace = get_object_or_404(
            Workspace,
            pk=workspace_id,
            owner=request.user,
        )

        with transaction.atomic():
            page = Page.objects.create(
                workspace=workspace,
                title=title,
                created_by=request.user,
            )

            for i, block_data in enumerate(blocks_data):
                btype = block_data.get('block_type', 'paragraph')
                # Silently coerce unknown types to paragraph so a bad AI
                # response never causes a 500 — the page still gets created.
                if btype not in VALID_BLOCK_TYPES:
                    btype = 'paragraph'

                Block.objects.create(
                    page=page,
                    block_type=btype,
                    content=block_data.get('content', {}),
                    order=float(i + 1),
                    doc_visible=True,
                    canvas_visible=False,
                )

        return Response(PageSerializer(page).data, status=status.HTTP_201_CREATED)
