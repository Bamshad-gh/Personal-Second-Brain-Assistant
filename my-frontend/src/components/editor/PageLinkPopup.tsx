/**
 * components/editor/PageLinkPopup.tsx
 *
 * What:    The search popup that appears when the user types [[ in the editor.
 *          Shows a filtered list of pages the user can link to.
 *          Selecting a page calls onSelect, which Editor.tsx uses to insert
 *          a PageLinkNode and record the connection via the relations API.
 *
 * Props:
 *   query     — text typed after "[["; used to filter the page list
 *   rect      — cursor DOMRect from @tiptap/suggestion; used for positioning
 *   pages     — all pages in the current workspace (passed from Editor.tsx)
 *   onSelect  — called with the chosen Page when user confirms a selection
 *   onClose   — called when Escape is pressed or popup should dismiss
 *
 * Imperative handle (PageLinkPopupHandle):
 *   onKeyDown(event) — Editor.tsx calls this to delegate ArrowUp/Down/Enter
 *                      events from the ProseMirror plugin to this component
 *
 * Architecture:
 *   Same portal + keyboard pattern as SlashMenuPortal.tsx + SlashMenuList.tsx.
 *   Renders on document.body via createPortal to escape editor stacking context.
 *   onMouseDown={e.preventDefault()} prevents editor blur before click fires.
 *
 * Files that import this:
 *   Editor.tsx — mounts when pageLinkOpen is true, passes popup ref for keydown
 */

'use client';

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import { FileText } from 'lucide-react';
import type { Page } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Imperative handle so Editor.tsx can forward keyboard events to this popup */
export interface PageLinkPopupHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface PageLinkPopupProps {
  query:    string;
  rect:     DOMRect | null;
  pages:    Page[];
  onSelect: (page: Page) => void;
  onClose:  () => void;
}

// Maximum results shown — keeps the popup compact
const MAX_RESULTS = 8;

// Approximate popup height used to decide whether to flip above the cursor
const POPUP_HEIGHT = 280;

// ─────────────────────────────────────────────────────────────────────────────
// PageLinkPopup
// ─────────────────────────────────────────────────────────────────────────────

export const PageLinkPopup = forwardRef<PageLinkPopupHandle, PageLinkPopupProps>(
  function PageLinkPopup({ query, rect, pages, onSelect, onClose }, ref) {
    // ── Portal mount guard — prevents SSR / pre-hydration createPortal calls ──
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // ── Keyboard navigation state ─────────────────────────────────────────────
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Ref to the currently selected button — used to scroll it into view
    const selectedRef = useRef<HTMLButtonElement>(null);

    // ── Filter pages by query (case-insensitive title match) ─────────────────
    const filtered = pages
      .filter((p) =>
        !query || p.title.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, MAX_RESULTS); // cap at MAX_RESULTS for a compact popup

    // Reset selection to top whenever the query or result list changes
    useEffect(() => {
      setSelectedIndex(0);
    }, [query, filtered.length]);

    // Scroll selected item into view when it changes via keyboard
    useEffect(() => {
      selectedRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    // ── Imperative handle — Editor.tsx delegates keydown events here ──────────
    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent): boolean => {
        if (event.key === 'ArrowUp') {
          // Wrap around to the bottom of the list
          setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
          return true; // consumed
        }
        if (event.key === 'ArrowDown') {
          // Wrap around to the top of the list
          setSelectedIndex((i) => (i + 1) % filtered.length);
          return true; // consumed
        }
        if (event.key === 'Enter') {
          const page = filtered[selectedIndex];
          if (page) onSelect(page);
          return true; // consumed
        }
        return false; // pass all other keys back to ProseMirror
      },
    }));

    // ── Portal positioning ────────────────────────────────────────────────────

    // Do not render during SSR or before hydration
    if (!mounted || !rect) return null;

    // Flip the popup above the cursor when there isn't enough space below
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove  = spaceBelow < POPUP_HEIGHT + 8;
    const top        = showAbove ? rect.top - POPUP_HEIGHT - 8 : rect.bottom + 8;

    // ── Render ────────────────────────────────────────────────────────────────

    return createPortal(
      <div
        style={{
          position: 'fixed',
          top,
          left:   rect.left,
          zIndex: 99999,
          width:  '280px',
        }}
        // CRITICAL: prevents the editor from losing focus when the user clicks
        // a result. Without this, onBlur fires on the editor before onClick fires
        // on the button, which triggers onExit and destroys the popup first.
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="animate-fade-in overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">

          {/* Search hint — shows what the user has typed so far */}
          <div className="border-b border-neutral-800 px-3 py-2">
            <p className="text-xs text-neutral-500">
              {query ? (
                <>Searching for <span className="text-neutral-300">"{query}"</span></>
              ) : (
                'Type a page name…'
              )}
            </p>
          </div>

          {/* Results list */}
          <div className="max-h-[224px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              // Empty state — query has no matches
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-neutral-500">No pages match</p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  Try a different search term
                </p>
              </div>
            ) : (
              filtered.map((page, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={page.id}
                    ref={isSelected ? selectedRef : undefined}
                    onClick={() => onSelect(page)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={[
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left',
                      'transition-colors duration-75',
                      isSelected
                        ? 'bg-violet-500/15 text-neutral-100'
                        : 'text-neutral-300 hover:bg-neutral-800',
                    ].join(' ')}
                  >
                    {/* Page icon — use the page's own icon or a fallback */}
                    <span className="shrink-0 text-base leading-none">
                      {page.icon || <FileText size={14} className="text-neutral-500" />}
                    </span>

                    {/* Page title — truncate long names */}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {page.title || 'Untitled'}
                    </span>

                    {/* Keyboard hint on the selected row */}
                    {isSelected && (
                      <span className="shrink-0 text-xs text-neutral-500">↵</span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer — keyboard shortcut hint */}
          <div className="border-t border-neutral-800 px-3 py-1.5">
            <p className="text-xs text-neutral-600">
              ↑↓ navigate · ↵ select · Esc cancel
            </p>
          </div>
        </div>
      </div>,
      document.body,
    );
  },
);
