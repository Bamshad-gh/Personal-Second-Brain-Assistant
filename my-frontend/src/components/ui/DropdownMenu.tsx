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
 *   items    — array of DropdownItem config objects
 *   children — the trigger element (button, div, etc.)
 *
 * Used by:
 *   src/components/sidebar/SidebarItem.tsx
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
  items:    DropdownItem[];
  children: React.ReactNode; // the trigger button/element
}

// ─────────────────────────────────────────────────────────────────────────────
// Approximate menu height used to decide whether to flip above the trigger.
// Calculated as: (items × 36px item height) + 8px vertical padding.
// ─────────────────────────────────────────────────────────────────────────────
const ITEM_HEIGHT   = 36;
const MENU_V_PAD    = 8;
const FLIP_THRESHOLD = 200; // px below cursor — if less, flip above

// ─────────────────────────────────────────────────────────────────────────────
// DropdownMenu
// ─────────────────────────────────────────────────────────────────────────────

export function DropdownMenu({ items, children }: DropdownMenuProps) {
  const [isOpen, setIsOpen]       = useState(false);
  const [mounted, setMounted]     = useState(false);
  const [position, setPosition]   = useState({ top: 0, right: 0 });
  const triggerRef                = useRef<HTMLDivElement>(null);

  // Portal mount guard — prevents SSR / pre-hydration createPortal calls
  useEffect(() => { setMounted(true); }, []);

  // ── Calculate dropdown position from trigger's bounding rect ──────────────
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = items.length * ITEM_HEIGHT + MENU_V_PAD;
    const spaceBelow = window.innerHeight - rect.bottom;

    const top = spaceBelow < FLIP_THRESHOLD
      ? rect.top - menuHeight - 4   // flip above trigger
      : rect.bottom + 4;            // open below trigger

    // Right-align the dropdown to the right edge of the trigger
    const right = window.innerWidth - rect.right;

    setPosition({ top, right });
  }, [items.length]);

  // ── Toggle open / closed ──────────────────────────────────────────────────
  function handleTriggerClick(e: React.MouseEvent) {
    e.stopPropagation(); // prevent bubbling to parent row (e.g. page select)
    if (!isOpen) calculatePosition();
    setIsOpen((prev) => !prev);
  }

  // ── Close on outside mousedown ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(e: MouseEvent) {
      // Ignore clicks inside the trigger wrapper
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
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    // Trigger wrapper — provides the ref for position calculation
    <div ref={triggerRef} onClick={handleTriggerClick} className="relative inline-flex">
      {children}

      {/* Dropdown portal — only rendered when open + mounted (client-side) */}
      {isOpen && mounted && createPortal(
        <div
          style={{
            position: 'fixed',
            top:   position.top,
            right: position.right,
            zIndex: 99999,
          }}
          // Prevent mousedown from bubbling up and closing the dropdown
          // before the item's onClick can fire
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="animate-fade-in min-w-[160px] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 py-1 shadow-xl">
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
                  item.disabled
                    ? 'cursor-not-allowed opacity-40'
                    : 'cursor-pointer',
                ].join(' ')}
              >
                {/* Optional icon */}
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
