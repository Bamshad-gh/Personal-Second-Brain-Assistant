/**
 * components/blocks/CodeBlock.tsx
 *
 * What:    Renders code blocks with:
 *            - Syntax-highlighted display when not focused (lowlight)
 *            - Plain textarea for editing when focused (fast, no TipTap overhead)
 *            - Language selector dropdown
 *            - Copy button (appears on hover)
 *            - Line numbers that stay in sync with content
 *            - Tab key inserts 2 spaces instead of changing focus
 *            - Backspace on empty → onDelete() (same as other block types)
 *
 * Highlighting:
 *   Uses lowlight (already installed via @tiptap/extension-code-block-lowlight).
 *   When the textarea is blurred, a <pre> with dangerouslySetInnerHTML shows
 *   the highlighted output. Click anywhere on the pre to return to editing.
 *   The hast tree from lowlight is walked manually — no hast-util-to-html needed.
 *
 * Why textarea (not TipTap):
 *   Code blocks don't need rich text — monospace + line numbers is enough.
 *   A plain textarea is faster, avoids TipTap's block-mode conflicts, and
 *   lets the user select arbitrary ranges without editor interference.
 */

'use client';

import { useState, useRef }        from 'react';
import { createLowlight, common }  from 'lowlight';
import { BlockAiActions }          from './BlockAiActions';
import type { Block }              from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'rust',
  'go', 'java', 'cpp', 'css', 'html', 'json', 'bash', 'sql',
  'markdown', 'yaml', 'docker',
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CodeBlockProps {
  block:     Block;
  onSave:    (content: Record<string, unknown>) => void;
  onDelete:  () => void;
  readOnly?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYNTAX HIGHLIGHTING HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Minimal hast-tree walker.
 * Handles text, element, and root nodes — no external package needed.
 * Element nodes become <span class="hljs-...">; text nodes are escaped.
 */
function hastToHtml(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;

  if (n['type'] === 'text') {
    return escapeHtml(String(n['value'] ?? ''));
  }

  if (n['type'] === 'element') {
    const props = (n['properties'] as Record<string, unknown>) ?? {};
    const cls   = Array.isArray(props['className'])
      ? (props['className'] as string[]).join(' ')
      : '';
    const children = Array.isArray(n['children'])
      ? (n['children'] as unknown[]).map(hastToHtml).join('')
      : '';
    return cls ? `<span class="${cls}">${children}</span>` : children;
  }

  if (n['type'] === 'root' && Array.isArray(n['children'])) {
    return (n['children'] as unknown[]).map(hastToHtml).join('');
  }

  return '';
}

/**
 * Highlights `codeStr` for the given language using lowlight.
 * Falls back to HTML-escaped plain text on any error (unknown language, etc.).
 */
function highlightCode(codeStr: string, lang: string): string {
  if (!codeStr) return '';
  try {
    const lowlight = createLowlight(common);
    const tree     = lowlight.highlight(lang, codeStr);
    return hastToHtml(tree);
  } catch {
    return escapeHtml(codeStr);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CodeBlock({ block, onSave, onDelete, readOnly = false }: CodeBlockProps) {

  const [code,      setCode]      = useState(String(block.content.code     ?? ''));
  const [language,  setLanguage]  = useState(String(block.content.language ?? 'plaintext'));
  const [copied,    setCopied]    = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiAnchor,  setAiAnchor]  = useState<HTMLElement | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  // ── Debounced content save ────────────────────────────────────────────────
  function scheduleCodeSave(newCode: string, lang: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onSave({ code: newCode, language: lang });
    }, 500);
  }

  function handleCodeChange(value: string) {
    setCode(value);
    scheduleCodeSave(value, language);
  }

  // Language change saves immediately (no debounce needed)
  function handleLanguageChange(lang: string) {
    setLanguage(lang);
    onSave({ code, language: lang });
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────
  function handleCopy() {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tab → insert 2 spaces (prevent focus change)
    if (e.key === 'Tab') {
      e.preventDefault();
      const el    = e.currentTarget;
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      const next  = code.slice(0, start) + '  ' + code.slice(end);
      setCode(next);
      scheduleCodeSave(next, language);
      // Restore cursor position after state update
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd   = start + 2;
        }
      });
      return;
    }
    // Backspace on empty → remove block
    if (e.key === 'Backspace' && !code) {
      e.preventDefault();
      onDelete();
    }
  }

  const lines          = Math.max(code.split('\n').length, 1);
  const contentHeight  = `${Math.max(lines, 3) * 24 + 32}px`;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 font-mono text-sm">

      {/* ── Header: language selector + AI button + copy button ─────────── */}
      <div className="flex items-center justify-between border-b border-neutral-700 bg-neutral-800/60 px-3 py-1.5">
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          disabled={readOnly}
          className="cursor-pointer bg-transparent text-xs text-neutral-400 outline-none transition-colors hover:text-neutral-200 disabled:cursor-default"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          {/* AI quick-actions button */}
          {!readOnly && (
            <button
              type="button"
              title="AI actions"
              onClick={(e) => {
                e.stopPropagation();
                if (aiOpen) {
                  setAiOpen(false);
                  setAiAnchor(null);
                } else {
                  setAiOpen(true);
                  setAiAnchor(e.currentTarget as HTMLElement);
                }
              }}
              className={[
                'text-xs opacity-0 transition-all group-hover:opacity-100',
                aiOpen ? 'text-violet-400' : 'text-neutral-500 hover:text-violet-400',
              ].join(' ')}
            >
              ✨
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-neutral-500 opacity-0 transition-all hover:text-neutral-200 group-hover:opacity-100"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* AI actions popover */}
      {aiOpen && aiAnchor && (
        <BlockAiActions
          block={block}
          anchorEl={aiAnchor}
          isCode={true}
          codeLanguage={language}
          onApply={(newText) => {
            setCode(newText);
            onSave({ code: newText, language });
            setAiOpen(false);
            setAiAnchor(null);
          }}
          onClose={() => {
            setAiOpen(false);
            setAiAnchor(null);
          }}
        />
      )}

      {/* ── Code area: line numbers + editing/display pane ───────────────── */}
      <div className="flex">

        {/* Line numbers */}
        <div
          className="select-none border-r border-neutral-700 py-4 pl-3 pr-3 text-right text-xs leading-6 text-neutral-600"
          style={{ minWidth: '3rem' }}
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Editing textarea (shown when focused) */}
        {isFocused || readOnly ? (
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            readOnly={readOnly}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="// Start typing…"
            className="flex-1 resize-none bg-transparent px-4 py-4 font-mono text-xs leading-6 text-neutral-200 outline-none"
            style={{ height: contentHeight }}
          />
        ) : (
          /* Highlighted display (shown when not focused) */
          <pre
            onClick={() => {
              setIsFocused(true);
              // Focus the textarea on next tick (it renders after state update)
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
            className="flex-1 cursor-text overflow-x-auto whitespace-pre px-4 py-4
                       font-mono text-xs leading-6 text-neutral-200"
            style={{ height: contentHeight }}
            dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
          />
        )}
      </div>
    </div>
  );
}
