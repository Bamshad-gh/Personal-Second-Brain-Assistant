/**
 * components/sidebar/PageTree.tsx
 *
 * What:    Renders a hierarchical list of pages grouped by custom page type.
 *          Takes a flat array of pages (as returned by the API) and:
 *            1. Builds the nested tree structure client-side using the parent field
 *            2. Groups ROOT-level nodes by custom_page_type
 *            3. Renders a collapsible group header per type with a + button
 *            4. Renders un-typed root pages after all type groups (no header)
 *
 * Props:
 *   pages           — flat array of Page objects from usePages()
 *   activePageId    — currently open page ID (for highlight)
 *   workspaceId     — needed to build navigation URLs + useMovePage
 *   customTypes     — list of CustomPageType objects for group headers
 *   onCreatePage    — called when user clicks + to add a page or child page;
 *                     accepts optional customPageTypeId for typed creation
 *   onUpdatePage    — called when user renames a page
 *   onDeletePage    — called when user confirms delete
 *
 * Drag-and-drop:
 *   Each page row is draggable. Dropping ON a page reparents the dragged page.
 *   Dropping BETWEEN pages (top 30% / bottom 30%) reorders among siblings.
 *   Visual feedback: violet line for reorder, violet bg tint for reparent.
 *   Backend: PATCH /api/pages/:id/move/ via useMovePage hook.
 */

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { useMovePage } from '@/hooks/usePages';
import type { Page, CustomPageType } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PageNode {
  page: Page;
  children: PageNode[];
}

interface PageTreeProps {
  pages:          Page[];
  activePageId:   string | null;
  workspaceId:    string;
  customTypes:    CustomPageType[];
  onCreatePage:   (parentId: string | null, customPageTypeId?: string) => void;
  onUpdatePage:   (pageId: string, payload: { title: string }) => void;
  onDeletePage:   (pageId: string) => void;
}

type DropPosition = 'before' | 'after' | 'inside';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — build tree from flat list
// ─────────────────────────────────────────────────────────────────────────────

/** Converts a flat Page[] into a nested PageNode[] for rendering */
function buildTree(pages: Page[]): PageNode[] {
  // Map: id → node (so we can look up parents in O(1))
  const nodeMap = new Map<string, PageNode>(
    pages.map((page) => [page.id, { page, children: [] }]),
  );

  const roots: PageNode[] = [];

  for (const page of pages) {
    const node = nodeMap.get(page.id)!;
    if (page.parent === null) {
      roots.push(node); // top-level page
    } else {
      const parentNode = nodeMap.get(page.parent);
      if (parentNode) {
        parentNode.children.push(node); // nested page
      } else {
        roots.push(node); // parent was deleted — treat as root
      }
    }
  }

  // Sort alphabetically by title
  const sortNodes = (nodes: PageNode[]): PageNode[] =>
    nodes.sort((a, b) => a.page.title.localeCompare(b.page.title));

  return sortNodes(roots);
}

// ─────────────────────────────────────────────────────────────────────────────
// PageTree component
// ─────────────────────────────────────────────────────────────────────────────

