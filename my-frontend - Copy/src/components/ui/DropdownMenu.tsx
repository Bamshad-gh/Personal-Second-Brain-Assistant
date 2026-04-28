/**
 * components/ui/DropdownMenu.tsx
 *
 * What:    A generic, reusable dropdown menu component.
 *          Wraps a trigger element (children) and shows a positioned list of
 *          action items when clicked. Used by SidebarItem and the page header.
 *
 * Architecture:
 *   Same portal + fixed-position pattern as PageLinkPopup.tsx.
 *   Renders the dropdown on document.body via createPortal to escape any
 *   overflow:hidden/auto ancestor (sidebar scroll container, etc.).
 *   Position is calculated from the trigger's getBoundingClientRect().
 *   Flips above the trigger when there isn't enough space below.
 *
 * Closing behaviour:
 *   - Click outside (mousedown listener on document)
 *   - Escape key
 *   - Clicking any item (item onClick fires after close)
 *
 * Item variants:
 *   default — neutral-300 text
 *   danger  — red-400 text, red tinted hover background
 *
 * Props:
 *   items     — array of DropdownItem config objects
 *   children  — the trigger element (button, div, etc.)
 *   placement — 'left' (default): right-aligns menu to trigger's right edge
 *               'right': left-aligns menu to trigger's left edge (use for
 *               triggers on the left side of the screen, e.g. sidebar buttons)
 *
 * Used by:
 *   src/components/sidebar/SidebarItem.tsx
 *   src/components/sidebar/Sidebar.tsx  (placement='right')
 *   src/app/(app)/[workspaceId]/[pageId]/page.tsx
 */

'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DropdownItem {
  label:     string;
  icon?:     React.ReactNode;
  onClick:   () => void;
  variant?:  'default' | 'danger';
  disabled?: boolean;
}

interface DropdownMenuProps {
  items:      DropdownItem[];
  children:   React.ReactNode;  // the trigger button/element
  placement?: 'left' | 'right'; // default: 'left' (right-aligned to trigger)
}

// ─────────────────────────────────────────────────────────────────────────────
// Approximate menu height used to decide whether to flip above the trigger.
// Calculated as: (items × 36px item height) + 8px vertical padding.
// ─────────────────────────────────────────────────────────────────────────────
const ITEM_HEIGHT    = 36;
const MENU_V_PAD     = 8;
const FLIP_THRESHOLD = 200; // px below trigger — if less, flip above

// ─────────────────────────────────────────────────────────────────────────────
// DropdownMenu
// ─────────────────────────────────────────────────────────────────────────────

export function DropdownMenu({ items, children, placement = 'left' }: DropdownMenuProps) {
  const [isOpen, setIsOpen]     = useState(false);
  const [mounted, setMounted]   = useState(false);
  // Position holds both left and right so the portal style can branch cleanly.
  const [position, setPosition] = useState({ top: 0, left: 0, right: 0 });
  const triggerRef              = useRef<HTMLDivElement>(null);

  // Portal mount guard — prevents SSR / pre-hydration createPortal calls.
  useEffect(() => { setMounted(true); }, []);

  // ── Calculate dropdown position from trigger's bounding rect ──────────────
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect       = triggerRef.current.getBoundingClientRect();
    const menuHeight = items.length * ITEM_HEIGHT + MENU_V_PAD;
    const spaceBelow = window.innerHeight - rect.bottom;

    const top = spaceBelow < FLIP_THRESHOLD
      ? rect.top - menuHeight - 4  // flip above trigger
      : rect.bottom + 4;           // open below trigger

    if (placement === 'right') {
      // Left-align: menu's left edge lines up with trigger's left edge.
      // Used for triggers on the left side of the screen (e.g. sidebar).
      setPosition({ top, left: rect.left, right: 0 });
    } else {
      // Right-align (default): menu's right edge lines up with trigger's right edge.
      setPosition({ top, left: 0, right: window.innerWidth - rect.right });
    }
  }, [items.length, placement]);

  // ── Toggle open / closed ──────────────────────────────────────────────────
  function handleTriggerClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isOpen) calculatePosition();
    setIsOpen((prev) => !prev);
  }

  // ── Close on outside mousedown ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // ── Item click: close first, then fire the item's handler ─────────────────
  function handleItemClick(item: DropdownItem) {
    if (item.disabled) return;
    setIsOpen(false);
    item.onClick();
  }

  // ── Portal style — branches on placement ──────────────────────────────────
  const portalStyle: React.CSSProperties = placement === 'right'
    ? { position: 'fixed', top: position.top, left:  position.left,  zIndex: 99999 }
    : { position: 'fixed', top: position.top, right: position.right, zIndex: 99999 };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={triggerRef} onClick={handleTriggerClick} className="relative inline-flex">
      {children}

      {isOpen && mounted && createPortal(
        <div
          style={portalStyle}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="animate-fade-in min-w-40 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
            {items.map((item, index) => (
              <button
                key={index}
                onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                disabled={item.disabled}
                className={[
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                  item.variant === 'danger'
                    ? 'text-red-400 hover:bg-red-950/30'
                    : 'text-neutral-300 hover:bg-neutral-800',
                  item.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                ].join(' ')}
              >
                {item.icon && (
                  <span className="shrink-0 text-current">{item.icon}</span>
                )}
                {item.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
