/**
 * components/editor/BottomTabBar.tsx
 *
 * What:  Sticky bottom tab bar for the document editor.
 *        Consolidates "Linked Pages" (backlinks) and "Canvas Blocks"
 *        into a single tabbed panel that sits at the bottom of the
 *        scrollable document column.
 *
 * Props:
 *   pageId        — UUID of the current page (unused directly, kept for future use)
 *   workspaceId   — used to build navigation URLs
 *   backlinkPages — pages that link to this page (from GET /relations/pages/:id/backlinks/)
 *   canvasBlocks  — blocks that live on the canvas (canvas_visible=true, canvas_x≠null)
 *
 * Behaviour:
 *   - Returns null when both lists are empty (no bar rendered)
 *   - Clicking an inactive tab opens its panel
 *   - Clicking the active tab again collapses the panel
 *   - Only one panel is open at a time
 */

'use client';

import { useState }     from 'react';
import { useRouter }    from 'next/navigation';
import { Link2, Layers } from 'lucide-react';
import type { BacklinkPage, Block } from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface BottomTabBarProps {
  pageId:        string;
  workspaceId:   string;
  backlinkPages: BacklinkPage[];
  canvasBlocks:  Block[];
}

type ActiveTab = 'linked' | 'canvas' | null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * extractText — walks a TipTap JSON node tree and concatenates text leaf nodes.
 * Returns a plain-text preview trimmed to `max` characters.
 */
function extractText(content: unknown, max = 80): string {
  const parts: string[] = [];
  function walk(n: unknown): void {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.text === 'string') {
      parts.push(obj.text);
    }
    if (Array.isArray(obj.content)) obj.content.forEach(walk);
  }
  walk(content);
  const text = parts.join(' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function BottomTabBar({
  workspaceId,
  backlinkPages,
  canvasBlocks,
}: BottomTabBarProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);

  // ── Nothing to show — render nothing ───────────────────────────────────
  if (backlinkPages.length === 0 && canvasBlocks.length === 0) return null;

  // ── Toggle helpers ──────────────────────────────────────────────────────
  function toggleTab(tab: 'linked' | 'canvas') {
    setActiveTab((prev) => (prev === tab ? null : tab));
  }

  // ── Shared class builders ───────────────────────────────────────────────
  function tabClass(tab: 'linked' | 'canvas'): string {
    return [
      'flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 transition-colors',
      activeTab === tab
        ? 'border-violet-500 text-violet-400'
        : 'border-transparent text-neutral-500 hover:text-neutral-300',
    ].join(' ');
  }

  function badgeClass(tab: 'linked' | 'canvas'): string {
    return [
      'text-[10px] rounded px-1.5 py-0.5',
      activeTab === tab
        ? 'bg-violet-900/40 text-violet-400'
        : 'bg-neutral-800 text-neutral-400',
    ].join(' ');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="sticky bottom-0 z-10 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">

      {/* ── Panel — renders ABOVE the tab row ──────────────────────────── */}
      {activeTab !== null && (
        <div className="max-h-52 overflow-y-auto border-t border-neutral-800 bg-neutral-950 px-4 py-2">

          {/* ── Linked Pages panel ─────────────────────────────────────── */}
          {activeTab === 'linked' && (
            <>
              {backlinkPages.length === 0 ? (
                <p className="text-xs text-neutral-500 py-2">No linked pages yet</p>
              ) : (
                backlinkPages.map((page) => (
                  <div
                    key={page.id}
                    onClick={() => router.push(`/${workspaceId}/${page.source_page_id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-neutral-300 hover:bg-neutral-800 cursor-pointer transition-colors"
                  >
                    <span>📄</span>
                    <span>{page.source_page_title || 'Untitled'}</span>
                  </div>
                ))
              )}
            </>
          )}

          {/* ── Canvas Blocks panel ────────────────────────────────────── */}
          {activeTab === 'canvas' && (
            <>
              {canvasBlocks.length === 0 ? (
                <p className="text-xs text-neutral-500 py-2">No canvas blocks visible in document</p>
              ) : (
                canvasBlocks.map((block) => (
                  <div key={block.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 shrink-0">
                      {block.block_type}
                    </span>
                    <span className="text-xs text-neutral-400 truncate flex-1">
                      {extractText(block.content?.json) || '(empty)'}
                    </span>
                  </div>
                ))
              )}
            </>
          )}

        </div>
      )}

      {/* ── Tab button row ──────────────────────────────────────────────── */}
      <div className="flex items-center px-4 h-9">

        {/* Linked Pages tab */}
        {backlinkPages.length > 0 && (
          <button
            type="button"
            onClick={() => toggleTab('linked')}
            className={tabClass('linked')}
          >
            <Link2 size={11} />
            Linked Pages
            <span className={badgeClass('linked')}>{backlinkPages.length}</span>
          </button>
        )}

        {/* Canvas Blocks tab */}
        {canvasBlocks.length > 0 && (
          <button
            type="button"
            onClick={() => toggleTab('canvas')}
            className={tabClass('canvas')}
          >
            <Layers size={11} />
            Canvas Blocks
            <span className={badgeClass('canvas')}>{canvasBlocks.length}</span>
          </button>
        )}

      </div>
    </div>
  );
}
