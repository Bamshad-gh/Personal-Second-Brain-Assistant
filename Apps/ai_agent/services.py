# Apps/ai_agent/services.py
"""
AI provider abstraction layer.

════════════════════════════════════════════════════════════════════
FILE MAP — where to find things
════════════════════════════════════════════════════════════════════

ADDING A NEW AI PROVIDER
  1. Create a class below (e.g. class GeminiProvider)
  2. Give it a .chat(messages, model, system) method that returns
     {'text': str, 'input_tokens': int, 'output_tokens': int}
  3. Add it to the PROVIDERS dict at the bottom of this section
  4. Set AI_PROVIDER = 'gemini' in your .env

ADDING A NEW ACTION TYPE
  1. Add an entry to ACTION_DEFINITIONS below
  2. That's it — automatically available via POST /api/ai/action/
     and GET /api/ai/actions/ (frontend loads the list dynamically)

CHANGING THE AI MODEL
  config/settings/base.py → AI_MODELS dict
  For Groq models: add AI_MODELS['groq'] = {'default': '...', 'fast': '...'}

ENDPOINT MAP
  GET  /api/ai/actions/     → list action metadata (frontend loads dynamically)
  POST /api/ai/action/      → predefined action (summarize, expand, fix_grammar, …)
  POST /api/ai/chat/        → free-form conversation with page as context
  GET  /api/ai/usage/       → token usage summary
  GET  /api/ai/quota/       → per-user daily quota + usage
  GET/DELETE /api/ai/chat/history/ → persistent chat history per page
  POST /api/ai/transcribe/  → Whisper audio → text
  All registered in: Apps/ai_agent/urls.py → config/urls.py
════════════════════════════════════════════════════════════════════
"""

import json
import re
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Lazy imports — app starts even if packages are not installed yet.
# Run:  pip install anthropic openai groq
# ─────────────────────────────────────────────────────────────────────────────

try:
    import anthropic as _anthropic
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

try:
    import openai as _openai
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False


# ─────────────────────────────────────────────────────────────────────────────
# Provider classes
# Interface contract:  chat(messages, model, system='') -> dict
#   messages: [{'role': 'user'|'assistant', 'content': str}, ...]
#   model:    the model ID string (e.g. 'claude-sonnet-4-6')
#   system:   optional system prompt
# Return: {'text': str, 'input_tokens': int, 'output_tokens': int}
# ─────────────────────────────────────────────────────────────────────────────

class AnthropicProvider:
    """
    Anthropic (Claude) provider.
    Requires: pip install anthropic
    API key:  ANTHROPIC_API_KEY in .env (get one at console.anthropic.com)
    """

    def __init__(self):
        if not _ANTHROPIC_AVAILABLE:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError(
                "ANTHROPIC_API_KEY is empty. Add it to your .env file. "
                "Get a key at https://console.anthropic.com"
            )
        self._client = _anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def chat(self, messages: list, model: str, system: str = '', json_mode: bool = False) -> dict:
        """
        Returns: {'text': str, 'input_tokens': int, 'output_tokens': int}
        json_mode is ignored — Claude follows JSON instructions without a special flag.
        """
        kwargs = {'model': model, 'max_tokens': settings.AI_MAX_TOKENS, 'messages': messages}
        if system:
            kwargs['system'] = system
        response = self._client.messages.create(**kwargs)
        return {
            'text':          response.content[0].text,
            'input_tokens':  response.usage.input_tokens,
            'output_tokens': response.usage.output_tokens,
        }


class OpenAIProvider:
    """
    OpenAI (GPT) provider.
    Requires: pip install openai
    API key:  OPENAI_API_KEY in .env (get one at platform.openai.com)
    """

    def __init__(self):
        if not _OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Run: pip install openai")
        if not settings.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY is empty. Add it to your .env file. "
                "Get a key at https://platform.openai.com"
            )
        self._client = _openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    def chat(self, messages: list, model: str, system: str = '', json_mode: bool = False) -> dict:
        """
        Returns: {'text': str, 'input_tokens': int, 'output_tokens': int}
        json_mode=True passes response_format={"type":"json_object"} to force JSON output.
        """
        all_messages = []
        if system:
            all_messages.append({'role': 'system', 'content': system})
        all_messages.extend(messages)
        kwargs: dict = {'model': model, 'messages': all_messages, 'max_tokens': settings.AI_MAX_TOKENS}
        if json_mode:
            kwargs['response_format'] = {'type': 'json_object'}
        response = self._client.chat.completions.create(**kwargs)
        return {
            'text':          response.choices[0].message.content,
            'input_tokens':  response.usage.prompt_tokens,
            'output_tokens': response.usage.completion_tokens,
        }


