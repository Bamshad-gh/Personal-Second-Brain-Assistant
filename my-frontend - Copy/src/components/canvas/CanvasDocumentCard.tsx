/**
 * components/canvas/CanvasDocumentCard.tsx
 *
 * What:    A pinned card on the infinite canvas that shows a live preview
 *          of the page's document content. Always present; not deletable or
 *          resizable. Draggable via pointer capture on the header grip.
 *
 * Props:
 *   pageId         — UUID of the page (used as localStorage key)
 *   title          — page title shown on the card
 *   contentPreview — plain-text excerpt of the document (max 150 chars)
 *   onOpen         — called when the user clicks "Open Document →"
 *   synced         — true when the document block has canvas_visible=true
 *
 * Position persistence:
 *   Stored in localStorage under key: canvas-doc-card-${pageId}
 *   Default position: { x: 50, y: 50 }
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { GripVertical }                from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasDocumentCardProps {
  pageId:         string;
  title:          string;
  contentPreview: string;
  onOpen:         () => void;
  synced:         boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CanvasDocumentCard({
  pageId,
  title,
  contentPreview,
  onOpen,
  synced,
}: CanvasDocumentCardProps) {

  // ── Position state ────────────────────────────────────────────────────────
  const [pos, setPos]       = useState({ x: 50, y: 50 });
  const isDraggingRef        = useRef(false);
  const dragRef              = useRef<{
    startMX: number; startMY: number;
    origX:   number; origY:   number;
  } | null>(null);

  // Load stored position from localStorage once on mount
  useEffect(() => {
    const key   = `canvas-doc-card-${pageId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (
          typeof parsed.x === 'number' &&
          typeof parsed.y === 'number'
        ) {
          setPos({ x: parsed.x, y: parsed.y });
        }
      } catch {
        // ignore malformed stored value
      }
    }
  }, [pageId]);

  // ── Drag handlers (pointer capture on grip) ───────────────────────────────

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragRef.current = {
      startMX: e.clientX,
      startMY: e.clientY,
      origX:   pos.x,
      origY:   pos.y,
    };
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startMX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startMY),
    });
  }

  function onDragUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const newX = dragRef.current.origX + (e.clientX - dragRef.current.startMX);
    const newY = dragRef.current.origY + (e.clientY - dragRef.current.startMY);
    dragRef.current      = null;
    isDraggingRef.current = false;
    const finalPos = { x: newX, y: newY };
    setPos(finalPos);
    localStorage.setItem(`canvas-doc-card-${pageId}`, JSON.stringify(finalPos));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div
      style={{
        position: 'absolute',
        left:     pos.x,
        top:      pos.y,
        zIndex:   999,
      }}
      className={[
        'w-[280px] rounded-xl shadow-lg p-4 bg-neutral-800 border',
        synced ? 'border-violet-600/50' : 'border-violet-800/40',
      ].join(' ')}
      // Stop click from bubbling up to canvas (which deselects blocks / pans)
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header row — grip + label + optional "Live" pill ─────────────── */}
      <div
        className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <GripVertical size={11} className="shrink-0 text-neutral-600" />
        <span className="text-xs text-violet-400 font-medium">📄 Document</span>
        {synced && (
          <span className="text-xs bg-violet-900/30 text-violet-400 rounded px-1.5 py-0.5 ml-auto">
            Live
          </span>
        )}
      </div>

      {/* ── Body — title + preview ────────────────────────────────────────── */}
      <p className="font-semibold text-neutral-100 mt-2 text-sm leading-snug">
        {title || 'Untitled'}
      </p>

      {contentPreview ? (
        <p className="text-xs text-neutral-400 line-clamp-3 mt-1 leading-relaxed">
          {contentPreview}
        </p>
      ) : (
        <p className="text-xs text-neutral-600 italic mt-1">
          No content yet — open document to start writing
        </p>
      )}

      {/* ── Footer — open link ────────────────────────────────────────────── */}
      <div className="mt-3 pt-2 border-t border-neutral-700">
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          Open Document →
        </button>
      </div>
    </div>
  );
}
