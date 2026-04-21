'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal }                from 'react-dom';
import { aiApi }                       from '@/lib/api';
import type { Block }                  from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Action {
  id:    string;
  label: string;
}

interface BlockAiActionsProps {
  block:          Block;
  anchorEl:       HTMLElement;
  isCode:         boolean;
  codeLanguage?:  string;
  onApply:        (newText: string) => void;
  onClose:        () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action lists
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_ACTIONS: Action[] = [
  { id: 'improve_tone',   label: 'Improve writing' },
  { id: 'fix_grammar',    label: 'Fix grammar'     },
  { id: 'shorter',        label: 'Make shorter'    },
  { id: 'expand',         label: 'Expand'          },
  { id: 'bullet_points',  label: 'Bullet points'   },
  { id: 'summarize',      label: 'Summarize'       },
  { id: 'explain_simple', label: 'Simplify'        },
];

const CODE_ACTIONS: Action[] = [
  { id: 'explain_code',  label: 'Explain code' },
  { id: 'add_comments',  label: 'Add comments' },
  { id: 'fix_code',      label: 'Fix bugs'     },
  { id: 'improve_code',  label: 'Improve code' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const POPOVER_H = 300;

function getPopoverPosition(anchor: HTMLElement, popoverW: number) {
  const rect = anchor.getBoundingClientRect();
  const vw   = window.innerWidth;
  return {
    bottom: rect.bottom,
    top:    rect.top,
    left:   Math.max(8, Math.min(rect.right - popoverW, vw - popoverW - 8)),
  };
}

/** Strip leading/trailing markdown code fences that AI sometimes adds. */
function stripFences(text: string): string {
  return text
    .replace(/^```[\w]*\r?\n?/, '')
    .replace(/\r?\n?```$/, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
//
// Uses hardcoded hex colors (Tailwind arbitrary-value syntax) so the popover
// is ALWAYS dark regardless of the page's .light / .dark class overrides.
// ─────────────────────────────────────────────────────────────────────────────

export function BlockAiActions({
  block,
  anchorEl,
  isCode,
  codeLanguage,
  onApply,
  onClose,
}: BlockAiActionsProps) {
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const vw       = typeof window !== 'undefined' ? window.innerWidth : 800;
  const popoverW = Math.min(272, Math.max(200, vw - 32));

  const [anchorInfo, setAnchorInfo] = useState(() => getPopoverPosition(anchorEl, popoverW));
  const popoverRef = useRef<HTMLDivElement>(null);
  const actions    = isCode ? CODE_ACTIONS : TEXT_ACTIONS;

  useEffect(() => {
    function update() { setAnchorInfo(getPopoverPosition(anchorEl, popoverW)); }
    // Capture phase on both window AND document to catch inner-div scroll events
    window.addEventListener('scroll',   update, true);
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize',   update);
    return () => {
      window.removeEventListener('scroll',   update, true);
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize',   update);
    };
  }, [anchorEl, popoverW]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (anchorEl.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [anchorEl, onClose]);

  // Position: below anchor normally, flip above when not enough space below
  const vh          = typeof window !== 'undefined' ? window.innerHeight : 800;
  const spaceBelow  = vh - anchorInfo.bottom - 8;
  const popoverTop  = spaceBelow >= POPOVER_H
    ? anchorInfo.bottom + 6                          // normal: below button
    : Math.max(8, anchorInfo.top - POPOVER_H - 6);  // flip: above button

  const sourceText = isCode
    ? String(block.content.code ?? '')
    : String(block.content.text ?? '');

  async function runAction(actionId: string) {
    if (!sourceText.trim()) { setError('Block has no content to process.'); return; }
    setSelectedAction(actionId);
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const extra = (isCode && codeLanguage && codeLanguage !== 'plaintext')
        ? { language: codeLanguage }
        : undefined;
      const response = await aiApi.action({ action_type: actionId, content: sourceText, extra });
      // Strip any accidental markdown code fences from code results
      const cleaned = isCode ? stripFences(response.result) : response.result;
      setResult(cleaned);
    } catch {
      setError('AI action failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    setResult(null);
    setError(null);
    setSelectedAction(null);
  }

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position:        'fixed',
        top:             popoverTop,
        left:            anchorInfo.left,
        zIndex:          9998,
        width:           popoverW,
        // Hardcoded dark — immune to .light class overrides in globals.css
        backgroundColor: '#1a1a1a',
        border:          '1px solid #333',
        color:           '#e5e5e5',
      }}
      className="animate-popover-in overflow-hidden rounded-xl shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ borderBottom: '1px solid #2a2a2a' }}
           className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]" style={{ color: '#a78bfa' }}>✨</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: '#888' }}>
            AI Actions
          </span>
          {isCode && codeLanguage && codeLanguage !== 'plaintext' && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-mono"
                  style={{ background: '#262626', border: '1px solid #333', color: '#999' }}>
              {codeLanguage}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-xs leading-none transition-colors"
          style={{ color: '#666' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ccc'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#666'; }}
        >
          ✕
        </button>
      </div>

      {/* Action grid */}
      {result === null && !loading && !error && (
        <div className="p-2">
          <div className="grid grid-cols-2 gap-1">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => runAction(action.id)}
                className="rounded-lg px-2.5 py-2 text-left text-xs font-medium
                           transition-all duration-100 active:scale-[0.97]"
                style={{
                  background:   selectedAction === action.id ? 'rgba(124,58,237,0.2)' : 'transparent',
                  border:       selectedAction === action.id ? '1px solid rgba(139,92,246,0.5)' : '1px solid transparent',
                  color:        selectedAction === action.id ? '#c4b5fd' : '#d4d4d4',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  if (selectedAction !== action.id) {
                    el.style.background = '#262626';
                    el.style.borderColor = '#444';
                    el.style.color = '#f5f5f5';
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  if (selectedAction !== action.id) {
                    el.style.background = 'transparent';
                    el.style.borderColor = 'transparent';
                    el.style.color = '#d4d4d4';
                  }
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 px-4 py-7">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: '#333' }} />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
                 style={{ borderTopColor: '#8b5cf6' }} />
            <div className="absolute inset-[5px] rounded-full" style={{ background: 'rgba(139,92,246,0.1)' }} />
          </div>
          <p className="text-center text-xs" style={{ color: '#777' }}>
            Running{' '}
            <span style={{ color: '#c4b5fd', fontWeight: 500 }}>
              {actions.find((a) => a.id === selectedAction)?.label}
            </span>
            …
          </p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-3 py-3 space-y-2">
          <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-[10px] transition-colors"
            style={{ color: '#777' }}
          >
            ← Back
          </button>
        </div>
      )}

      {/* Result preview */}
      {result !== null && !loading && (
        <div className="p-2 space-y-2">
          <div className="max-h-48 overflow-y-auto overscroll-contain rounded-lg
                          px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap"
               style={{
                 background:   '#111',
                 border:       '1px solid #2a2a2a',
                 color:        '#e5e5e5',
               }}>
            {result}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onApply(result)}
              className="flex-1 rounded-lg py-2 text-xs font-semibold text-white
                         shadow-sm transition-colors"
              style={{ background: '#7c3aed' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#6d28d9'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#7c3aed'; }}
            >
              ✓ Accept
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 rounded-lg py-2 text-xs transition-colors"
              style={{ border: '1px solid #333', color: '#999' }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = '#555';
                el.style.color = '#e5e5e5';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = '#333';
                el.style.color = '#999';
              }}
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