class GroqProvider:
    """
    Groq — free tier, very fast inference (Llama 3.1, Mixtral, etc.).
    Uses the openai-compatible API so the openai package works fine.
    Requires: pip install openai
    API key:  GROQ_API_KEY in .env (get one at console.groq.com)
    Set:      AI_PROVIDER = 'groq' in your .env to switch to Groq.
    Models:   Add AI_MODELS['groq'] = {'default': 'llama-3.1-8b-instant', 'fast': '...'}
              in config/settings/base.py to control which Groq model is used.
    """

    def __init__(self):
        if not _OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Run: pip install openai")
        if not getattr(settings, 'GROQ_API_KEY', None):
            raise ValueError(
                "GROQ_API_KEY is empty. Add it to your .env file. "
                "Get a key at https://console.groq.com"
            )
        # Groq is OpenAI-compatible — point the client at Groq's base URL
        self._client = _openai.OpenAI(
            api_key=settings.GROQ_API_KEY,
            base_url='https://api.groq.com/openai/v1',
        )

    def chat(self, messages: list, model: str, system: str = '', json_mode: bool = False) -> dict:
        """
        Returns: {'text': str, 'input_tokens': int, 'output_tokens': int}
        json_mode=True passes response_format={"type":"json_object"} to force JSON output.
        """
        all_messages = []
        if system:
            all_messages.append({'role': 'system', 'content': system})
        all_messages.extend(messages)
        kwargs: dict = {'model': model, 'messages': all_messages, 'max_tokens': settings.AI_MAX_TOKENS}
        if json_mode:
            kwargs['response_format'] = {'type': 'json_object'}
        response = self._client.chat.completions.create(**kwargs)
        return {
            'text':          response.choices[0].message.content,
            'input_tokens':  response.usage.prompt_tokens,
            'output_tokens': response.usage.completion_tokens,
        }


# ─────────────────────────────────────────────────────────────────────────────
# PROVIDERS registry — add new providers here
# ─────────────────────────────────────────────────────────────────────────────

PROVIDERS = {
    'anthropic': AnthropicProvider,
    'openai':    OpenAIProvider,
    'groq':      GroqProvider,
    # 'gemini': GeminiProvider,  # ← uncomment after creating GeminiProvider above
}


def get_provider():
    """Returns an instance of the currently configured AI provider (from AI_PROVIDER in .env)."""
    name = getattr(settings, 'AI_PROVIDER', 'anthropic')
    cls  = PROVIDERS.get(name)
    if not cls:
        raise ValueError(f"Unknown AI provider '{name}'. Valid: {list(PROVIDERS.keys())}")
    return cls()


def get_model(tier: str = 'default') -> str:
    """
    Returns the model ID for the given tier.
    'default' → high-quality, for complex tasks
    'fast'    → cheaper/faster, for simple formatting tasks
    Both are configured in config/settings/base.py → AI_MODELS
    For Groq: add AI_MODELS = {'groq': {'default': 'llama-3.1-8b-instant', 'fast': '...'}}
    Falls back to 'claude-sonnet-4-6' if not configured.
    """
    name   = getattr(settings, 'AI_PROVIDER', 'anthropic')
    models = getattr(settings, 'AI_MODELS', {}).get(name, {})
    return models.get(tier) or models.get('default') or 'claude-sonnet-4-6'


