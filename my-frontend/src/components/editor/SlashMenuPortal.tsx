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
 * Used by:  Editor.tsx
 */

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface SlashMenuPortalProps {
  children: React.ReactNode;
  rect:     DOMRect | null;
}

export function SlashMenuPortal({ children, rect }: SlashMenuPortalProps) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !rect) return null;

  // Flip menu above the cursor when there isn't enough space below
  const menuHeight  = 320; // matches max-height in .slash-menu (globals.css)
  const spaceBelow  = window.innerHeight - rect.bottom;
  const showAbove   = spaceBelow < menuHeight + 8;
  const top         = showAbove ? rect.top - menuHeight - 8 : rect.bottom + 8;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top,
        left:     rect.left,
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
