"""
Apps/ai_agent/web_search.py

Web search tools for the AI agent.
Uses DuckDuckGo Instant Answer API (free, no API key needed).
Falls back to empty results on any network/parsing error — never crashes the chat.

Install: pip install requests beautifulsoup4
"""

import logging
import re

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Lazy imports — app starts even if packages are not installed yet.
# ─────────────────────────────────────────────────────────────────────────────

try:
    import requests as _requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

try:
    from bs4 import BeautifulSoup as _BeautifulSoup
    _BS4_AVAILABLE = True
except ImportError:
    _BS4_AVAILABLE = False

_DDG_URL    = 'https://api.duckduckgo.com/'
_USER_AGENT = 'Mozilla/5.0 (compatible; SpatialScribeBot/1.0)'


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def search_web(query: str, max_results: int = 4) -> list[dict]:
    """
    Search using DuckDuckGo Instant Answer API.
    Returns a list of { title, url, snippet } dicts.
    Returns [] on any error — never raises.
    """
    if not _REQUESTS_AVAILABLE:
        logger.warning('web_search: requests package not installed. Run: pip install requests')
        return []

    try:
        resp = _requests.get(
            _DDG_URL,
            params={
                'q':             query,
                'format':        'json',
                'no_html':       '1',
                'skip_disambig': '1',
            },
            timeout=6,
            headers={'User-Agent': _USER_AGENT},
        )
        resp.raise_for_status()
        data: dict = resp.json()
    except Exception:
        logger.exception('web_search: DuckDuckGo request failed for query=%r', query)
        return []

    results: list[dict] = []

    # Direct answer — for simple factual queries ("what is 2+2", "speed of light")
    if data.get('Answer'):
        results.append({
            'title':   'Direct Answer',
            'url':     '',
            'snippet': str(data['Answer'])[:300],
        })

    # Abstract — main instant-answer block (typically from Wikipedia)
    if data.get('Abstract') and len(results) < max_results:
        results.append({
            'title':   str(data.get('Heading', query)),
            'url':     str(data.get('AbstractURL', '')),
            'snippet': str(data['Abstract'])[:400],
        })

    # Related topics — secondary results
    for topic in data.get('RelatedTopics', []):
        if len(results) >= max_results:
            break
        if not isinstance(topic, dict):
            continue
        text = str(topic.get('Text', '')).strip()
        if not text:
            continue
        results.append({
            'title':   text[:60],
            'url':     str(topic.get('FirstURL', '')),
            'snippet': text[:300],
        })

    return results[:max_results]


def fetch_page_summary(url: str, max_chars: int = 600) -> str:
    """
    Fetch a URL and extract clean readable text using BeautifulSoup.
    Returns '' on any error — never raises.
    """
    if not url or not url.startswith('http'):
        return ''
    if not _REQUESTS_AVAILABLE or not _BS4_AVAILABLE:
        logger.warning('fetch_page_summary: requests or beautifulsoup4 not installed')
        return ''

    try:
        resp = _requests.get(
            url,
            timeout=5,
            headers={'User-Agent': _USER_AGENT},
        )
        resp.raise_for_status()
        soup = _BeautifulSoup(resp.text, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()
        text = soup.get_text(separator=' ', strip=True)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:max_chars]
    except Exception:
        logger.exception('fetch_page_summary: failed for url=%r', url)
        return ''