# ─────────────────────────────────────────────────────────────────────────────
# Action registry
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HOW TO ADD A NEW AI ACTION:
#   1. Add an entry to ACTION_DEFINITIONS below with:
#        system      — the system prompt sent to the AI
#        tier        — 'fast' (cheap/quick) or 'default' (smarter)
#        label       — human-readable name shown in the UI
#        description — short subtitle shown below the label
#        category    — 'text' or 'code' (controls grouping in the panel)
#        requires_extra (optional) — list of keys the caller must supply
#                        in the `extra` dict (e.g. ['language'] for translate)
#   2. That's it — automatically available via POST /api/ai/action/
#      and GET /api/ai/actions/ (frontend loads the list dynamically)
#
# TIERS:
#   'fast'    → cheaper/faster model (simple edits, grammar, bullets)
#   'default' → smarter model (summarize, explain, generate)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ACTION_DEFINITIONS: dict[str, dict] = {

    # ── Text actions ─────────────────────────────────────────────────────────
    'summarize': {
        'system':      'Summarize the following text concisely in 2-3 sentences. Be direct and clear.',
        'tier':        'default',
        'label':       'Summarize',
        'description': 'Condense to key points',
        'category':    'text',
    },
    'expand': {
        'system':      'Expand the following text with more detail, examples, and depth. Keep the same tone.',
        'tier':        'default',
        'label':       'Expand',
        'description': 'Add more detail and depth',
        'category':    'text',
    },
    'fix_grammar': {
        'system':      'Fix all grammar, spelling, and punctuation errors. Return only the corrected text.',
        'tier':        'fast',
        'label':       'Fix Grammar',
        'description': 'Correct errors',
        'category':    'text',
    },
    'shorter': {
        'system':      'Rewrite more concisely while preserving the main points. Return only the rewritten text.',
        'tier':        'fast',
        'label':       'Make Shorter',
        'description': 'Reduce length',
        'category':    'text',
    },
    'bullet_points': {
        'system':      (
            'Convert the following text into a clean bullet list. '
            'Use the • character (Unicode bullet) for each item, one per line. '
            'Do NOT use markdown *, **, or - characters. '
            'Return only the bullet list, nothing else.'
        ),
        'tier':        'fast',
        'label':       'Bullet Points',
        'description': 'Convert to bullets',
        'category':    'text',
    },
    'continue_writing': {
        'system':      'Continue writing from where the following text ends. Match the style and tone.',
        'tier':        'default',
        'label':       'Continue Writing',
        'description': 'Keep the momentum going',
        'category':    'text',
    },
    'improve_tone': {
        'system':      'Improve the writing to be more professional and clear. Return only the improved text.',
        'tier':        'fast',
        'label':       'Improve Tone',
        'description': 'Polish the writing',
        'category':    'text',
    },
    'explain_simple': {
        'system':      'Explain this as if the reader has no background in the subject.',
        'tier':        'default',
        'label':       'Simplify',
        'description': 'Explain simply',
        'category':    'text',
    },
    'translate': {
        'system':        'Translate the following text to {language}. Return only the translation.',
        'tier':          'fast',
        'label':         'Translate',
        'description':   'Translate to another language',
        'category':      'text',
        'requires_extra': ['language'],
    },

    # ── Code actions — add more code actions here following the same pattern ──
    'explain_code': {
        'system':      (
            'Explain what this code does in plain English. '
            'Be clear and concise — describe the purpose, inputs, outputs, and any important logic. '
            'Do not include the code itself in the response.'
        ),
        'tier':        'default',
        'label':       'Explain Code',
        'description': 'Understand what the code does',
        'category':    'code',
    },
    'add_comments': {
        'system':      (
            'Add clear, helpful inline comments to this code. '
            'CRITICAL RULES: '
            '(1) Return ONLY the code — no markdown fences, no backticks, no preamble. '
            '(2) Use the correct comment syntax for the language. '
            '(3) Do NOT change any logic, variable names, or structure. '
            '(4) Add a comment above each logical section and for any non-obvious line.'
        ),
        'tier':        'default',
        'label':       'Add Comments',
        'description': 'Document the code',
        'category':    'code',
    },
    'fix_code': {
        'system':      (
            'Find and fix all bugs in this code. '
            'CRITICAL RULES: '
            '(1) Return ONLY the fixed code — no markdown fences, no backticks, no preamble. '
            '(2) Use a short inline comment (correct syntax for the language) above each fix to explain what was wrong. '
            '(3) Do NOT refactor or change anything that is not a bug.'
        ),
        'tier':        'default',
        'label':       'Fix Code',
        'description': 'Find and fix bugs',
        'category':    'code',
    },
    'improve_code': {
        'system':      (
            'Improve this code for readability, performance, and best practices. '
            'CRITICAL RULES: '
            '(1) Return ONLY the improved code — no markdown fences, no backticks, no preamble. '
            '(2) Use correct comment syntax for the language to briefly note significant changes. '
            '(3) Preserve the overall structure and intent of the original code.'
        ),
        'tier':        'default',
        'label':       'Improve Code',
        'description': 'Optimize and clean up',
        'category':    'code',
    },
}

