/**
 * components/canvas/CanvasView.tsx
 *
 * What:    Infinite 2D canvas that replaces the document editor when
 *          page.view_mode === 'canvas'. Blocks are absolutely positioned
 *          using their canvas_x/y coordinates and can be freely dragged
 *          and resized.
 *
 * Props:
 *   blocks        — all blocks for the page (from useBlocks)
 *   pageId        — UUID of the current page (used for block mutations)
 *   workspaceId   — UUID of the current workspace (reserved for future use)
 *   readOnly      — disables all editing when true (locked page)
 *   onSwitchToDoc — called when the "Document" toolbar button is clicked
 *
 * Pan:
 *   Middle-mouse button drag  — always available
 *   Space + left-mouse drag   — standard canvas pan shortcut
 *   Implemented with pointer capture so the gesture works even if the
 *   pointer drifts outside the container.
 *
 * Zoom:
 *   Ctrl + scroll wheel — scale clamped 0.25×–2.0×
 *   Zoom is cursor-centred: the canvas point under the cursor stays fixed.
 *   Non-passive wheel listener is registered via useEffect so
 *   preventDefault() can suppress the browser's native Ctrl+zoom.
 *
 * Default positions:
 *   Blocks whose canvas_x is null (created in document mode) are rendered
 *   at computed grid positions: column 0-2 × row n. These positions are
 *   NOT saved until the user first drags the block, keeping the switch
 *   document→canvas free of N PATCH calls.
 *
 * Adding blocks:
 *   createBlock fires a POST with canvas_x/y set to the current viewport
 *   centre in canvas-space, so new blocks always appear where you're looking.
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useRef }      from 'react';
import { useCreateBlock, useUpdateBlock, useDeleteBlock } from '@/hooks/useBlocks';
import { CanvasBlock }                      from './CanvasBlock';
import { CanvasToolbar }                    from './CanvasToolbar';
import type { Block }                       from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasViewProps {
  blocks:        Block[];
  pageId:        string;
  /** Reserved for future canvas block types (e.g. page-link chips) */
  workspaceId:   string;
  readOnly?:     boolean;
  onSwitchToDoc: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * defaultPosition — grid position for blocks that have no canvas coordinates.
 * 3-column grid: col = index % 3, row = floor(index / 3).
 * 50px margin from origin; 350px column gap; 250px row gap.
 */
