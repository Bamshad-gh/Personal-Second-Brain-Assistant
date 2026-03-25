/**
 * components/canvas/CanvasBlock.tsx
 *
 * What:    A single absolutely-positioned block on the infinite canvas.
 *          Handles drag, resize, selection highlight, and content rendering.
 *
 * Props:
 *   block          — the Block data (canvas_x/y/w/z must be non-null)
 *   isSelected     — shows violet border + resize handles when true
 *   onSelect       — called when the user clicks the block
 *   onDragEnd      — called with (x, y) during drag (debounced 300ms) and
 *                    immediately on pointerUp
 *   onResizeEnd    — called with (w, h) when a resize operation completes;
 *                    h=0 means "auto height" (right-edge W-only resize)
 *   onContentSave  — called with (blockId, tiptapJson) after 500ms debounce
 *   onColorChange  — called with hex string (or '') to update bg_color
 *
 * Drag:
 *   Pointer-capture on the header grip div.
 *   Local state (localX/Y) updates during drag for a live preview.
 *   onDragEnd is called with a 300ms debounce during drag AND immediately
 *   on pointerUp to guarantee the final position is always saved.
 *
 * Resize:
 *   Right-edge handle (W only)  → cursor-ew-resize, calls onResizeEnd(w, 0)
 *   Bottom-right corner (W + H) → cursor-nwse-resize, calls onResizeEnd(w, h)
 *   Both handles use pointer capture and are visible only when selected.
 *
 * Content by block_type:
 *   text     → mini TipTap editor (StarterKit, 500ms autosave)
 *   sticky   → amber card + mini TipTap editor
 *   heading1 → static <h2> extracted from content.json
 *   image    → <img src={content.src}>
 *   rich     → structured read-only preview (double-click to open full editor)
 *   other    → grey placeholder label
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useRef, type ReactNode }  from 'react';
import { useEditor, EditorContent }     from '@tiptap/react';
import StarterKit                       from '@tiptap/starter-kit';
import { GripVertical, X, FileText }    from 'lucide-react';
import type { Block }                   from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COLOR_SWATCHES: { color: string; label: string }[] = [
  { color: '',        label: 'Default' },
  { color: '#fef9c3', label: 'Yellow'  },
  { color: '#dcfce7', label: 'Green'   },
  { color: '#dbeafe', label: 'Blue'    },
  { color: '#fce7f3', label: 'Pink'    },
  { color: '#ede9fe', label: 'Violet'  },
  { color: '#fee2e2', label: 'Red'     },
  { color: '#f1f5f9', label: 'Slate'   },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasBlockProps {
  block:               Block;
  isSelected:          boolean;
  onSelect:            () => void;
  onDelete:            () => void;
  onToggleVisibility:  () => void;
  onDragEnd:           (x: number, y: number) => void;
  onResizeEnd:         (w: number, h: number) => void;
  onContentSave:       (blockId: string, json: Record<string, unknown>) => void;
  onEditStart?:        () => void;
  onColorChange:       (color: string) => void;
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

// ── isLightColor — returns true when a hex color has high perceived luminance
function isLightColor(hex: string): boolean {
  if (!hex) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
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
  onEditStart,
  onColorChange,
}: CanvasBlockProps) {

  // ── Position / size state (local for live drag/resize preview) ────────────
  const [localX, setLocalX] = useState(block.canvas_x ?? 0);
  const [localY, setLocalY] = useState(block.canvas_y ?? 0);
  const [localW, setLocalW] = useState(block.canvas_w ?? 300);
  const [localH, setLocalH] = useState(block.canvas_h ?? 0); // 0 = auto height

  // ── Color picker state ────────────────────────────────────────────────────
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [localColor,      setLocalColor]      = useState(block.bg_color ?? '');
  const colorDirtyRef = useRef(false);

  // Sync localColor from prop only when no local change is pending.
  // colorDirtyRef stays true for 3s after a swatch click, which covers the
  // full round-trip: mutate → onSettled invalidate → background refetch completes.
  useEffect(() => {
    if (!colorDirtyRef.current) setLocalColor(block.bg_color ?? '');
  }, [block.bg_color]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isDraggingRef  = useRef(false);
  const isResizingRef  = useRef(false);
  const blockRef       = useRef<HTMLDivElement>(null);

  // Sync from props when not currently dragging / resizing
  useEffect(() => {
    if (!isDraggingRef.current) setLocalX(block.canvas_x ?? 0);
  }, [block.canvas_x]);

  useEffect(() => {
    if (!isDraggingRef.current) setLocalY(block.canvas_y ?? 0);
  }, [block.canvas_y]);

  useEffect(() => {
    if (!isResizingRef.current) setLocalW(block.canvas_w ?? 300);
  }, [block.canvas_w]);

  useEffect(() => {
    if (!isResizingRef.current) setLocalH(block.canvas_h ?? 0);
  }, [block.canvas_h]);

  // ── Debounced position save ───────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function savePosition(x: number, y: number) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onDragEnd(x, y);
      saveTimerRef.current = null;
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Drag (pointer capture on header) ─────────────────────────────────────

  const dragRef = useRef<{
    startMX: number; startMY: number;
    origX:   number; origY:   number;
  } | null>(null);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, origX: localX, origY: localY };
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const newX = dragRef.current.origX + (e.clientX - dragRef.current.startMX);
    const newY = dragRef.current.origY + (e.clientY - dragRef.current.startMY);
    setLocalX(newX);
    setLocalY(newY);
    savePosition(newX, newY);
  }

  function onDragUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const newX = dragRef.current.origX + (e.clientX - dragRef.current.startMX);
    const newY = dragRef.current.origY + (e.clientY - dragRef.current.startMY);
    dragRef.current = null;
    isDraggingRef.current = false;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    onDragEnd(newX, newY);
  }

  // ── Corner resize — both W + H (pointer capture on bottom-right handle) ───

  const resizeRef = useRef<{
    startMX: number; startMY: number;
    origW:   number; origH:   number;
  } | null>(null);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    isResizingRef.current = true;
    resizeRef.current = {
      startMX: e.clientX,
      startMY: e.clientY,
      origW:   localW,
      origH:   blockRef.current?.getBoundingClientRect().height ?? 200,
    };
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const newW = Math.max(200, resizeRef.current.origW + (e.clientX - resizeRef.current.startMX));
    const newH = Math.max(100, resizeRef.current.origH + (e.clientY - resizeRef.current.startMY));
    setLocalW(newW);
    setLocalH(newH);
  }

  function onResizeUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const newW = Math.max(200, resizeRef.current.origW + (e.clientX - resizeRef.current.startMX));
    const newH = Math.max(100, resizeRef.current.origH + (e.clientY - resizeRef.current.startMY));
    resizeRef.current = null;
    isResizingRef.current = false;
    onResizeEnd(newW, newH);
  }

  // ── Right-edge resize — W only (pointer capture on right edge handle) ─────

  const resizeWRef = useRef<{
    startMX: number;
    origW:   number;
  } | null>(null);

  function startResizeW(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    isResizingRef.current = true;
    resizeWRef.current = { startMX: e.clientX, origW: localW };
  }

  function onResizeWMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeWRef.current) return;
    const newW = Math.max(200, resizeWRef.current.origW + (e.clientX - resizeWRef.current.startMX));
    setLocalW(newW);
  }

  function onResizeWUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeWRef.current) return;
    const newW = Math.max(200, resizeWRef.current.origW + (e.clientX - resizeWRef.current.startMX));
    resizeWRef.current = null;
    isResizingRef.current = false;
    onResizeEnd(newW, 0); // h=0 → auto height
  }

  // ── Color select handler ─────────────────────────────────────────────────
  function handleColorSelect(color: string) {
    colorDirtyRef.current = true;
    setLocalColor(color);
    onColorChange(color);
    setColorPickerOpen(false);
    // Block prop sync for 3s — enough time for refetch to complete after invalidation
    setTimeout(() => { colorDirtyRef.current = false; }, 3000);
  }

  // ── Sticky note variant ───────────────────────────────────────────────────
  const isSticky = block.block_type === 'sticky';

  // ── Text color based on applied background ────────────────────────────────
  // True when localColor is a light pastel — forces dark text for readability
  const textOnColor = isLightColor(localColor);
  const textColor   = localColor && isLightColor(localColor) ? '#1f2937' : undefined;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={blockRef}
      data-blockid={block.id}
      style={{
        position: 'absolute',
        left:     localX,
        top:      localY,
        width:    localW,
        height:   localH > 0 ? localH : undefined,
        zIndex:   block.canvas_z ?? 0,
        // localColor overrides default background; sticky keeps its amber border
        ...(localColor ? { backgroundColor: localColor } : {}),
        ...(isSticky ? { borderColor: '#92400e' } : {}),
      }}
      className={[
        'rounded-xl border shadow-md flex flex-col',
        'min-w-50 min-h-20',
        isSticky
          ? 'bg-amber-50 dark:bg-amber-900/40'
          : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800',
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
          'relative flex items-center gap-1.5 px-3 py-1.5 select-none',
          'border-b cursor-grab active:cursor-grabbing',
          isSticky ? 'border-yellow-700/30' : 'border-neutral-200 dark:border-neutral-800',
        ].join(' ')}
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <GripVertical size={11} className="shrink-0 text-neutral-400 dark:text-neutral-600" />

        {/* ── Color picker button ─────────────────────────────────────── */}
        <button
          type="button"
          className={[
            'w-3 h-3 rounded-full shrink-0',
            localColor
              ? 'border border-neutral-400 dark:border-neutral-600'
              : 'border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900',
          ].join(' ')}
          style={localColor ? { background: localColor } : undefined}
          onClick={(e) => { e.stopPropagation(); setColorPickerOpen(v => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Block color"
        />

        {/* ── Color swatch popup ──────────────────────────────────────── */}
        {colorPickerOpen && (
          <div
            className="absolute top-full left-0 mt-0.5 z-50 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 flex flex-wrap gap-1.5 w-36 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {COLOR_SWATCHES.map(({ color, label }) => (
              <button
                key={label}
                type="button"
                title={label}
                className={[
                  'w-5 h-5 rounded cursor-pointer border-2',
                  color ? '' : 'bg-white dark:bg-neutral-900',
                  localColor === color
                    ? 'border-violet-500'
                    : 'border-neutral-200 dark:border-neutral-700',
                ].join(' ')}
                style={color ? { background: color } : undefined}
                onClick={() => handleColorSelect(color)}
              />
            ))}
          </div>
        )}

        {/* ── Block type label ────────────────────────────────────────── */}
        {isSticky ? (
          <span className="text-xs truncate" style={{ color: '#fef3c7' }}>
            ● Sticky
          </span>
        ) : block.block_type === 'rich' ? (
          <span className="text-xs text-violet-500 truncate">≡ Rich</span>
        ) : (
          <span className={[
            'text-xs truncate',
            textOnColor ? 'text-neutral-600' : 'text-neutral-600 dark:text-neutral-400',
          ].join(' ')}>≡ Text</span>
        )}
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className={[
        'flex-1 overflow-y-auto p-3',
        textOnColor ? 'text-neutral-800' : 'text-neutral-800 dark:text-neutral-200',
      ].join(' ')}>
        {(block.block_type === 'text' || block.block_type === 'sticky') && (
          <TextContent block={block} onContentSave={onContentSave} textColor={textColor} />
        )}
        {block.block_type === 'heading1' && (
          <HeadingContent block={block} textColor={textColor} />
        )}
        {block.block_type === 'image' && (
          <ImageContent block={block} />
        )}
        {block.block_type === 'rich' && (
          <RichPreviewContent block={block} onEditStart={onEditStart} textColor={textColor} />
        )}
        {!['text', 'sticky', 'heading1', 'image', 'rich'].includes(block.block_type) && (
          <PlaceholderContent
            blockType={block.block_type}
            textColor={textColor}
          />
        )}
      </div>

      {/* ── Delete + visibility buttons (visible only when selected) ──── */}
      {isSelected && (
        <>
          {/* Visibility toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
            className={[
              'absolute top-2 right-8 flex items-center gap-1',
              'rounded px-1.5 py-0.5 text-xs transition-colors z-10',
              block.doc_visible
                ? 'bg-violet-900/40 text-violet-400 hover:bg-violet-900/60'
                : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-600 hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-400',
            ].join(' ')}
            title={block.doc_visible
              ? 'Visible in document — click to hide'
              : 'Hidden from document — click to show'}
          >
            <FileText size={10} />
            <span>{block.doc_visible ? 'In doc' : 'Doc'}</span>
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

      {/* ── Right-edge resize handle (W only, visible when selected) ───── */}
      {isSelected && (
        <div
          style={{ zIndex: 10 }}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-8 cursor-ew-resize bg-violet-500/50 rounded-l-sm"
          onPointerDown={startResizeW}
          onPointerMove={onResizeWMove}
          onPointerUp={onResizeWUp}
        />
      )}

      {/* ── Corner resize handle (W + H, visible when selected) ─────────── */}
      {isSelected && (
        <div
          style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, zIndex: 10 }}
          className="cursor-nwse-resize bg-violet-500 rounded-tl-md"
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
  textColor?:    string;
}

function TextContent({ block, onContentSave, textColor }: TextContentProps) {
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
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        onContentSave(block.id, e.getJSON() as Record<string, unknown>);
      }, 500);
    },
  });

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  return (
    <div
      className="canvas-mini-editor text-sm text-neutral-800 dark:text-neutral-200 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-8"
      style={{ color: textColor }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

// ── HeadingContent — static heading extracted from TipTap JSON ───────────────

function HeadingContent({ block, textColor }: { block: Block; textColor?: string }) {
  const text = extractTipTapText(block.content?.json ?? {}) || 'Heading';
  return (
    <h2 style={{ color: textColor }} className="text-xl font-bold text-neutral-900 dark:text-neutral-100 leading-snug wrap-break-word">
      {text}
    </h2>
  );
}

// ── ImageContent — renders the stored image src ───────────────────────────────

function ImageContent({ block }: { block: Block }) {
  const src = block.content?.src as string | undefined;
  if (!src) {
    return (
      <p className="text-xs text-neutral-400 dark:text-neutral-600 italic">No image source</p>
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

function PlaceholderContent({ blockType, textColor }: { blockType: string; textColor?: string }) {
  return (
    <div className="p-3" style={{ color: textColor }}>
      <p className="text-xs italic text-neutral-500 dark:text-neutral-600">
        [{blockType.replace('_', ' ')} — switch to document mode to edit]
      </p>
    </div>
  );
}

// ── RichPreviewContent — structured read-only preview for rich blocks ────────

function RichPreviewContent({
  block,
  onEditStart,
  textColor,
}: {
  block: Block;
  onEditStart?: () => void;
  textColor?: string;
}) {
  const json = block.content?.json as Record<string, unknown> | undefined;
  const nodes = Array.isArray((json as Record<string, unknown>)?.content)
    ? ((json as Record<string, unknown>).content as Record<string, unknown>[])
    : [];

  function renderNode(node: Record<string, unknown>, idx: number): ReactNode {
    const type = node.type as string;
    const content = node.content as Record<string, unknown>[] | undefined;
    const text = content
      ?.filter((n) => n.type === 'text')
      .map((n) => n.text as string)
      .join('') ?? '';

    switch (type) {
      case 'heading': {
        const level = (node.attrs as Record<string, unknown>)?.level as number ?? 1;
        const cls = level === 1 ? 'font-bold text-base'
                  : level === 2 ? 'font-semibold text-sm'
                  :               'font-medium text-sm';
        return <p key={idx} className={cls}>{text}</p>;
      }
      case 'bulletList':
      case 'orderedList':
        return (
          <ul key={idx} className="list-disc list-inside text-xs space-y-0.5">
            {(node.content as Record<string, unknown>[] ?? []).map((item, i) => {
              const itemText = (item.content as Record<string, unknown>[] ?? [])
                .flatMap((p) => (p.content as Record<string, unknown>[] ?? []))
                .filter((n) => n.type === 'text')
                .map((n) => n.text as string)
                .join('');
              return <li key={i}>{itemText}</li>;
            })}
          </ul>
        );
      case 'codeBlock':
        return (
          <pre key={idx} className="text-[10px] bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 font-mono text-green-700 dark:text-green-400 overflow-hidden">
            {text.slice(0, 60)}{text.length > 60 ? '…' : ''}
          </pre>
        );
      case 'paragraph':
        return text ? <p key={idx} className="text-xs text-neutral-700 dark:text-neutral-300">{text}</p> : null;
      default:
        return text ? <p key={idx} className="text-xs text-neutral-500 dark:text-neutral-400">{text}</p> : null;
    }
  }

  return (
    <div
      className="cursor-pointer select-none space-y-1 overflow-hidden max-h-32"
      style={{ color: textColor }}
      onDoubleClick={(e) => { e.stopPropagation(); onEditStart?.(); }}
    >
      {nodes.length > 0
        ? nodes.slice(0, 6).map((n, i) => renderNode(n, i))
        : <p className="italic text-neutral-400 dark:text-neutral-600 text-xs">Double-click to edit…</p>
      }
    </div>
  );
}
