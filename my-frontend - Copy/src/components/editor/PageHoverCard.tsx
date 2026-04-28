/**
 * components/editor/PageHoverCard.tsx
 *
 * What:    Hover card shown when the user rests their mouse over a [[Page Link]]
 *          chip in the editor for 500ms.
 *          Renders into a portal on document.body (same pattern as DropdownMenu.tsx)
 *          so it escapes any overflow:hidden containers.
 *
 * Positioning:
 *   - position: fixed, anchored to anchorRect (getBoundingClientRect() of the chip)
 *   - Default: below the chip (rect.bottom + 8)
 *   - Flips above when there isn't enough room below (< CARD_HEIGHT px remaining)
 *   - Left-aligned to chip; clamped to not overflow the right edge of the viewport
 *
 * Dismiss timing (coordinated by Editor.tsx):
 *   - 500ms show delay after hovering chip → Editor.tsx starts timer
 *   - Card stays visible while mouse is over chip OR card
 *   - 100ms dismiss delay after mouse leaves both → onMouseLeave → Editor.tsx starts timer
 *   - onMouseEnter → Editor.tsx cancels dismiss timer
 *
 * HoverCardConfig:
 *   Pass config prop to hide/show individual sections.
 *   Defaults show all sections. Future: user preference stored in workspace settings.
 */

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { pageApi } from '@/lib/api';
import type { PagePreview } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

interface HoverCardConfig {
  showPreview:    boolean;
  showBacklinks:  boolean;
  showPageType:   boolean;
  showOpenButton: boolean;
}

// Change these defaults or pass config prop to control which sections
// show in the hover card
const DEFAULT_HOVER_CARD_CONFIG: HoverCardConfig = {
  showPreview:    true,
  showBacklinks:  true,
  showPageType:   true,
  showOpenButton: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface PageHoverCardProps {
  pageId:       string;
  workspaceId:  string;
  anchorRect:   DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  config?:      Partial<HoverCardConfig>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CARD_WIDTH  = 280;
const CARD_HEIGHT = 160; // estimate for flip logic
const OFFSET      = 8;   // gap between chip and card

// ─────────────────────────────────────────────────────────────────────────────
// PageHoverCard
// ─────────────────────────────────────────────────────────────────────────────

export function PageHoverCard({
  pageId,
  workspaceId,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
  config,
}: PageHoverCardProps) {
  const cfg = { ...DEFAULT_HOVER_CARD_CONFIG, ...config };

  // ── Portal mount guard (same pattern as DropdownMenu.tsx) ────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const router = useRouter();

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<PagePreview>({
    queryKey: ['page-preview', pageId],
    queryFn:  () => pageApi.preview(pageId),
    staleTime: 60_000,
  });

  // ── Position ─────────────────────────────────────────────────────────────
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const flipAbove  = spaceBelow < CARD_HEIGHT + OFFSET;

  const top  = flipAbove
    ? anchorRect.top - CARD_HEIGHT - OFFSET
    : anchorRect.bottom + OFFSET;

  // Clamp so card never overflows the right edge
  const left = Math.min(
    anchorRect.left,
    window.innerWidth - CARD_WIDTH - 8,
  );

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top,
        left,
        width: CARD_WIDTH,
        zIndex: 9999,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl animate-fade-in"
    >
      {isLoading ? (
        // ── Loading shimmer ──────────────────────────────────────────────
        <div className="flex flex-col gap-2">
          <div className="animate-shimmer h-4 w-3/4 rounded" />
          <div className="animate-shimmer h-3 w-full rounded" />
          <div className="animate-shimmer h-3 w-2/3 rounded" />
        </div>
      ) : data ? (
        // ── Card content ─────────────────────────────────────────────────
        <>
          {/* Icon + title + type badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 text-lg leading-none">{data.icon || '📄'}</span>
              <span className="truncate text-sm font-semibold text-neutral-100">
                {data.title || 'Untitled'}
              </span>
            </div>
            {cfg.showPageType && (
              <span className="shrink-0 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {data.page_type}
              </span>
            )}
          </div>

          {/* Content preview */}
          {cfg.showPreview && data.content_preview && (
            <p className="mt-2 line-clamp-3 text-sm text-neutral-400">
              {data.content_preview}
            </p>
          )}

          {/* Backlinks + Open button */}
          {(cfg.showBacklinks || cfg.showOpenButton) && (
            <div className="mt-3 flex items-center justify-between">
              {cfg.showBacklinks && (
                <span className="text-xs text-neutral-600">
                  {data.backlink_count === 1
                    ? '1 backlink'
                    : `${data.backlink_count} backlinks`}
                </span>
              )}
              {cfg.showOpenButton && (
                <button
                  onClick={() => router.push(`/${workspaceId}/${pageId}`)}
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Open →
                </button>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>,
    document.body,
  );
}
