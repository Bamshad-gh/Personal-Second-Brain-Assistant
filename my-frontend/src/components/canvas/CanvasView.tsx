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
 *
 * Connection arrows:
 *   Move the pointer over a block to reveal 4 edge-midpoint handle dots.
 *   Drag from a dot to another block to create a BLOCK_LINK Connection.
 *   Click an arrow to select it and open its control panel.
 *   Escape cancels an in-progress connection drag.
 *
 *   Hover detection: the container's onPointerMove does a canvas-space
 *   bounds check each frame — no wrapper div needed.
 *   Connection completion: the container's onPointerUp checks which block
 *   the pointer is released over — no onPointerUp on individual handles.
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useRef, Fragment } from 'react';
import { useCreateBlock, useUpdateBlock, useDeleteBlock } from '@/hooks/useBlocks';
import {
  useBlockConnections,
  useCreateBlockConnection,
  useUpdateBlockConnection,
  useDeleteBlockConnection,
} from '@/hooks/useBlockConnections';
import { CanvasBlock }        from './CanvasBlock';
import { CanvasArrow }        from './CanvasArrow';
import { CanvasToolbar }      from './CanvasToolbar';
import { CanvasDocumentCard } from './CanvasDocumentCard';
import type { Block }         from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasViewProps {
  blocks:          Block[];
  pageId:          string;
  /** Reserved for future canvas block types (e.g. page-link chips) */
  workspaceId:     string;
  readOnly?:       boolean;
  onSwitchToDoc:   () => void;
  /** Page title — displayed on the document card */
  title:           string;
  /** The document content block (block_type='text', canvas_x=null) if it exists */
  contentBlock?:   Block;
  /** Whether the page has a cover image (shows cover toggle in toolbar) */
  hasCover?:       boolean;
  /** Whether the cover is currently expanded in canvas mode */
  coverExpanded?:  boolean;
  /** Toggle cover expanded/collapsed */
  onToggleCover?:  () => void;
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
 * extractPreviewText — walks a TipTap JSON node tree and concatenates text nodes.
 * Used to generate the preview shown in the CanvasDocumentCard.
 */
function extractPreviewText(node: unknown, max = 150): string {
  const parts: string[] = [];
  function walk(n: unknown): void {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.text === 'string') {
      parts.push(obj.text as string);
    }
    if (Array.isArray(obj.content)) obj.content.forEach(walk);
  }
  walk(node);
  return parts.join(' ').slice(0, max);
}

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
  title,
  contentBlock,
  hasCover,
  coverExpanded,
  onToggleCover,
}: CanvasViewProps) {

  // ── Pan / zoom state (for rendering) ─────────────────────────────────────
  const [panX,        setPanX]        = useState(0);
  const [panY,        setPanY]        = useState(0);
  const [scale,       setScale]       = useState(1);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [isPanning,   setIsPanning]   = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  // ── Connection arrow state ────────────────────────────────────────────────
  const { data: connections = [] } = useBlockConnections(pageId);
  const createConnection = useCreateBlockConnection(pageId);
  const updateConnection = useUpdateBlockConnection(pageId);
  const deleteConnection = useDeleteBlockConnection(pageId);

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectingFromId,     setConnectingFromId]     = useState<string | null>(null);
  const [livePointer,          setLivePointer]          = useState<{ x: number; y: number } | null>(null);
  // hoveredBlockId is set by canvas-space bounds check in handlePointerMove,
  // NOT by onPointerEnter on handle divs or wrapper divs.
  const [hoveredBlockId,       setHoveredBlockId]       = useState<string | null>(null);

  // ── Refs — always-current values for event handlers ──────────────────────
  const panXRef      = useRef(0);
  const panYRef      = useRef(0);
  const scaleRef     = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const panStartRef = useRef<{
    mx: number; my: number;
    px: number; py: number;
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

  // ── Block mutations ────────────────────────────────────────────────────────
  const updateBlock = useUpdateBlock(pageId);
  const createBlock = useCreateBlock(pageId);
  const deleteBlock = useDeleteBlock(pageId);

  const updateBlockRef = useRef(updateBlock.mutate);
  useEffect(() => { updateBlockRef.current = updateBlock.mutate; });

  // ── Filtered blocks (canvas-visible; excludes the doc content block) ──────
  // Declared early so handlePointerMove and handlePointerUp can close over it.
  const canvasBlocks = blocks.filter(b => b.id !== contentBlock?.id);

  // ── Initialize positions for blocks with no stored coordinates ───────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    blocks.forEach((block, index) => {
      if (block.canvas_x === null && block.id !== contentBlock?.id) {
        const pos = defaultPosition(index);
        updateBlock.mutate({ id: block.id, payload: { canvas_x: pos.x, canvas_y: pos.y } });
      }
    });
  }, []); // run once on mount only

  // ── Space key + Escape listener ───────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') {
        setConnectingFromId(null);
        setLivePointer(null);
        return;
      }
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
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
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el: HTMLDivElement = container;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const factor   = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current * factor));

      const rect   = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - (mouseX - panXRef.current) * (newScale / scaleRef.current);
      const newPanY = mouseY - (mouseY - panYRef.current) * (newScale / scaleRef.current);

      updatePan(newPanX, newPanY);
      updateScale(newScale);
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pan + hover + ghost-line pointer handlers ─────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const isPanGesture = e.button === 1 || (e.button === 0 && isSpaceDown);
    if (!isPanGesture) return;

    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panStartRef.current = {
      mx: e.clientX, my: e.clientY,
      px: panXRef.current, py: panYRef.current,
    };
    setIsPanning(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // 1. Pan update
    if (panStartRef.current) {
      updatePan(
        panStartRef.current.px + (e.clientX - panStartRef.current.mx),
        panStartRef.current.py + (e.clientY - panStartRef.current.my),
      );
    }

    // 2. Canvas-space pointer position (used for ghost line + hover detection)
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = (e.clientX - rect.left - panXRef.current) / scaleRef.current;
    const cy = (e.clientY - rect.top  - panYRef.current) / scaleRef.current;

    // 3. Ghost line tracking during connection drag
    if (connectingFromId) {
      setLivePointer({ x: cx, y: cy });
    }

    // 4. Hover detection for edge handles — canvas-space bounds check.
    //    CanvasBlock positions itself via its own localX/localY state, which
    //    may differ from canvas_x/y during drag. We use canvas_x/y (last-saved)
    //    as an approximation; during a block drag the user isn't connecting anyway.
    const hovered = canvasBlocks.find(b => {
      const bx = b.canvas_x ?? 0;
      const by = b.canvas_y ?? 0;
      const bw = b.canvas_w ?? 300;
      const bh = b.canvas_h ?? 100;
      return cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh;
    });
    setHoveredBlockId(hovered?.id ?? null);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    // Connection completion — check if the pointer was released over a block.
    // This runs regardless of where the pointer is so any drop on a block body
    // (not just an edge handle) completes the connection.
    if (connectingFromId) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const canvasX = (e.clientX - rect.left - panXRef.current) / scaleRef.current;
        const canvasY = (e.clientY - rect.top  - panYRef.current) / scaleRef.current;
        const targetBlock = canvasBlocks.find(b => {
          if (b.id === connectingFromId) return false;
          const bx = b.canvas_x ?? 0;
          const by = b.canvas_y ?? 0;
          const bw = b.canvas_w ?? 300;
          const bh = b.canvas_h ?? 100;
          return canvasX >= bx && canvasX <= bx + bw && canvasY >= by && canvasY <= by + bh;
        });
        if (targetBlock) {
          createConnection.mutate({
            source_block: connectingFromId,
            target_block: targetBlock.id,
          });
        }
      }
      setConnectingFromId(null);
      setLivePointer(null);
      return; // not a pan gesture — don't clear panStartRef
    }

    // Pan end
    panStartRef.current = null;
    setIsPanning(false);
  }

  // ── Add block at viewport centre ──────────────────────────────────────────
  function addBlock(blockType: 'text' | 'sticky') {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

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

  // ── Document card preview text ────────────────────────────────────────────
  const contentPreview = extractPreviewText(contentBlock?.content?.json);

  // ── Cursor style ──────────────────────────────────────────────────────────
  const cursor = isPanning
    ? 'grabbing'
    : isSpaceDown
      ? 'grab'
      : connectingFromId
        ? 'crosshair'
        : 'default';

  // ── Ghost connection line (canvas-space SVG, rendered inside transform div) ─
  let ghostLine: React.ReactNode = null;
  if (connectingFromId && livePointer) {
    const srcBlock = blocks.find(b => b.id === connectingFromId);
    if (srcBlock) {
      const sw    = srcBlock.canvas_w ?? 300;
      const sh    = srcBlock.canvas_h ?? 100;
      const srcX  = srcBlock.canvas_x ?? 0;
      const srcY  = srcBlock.canvas_y ?? 0;
      const srcCx = srcX + sw / 2;
      const useRight = livePointer.x >= srcCx;
      const gsx   = useRight ? srcX + sw : srcX;
      const gsy   = srcY + sh / 2;
      ghostLine = (
        <svg style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          overflow: 'visible', pointerEvents: 'none',
        }}>
          <line
            x1={gsx} y1={gsy}
            x2={livePointer.x} y2={livePointer.y}
            stroke="#7c3aed"
            strokeWidth={2 / scale}
            strokeOpacity={0.5}
            strokeDasharray={`${6 / scale} ${3 / scale}`}
          />
        </svg>
      );
    }
  }

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
      onPointerLeave={() => setHoveredBlockId(null)}
      onClick={() => {
        setSelectedId(null);
        setSelectedConnectionId(null);
        setConnectingFromId(null);
        setLivePointer(null);
      }}
    >
      {/* ── Transform layer ─────────────────────────────────────────────── */}
      <div
        style={{
          position:        'absolute',
          inset:           0,
          transformOrigin: '0 0',
          transform:       `translate(${panX}px, ${panY}px) scale(${scale})`,
          pointerEvents:   isPanning ? 'none' : 'auto',
        }}
      >
        {/* ── Document card ───────────────────────────────────────────────── */}
        <CanvasDocumentCard
          pageId={pageId}
          title={title}
          contentPreview={contentPreview}
          onOpen={onSwitchToDoc}
          synced={contentBlock?.canvas_visible ?? false}
        />

        {/* ── Connection arrows (rendered behind blocks) ───────────────────── */}
        {connections
          .filter(c => !c.is_deleted)
          .map(conn => {
            const src = blocks.find(b => b.id === conn.source_block);
            const tgt = blocks.find(b => b.id === conn.target_block);
            if (!src || !tgt) return null;

            const srcIdx = canvasBlocks.indexOf(src);
            const tgtIdx = canvasBlocks.indexOf(tgt);
            const srcPos = src.canvas_x !== null
              ? { x: src.canvas_x, y: src.canvas_y! }
              : defaultPosition(srcIdx >= 0 ? srcIdx : 0);
            const tgtPos = tgt.canvas_x !== null
              ? { x: tgt.canvas_x, y: tgt.canvas_y! }
              : defaultPosition(tgtIdx >= 0 ? tgtIdx : 0);

            const srcWithPos: Block = { ...src, canvas_x: srcPos.x, canvas_y: srcPos.y };
            const tgtWithPos: Block = { ...tgt, canvas_x: tgtPos.x, canvas_y: tgtPos.y };

            return (
              <CanvasArrow
                key={conn.id}
                connection={conn}
                sourceBlock={srcWithPos}
                targetBlock={tgtWithPos}
                isSelected={selectedConnectionId === conn.id}
                onSelect={() => { setSelectedConnectionId(conn.id); setSelectedId(null); }}
                onDelete={() => deleteConnection.mutate(conn.id)}
                onLabelChange={(label) =>
                  updateConnection.mutate({ id: conn.id, payload: { label } })
                }
                onDirectionToggle={() =>
                  updateConnection.mutate({
                    id: conn.id,
                    payload: { direction: conn.direction === 'directed' ? 'undirected' : 'directed' },
                  })
                }
                onTypeToggle={() =>
                  updateConnection.mutate({
                    id: conn.id,
                    payload: { arrow_type: conn.arrow_type === 'link' ? 'flow' : 'link' },
                  })
                }
                scale={scale}
                panX={panX}
                panY={panY}
              />
            );
          })
        }

        {/* ── Ghost line during connection drag ────────────────────────────── */}
        {ghostLine}

        {/* ── Canvas blocks + edge handles ─────────────────────────────────── */}
        {canvasBlocks.map((block, index) => {
          const pos = block.canvas_x !== null
            ? { x: block.canvas_x, y: block.canvas_y! }
            : defaultPosition(index);

          const blockWithPos: Block = { ...block, canvas_x: pos.x, canvas_y: pos.y };

          const bw = block.canvas_w ?? 300;
          const bh = block.canvas_h ?? 100;

          // Handles visible when the block is hovered OR a connection is in progress
          // (in-progress: show all blocks' handles as drop targets).
          const showHandles = !readOnly && (hoveredBlockId === block.id || connectingFromId !== null);

          // Positions are in canvas-space, matching where CanvasBlock renders.
          // transform: translate(-50%,-50%) centres each 14px dot on the edge midpoint.
          const edgeHandles = [
            { id: 'top',    left: pos.x + bw / 2, top: pos.y          },
            { id: 'bottom', left: pos.x + bw / 2, top: pos.y + bh     },
            { id: 'left',   left: pos.x,           top: pos.y + bh / 2 },
            { id: 'right',  left: pos.x + bw,      top: pos.y + bh / 2 },
          ];

          return (
            <Fragment key={block.id}>
              <CanvasBlock
                block={blockWithPos}
                isSelected={selectedId === block.id}
                onSelect={() => { setSelectedId(block.id); setSelectedConnectionId(null); }}
                onDelete={() => deleteBlock.mutate(block.id)}
                onToggleVisibility={() =>
                  updateBlock.mutate({ id: block.id, payload: { doc_visible: !block.doc_visible } })
                }
                onDragEnd={(x, y) => {
                  updateBlockRef.current({ id: block.id, payload: { canvas_x: x, canvas_y: y } });
                }}
                onResizeEnd={(w, h) => {
                  const payload = h > 0 ? { canvas_w: w, canvas_h: h } : { canvas_w: w };
                  updateBlock.mutate({ id: block.id, payload });
                }}
                onContentSave={(_blockId, json) =>
                  updateBlock.mutate({ id: block.id, payload: { content: { json } } })
                }
              />

              {/* ── Edge connection handles ──────────────────────────────────
                  Handle dots have zIndex 30, above CanvasBlock (zIndex 0).
                  stopPropagation on pointerDown prevents CanvasBlock's drag
                  header from getting the event.
                  No onPointerUp here — connection completion is in the canvas
                  container's handlePointerUp via canvas-space bounds check.   */}
              {showHandles && edgeHandles.map(handle => (
                <div
                  key={handle.id}
                  style={{
                    position:     'absolute',
                    left:          handle.left,
                    top:           handle.top,
                    transform:    'translate(-50%, -50%)',
                    width:         14,
                    height:        14,
                    borderRadius: '50%',
                    background:   '#7c3aed',
                    border:       '2px solid #c4b5fd',
                    cursor:       'crosshair',
                    zIndex:        30,
                    opacity:       connectingFromId ? 1 : 0.8,
                    boxShadow:    '0 0 6px #7c3aed88',
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setConnectingFromId(block.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ))}
            </Fragment>
          );
        })}
      </div>

      {/* ── Canvas toolbar (fixed, bottom-centre) ───────────────────────── */}
      {!readOnly && (
        <CanvasToolbar
          scale={scale}
          onZoomIn={() => updateScale(Math.min(MAX_SCALE, scaleRef.current * 1.1))}
          onZoomOut={() => updateScale(Math.max(MIN_SCALE, scaleRef.current / 1.1))}
          onAddText={() => addBlock('text')}
          onAddSticky={() => addBlock('sticky')}
          onSwitchToDoc={onSwitchToDoc}
          hasCover={hasCover}
          coverExpanded={coverExpanded}
          onToggleCover={onToggleCover}
        />
      )}
    </div>
  );
}
