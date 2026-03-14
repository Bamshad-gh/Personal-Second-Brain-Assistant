/**
 * components/sidebar/SidebarItem.tsx
 *
 * A single row in the sidebar page tree.
 * Active state: violet left-border accent + subtle tinted background.
 * Hover state: smooth fade to neutral-800/60.
 */

'use client';

import { useState } from 'react';
import { ChevronRight, Plus, Trash2, FileText } from 'lucide-react';
import type { Page } from '@/types';

interface SidebarItemProps {
  page: Page;
  depth: number;
  isActive: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  onSelect: (page: Page) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (pageId: string) => void;
  onToggle: (pageId: string) => void;
}

export function SidebarItem({
  page,
  depth,
  isActive,
  hasChildren,
  isExpanded,
  onSelect,
  onAddChild,
  onDelete,
  onToggle,
}: SidebarItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={[
        'group flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer',
        'min-h-[34px] select-none transition-all duration-100',
        // Active: violet left-bar + subtle purple tint (class defined in globals.css)
        isActive
          ? 'sidebar-item-active'
          : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200',
      ].join(' ')}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(page)}
    >
      {/* ── Expand / collapse chevron ────────────────────────────────────── */}
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

      {/* ── Page icon ─────────────────────────────────────────────────────── */}
      <span className="shrink-0 text-sm leading-none" aria-hidden="true">
        {page.icon || <FileText size={14} className="text-neutral-500" />}
      </span>

      {/* ── Page title ────────────────────────────────────────────────────── */}
      <span
        className={[
          'flex-1 truncate text-sm leading-tight',
          isActive ? 'font-medium text-neutral-100' : '',
        ].join(' ')}
      >
        {page.title || 'Untitled'}
      </span>

      {/* ── Action buttons (visible on hover) ─────────────────────────────── */}
      {isHovered && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onAddChild(page.id); }}
            className="flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
            title="Add page inside"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}
            className="flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:bg-red-500/20 hover:text-red-400 transition-colors"
            title="Delete page"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
