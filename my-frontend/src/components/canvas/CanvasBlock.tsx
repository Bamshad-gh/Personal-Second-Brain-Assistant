/**
 * components/canvas/CanvasBlock.tsx
 *
 * What:    A single absolutely-positioned block on the infinite canvas.
 *          Handles drag, resize, selection highlight, and content rendering.
 *
 * Props:
 *   block          — the Block data (canvas_x/y/w/z must be non-null)
 *   isSelected     — shows violet border + resize handle when true
 *   onSelect       — called when the user clicks the block
 *   onDragEnd      — called with (x, y) when a drag operation completes
 *   onResizeEnd    — called with (w, h) when a resize operation completes
 *   onContentSave  — called with (blockId, tiptapJson) after 500ms debounce
 *
 * Drag:
 *   Pointer-capture on the header grip div.
 *   Local state (localX/Y) updates during drag for a live preview;
 *   onDragEnd fires on pointerup only if the position changed.
 *
 * Resize:
 *   Pointer-capture on the bottom-right handle (visible only when selected).
 *   localW updates during resize; onResizeEnd fires on pointerup.
 *
 * Content by block_type:
 *   text     → mini TipTap editor (StarterKit, 500ms autosave)
 *   sticky   → yellow card + mini TipTap editor
 *   heading1 → static <h2> extracted from content.json
 *   image    → <img src={content.src}>
 *   other    → grey placeholder label
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useRef }  from 'react';
import { useEditor, EditorContent }     from '@tiptap/react';
import StarterKit                       from '@tiptap/starter-kit';
import { GripVertical, X, Eye, EyeOff } from 'lucide-react';
import type { Block }                   from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasBlockProps {
  block:         Block;
  isSelected:    boolean;
  onSelect:      () => void;
  onDelete:            () => void;
  onToggleVisibility:  () => void;
  onDragEnd:           (x: number, y: number) => void;
  onResizeEnd:   (w: number, h: number) => void;
  onContentSave: (blockId: string, json: Record<string, unknown>) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER — extract plain text from a TipTap JSON node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractTipTapText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const n = node as Record<string, unknown>;
  const parts: string[] = [];
  if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text);
  if (Array.isArray(n.content)) {
    for (const child of n.content) parts.push(extractTipTapText(child));
  }
  return parts.join('');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT — CanvasBlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CanvasBlock({
  block,
  isSelected,
  onSelect,
  onDelete,
  onToggleVisibility,
  onDragEnd,
  onResizeEnd,
  onContentSave,
}: CanvasBlockProps) {

  // ── Position / size state (local for live drag preview) ──────────────────
  const [localX, setLocalX] = useState(block.canvas_x ?? 0);
  const [localY, setLocalY] = useState(block.canvas_y ?? 0);
  const [localW, setLocalW] = useState(block.canvas_w ?? 300);

  // Sync from props when not currently dragging / resizing
  const isDraggingRef  = useRef(false);
  const isResizingRef  = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current)  setLocalX(block.canvas_x ?? 0);
  }, [block.canvas_x]);

  useEffect(() => {
    if (!isDraggingRef.current)  setLocalY(block.canvas_y ?? 0);
  }, [block.canvas_y]);

  useEffect(() => {
    if (!isResizingRef.current)  setLocalW(block.canvas_w ?? 300);
  }, [block.canvas_w]);

  // ── Drag (pointer capture on header) ─────────────────────────────────────

  const dragRef = useRef<{
    startMX: number; startMY: number;
    origX:   number; origY:   number;
  } | null>(null);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    // Only primary button; don't steal from resize handle
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, origX: localX, origY: localY };
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setLocalX(dragRef.current.origX + (e.clientX - dragRef.current.startMX));
    setLocalY(dragRef.current.origY + (e.clientY - dragRef.current.startMY));
  }

  function onDragUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const newX = dragRef.current.origX + (e.clientX - dragRef.current.startMX);
    const newY = dragRef.current.origY + (e.clientY - dragRef.current.startMY);
    dragRef.current = null;
    isDraggingRef.current = false;
    // Only call onDragEnd if position actually changed
    if (newX !== localX || newY !== localY) {
      onDragEnd(newX, newY);
    }
  }

  // ── Resize (pointer capture on bottom-right handle) ───────────────────────

  const resizeRef = useRef<{
    startMX: number; startMY: number;
    origW:   number;
  } | null>(null);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    isResizingRef.current = true;
    resizeRef.current = { startMX: e.clientX, startMY: e.clientY, origW: localW };
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const newW = Math.max(200, resizeRef.current.origW + (e.clientX - resizeRef.current.startMX));
    setLocalW(newW);
  }

  function onResizeUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const newW = Math.max(200, resizeRef.current.origW + (e.clientX - resizeRef.current.startMX));
    resizeRef.current = null;
    isResizingRef.current = false;
    onResizeEnd(newW, 0); // height is auto — backend ignores canvas_h=0 for auto-height blocks
  }

  // ── Sticky note variant ───────────────────────────────────────────────────
  const isSticky = block.block_type === 'sticky';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'absolute',
        left:     localX,
        top:      localY,
        width:    localW,
        zIndex:   block.canvas_z ?? 0,
        ...(isSticky ? { background: '#422006', borderColor: '#92400e' } : {}),
      }}
      className={[
        'rounded-xl border shadow-md flex flex-col',
        'min-w-50 min-h-20',
        isSticky ? '' : 'bg-neutral-900 border-neutral-800',
        isSelected && !isSticky ? 'border-violet-500 shadow-violet-500/20 shadow-lg' : '',
        isSelected && isSticky  ? 'shadow-yellow-500/20 shadow-lg' : '',
      ].join(' ')}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* ── Amber top strip for sticky cards ───────────────────────────── */}
      {isSticky && (
        <div className="h-2 rounded-t-xl shrink-0" style={{ background: '#92400e' }} />
      )}

      {/* ── Drag handle header ─────────────────────────────────────────── */}
      <div
        className={[
          'flex items-center gap-1.5 px-3 py-1.5 select-none',
          'border-b cursor-grab active:cursor-grabbing',
          isSticky ? 'border-yellow-700/30' : 'border-neutral-800',
        ].join(' ')}
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <GripVertical size={11} className="shrink-0 text-neutral-600" />
        {isSticky ? (
          <span className="text-xs truncate" style={{ color: '#fef3c7' }}>
            ● Sticky
          </span>
        ) : (
          <span className="text-xs text-neutral-600 truncate">
            ≡ Text
          </span>
        )}
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden p-3">
        {(block.block_type === 'text' || block.block_type === 'sticky') && (
          <TextContent block={block} onContentSave={onContentSave} />
        )}
        {block.block_type === 'heading1' && (
          <HeadingContent block={block} />
        )}
        {block.block_type === 'image' && (
          <ImageContent block={block} />
        )}
        {!['text', 'sticky', 'heading1', 'image'].includes(block.block_type) && (
          <PlaceholderContent blockType={block.block_type} />
        )}
      </div>

      {/* ── Delete + visibility buttons (visible only when selected) ──── */}
      {isSelected && (
        <>
          {/* Visibility toggle — show/hide in document view */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
            className="absolute top-2 right-8 flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300 transition-colors z-10"
            title={block.doc_visible ? 'Hide in document' : 'Show in document'}
          >
            {block.doc_visible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>

          {/* Delete */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:bg-red-950/30 hover:text-red-400 transition-colors z-10"
            title="Delete block"
          >
            <X size={12} />
          </button>
        </>
      )}

      {/* ── Resize handle (visible only when selected) ─────────────────── */}
      {isSelected && (
        <div
          style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16 }}
          className="cursor-se-resize bg-violet-500 rounded-tl-md"
          onPointerDown={startResize}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONTENT SUB-COMPONENTS
// Each is its own component so hooks are not called conditionally.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── TextContent — mini TipTap editor (text + sticky) ─────────────────────────

interface TextContentProps {
  block:         Block;
  onContentSave: (blockId: string, json: Record<string, unknown>) => void;
}

function TextContent({ block, onContentSave }: TextContentProps) {
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        hardBreak: false,
      }),
    ],
    content: (block.content?.json as Record<string, unknown> | undefined) ?? undefined,
    onUpdate({ editor: e }) {
      // 500ms debounce — same pattern as the main Editor
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        onContentSave(block.id, e.getJSON() as Record<string, unknown>);
      }, 500);
    },
  });

  // Cleanup autosave timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  return (
    // Stop pointer events so typing doesn't trigger drag or canvas interactions
    <div
      className="canvas-mini-editor text-sm text-neutral-200 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-8"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

// ── HeadingContent — static heading extracted from TipTap JSON ───────────────

function HeadingContent({ block }: { block: Block }) {
  const text = extractTipTapText(block.content?.json ?? {}) || 'Heading';
  return (
    <h2 className="text-xl font-bold text-neutral-100 leading-snug wrap-break-word">
      {text}
    </h2>
  );
}

// ── ImageContent — renders the stored image src ───────────────────────────────

function ImageContent({ block }: { block: Block }) {
  const src = block.content?.src as string | undefined;
  if (!src) {
    return (
      <p className="text-xs text-neutral-600 italic">No image source</p>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full h-auto object-contain rounded"
      draggable={false}
    />
  );
}

// ── PlaceholderContent — unsupported block type ───────────────────────────────

function PlaceholderContent({ blockType }: { blockType: string }) {
  return (
    <div className="p-3">
      <p className="text-xs text-neutral-500 italic">
        [{blockType.replace('_', ' ')} — switch to document mode to edit]
      </p>
    </div>
  );
}