# Used only by run_chat() — not a user-facing action
_CHAT_SYSTEM_PROMPT = "You are a helpful AI assistant in a notes app. Answer the user's question clearly."

# Comment syntax per language — used to give language-aware instructions to code actions
_COMMENT_SYNTAX: dict[str, str] = {
    'python':     '# (hash)',
    'javascript': '// (double slash) or /* block */',
    'typescript': '// (double slash) or /* block */',
    'go':         '// (double slash)',
    'rust':       '// (double slash)',
    'java':       '// (double slash) or /* block */',
    'cpp':        '// (double slash) or /* block */',
    'css':        '/* block comment */',
    'html':       '<!-- comment -->',
    'sql':        '-- (double dash)',
    'bash':       '# (hash)',
    'yaml':       '# (hash)',
    'docker':     '# (hash)',
    'markdown':   '<!-- comment -->',
    'ruby':       '# (hash)',
    'php':        '// (double slash) or # (hash)',
    'swift':      '// (double slash)',
    'kotlin':     '// (double slash)',
    'r':          '# (hash)',
    'scala':      '// (double slash)',
}


def _get_comment_syntax(lang: str) -> str:
    return _COMMENT_SYNTAX.get(lang.lower(), '// (double slash)')


# ─────────────────────────────────────────────────────────────────────────────
# Quota enforcement
# ─────────────────────────────────────────────────────────────────────────────

def check_quota(user) -> None:
    """
    Raises PermissionError if the user has exceeded their daily AI quota.
    Called at the start of run_action() and run_chat().

    HOW QUOTA WORKS:
      1. Get or create AiUserQuota for this user (free tier by default)
      2. Count today's AiUsageLog rows for this user (resets at UTC midnight)
      3. If count >= daily_actions limit: raise PermissionError
      4. If token sum >= daily_tokens limit: raise PermissionError
      5. 'unlimited' tier: always passes immediately (None limits)

    To upgrade a user: Django admin → AI User Quotas → change Tier.
    To give a one-off override: set custom_daily_actions / custom_daily_tokens.
    """
    from .models import AiUserQuota, AiUsageLog
    from django.utils import timezone
    from django.db.models import Sum

    quota  = AiUserQuota.get_or_create_for_user(user)
    limits = quota.get_daily_limits()

    # Unlimited tier — skip all checks
    if limits['daily_actions'] is None:
        return

    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    qs = AiUsageLog.objects.filter(user=user, created_at__gte=today_start)

    # Check action count
    if qs.count() >= limits['daily_actions']:
        raise PermissionError(
            f"Daily AI limit reached ({limits['daily_actions']} actions). "
            f"Upgrade to Pro for more."
        )

    # Check token count (only if a token limit is configured)
    if limits['daily_tokens'] is not None:
        agg  = qs.aggregate(total=Sum('input_tokens') + Sum('output_tokens'))
        used = agg['total'] or 0
        if used >= limits['daily_tokens']:
            raise PermissionError(
                f"Daily token limit reached ({limits['daily_tokens']:,} tokens). "
                f"Upgrade to Pro for more."
            )


