/**
 * components/canvas/CanvasArrow.tsx
 *
 * What:    Renders a single SVG bezier arrow between two canvas blocks.
 *          When selected, shows a floating control panel (via portal) for
 *          toggling direction, arrow type, editing the label, and deleting.
 *
 * Props:
 *   connection        — the BlockConnection data
 *   sourceBlock       — Block at the tail of the arrow
 *   targetBlock       — Block at the head of the arrow
 *   isSelected        — true when this arrow is focused
 *   onSelect          — called when the hit area is clicked
 *   onDelete          — soft-deletes the connection
 *   onLabelChange     — called with new label string (on blur / Enter)
 *   onDirectionToggle — toggles directed ↔ undirected
 *   onTypeToggle      — toggles link ↔ flow
 *   scale             — current canvas zoom (used to keep stroke widths stable)
 *   panX / panY       — current canvas pan offset (for screen-space panel pos)
 *
 * Geometry:
 *   Computes edge midpoints from canvas_x/y/w/h.
 *   If target center is to the right of source center: source right-edge →
 *   target left-edge.  Otherwise flipped.
 *   Bezier curve uses cubic control points at dx = max(|tx-sx|*0.5, 80).
 *
 * Flow arrows:
 *   Animated dashed blue line via CSS @keyframes dashFlow injected in <defs>.
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useRef } from 'react';
import { createPortal }                from 'react-dom';
import { X }                           from 'lucide-react';
import type { Block, BlockConnection } from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasArrowProps {
  connection:        BlockConnection;
  sourceBlock:       Block;
  targetBlock:       Block;
  isSelected:        boolean;
  onSelect:          () => void;
  onDelete:          () => void;
  onLabelChange:     (label: string) => void;
  onDirectionToggle: () => void;
  onTypeToggle:      () => void;
  scale:             number;
  panX:              number;
  panY:              number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ArrowPoints {
  sx: number; sy: number;
  tx: number; ty: number;
  dx: number;
  useRight: boolean;
}

function computeArrowPoints(src: Block, tgt: Block): ArrowPoints {
  const sw = src.canvas_w ?? 300;
  const sh = src.canvas_h ?? 100;
  const tw = tgt.canvas_w ?? 300;
  const th = tgt.canvas_h ?? 100;

  const srcCx = (src.canvas_x ?? 0) + sw / 2;
  const tgtCx = (tgt.canvas_x ?? 0) + tw / 2;
  const useRight = tgtCx >= srcCx;

  const sx = useRight ? (src.canvas_x ?? 0) + sw : (src.canvas_x ?? 0);
  const sy = (src.canvas_y ?? 0) + sh / 2;
  const tx = useRight ? (tgt.canvas_x ?? 0) : (tgt.canvas_x ?? 0) + tw;
  const ty = (tgt.canvas_y ?? 0) + th / 2;
  const dx = Math.max(Math.abs(tx - sx) * 0.5, 80);

  return { sx, sy, tx, ty, dx, useRight };
}

function buildPath({ sx, sy, tx, ty, dx, useRight }: ArrowPoints): string {
  const c1x = sx + (useRight ?  dx : -dx);
  const c2x = tx + (useRight ? -dx :  dx);
  return `M ${sx} ${sy} C ${c1x} ${sy} ${c2x} ${ty} ${tx} ${ty}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CanvasArrow({
  connection,
  sourceBlock,
  targetBlock,
  isSelected,
  onSelect,
  onDelete,
  onLabelChange,
  onDirectionToggle,
  onTypeToggle,
  scale,
  panX,
  panY,
}: CanvasArrowProps) {

  // ── Portal mount guard ────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Draw-on-create animation ──────────────────────────────────────────────
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Label editing state ───────────────────────────────────────────────────
  const [labelDraft, setLabelDraft] = useState(connection.label);
  const panelRef   = useRef<HTMLDivElement>(null);

  // Keep draft in sync when connection prop changes (e.g. after server update)
  useEffect(() => { setLabelDraft(connection.label); }, [connection.label]);

  // ── Click-outside to deselect is handled in CanvasView (canvas onClick) ──

  // ── Geometry ──────────────────────────────────────────────────────────────
  const points = computeArrowPoints(sourceBlock, targetBlock);
  const d      = buildPath(points);

  const isFlow     = connection.arrow_type === 'flow';
  const isDirected = connection.direction  === 'directed';
  const markerId   = `arrow-${connection.id}`;

  // ── Selected panel screen-space position ──────────────────────────────────
  // Midpoint of the bezier (approximated as halfway between endpoints)
  const midCanvasX = points.sx + (points.tx - points.sx) / 2;
  const midCanvasY = points.sy + (points.ty - points.sy) / 2;
  const panelScreenX = midCanvasX * scale + panX;
  const panelScreenY = midCanvasY * scale + panY;

  // ── Stroke colours ────────────────────────────────────────────────────────
  const strokeColor   = isFlow ? '#60a5fa' : '#7c3aed';
  const strokeOpacity = isSelected ? 1 : 0.6;
  const strokeWidth   = (isSelected ? 3 : 2) / scale;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <>
      {/* ── SVG arrow ─────────────────────────────────────────────────── */}
      <svg
        style={{
          position:      'absolute',
          inset:         0,
          width:         '100%',
          height:        '100%',
          overflow:      'visible',
          pointerEvents: 'none',
        }}
      >
        <defs>
          {/* Arrowhead marker — only rendered when direction === 'directed' */}
          {isDirected && (
            <marker
              id={markerId}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon
                points="0 0, 8 3, 0 6"
                fill={strokeColor}
                fillOpacity={strokeOpacity}
              />
            </marker>
          )}
          {/* Flow animation keyframes */}
          <style>{`
            @keyframes dashFlow-${connection.id} {
              to { stroke-dashoffset: -20; }
            }
          `}</style>
        </defs>

        {/* Hit area — wide transparent path for easy clicking */}
        <path
          d={d}
          stroke="transparent"
          strokeWidth={20 / scale}
          fill="none"
          pointerEvents="stroke"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          style={{ cursor: 'pointer' }}
        />

        {/* Visible arrow path */}
        <path
          d={d}
          stroke={strokeColor}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          fill="none"
          pointerEvents="none"
          markerEnd={isDirected ? `url(#${markerId})` : undefined}
          strokeDasharray={
            !drawn
              ? '1000 1000'
              : isFlow
                ? '8 4'
                : undefined
          }
          strokeDashoffset={drawn ? 0 : 1000}
          style={{
            transition: 'stroke-dashoffset 0.5s ease-out',
            ...(isFlow && drawn
              ? { animation: `dashFlow-${connection.id} 0.8s linear infinite` }
              : {}),
          }}
        />

        {/* Inline label — rendered at midpoint when label is non-empty */}
        {connection.label && (
          <text
            x={midCanvasX}
            y={midCanvasY - 8 / scale}
            textAnchor="middle"
            fontSize={12 / scale}
            fill={strokeColor}
            fillOpacity={strokeOpacity}
            pointerEvents="none"
          >
            {connection.label}
          </text>
        )}
      </svg>

      {/* ── Selected control panel (portal) ───────────────────────────── */}
      {isSelected && mounted && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top:      panelScreenY - 20,
            left:     panelScreenX,
            zIndex:   'var(--z-popup)' as unknown as number,
            transform: 'translate(-50%, -100%)',
          }}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Direction toggle */}
          <button
            type="button"
            onClick={onDirectionToggle}
            title={isDirected ? 'Switch to undirected' : 'Switch to directed'}
            className={[
              'rounded px-1.5 py-0.5 text-xs transition-colors',
              isDirected
                ? 'bg-violet-900/40 text-violet-400 hover:bg-violet-900/60'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700',
            ].join(' ')}
          >
            {isDirected ? '→' : '—'}
          </button>

          {/* Arrow type toggle */}
          <button
            type="button"
            onClick={onTypeToggle}
            title={isFlow ? 'Switch to link' : 'Switch to flow'}
            className={[
              'rounded px-1.5 py-0.5 text-xs transition-colors',
              isFlow
                ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-900/60'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700',
            ].join(' ')}
          >
            {isFlow ? 'Flow' : 'Link'}
          </button>

          {/* Label input */}
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => {
              if (labelDraft !== connection.label) onLabelChange(labelDraft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                setLabelDraft(connection.label);
                e.currentTarget.blur();
              }
            }}
            placeholder="Label…"
            className="w-20 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300 placeholder-neutral-600 outline-none focus:ring-1 focus:ring-violet-500"
          />

          {/* Delete */}
          <button
            type="button"
            onClick={onDelete}
            title="Delete connection"
            className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-red-950/30 hover:text-red-400 transition-colors"
          >
            <X size={11} />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
