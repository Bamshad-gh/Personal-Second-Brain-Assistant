/**
 * components/canvas/CanvasMinimap.tsx
 *
 * What:    Bird's-eye minimap of the canvas, pinned to the bottom-right corner.
 *          Shows all positioned blocks as small rects and a violet viewport rect.
 *          Clicking the minimap navigates the canvas to centre on that point.
 *
 * Props:
 *   blocks          — canvas blocks (positioned ones drawn as rects)
 *   panX / panY     — current canvas pan offset
 *   scale           — current canvas zoom
 *   containerWidth  — pixel width of the canvas container (for viewport rect)
 *   containerHeight — pixel height of the canvas container
 *   onNavigate      — called with (newPanX, newPanY) when user clicks the minimap
 */

'use client';

import { useState }  from 'react';
import type { Block } from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MINIMAP_W = 160;
const MINIMAP_H = 110;
const PAD       = 80;   // canvas-space padding around block bounding box

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasMinimapProps {
  blocks:          Block[];
  panX:            number;
  panY:            number;
  scale:           number;
  containerWidth:  number;
  containerHeight: number;
  onNavigate:      (panX: number, panY: number) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CanvasMinimap({
  blocks,
  panX,
  panY,
  scale,
  containerWidth,
  containerHeight,
  onNavigate,
}: CanvasMinimapProps) {

  const [visible, setVisible] = useState(true);

  // ── Positioned blocks only ────────────────────────────────────────────────
  const positioned = blocks.filter(b => b.canvas_x != null);

  // ── Canvas bounding box ───────────────────────────────────────────────────
  let minX = 0, minY = 0, maxX = 800, maxY = 600; // defaults when no blocks
  if (positioned.length > 0) {
    minX =  Infinity;
    minY =  Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const b of positioned) {
      const bx = b.canvas_x ?? 0;
      const by = b.canvas_y ?? 0;
      const bw = b.canvas_w ?? 300;
      const bh = b.canvas_h ?? 100;
      if (bx      < minX) minX = bx;
      if (by      < minY) minY = by;
      if (bx + bw > maxX) maxX = bx + bw;
      if (by + bh > maxY) maxY = by + bh;
    }
  }

  // Add padding and enforce minimum range so fitScale never blows up
  minX -= PAD; minY -= PAD;
  maxX += PAD; maxY += PAD;
  const rangeX = Math.max(maxX - minX, 300);
  const rangeY = Math.max(maxY - minY, 200);

  // ── Fit scale + centering offset ──────────────────────────────────────────
  const fitScale = Math.min(MINIMAP_W / rangeX, MINIMAP_H / rangeY) * 0.9;
  const offsetX  = (MINIMAP_W - rangeX * fitScale) / 2;
  const offsetY  = (MINIMAP_H - rangeY * fitScale) / 2;

  function toMm(cx: number, cy: number): { x: number; y: number } {
    return {
      x: (cx - minX) * fitScale + offsetX,
      y: (cy - minY) * fitScale + offsetY,
    };
  }

  // ── Viewport rect in minimap-space ────────────────────────────────────────
  const vpCanvasX = -panX / scale;
  const vpCanvasY = -panY / scale;
  const vpCanvasW = containerWidth  / scale;
  const vpCanvasH = containerHeight / scale;

  const vpMm  = toMm(vpCanvasX, vpCanvasY);
  const vpMmW = Math.max(vpCanvasW * fitScale, 4);
  const vpMmH = Math.max(vpCanvasH * fitScale, 4);

  // ── Click → navigate ──────────────────────────────────────────────────────
  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect    = e.currentTarget.getBoundingClientRect();
    const clickMmX = e.clientX - rect.left;
    const clickMmY = e.clientY - rect.top;
    const canvasX  = (clickMmX - offsetX) / fitScale + minX;
    const canvasY  = (clickMmY - offsetY) / fitScale + minY;
    onNavigate(
      containerWidth  / 2 - canvasX * scale,
      containerHeight / 2 - canvasY * scale,
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>

      {/* ── Toggle button ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        style={{
          fontSize:    10,
          padding:     '2px 8px',
          borderRadius: 6,
          border:      '1px solid #3f3f46',
          background:  '#18181b',
          color:       '#71717a',
          cursor:      'pointer',
          userSelect:  'none',
          lineHeight:  '16px',
        }}
      >
        {visible ? '⊟ map' : '⊞ map'}
      </button>

      {/* ── Minimap SVG ────────────────────────────────────────────────── */}
      {visible && (
        <svg
          width={MINIMAP_W}
          height={MINIMAP_H}
          onClick={handleClick}
          style={{
            display:      'block',
            borderRadius:  8,
            border:       '1px solid #3f3f46',
            background:   '#09090b',
            cursor:       'crosshair',
            flexShrink:    0,
          }}
        >
          {/* Block rects */}
          {positioned.map(b => {
            const mm = toMm(b.canvas_x ?? 0, b.canvas_y ?? 0);
            const w  = Math.max((b.canvas_w ?? 300) * fitScale, 2);
            const h  = Math.max((b.canvas_h ?? 100) * fitScale, 2);
            return (
              <rect
                key={b.id}
                x={mm.x}
                y={mm.y}
                width={w}
                height={h}
                rx={2}
                fill={b.bg_color || '#27272a'}
                stroke="#52525b"
                strokeWidth={0.5}
              />
            );
          })}

          {/* Viewport rect */}
          <rect
            x={vpMm.x}
            y={vpMm.y}
            width={vpMmW}
            height={vpMmH}
            rx={3}
            fill="#7c3aed11"
            stroke="#7c3aed"
            strokeWidth={1.5}
            strokeOpacity={0.8}
          />
        </svg>
      )}
    </div>
  );
}
