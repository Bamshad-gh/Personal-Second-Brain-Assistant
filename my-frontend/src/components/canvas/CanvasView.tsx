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
import { CanvasRichBlock }    from './CanvasRichBlock';
import { CanvasMinimap }      from './CanvasMinimap';
import type { Block, BlockType } from '@/types';

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
  /** When true the parent has applied fixed inset-0 z-50 — canvas fills viewport */
  fullscreen?:     boolean;
  /** When true, show the left-side block-type template panel */
  showBlockPanel?: boolean;
  /** Blocks shared between document and canvas (canvas_visible + doc_visible + positioned) */
  sharedBlocks?:   Block[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;

const BLOCK_TEMPLATES: { type: string; label: string; icon: string }[] = [
  { type: 'text',     label: 'Text',    icon: '¶' },
  { type: 'sticky',   label: 'Sticky',  icon: '★' },
  { type: 'rich',     label: 'Rich',    icon: '≡' },
  { type: 'heading1', label: 'Heading', icon: 'H' },
  { type: 'image',    label: 'Image',   icon: '🖼' },
  { type: 'pdf',      label: 'PDF',     icon: '📄' },
];

/** Default canvas size overrides for block types that need more space */
const TEMPLATE_SIZE: Record<string, { canvas_w?: number; canvas_h?: number }> = {
  image: { canvas_w: 420 },
  pdf:   { canvas_w: 520, canvas_h: 560 },
};

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
 * extractSharedBlockText — short label for a shared block in the panel list.
 * Handles all block types explicitly; falls back to TipTap JSON walk for text types.
 */
function extractSharedBlockText(block: Block): string {
  switch (block.block_type) {
    case 'image':
      return `🖼 ${String(block.content.filename ?? block.content.alt ?? 'Image')}`;
    case 'pdf':
      return `📄 ${String(block.content.filename ?? 'PDF document')}`;
    case 'video':
      return `🎥 ${String(block.content.filename ?? 'Video')}`;
    case 'table':
      return '⊞ Table';
    case 'code':
      return `</> ${String(block.content.language ?? 'code')}: ${
        String(block.content.code ?? '').slice(0, 30)
      }`;
    case 'callout': {
      const emoji = String(block.content.emoji ?? '💡');
      const text  = String(block.content.text  ?? '');
      return `${emoji} ${text.slice(0, 30)}`;
    }
    default: {
      const parts: string[] = [];
      function walk(n: unknown): void {
        if (!n || typeof n !== 'object') return;
        const obj = n as Record<string, unknown>;
        if (obj.type === 'text' && typeof obj.text === 'string') parts.push(obj.text);
        if (Array.isArray(obj.content)) obj.content.forEach(walk);
      }
      walk(block.content?.json ?? block.content);
      const text = parts.join(' ').trim();
      return text.slice(0, 35) || `(${block.block_type} block)`;
    }
  }
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

const GRID_SIZE = 24; // matches dot-grid background-size in globals.css

function snapToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
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
  fullscreen = false,
  showBlockPanel = false,
  sharedBlocks = [],
}: CanvasViewProps) {

  // ── Pan / zoom state (for rendering) ─────────────────────────────────────
  const [panX,        setPanX]        = useState(0);
  const [panY,        setPanY]        = useState(0);
  const [scale,       setScale]       = useState(1);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [isPanning,   setIsPanning]   = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  // ── Touch gesture state (single-finger pan + two-finger pinch zoom) ───────
  const touchPanStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinchStartRef    = useRef<{ dist: number; scale: number } | null>(null);

  // ── Rich block editing state ──────────────────────────────────────────────
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  // ── Snap-to-grid + minimap ────────────────────────────────────────────────
  const [snapEnabled,    setSnapEnabled]    = useState(false);
  const [containerSize,  setContainerSize]  = useState({ w: 0, h: 0 });

  // ── Panel tab state ───────────────────────────────────────────────────────
  const [panelTab, setPanelTab] = useState<'types' | 'shared'>('types');

  // ── Block-template drag ref (HTML5 drag API, tracks which template type is being dragged) ─
  const draggedTypeRef = useRef<string | null>(null);

  // ── Shared-block drag ref (drag from "Shared" tab to reposition on canvas) ─
  const draggedSharedBlockIdRef = useRef<string | null>(null);

  // ── Actual rendered block heights (ResizeObserver) ────────────────────────
  // canvas_h may not reflect auto-height blocks (text/sticky/rich grow with content).
  // We observe each block's DOM element and use its real height for edge handle dots.
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});
  const blockElRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Auto-close the rich editor when the user selects a different block
  useEffect(() => {
    if (editingBlockId && selectedId !== editingBlockId) {
      setEditingBlockId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  // ── ResizeObserver — track actual rendered block heights ─────────────────
  // CanvasBlock uses position:absolute so a wrapper div in the Fragment would
  // have 0 height and can't be observed. Instead we query DOM elements by
  // data-blockid (added to CanvasBlock's root div) after each render.
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setBlockHeights((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).dataset.blockid;
          if (id) next[id] = entry.contentRect.height;
        });
        return next;
      });
    });

    // Populate blockElRefs by querying the DOM, then observe each element.
    blockElRefs.current.clear();
    canvasBlocks.forEach((b) => {
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-blockid="${b.id}"]`);
      if (el) {
        blockElRefs.current.set(b.id, el);
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasBlocks]);

  // ── Container size (for minimap viewport rect) ───────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainerSize({ w: r.width, h: r.height });
    });
    obs.observe(el);
    setContainerSize({ w: el.offsetWidth, h: el.offsetHeight });
    return () => obs.disconnect();
  }, []);

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

  function handleAddRich() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cx = (rect.width  / 2 - panXRef.current) / scaleRef.current - 240;
    const cy = (rect.height / 2 - panYRef.current) / scaleRef.current - 160;

    createBlock.mutate({
      block_type:     'rich',
      content:        {},
      order:          blocks.length + 1,
      canvas_x:       cx,
      canvas_y:       cy,
      canvas_w:       480,
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

  // ── Touch handlers (mobile pan + pinch-zoom) ─────────────────────────────

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 1) {
      // Single finger — begin pan
      touchPanStartRef.current = {
        x:  e.touches[0].clientX,
        y:  e.touches[0].clientY,
        px: panXRef.current,
        py: panYRef.current,
      };
      pinchStartRef.current = null;
    } else if (e.touches.length === 2) {
      // Two fingers — begin pinch zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchStartRef.current    = { dist, scale: scaleRef.current };
      touchPanStartRef.current = null;
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    e.preventDefault(); // stop browser scroll / native zoom

    if (e.touches.length === 1 && touchPanStartRef.current) {
      const dx = e.touches[0].clientX - touchPanStartRef.current.x;
      const dy = e.touches[0].clientY - touchPanStartRef.current.y;
      updatePan(touchPanStartRef.current.px + dx, touchPanStartRef.current.py + dy);

    } else if (e.touches.length === 2 && pinchStartRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchStartRef.current.scale * (dist / pinchStartRef.current.dist)),
      );
      updateScale(newScale);

      // Also pan so the midpoint between fingers stays fixed
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && pinchStartRef.current) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const ratio = newScale / pinchStartRef.current.scale;
        updatePan(
          midX - (midX - panXRef.current) * ratio,
          midY - (midY - panYRef.current) * ratio,
        );
        // Update pinch baseline so each frame is relative to previous
        pinchStartRef.current = { dist, scale: newScale };
      }
    }
  }

  function handleTouchEnd() {
    touchPanStartRef.current = null;
    pinchStartRef.current    = null;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-neutral-950 bg-dot-grid"
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHoveredBlockId(null)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        // Don't deselect while the rich block editor is open — clicks on the
        // SlashMenuPortal (portaled to document.body) still bubble through the
        // React tree and would otherwise trigger the editingBlockId auto-close.
        if (editingBlockId) return;
        setSelectedId(null);
        setSelectedConnectionId(null);
        setConnectingFromId(null);
        setLivePointer(null);
      }}
      onDragOver={(e) => {
        if (draggedTypeRef.current || draggedSharedBlockIdRef.current) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dropX = (e.clientX - rect.left - panXRef.current) / scaleRef.current;
        const dropY = (e.clientY - rect.top  - panYRef.current) / scaleRef.current;

        // ── Shared block drop — just reposition the existing block ──────────
        const sharedId = draggedSharedBlockIdRef.current;
        if (sharedId) {
          draggedSharedBlockIdRef.current = null;
          updateBlockRef.current({ id: sharedId, payload: { canvas_x: dropX, canvas_y: dropY } });
          return;
        }

        // ── Template drop — create a new canvas block ────────────────────────
        const blockType = draggedTypeRef.current;
        if (!blockType) return;
        draggedTypeRef.current = null;
        const sizeDefaults = TEMPLATE_SIZE[blockType] ?? {};
        createBlock.mutate({
          block_type: blockType as BlockType,
          content: {},
          canvas_x: dropX,
          canvas_y: dropY,
          canvas_visible: true,
          doc_visible: false,
          ...sizeDefaults,
        });
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
          const bh = blockHeights[block.id] ?? block.canvas_h ?? 100;

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
              <div style={{
                opacity:       editingBlockId === block.id ? 0 : 1,
                pointerEvents: editingBlockId === block.id ? 'none' : undefined,
              }}>
                <CanvasBlock
                  block={blockWithPos}
                  isSelected={selectedId === block.id}
                  onSelect={() => { setSelectedId(block.id); setSelectedConnectionId(null); }}
                  onDelete={() => deleteBlock.mutate(block.id)}
                  onToggleVisibility={() =>
                    updateBlock.mutate({ id: block.id, payload: { doc_visible: !block.doc_visible } })
                  }
                  onDragEnd={(x, y) => {
                    const fx = snapEnabled ? snapToGrid(x) : x;
                    const fy = snapEnabled ? snapToGrid(y) : y;
                    updateBlockRef.current({ id: block.id, payload: { canvas_x: fx, canvas_y: fy } });
                  }}
                  onResizeEnd={(w, h) => {
                    const payload = h > 0 ? { canvas_w: w, canvas_h: h } : { canvas_w: w };
                    updateBlock.mutate({ id: block.id, payload });
                  }}
                  onContentSave={(_blockId, json) =>
                    updateBlock.mutate({ id: block.id, payload: { content: { json } } })
                  }
                  onSaveContent={(content) =>
                    updateBlock.mutate({ id: block.id, payload: { content } })
                  }
                  onEditStart={() => setEditingBlockId(block.id)}
                  onColorChange={(color) =>
                    updateBlock.mutate({ id: block.id, payload: { bg_color: color } })
                  }
                />
              </div>

              {/* ── Edge connection handles ──────────────────────────────────
                  Handle dots have zIndex 30, above CanvasBlock (zIndex 0).
                  stopPropagation on pointerDown prevents CanvasBlock's drag
                  header from getting the event.
                  No onPointerUp here — connection completion is in the canvas
                  container's handlePointerUp via canvas-space bounds check.   */}
              {showHandles && edgeHandles.map(handle => (
                <div
                  key={handle.id}
                  title="Drag to connect"
                  style={{
                    position:     'absolute',
                    left:          handle.left,
                    top:           handle.top,
                    transform:    'translate(-50%, -50%) rotate(45deg)',
                    width:         12,
                    height:        12,
                    borderRadius: '3px',
                    background:   '#a78bfa',
                    border:       '2px solid #ede9fe',
                    cursor:       'crosshair',
                    zIndex:        30,
                    opacity:       connectingFromId ? 1 : 0.85,
                    boxShadow:    connectingFromId
                      ? '0 0 10px #a78bfa99, inset 0 0 0 2px white'
                      : 'inset 0 0 0 2px white',
                    animation:    connectingFromId ? 'pulse 1.5s infinite' : 'none',
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

        {/* ── Rich block editor overlay ──────────────────────────────────── */}
        {editingBlockId && (() => {
          const eb = canvasBlocks.find(b => b.id === editingBlockId);
          if (!eb) return null;
          return (
            <CanvasRichBlock
              block={eb}
              onSave={(json) => updateBlockRef.current({ id: eb.id, payload: { content: { json } } })}
              onClose={() => setEditingBlockId(null)}
            />
          );
        })()}
      </div>

      {/* ── Block panel (left side, outside transform — doesn't pan/zoom) ──── */}
      {showBlockPanel && (
        <div className="absolute left-0 top-0 bottom-0 w-56 z-20 bg-neutral-900/95 backdrop-blur-sm border-r border-neutral-800 flex flex-col">

          {/* ── Tab bar ────────────────────────────────────────────────────── */}
          <div className="flex border-b border-neutral-800 shrink-0">
            <button
              onClick={() => setPanelTab('types')}
              className={[
                'flex-1 py-2 text-xs transition-colors',
                panelTab === 'types'
                  ? 'text-violet-400 border-b-2 border-violet-500'
                  : 'text-neutral-500 hover:text-neutral-300',
              ].join(' ')}
            >
              Block Types
            </button>
            <button
              onClick={() => setPanelTab('shared')}
              className={[
                'flex-1 py-2 text-xs transition-colors',
                panelTab === 'shared'
                  ? 'text-violet-400 border-b-2 border-violet-500'
                  : 'text-neutral-500 hover:text-neutral-300',
              ].join(' ')}
            >
              Shared
              {sharedBlocks.length > 0 && (
                <span className="ml-1 text-[10px] bg-violet-900/40 text-violet-400 rounded px-1">
                  {sharedBlocks.length}
                </span>
              )}
            </button>
          </div>

          {/* ── Types tab — draggable block-type templates ───────────────── */}
          {panelTab === 'types' && (
            <div className="overflow-y-auto flex-1">
              {BLOCK_TEMPLATES.map((t) => (
                <div
                  key={t.type}
                  draggable
                  onDragStart={() => { draggedTypeRef.current = t.type; }}
                  onDragEnd={() => { draggedTypeRef.current = null; }}
                  className="mx-2 my-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 cursor-grab text-xs text-neutral-300 select-none flex items-center gap-2 hover:bg-neutral-700 transition-colors"
                >
                  <span className="text-neutral-400 w-4 text-center shrink-0">{t.icon}</span>
                  {t.label}
                </div>
              ))}
            </div>
          )}

          {/* ── Shared tab — blocks visible in both doc and canvas ─────────── */}
          {panelTab === 'shared' && (
            <div className="overflow-y-auto flex-1">
              {sharedBlocks.length === 0 ? (
                <p className="text-xs text-neutral-600 px-3 py-4 text-center">
                  No shared blocks yet.{' '}
                  Toggle blocks in document mode to share them here.
                </p>
              ) : (
                sharedBlocks.map((b) => (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={() => { draggedSharedBlockIdRef.current = b.id; }}
                    onDragEnd={() => { draggedSharedBlockIdRef.current = null; }}
                    className="mx-2 my-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 cursor-grab text-xs text-neutral-300 select-none hover:bg-neutral-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-12 shrink-0 truncate text-[9px] uppercase text-neutral-600">
                        {b.block_type.replace('_', ' ')}
                      </span>
                      <span className="truncate">{extractSharedBlockText(b)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      )}

      {/* ── Canvas toolbar (fixed, bottom-centre) ───────────────────────── */}
      {!readOnly && (
        <CanvasToolbar
          scale={scale}
          onZoomIn={() => updateScale(Math.min(MAX_SCALE, scaleRef.current * 1.1))}
          onZoomOut={() => updateScale(Math.max(MIN_SCALE, scaleRef.current / 1.1))}
          onAddText={() => addBlock('text')}
          onAddSticky={() => addBlock('sticky')}
          onAddRich={handleAddRich}
          onSwitchToDoc={onSwitchToDoc}
          hasCover={hasCover}
          coverExpanded={coverExpanded}
          onToggleCover={onToggleCover}
        />
      )}

      {/* ── Minimap + snap toggle (bottom-right, outside transform) ─────── */}
      <div
        style={{
          position:      'absolute',
          bottom:         16,
          right:          16,
          zIndex:         20,
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'flex-end',
          gap:            6,
          pointerEvents: 'auto',
        }}
        // Stop canvas pan/select from triggering through this overlay
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Snap toggle */}
        <button
          type="button"
          onClick={() => setSnapEnabled(s => !s)}
          style={{
            fontSize:     10,
            padding:      '2px 8px',
            borderRadius:  6,
            border:       `1px solid ${snapEnabled ? '#7c3aed' : '#3f3f46'}`,
            background:    snapEnabled ? '#4c1d95' : '#18181b',
            color:         snapEnabled ? '#c4b5fd' : '#71717a',
            cursor:       'pointer',
            userSelect:   'none',
            lineHeight:   '16px',
          }}
        >
          ⊞ Snap
        </button>

        {/* Minimap */}
        <CanvasMinimap
          blocks={canvasBlocks}
          panX={panX}
          panY={panY}
          scale={scale}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
          onNavigate={(nx, ny) => updatePan(nx, ny)}
        />
      </div>
    </div>
  );
}
