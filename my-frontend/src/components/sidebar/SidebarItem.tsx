/**
 * components/sidebar/SidebarItem.tsx
 *
 * What:    A single row in the sidebar page tree.
 *
 * States:
 *   Normal          — page icon + title + "..." button on hover
 *   Renaming        — inline <input> replaces title; Enter/blur saves, Escape cancels
 *   ConfirmDelete   — inline "Delete? [Yes] [No]" replaces row content
 *
 * "..." menu items (via DropdownMenu):
 *   Rename      → switches to renaming state
 *   New subpage → calls onAddChild(page.id)
 *   Delete      → switches to confirm-delete state
 *
 * Props:
 *   page        — the Page object to render
 *   depth       — nesting level (used for left padding)
 *   isActive    — whether this page is currently open (violet accent)
 *   hasChildren — controls chevron visibility
 *   isExpanded  — chevron rotation
 *   onSelect    — navigate to page
 *   onAddChild  — create a child page under this one
 *   onUpdate    — save a title change (calls useUpdatePage in Sidebar.tsx)
 *   onDelete    — delete this page (calls useDeletePage in Sidebar.tsx)
 *   onToggle    — expand/collapse children
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronRight, MoreHorizontal, Pencil, Plus, Trash2, FileText } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import type { Page } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarItemProps {
  page:        Page;
  depth:       number;
  isActive:    boolean;
  hasChildren: boolean;
  isExpanded:  boolean;
  onSelect:    (page: Page) => void;
  onAddChild:  (parentId: string) => void;
  onUpdate:    (pageId: string, payload: { title: string }) => void;
  onDelete:    (pageId: string) => void;
  onToggle:    (pageId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SidebarItem
// ─────────────────────────────────────────────────────────────────────────────

export function SidebarItem({
  page,
  depth,
  isActive,
  hasChildren,
  isExpanded,
  onSelect,
  onAddChild,
  onUpdate,
  onDelete,
  onToggle,
}: SidebarItemProps) {

  // ── Local state ──────────────────────────────────────────────────────────
  const [isRenaming,          setIsRenaming]          = useState(false);
  const [renameValue,         setRenameValue]         = useState(page.title);
  const [isConfirmingDelete,  setIsConfirmingDelete]  = useState(false);
  const [isDeleting,          setIsDeleting]          = useState(false);

  const renameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the rename input whenever renaming mode is entered
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  // ── Rename helpers ───────────────────────────────────────────────────────

  function commitRename() {
    const trimmed = renameValue.trim();
    onUpdate(page.id, { title: trimmed || page.title });
    setIsRenaming(false);
  }

  function cancelRename() {
    setRenameValue(page.title);
    setIsRenaming(false);
  }

  // ── Delete helpers ───────────────────────────────────────────────────────

  function confirmDelete() {
    setIsDeleting(true);
    onDelete(page.id);
    // onDelete navigates away if this was the active page,
    // so we only need to clean up state for non-active pages.
    setIsDeleting(false);
    setIsConfirmingDelete(false);
  }

  // ── Dropdown items ───────────────────────────────────────────────────────

  const menuItems = [
    {
      label:   'Rename',
      icon:    <Pencil size={13} />,
      onClick: () => { setRenameValue(page.title); setIsRenaming(true); },
    },
    {
      label:   'New subpage',
      icon:    <Plus size={13} />,
      onClick: () => onAddChild(page.id),
    },
    {
      label:    'Delete',
      icon:     <Trash2 size={13} />,
      variant:  'danger' as const,
      onClick:  () => setIsConfirmingDelete(true),
    },
  ];

  // ── Render — inline delete confirmation ──────────────────────────────────
  //
  // When confirming delete, replace the entire row content so there's no
  // accidental navigation when clicking Yes/No.

  if (isConfirmingDelete) {
    return (
      <div
        className={[
          'group flex items-center gap-1 rounded-md px-2 py-1',
          'min-h-8.5 select-none',
          isActive ? 'sidebar-item-active' : 'bg-neutral-800/40',
        ].join(' ')}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <span className="flex-1 truncate text-xs text-neutral-400">Delete?</span>

        <button
          onClick={confirmDelete}
          disabled={isDeleting}
          className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-50"
        >
          {isDeleting ? '…' : 'Yes'}
        </button>

        <button
          onClick={() => setIsConfirmingDelete(false)}
          disabled={isDeleting}
          className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-700 transition-colors disabled:opacity-50"
        >
          No
        </button>
      </div>
    );
  }

  // ── Render — normal / renaming ────────────────────────────────────────────

  return (
    <div
      className={[
        'group flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer',
        'min-h-8.5 select-none transition-all duration-100',
        isActive
          ? 'sidebar-item-active'
          : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200',
      ].join(' ')}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onClick={() => { if (!isRenaming) onSelect(page); }}
    >
      {/* ── Expand / collapse chevron ─────────────────────────────────────── */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) onToggle(page.id);
        }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-600 hover:text-neutral-300"
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
      >
        {hasChildren ? (
          <ChevronRight
            size={12}
            className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
          />
        ) : (
          <span className="w-3" />
        )}
      </button>

      {/* ── Page icon ────────────────────────────────────────────────────── */}
      <span className="shrink-0 text-sm leading-none" aria-hidden="true">
        {page.icon || <FileText size={14} className="text-neutral-500" />}
      </span>

      {/* ── Title (normal) or rename input ───────────────────────────────── */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
            // Prevent keystrokes from bubbling to TipTap or the row click handler
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent text-sm text-neutral-100 outline-none border-b border-violet-500 py-0.5"
          aria-label="Rename page"
        />
      ) : (
        <span
          className={[
            'flex-1 truncate text-sm leading-tight',
            isActive ? 'font-medium text-neutral-100' : '',
          ].join(' ')}
        >
          {page.title || 'Untitled'}
        </span>
      )}

      {/* ── "..." options button (always in DOM for opacity transition) ──── */}
      {!isRenaming && (
        <div className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu items={menuItems}>
            <button
              className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 transition-all duration-100"
              title="Page options"
            >
              <MoreHorizontal size={12} />
            </button>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