export function PageTree({
  pages,
  activePageId,
  workspaceId,
  customTypes,
  onCreatePage,
  onUpdatePage,
  onDeletePage,
}: PageTreeProps) {
  const router   = useRouter();
  const movePage = useMovePage(workspaceId);

  // Track which pages are expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [draggingId,   setDraggingId]   = useState<string | null>(null);
  const [dragOverId,   setDragOverId]   = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<DropPosition | null>(null);

  // Build the tree only when pages changes
  const tree = useMemo(() => buildTree(pages), [pages]);

  // ── Group root nodes by custom_page_type ─────────────────────────────────

  const { groupedNodes, untypedNodes } = useMemo(() => {
    const grouped: Record<string, PageNode[]> = {};
    const untyped: PageNode[] = [];

    for (const node of tree) {
      const typeId = node.page.custom_page_type;
      if (typeId) {
        if (!grouped[typeId]) grouped[typeId] = [];
        grouped[typeId].push(node);
      } else {
        untyped.push(node);
      }
    }

    return { groupedNodes: grouped, untypedNodes: untyped };
  }, [tree]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function toggleExpand(pageId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  function handleSelect(page: Page) {
    router.push(`/${workspaceId}/${page.id}`);
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────────────

  function handleDragStart(pageId: string) {
    setDraggingId(pageId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
    setDragPosition(null);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, pageId: string) {
    e.preventDefault();
    setDragOverId(pageId);
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientY - rect.top) / rect.height;
    setDragPosition(pct < 0.3 ? 'before' : pct > 0.7 ? 'after' : 'inside');
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetPage: Page) {
    e.preventDefault();
    if (!draggingId || draggingId === targetPage.id) {
      handleDragEnd();
      return;
    }

    if (dragPosition === 'inside') {
      // Reparent: make dragged page a child of the target
      const siblings = pages.filter((p) => p.parent === targetPage.id);
      movePage.mutate({ id: draggingId, parentId: targetPage.id, order: siblings.length });
    } else {
      // Reorder: insert before or after the target among its siblings
      const parentId  = targetPage.parent ?? null;
      const siblings  = pages.filter((p) => (p.parent ?? null) === parentId && p.id !== draggingId);
      const targetIdx = siblings.findIndex((p) => p.id === targetPage.id);
      const order     = dragPosition === 'before' ? targetIdx : targetIdx + 1;
      movePage.mutate({ id: draggingId, parentId, order: Math.max(0, order) });
    }

    handleDragEnd();
  }

  // ── Recursive renderer ────────────────────────────────────────────────────

  function renderNodes(nodes: PageNode[], depth: number): React.ReactNode[] {
    return nodes.flatMap((node) => {
      const isExpanded  = expanded.has(node.page.id);
      const hasChildren = node.children.length > 0;
      const isDragging  = draggingId === node.page.id;
      const isOver      = dragOverId === node.page.id;

      // Effective color: page override → type default → none
      const effectiveColor =
        node.page.color ||
        customTypes.find((t) => t.id === node.page.custom_page_type)?.default_color ||
        null;

      // Build the wrapper style: base color + drag-over highlight
      const wrapperStyle: React.CSSProperties = {
        opacity: isDragging ? 0.4 : 1,
        ...(isOver && dragPosition === 'inside'
          ? {
              borderLeft:      '2px solid #7c3aed',
              backgroundColor: 'rgba(124,58,237,0.08)',
              borderRadius:    '6px',
            }
          : effectiveColor
          ? {
              borderLeft:      `2px solid ${effectiveColor}40`,
              backgroundColor: `${effectiveColor}08`,
              borderRadius:    '6px',
            }
          : undefined),
      };

      return [
        <div
          key={node.page.id}
          draggable
          onDragStart={() => handleDragStart(node.page.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, node.page.id)}
          onDrop={(e) => handleDrop(e, node.page)}
          style={wrapperStyle}
        >
          {/* Drop indicator — insert BEFORE */}
          {isOver && dragPosition === 'before' && (
            <div className="mx-2 h-0.5 rounded-full bg-violet-500" />
          )}

          <SidebarItem
            page={node.page}
            depth={depth}
            isActive={activePageId === node.page.id}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            onSelect={handleSelect}
            onAddChild={(parentId) => {
              setExpanded((prev) => new Set([...prev, parentId])); // auto-expand parent
              onCreatePage(parentId);
            }}
            onUpdate={onUpdatePage}
            onDelete={onDeletePage}
            onToggle={toggleExpand}
          />

          {/* Drop indicator — insert AFTER */}
          {isOver && dragPosition === 'after' && (
            <div className="mx-2 h-0.5 rounded-full bg-violet-500" />
          )}
        </div>,
        // Only render children if this node is expanded
        ...(hasChildren && isExpanded ? renderNodes(node.children, depth + 1) : []),
      ];
    });
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (pages.length === 0 && customTypes.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-xs text-neutral-600">No pages yet</p>
        <button
          onClick={() => onCreatePage(null)}
          className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          + Add a page
        </button>
      </div>
    );
  }

  // ── Render: type groups first, untyped pages last ────────────────────────

  return (
    <div className="flex flex-col gap-0.5 px-2">

      {/* ── Type group sections — only pinned types appear in the sidebar ── */}
      {customTypes.filter((type) => type.is_pinned).map((type) => (
        <div key={type.id} className="mb-0.5">

          {/* Group header — colored left border from the type's group color */}
          <div
            className="group flex items-center gap-1 px-2 py-1 rounded-md"
            style={
              type.group_detail?.color
                ? { borderLeft: `3px solid ${type.group_detail.color}`, paddingLeft: '6px' }
                : undefined
            }
          >
            <span className="mr-0.5 leading-none text-sm">{type.icon || '📄'}</span>
            <span className="flex-1 truncate uppercase tracking-wide text-[10px] font-semibold text-neutral-500">
              {type.name}
            </span>
            <button
              onClick={() => onCreatePage(null, type.id)}
              className={[
                'opacity-0 group-hover:opacity-100',
                'flex h-4 w-4 items-center justify-center rounded',
                'text-neutral-500 hover:text-violet-400 transition-all',
              ].join(' ')}
              title={`New ${type.name} page`}
            >
              <Plus size={11} />
            </button>
          </div>

          {/* Pages of this type */}
          {renderNodes(groupedNodes[type.id] ?? [], 0)}
        </div>
      ))}

      {/* ── Un-typed pages (no group header) ─────────────────────────── */}
      {untypedNodes.length > 0 && (
        <div className="mt-0.5">
          {renderNodes(untypedNodes, 0)}
        </div>
      )}

    </div>
  );
}