function defaultPosition(index: number): { x: number; y: number } {
  return {
    x: (index % 3) * 350 + 50,
    y: Math.floor(index / 3) * 250 + 50,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT — CanvasView
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CanvasView({
  blocks,
  pageId,
  readOnly = false,
  onSwitchToDoc,
}: CanvasViewProps) {

  // ── Pan / zoom state (for rendering) ─────────────────────────────────────
  const [panX,       setPanX]       = useState(0);
  const [panY,       setPanY]       = useState(0);
  const [scale,      setScale]      = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPanning,  setIsPanning]  = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  // ── Refs — always-current values for event handlers ──────────────────────
  // React state updates are async; refs give event handlers the latest value
  // without stale-closure issues.
  const panXRef     = useRef(0);
  const panYRef     = useRef(0);
  const scaleRef    = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref that holds the pan-start snapshot (set on pointerdown, cleared on pointerup)
  const panStartRef = useRef<{
    mx: number; my: number;   // mouse position at drag start
    px: number; py: number;   // panX/panY at drag start
  } | null>(null);

  // ── Helpers to update both state AND refs together ───────────────────────
  function updatePan(x: number, y: number) {
    panXRef.current = x;
    panYRef.current = y;
    setPanX(x);
    setPanY(y);
  }

  function updateScale(s: number) {
    scaleRef.current = s;
    setScale(s);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateBlock = useUpdateBlock(pageId);
  const createBlock = useCreateBlock(pageId);
  const deleteBlock = useDeleteBlock(pageId);

  // ── Space key listener ────────────────────────────────────────────────────
  // Enables Space + left-drag canvas pan.
  // Checks for contentEditable / input targets so Space still works when
  // typing inside a canvas block's mini TipTap editor.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA'
      ) return;
      e.preventDefault();
      setIsSpaceDown(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') setIsSpaceDown(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, []);

  // ── Non-passive wheel listener (Ctrl+scroll = zoom) ───────────────────────
  // React's synthetic onWheel is passive, so preventDefault() is a no-op.
  // We attach a native listener with { passive: false } instead.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // TypeScript does not propagate narrowing into closures — re-assign to a
    // new explicitly-typed const so onWheel sees HTMLDivElement, not null.
    const el: HTMLDivElement = container;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault(); // prevent browser Ctrl+zoom

      const factor   = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current * factor));

      // Zoom centred on the cursor position within the container
      const rect   = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // The point under the cursor must stay fixed:
      //   newPan = cursor - (cursor - oldPan) * (newScale / oldScale)
      const newPanX = mouseX - (mouseX - panXRef.current) * (newScale / scaleRef.current);
      const newPanY = mouseY - (mouseY - panYRef.current) * (newScale / scaleRef.current);

      updatePan(newPanX, newPanY);
      updateScale(newScale);
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // refs keep values current — no deps needed

  // ── Pan pointer handlers ──────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Middle-mouse OR Space + left-mouse triggers pan
    const isPanGesture = e.button === 1 || (e.button === 0 && isSpaceDown);
    if (!isPanGesture) return;

    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panStartRef.current = {
      mx: e.clientX,
      my: e.clientY,
      px: panXRef.current,
      py: panYRef.current,
    };
    setIsPanning(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!panStartRef.current) return;
    updatePan(
      panStartRef.current.px + (e.clientX - panStartRef.current.mx),
      panStartRef.current.py + (e.clientY - panStartRef.current.my),
    );
  }

  function handlePointerUp() {
    panStartRef.current = null;
    setIsPanning(false);
  }

  // ── Add block at viewport centre ──────────────────────────────────────────
  // Converts the screen-space viewport centre to canvas-space coordinates,
  // accounting for the current pan offset and zoom scale.
  function addBlock(blockType: 'text' | 'sticky') {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // canvas_x = (screenX - panX) / scale  (offset by half block width to centre it)
    const cx = (rect.width  / 2 - panXRef.current) / scaleRef.current - 150;
    const cy = (rect.height / 2 - panYRef.current) / scaleRef.current - 50;

    createBlock.mutate({
      block_type:     blockType,
      content:        {},
      order:          blocks.length + 1,
      canvas_x:       cx,
      canvas_y:       cy,
      canvas_w:       300,
      canvas_z:       0,
      canvas_visible: true,
      doc_visible:    false,
    });
  }

  // ── Cursor style ──────────────────────────────────────────────────────────
  const cursor = isPanning
    ? 'grabbing'
    : isSpaceDown
      ? 'grab'
      : 'default';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-neutral-950 bg-dot-grid"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      // Clicking the canvas background deselects any selected block
      onClick={() => setSelectedId(null)}
    >
      {/* ── Transform layer — blocks live here ─────────────────────────── */}
      <div
        style={{
          position:        'absolute',
          inset:           0,
          transformOrigin: '0 0',
          transform:       `translate(${panX}px, ${panY}px) scale(${scale})`,
          // Pointer events must be enabled so blocks receive clicks/drags
          pointerEvents:   isPanning ? 'none' : 'auto',
        }}
      >
        {blocks.map((block, index) => {
          // Use stored coordinates; fall back to computed grid position
          const pos = block.canvas_x !== null
            ? { x: block.canvas_x, y: block.canvas_y! }
            : defaultPosition(index);

          // Merge computed position into block so CanvasBlock always sees non-null values
          const blockWithPos: Block = { ...block, canvas_x: pos.x, canvas_y: pos.y };

          return (
            <CanvasBlock
              key={block.id}
              block={blockWithPos}
              isSelected={selectedId === block.id}
              onSelect={() => setSelectedId(block.id)}
              onDelete={() => deleteBlock.mutate(block.id)}
              onToggleVisibility={() =>
                updateBlock.mutate({ id: block.id, payload: { doc_visible: !block.doc_visible } })
              }
              onDragEnd={(x, y) => {
                // Only save canvas position if this block was already
                // a canvas block (had canvas_x set when the page loaded).
                // Prevents document content blocks from accidentally
                // getting canvas positions assigned.
                const original = blocks.find(b => b.id === block.id);
                if (original && original.canvas_x !== null) {
                  updateBlock.mutate({ id: block.id, payload: { canvas_x: x, canvas_y: y } });
                }
              }}
              onResizeEnd={(w, h) => {
                // h === 0 means auto-height (CanvasBlock sentinel) — skip canvas_h
                const payload = h > 0
                  ? { canvas_w: w, canvas_h: h }
                  : { canvas_w: w };
                updateBlock.mutate({ id: block.id, payload });
              }}
              onContentSave={(_blockId, json) =>
                updateBlock.mutate({ id: block.id, payload: { content: { json } } })
              }
            />
          );
        })}
      </div>

      {/* ── Canvas toolbar (fixed, bottom-centre) ──────────────────────── */}
      {!readOnly && (
        <CanvasToolbar
          scale={scale}
          onZoomIn={() => updateScale(Math.min(MAX_SCALE, scaleRef.current * 1.1))}
          onZoomOut={() => updateScale(Math.max(MIN_SCALE, scaleRef.current / 1.1))}
          onAddText={() => addBlock('text')}
          onAddSticky={() => addBlock('sticky')}
          onSwitchToDoc={onSwitchToDoc}
        />
      )}
    </div>
  );
}
