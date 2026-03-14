/**
 * components/sidebar/PageTree.tsx
 *
 * What:    Renders a hierarchical list of pages. Takes a flat array of pages
 *          (as returned by the API) and builds the nested tree structure
 *          client-side using the parent field.
 *
 * Props:
 *   pages           — flat array of Page objects from usePages()
 *   activePageId    — currently open page ID (for highlight)
 *   workspaceId     — needed to build navigation URLs
 *   onCreatePage    — called when user clicks + to add a page or child page
 *   onDeletePage    — called when user clicks trash icon
 *
 * How to expand:
 *   - Add drag-and-drop reordering
 *   - Add "pinned pages" section above the tree
 *   - Add search/filter within the tree
 *   - Persist expanded state to localStorage
 *
 * Algorithm — flat to tree:
 *   1. Build a Map of id → {page, children[]}
 *   2. Walk the array: if page.parent is null, it's a root node
 *      otherwise, push it into parent's children array
 *   3. Render recursively starting from root nodes
 *   This is O(n) — same approach as building nested comments in Django.
 */

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SidebarItem } from './SidebarItem';
import type { Page } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PageNode {
  page: Page;
  children: PageNode[];
}

interface PageTreeProps {
  pages: Page[];
  activePageId: string | null;
  workspaceId: string;
  onCreatePage: (parentId: string | null) => void;
  onDeletePage: (pageId: string) => void;
}

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

  // Sort by page order (fallback to title alphabetically)
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
  onCreatePage,
  onDeletePage,
}: PageTreeProps) {
  const router = useRouter();

  // Track which pages are expanded — starts with all root pages expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Build the tree only when pages changes (useMemo prevents rebuilding on every render)
  const tree = useMemo(() => buildTree(pages), [pages]);

  /** Toggle a page's expanded state */
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

  /** Navigate to a page when clicked */
  function handleSelect(page: Page) {
    router.push(`/${workspaceId}/${page.id}`);
  }

  // ── Recursive renderer ────────────────────────────────────────────────────

  /**
   * renderNodes — recursively renders page nodes at a given depth.
   * React renders lists as arrays, so we return an array of JSX elements.
   */
  function renderNodes(nodes: PageNode[], depth: number): React.ReactNode[] {
    return nodes.flatMap((node) => {
      const isExpanded = expanded.has(node.page.id);
      const hasChildren = node.children.length > 0;

      return [
        <SidebarItem
          key={node.page.id}
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
          onDelete={onDeletePage}
          onToggle={toggleExpand}
        />,
        // Only render children if this node is expanded
        ...(hasChildren && isExpanded ? renderNodes(node.children, depth + 1) : []),
      ];
    });
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (pages.length === 0) {
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

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {renderNodes(tree, 0)}
    </div>
  );
}
