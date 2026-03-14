# Apps/ai_agent/services.py
"""
AI provider abstraction layer.

════════════════════════════════════════════════════════════════════
FILE MAP — where to find things
════════════════════════════════════════════════════════════════════

ADDING A NEW AI PROVIDER
  1. Create a class below (e.g. class GeminiProvider)
  2. Give it a .chat(messages, model, system) method that returns a string
  3. Add it to the PROVIDERS dict at the bottom of this section
  4. Set AI_PROVIDER = 'gemini' in your .env

ADDING A NEW ACTION TYPE
  1. Add a key to SYSTEM_PROMPTS below with the system prompt
  2. Optionally add it to ACTION_MODELS if it needs a different model tier
  3. Add a button in the frontend: src/components/ai/AiPanel.tsx → QUICK_ACTIONS

CHANGING THE AI MODEL
  config/settings/base.py → AI_MODELS dict

ENDPOINT MAP
  POST /api/ai/action/  → predefined action (summarize, expand, fix_grammar, …)
  POST /api/ai/chat/    → free-form conversation with page as context
  Both registered in: Apps/ai_agent/urls.py → config/urls.py
════════════════════════════════════════════════════════════════════
"""

from django.conf import settings

# ─────────────────────────────────────────────────────────────────────────────
# Lazy imports — app starts even if packages are not installed yet.
# Run:  pip install anthropic openai
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
# Interface contract:  chat(messages, model, system='') -> str
#   messages: [{'role': 'user'|'assistant', 'content': str}, ...]
#   model:    the model ID string (e.g. 'claude-sonnet-4-6')
#   system:   optional system prompt
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

    def chat(self, messages: list, model: str, system: str = '') -> dict:
        """
        Returns: {'text': str, 'input_tokens': int, 'output_tokens': int}
        Token counts are from response.usage — used by views.py to log AiUsageLog.
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

    def chat(self, messages: list, model: str, system: str = '') -> dict:
        """
        Returns: {'text': str, 'input_tokens': int, 'output_tokens': int}
        Token counts are from response.usage — used by views.py to log AiUsageLog.
        """
        all_messages = []
        if system:
            all_messages.append({'role': 'system', 'content': system})
        all_messages.extend(messages)
        response = self._client.chat.completions.create(
            model=model, messages=all_messages, max_tokens=settings.AI_MAX_TOKENS,
        )
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
    """
    name    = getattr(settings, 'AI_PROVIDER', 'anthropic')
    models  = getattr(settings, 'AI_MODELS', {}).get(name, {})
    return models.get(tier) or models.get('default') or 'claude-sonnet-4-6'


# ─────────────────────────────────────────────────────────────────────────────
# Action registry
# TO ADD A NEW ACTION: add an entry to SYSTEM_PROMPTS + ACTION_MODELS,
# then add a button in src/components/ai/AiPanel.tsx → QUICK_ACTIONS
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPTS = {
    'summarize':        "Summarize the following text concisely in 2-3 sentences. Be direct and clear.",
    'expand':           "Expand the following text with more detail, examples, and depth. Keep the same tone.",
    'fix_grammar':      "Fix all grammar, spelling, and punctuation errors. Return only the corrected text.",
    'shorter':          "Rewrite more concisely while preserving the main points. Return only the rewritten text.",
    'bullet_points':    "Convert the following text into a clean, structured bullet-point list.",
    'continue_writing': "Continue writing from where the following text ends. Match the style and tone.",
    'translate':        "Translate the following text to {language}. Return only the translation.",
    'explain_simple':   "Explain this as if the reader has no background in the subject.",
    'improve_tone':     "Improve the writing to be more professional and clear. Return only the improved text.",
    'ask':              "You are a helpful AI assistant in a notes app. Answer the user's question clearly.",
}

# Which model tier to use per action (cost optimisation)
ACTION_MODELS = {
    'fix_grammar':    'fast',
    'shorter':        'fast',
    'bullet_points':  'fast',
    'translate':      'fast',
    'improve_tone':   'fast',
    'summarize':      'default',
    'expand':         'default',
    'continue_writing': 'default',
    'explain_simple': 'default',
    'ask':            'default',
}


# ─────────────────────────────────────────────────────────────────────────────
# Public functions — called by views.py
# ─────────────────────────────────────────────────────────────────────────────

def run_action(action_type: str, content: str, extra: dict | None = None) -> tuple:
    """
    Run a predefined AI action on some text.

    action_type — key from SYSTEM_PROMPTS above
    content     — the text to process
    extra       — optional params injected into the system prompt
                  (e.g. {'language': 'Spanish'} for 'translate')
    Returns (text, input_tokens, output_tokens) tuple.
    Token counts are used by views.py to log AiUsageLog.
    """
    template = SYSTEM_PROMPTS.get(action_type)
    if not template:
        raise ValueError(
            f"Unknown action '{action_type}'. Valid: {list(SYSTEM_PROMPTS.keys())}"
        )

    system   = template.format(**(extra or {})) if extra else template
    model    = get_model(ACTION_MODELS.get(action_type, 'default'))
    provider = get_provider()

    result = provider.chat(
        messages=[{'role': 'user', 'content': content}],
        model=model,
        system=system,
    )
    return result['text'], result['input_tokens'], result['output_tokens']


def run_chat(messages: list, page_context: str = '') -> tuple:
    """
    Run a free-form chat conversation.

    messages     — full conversation history [{role, content}, ...]
    page_context — optional text from the current page (used as AI context)
    Returns (text, input_tokens, output_tokens) tuple.
    Token counts are used by views.py to log AiUsageLog.
    """
    system = SYSTEM_PROMPTS['ask']
    if page_context:
        system += (
            "\n\nYou have access to the following page content as context. "
            "Use it when answering questions:\n\n"
            f"--- PAGE CONTENT ---\n{page_context[:4000]}\n--- END ---"
        )

    result = get_provider().chat(
        messages=messages,
        model=get_model('default'),
        system=system,
    )
    return result['text'], result['input_tokens'], result['output_tokens']
