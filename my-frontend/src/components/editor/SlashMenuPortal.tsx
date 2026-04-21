/**
 * components/editor/SlashMenuPortal.tsx
 *
 * What:    Thin portal wrapper — renders children at a fixed position on
 *          document.body, positioned from a DOMRect.
 *
 * Why portal:
 *   The menu must escape the editor's stacking context so it renders above
 *   all other page content without needing a specific z-index on each parent.
 *
 * Why `mounted` guard:
 *   createPortal requires document.body to exist. The guard ensures we never
 *   attempt the portal during SSR / before hydration completes.
 *
 * Props:
 *   children — the menu content (SlashMenuList)
 *   rect     — DOMRect from clientRect() in @tiptap/suggestion; used for
 *              fixed-position placement. Menu flips above cursor when there
 *              is insufficient space below (< 328px).
 *
 * Scroll tracking:
 *   A capture-phase scroll listener re-reads the current cursor position
 *   from window.getSelection() on every scroll event so the menu follows
 *   the text caret even when the user scrolls after opening the menu.
 *   The flip (above/below) is re-evaluated on every position update.
 *
 * Used by:  DocumentEditor.tsx, Editor.tsx
 */

'use client';

import { useEffect, useState } from 'react';
import { createPortal }        from 'react-dom';

interface SlashMenuPortalProps {
  children: React.ReactNode;
  rect:     DOMRect | null;
}

const MENU_HEIGHT = 320; // matches max-height in .slash-menu (globals.css)

/** Compute fixed-position top/left from a DOMRect, flipping above if needed. */
function computePos(r: DOMRect): { top: number; left: number } {
  const spaceBelow = window.innerHeight - r.bottom;
  const showAbove  = spaceBelow < MENU_HEIGHT + 8;
  return {
    top:  showAbove ? r.top - MENU_HEIGHT - 8 : r.bottom + 8,
    left: r.left,
  };
}

export function SlashMenuPortal({ children, rect }: SlashMenuPortalProps) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Sync position whenever the rect prop changes (user types more chars after '/').
  // This is the primary source of truth — the slash extension sends a fresh rect
  // on every slash:update event.
  useEffect(() => {
    if (rect) setPos(computePos(rect));
  }, [rect]);

  // Re-read cursor position on scroll so the menu follows the text caret.
  // Capture phase (true) catches scroll events from any scrollable ancestor,
  // including the document editor's overflow-y-auto container.
  useEffect(() => {
    function onScroll() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range   = sel.getRangeAt(0);
      const newRect = range.getBoundingClientRect();
      // Skip degenerate rects (e.g. when selection is collapsed in a hidden node)
      if (newRect.width === 0 && newRect.height === 0) return;
      setPos(computePos(newRect));
    }
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, []);

  if (!mounted || !rect) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top:      pos.top,
        left:     pos.left,
        zIndex:   99999,
      }}
      // Prevent the editor from losing focus when the user clicks a menu item.
      // Without this, onBlur fires on the editor before onClick fires on the
      // button, which triggers onExit and destroys the menu before the click
      // registers.
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