# ─────────────────────────────────────────────────────────────────────────────
# Chat memory helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_chat_history(user, page_id=None, limit: int = 20) -> list[dict]:
    """
    Returns the last `limit` messages for this user+page as a list of
    {role, content} dicts suitable for passing directly to a provider.

    page_id=None returns messages not associated with any page.
    Results are in chronological order (oldest first).
    """
    from .models import AiChatMessage
    qs = AiChatMessage.objects.filter(user=user)
    if page_id:
        qs = qs.filter(page_id=page_id)
    msgs = list(qs.order_by('-created_at')[:limit])
    msgs.reverse()  # chronological order
    return [{'role': m.role, 'content': m.content} for m in msgs]


def save_chat_messages(user, page_id, user_msg: str, assistant_msg: str) -> None:
    """
    Persists a user+assistant exchange to the database.
    Triggers auto-compaction if the thread is getting too long.

    IMPORTANT: Only the last user message and its corresponding assistant
    response are saved per call. The full history is loaded separately
    via get_chat_history() each time run_chat() is called.
    """
    from .models import AiChatMessage
    AiChatMessage.objects.create(user=user, page_id=page_id, role='user',      content=user_msg)
    AiChatMessage.objects.create(user=user, page_id=page_id, role='assistant', content=assistant_msg)
    _auto_compact_if_needed(user, page_id)


def _auto_compact_if_needed(user, page_id) -> None:
    """
    If message count for this thread exceeds MAX_MESSAGES_PER_THREAD,
    summarize the oldest half and replace them with a single system message.

    WHY THIS EXISTS:
      Unbounded history would make every chat request increasingly expensive.
      This keeps context manageable while preserving the gist of older turns.

    HOW IT WORKS:
      1. Count messages for user+page
      2. If > MAX: take oldest half, summarize with fast model
      3. Delete those messages, insert a system summary in their place
      4. If the summarization AI call fails: use a simple "[N messages]" placeholder
         so the thread is still trimmed even without a real summary
    """
    from .models import AiChatMessage
    MAX = AiChatMessage.MAX_MESSAGES_PER_THREAD
    qs  = AiChatMessage.objects.filter(user=user, page_id=page_id).order_by('created_at')
    count = qs.count()
    if count <= MAX:
        return

    half     = count // 2
    old_msgs = list(qs[:half])
    old_text = '\n'.join(f"{m.role}: {m.content[:200]}" for m in old_msgs)

    try:
        result = get_provider().chat(
            messages=[{'role': 'user', 'content': f"Summarize this conversation history concisely:\n{old_text}"}],
            model=get_model('fast'),
            system='You are a helpful assistant. Summarize conversation history concisely in 2-3 sentences.',
        )
        summary = result['text']
    except Exception:
        # Summarization failed — use a simple placeholder so we still trim
        summary = f"[Earlier conversation with {half} messages — summary unavailable]"

    # Replace old messages with summary (never silently delete — always leave a trace)
    ids_to_delete = [m.id for m in old_msgs]
    AiChatMessage.objects.filter(id__in=ids_to_delete).delete()
    AiChatMessage.objects.create(
        user=user,
        page_id=page_id,
        role='system',
        content=f"[Conversation summary]: {summary}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public functions — called by views.py
# ─────────────────────────────────────────────────────────────────────────────

def run_action(action_type: str, content: str, extra: dict | None = None, user=None) -> tuple:
    """
    Run a predefined AI action on some text.

    action_type — key from ACTION_DEFINITIONS above
    content     — the text to process
    extra       — optional params injected into the system prompt
                  (e.g. {'language': 'Spanish'} for 'translate')
    user        — if provided, quota is checked before the AI call

    Returns (text, input_tokens, output_tokens) tuple.
    Raises PermissionError if the user has exceeded their daily quota.
    """
    if user:
        check_quota(user)

    defn = ACTION_DEFINITIONS.get(action_type)
    if not defn:
        raise ValueError(
            f"Unknown action '{action_type}'. Valid: {list(ACTION_DEFINITIONS.keys())}"
        )

    # Only allow known keys into the format() call to prevent prompt injection
    # via arbitrary format-string placeholders supplied by the caller.
    _SAFE_EXTRA_KEYS = {'language', 'tone', 'length', 'target_language', 'style'}
    safe_extra = {k: str(v)[:200] for k, v in (extra or {}).items() if k in _SAFE_EXTRA_KEYS}
    system = defn['system'].format(**safe_extra) if safe_extra else defn['system']

    # Prepend language-aware constraints for code actions when a language is provided
    if defn.get('category') == 'code' and extra and extra.get('language'):
        lang    = str(extra['language'])
        comment = _get_comment_syntax(lang)
        if action_type == 'explain_code':
            # Explanation returns prose, not code — only inject language context
            system = f"The code is written in {lang}. " + system
        else:
            system = (
                f"CODE LANGUAGE: {lang}\n"
                f"COMMENT SYNTAX: {comment}\n"
                f"ABSOLUTE RULES:\n"
                f"- Use ONLY {comment} for any comments — never any other comment style\n"
                f"- Never break the {lang} syntax\n"
                f"- Preserve all variable names, function signatures, and logic unless fixing a bug\n"
                f"- Return ONLY raw {lang} code — NO markdown fences, NO backticks, NO explanatory text before or after\n\n"
            ) + system

    model    = get_model(defn.get('tier', 'default'))
    provider = get_provider()

    result = provider.chat(
        messages=[{'role': 'user', 'content': content}],
        model=model,
        system=system,
    )
    return result['text'], result['input_tokens'], result['output_tokens']


def run_chat(messages: list, page_context: str = '', user=None, page_id=None) -> tuple:
    """
    Run a free-form chat conversation.

    messages     — the current turn's messages [{role, content}, ...]
                   (just the new messages, not the full history)
    page_context — optional text from the current page (used as AI context)
    user         — if provided: quota checked, history loaded/saved
    page_id      — required together with user for history persistence

    HOW HISTORY WORKS:
      1. Persistent DB history is prepended before the incoming messages
      2. The combined list is sent to the AI
      3. After a successful response, the last user message + reply are saved
      4. Auto-compaction runs if the thread grows beyond MAX_MESSAGES_PER_THREAD

    Returns (text, input_tokens, output_tokens) tuple.
    Raises PermissionError if the user has exceeded their daily quota.
    """
    if user:
        check_quota(user)

    system = _CHAT_SYSTEM_PROMPT
    if page_context:
        system += (
            "\n\nYou have access to the following page content as context. "
            "Use it when answering questions:\n\n"
            f"--- PAGE CONTENT ---\n{page_context[:4000]}\n--- END ---"
        )

    # Prepend persistent history so the AI has full conversational context
    if user and page_id:
        db_history      = get_chat_history(user, page_id, limit=20)
        combined_msgs   = db_history + messages
    else:
        combined_msgs   = messages

    result = get_provider().chat(
        messages=combined_msgs,
        model=get_model('default'),
        system=system,
    )
    reply = result['text']

    # Persist this exchange so future calls can load it as history
    if user and page_id:
        # Find the last user message in the incoming messages (not the history)
        last_user_msg = next(
            (m['content'] for m in reversed(messages) if m.get('role') == 'user'),
            None,
        )
        if last_user_msg:
            save_chat_messages(user, page_id, last_user_msg, reply)

    return reply, result['input_tokens'], result['output_tokens']


# ─────────────────────────────────────────────────────────────────────────────
# AI Agent — structured JSON responses for action proposals
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HOW TO ADD A NEW ACTION:
#   1. Add it to AGENT_ACTIONS below (description only, for documentation)
#   2. Add its JSON shape to AGENT_SYSTEM_PROMPT
#   3. Add the API endpoint in views.py
#   4. Add the frontend handler in AiPanel.tsx
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ─────────────────────────────────────────────────────────────────────────────

AGENT_ACTIONS: dict[str, str] = {
    'create_page':    'Create a new page with title and blocks',
    'add_blocks':     'Add blocks to the current page',
    'create_mindmap': 'Create a mind map on the canvas',
    'read_page':      'Read and summarize a page (no confirmation needed)',
    'remove_blocks':  'Remove specific blocks from the current page',
    'web_search':     'Search the web for current information (auto-executed, no approval needed)',
}

AGENT_SYSTEM_PROMPT = """You are an AI assistant inside SpatialScribe workspace app.
You MUST respond with valid JSON only. Never respond with plain text.

RESPONSE FORMAT — choose one:

For normal conversation:
{"type":"message","message":"your response here"}

For creating a new page (when user asks to create/make/build a page or document):
{"type":"action","action":"create_page","params":{"title":"Page Title","blocks":[{"block_type":"heading1","content":{"text":"Title"}},{"block_type":"paragraph","content":{"text":"Content"}}]},"message":"I'll create a page called 'Title' with X sections. Approve?"}

For adding blocks to current page:
{"type":"action","action":"add_blocks","params":{"blocks":[{"block_type":"paragraph","content":{"text":"content"}}]},"message":"I'll add X blocks to your page. Approve?"}

For creating a mind map:
{"type":"action","action":"create_mindmap","params":{"nodes":[{"label":"Central Idea"},{"label":"Branch"}]},"message":"I'll create a mind map. Approve?"}

For removing specific blocks from current page:
{"type":"action","action":"remove_blocks","params":{"block_ids":["uuid1","uuid2"],"reason":"Removing duplicate content"},"message":"I'll remove 2 blocks from your page. This cannot be undone. Approve?"}

For searching the web (current events, news, prices, facts, real-time data):
{"type":"action","action":"web_search","params":{"query":"specific search query"},"message":"Searching the web for..."}

STRICT RULES:
1. ALWAYS output raw JSON — no markdown, no backticks, no explanation outside JSON
2. The "message" field is shown to user — make it friendly and clear
3. For create/modify/delete actions always use type=action (needs user approval)
4. For questions/summaries use type=message
5. Available block types: paragraph, heading1, heading2, heading3, bullet_item, numbered_item, todo_item, code, quote, callout, divider
6. For code: {"block_type":"code","content":{"code":"print('hello')","language":"python"}}
7. For remove_blocks you MUST list exact block IDs from the page block list provided below
8. NEVER remove blocks unless user explicitly asks to delete/remove content
9. Always explain what will be removed in the message field
10. Use web_search whenever the user asks about current events, recent news, live prices, today's date, or any information that may be outdated in your training data
11. web_search is AUTO-EXECUTED immediately — never ask the user for permission before searching; just do it

Current page content and block IDs will be provided if available. Use them for context."""


def _parse_json_response(text: str) -> dict:
    """
    Extract and parse a JSON object from an AI response string.
    Tries three strategies before falling back to a plain-message wrapper.
    Extracted so it can be reused for both the first and second (post-search) AI calls.
    """
    text = text.strip()

    # Strategy 1: direct JSON parse
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 2: JSON inside markdown fence ```json … ```
    m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except (json.JSONDecodeError, ValueError):
            pass

    # Strategy 3: first { to last }
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: wrap plain text as a message
    return {'type': 'message', 'message': text}


def _normalise_parsed(parsed: dict, raw_text: str) -> dict:
    """Guarantee minimum required keys and normalise data/params naming."""
    if 'type' not in parsed:
        parsed['type'] = 'message'
    if 'message' not in parsed:
        parsed['message'] = raw_text
    if 'data' in parsed and 'params' not in parsed:
        parsed['params'] = parsed.pop('data')
    return parsed


def run_agent_chat(
    messages: list,
    page_context: str = '',
    user=None,
    page_id: str | None = None,
) -> tuple[dict, int, int]:
    """
    Enhanced chat that returns a structured JSON response for agent actions.

    messages     — new messages for this turn [{role, content}, ...]
    page_context — optional text from the current page (prepended to system prompt)
    user         — if provided: quota checked, history loaded/saved
    page_id      — required together with user for history persistence

    Returns (parsed_response: dict, input_tokens: int, output_tokens: int).

    parsed_response always contains at minimum:
      { "type": "message"|"action", "message": str }

    For type="action" it also contains:
      { "action": str, "data": dict }

    HOW HISTORY WORKS:
      Same as run_chat() — DB history is prepended, then saved after response.

    FALLBACK:
      If the AI returns non-JSON text, it is wrapped as
      { "type": "message", "message": <raw text> } so the frontend
      always receives a valid object.
    """
    if user:
        check_quota(user)

    # Build system prompt with optional page context
    system = AGENT_SYSTEM_PROMPT
    if page_context:
        system += (
            f"\n\nCurrent page content (use as context when relevant):\n"
            f"--- PAGE CONTENT ---\n{page_context[:3000]}\n--- END ---"
        )

    # Include block IDs so AI can reference them for remove_blocks
    if page_id:
        from Apps.blocks.models import Block as _Block
        page_blocks = _Block.objects.filter(
            page_id=page_id,
            is_deleted=False,
            doc_visible=True,
        ).order_by('order')[:50]

        blocks_text = '\n'.join([
            f"[ID:{b.id}] [{b.block_type}] {str(b.content.get('text', b.content.get('code', '')))[:100]}"
            for b in page_blocks
        ])
        if blocks_text:
            system += f"\n\n=== CURRENT PAGE BLOCKS (with IDs) ===\n{blocks_text}\n=== END ==="

    # Prepend persistent history (same pattern as run_chat)
    if user and page_id:
        db_history    = get_chat_history(user, page_id, limit=20)
        all_messages  = db_history + messages
    else:
        all_messages  = messages

    provider = get_provider()
    # Force JSON output mode for OpenAI/Groq — Anthropic (Claude) follows instructions without it
    use_json_mode = not isinstance(provider, AnthropicProvider)
    try:
        result = provider.chat(
            messages=all_messages,
            model=get_model('default'),
            system=system,
            json_mode=use_json_mode,
        )
    except Exception:
        logger.exception('run_agent_chat: provider.chat() failed')
        raise

    raw_text      = result['text']
    input_tokens  = result['input_tokens']
    output_tokens = result['output_tokens']

    # ── Parse initial response ───────────────────────────────────────────────
    parsed = _normalise_parsed(_parse_json_response(raw_text), raw_text)

    # ── Auto-execute web_search (no user approval required) ──────────────────
    # If the AI wants to search the web, run the search server-side and feed
    # results back into a second AI call so the user receives a final answer.
    if parsed.get('type') == 'action' and parsed.get('action') == 'web_search':
        try:
            from .web_search import search_web
            query   = str((parsed.get('params') or {}).get('query', '')).strip()
            results = search_web(query, max_results=4) if query else []

            if results:
                search_lines = '\n'.join(
                    f"- {r['title']}: {r['snippet']}"
                    for r in results
                )
                search_user_msg = (
                    f"[Web search completed for \"{query}\". Results:\n{search_lines}\n\n"
                    "Now answer the user's original question using these results. "
                    "Do NOT search again — respond with a direct answer message.]"
                )
            else:
                search_user_msg = (
                    f"[Web search for \"{query}\" returned no results. "
                    "Answer from your training knowledge and be transparent about uncertainty. "
                    "Do NOT search again.]"
                )

            # Inject the AI's web_search response + search results as conversation turns
            # so the AI knows it already searched and must now give a final answer.
            second_messages = all_messages + [
                {'role': 'assistant', 'content': raw_text},
                {'role': 'user',      'content': search_user_msg},
            ]

            result2 = provider.chat(
                messages=second_messages,
                model=get_model('default'),
                system=system,
                json_mode=use_json_mode,
            )
            input_tokens  += result2['input_tokens']
            output_tokens += result2['output_tokens']
            parsed = _normalise_parsed(_parse_json_response(result2['text']), result2['text'])

            # Guard: if the AI still returns web_search despite having results, force a message
            if parsed.get('type') == 'action' and parsed.get('action') == 'web_search':
                parsed = {
                    'type':    'message',
                    'message': "I searched the web but couldn't formulate a clear answer. Please try rephrasing your question.",
                }

        except Exception:
            logger.exception('run_agent_chat: web_search auto-execution failed')
            parsed = {
                'type':    'message',
                'message': "I tried to search the web but ran into an issue. Let me answer from what I know instead.",
            }

    # ── Persist exchange to chat history ─────────────────────────────────────
    if user and messages:
        last_user_msg = next(
            (m['content'] for m in reversed(messages) if m.get('role') == 'user'),
            '',
        )
        if last_user_msg:
            save_chat_messages(user, page_id, last_user_msg, parsed['message'])

    return parsed, input_tokens, output_tokens
