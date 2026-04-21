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
 *
 * Layout:
 *   Root div is position:absolute (canvas placement) and serves as the
 *   containing block for absolutely-positioned children.
 *   When the block has an explicit height (localH > 0) the content area uses
 *   position:absolute to fill the space below the header perfectly.
 *   headerHeight accounts for the sticky amber strip (44px) vs normal (36px).
 *   When height is auto (localH === 0) the content area flows normally.
 *
 * Color cascade:
 *   dynamicTextColor is set on the content area div and cascades to all
 *   children automatically — sub-components need no individual color prop.
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useRef, type ReactNode }  from 'react';
import { createPortal }                 from 'react-dom';
import { useEditor, EditorContent }     from '@tiptap/react';
import StarterKit                       from '@tiptap/starter-kit';
import { GripVertical, X, FileText }    from 'lucide-react';
import { blockApi }                     from '@/lib/api';
import type { Block }                   from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COLOR_SWATCHES: { color: string; label: string }[] = [
  { color: '',        label: 'Default'      },
  { color: '#854d0e', label: 'Amber'        },  // dark amber
  { color: '#166534', label: 'Green'        },  // dark green
  { color: '#1e40af', label: 'Blue'         },  // dark blue
  { color: '#9d174d', label: 'Pink'         },  // dark pink
  { color: '#4c1d95', label: 'Violet'       },  // dark violet
  { color: '#991b1b', label: 'Red'          },  // dark red
  { color: '#1f2937', label: 'Slate'        },  // dark slate
  { color: '#fef9c3', label: 'Light Yellow' },  // light yellow
  { color: '#dcfce7', label: 'Light Green'  },  // light green
  { color: '#dbeafe', label: 'Light Blue'   },  // light blue
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
  /** Saves arbitrary content object directly (used by media blocks after upload) */
  onSaveContent?:      (content: Record<string, unknown>) => void;
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
  onSaveContent,
  onEditStart,
  onColorChange,
}: CanvasBlockProps) {

  // ── Portal mount guard (SSR-safe) ────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Position / size state (local for live drag/resize preview) ────────────
  const [localX, setLocalX] = useState(block.canvas_x ?? 0);
  const [localY, setLocalY] = useState(block.canvas_y ?? 0);
  const [localW, setLocalW] = useState(block.canvas_w ?? 300);
  const [localH, setLocalH] = useState(block.canvas_h ?? 0); // 0 = auto height

  // ── Color picker state ────────────────────────────────────────────────────
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [localColor,      setLocalColor]      = useState(block.bg_color ?? '');
  const [pickerRect,      setPickerRect]      = useState<DOMRect | null>(null);
  const colorBtnRef   = useRef<HTMLButtonElement>(null);
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

  // ── Text color that cascades to all content children ─────────────────────
  // Explicit: dark text on light bg, light text on dark bg, undefined = CSS default
  const dynamicTextColor: string | undefined = localColor
    ? isLightColor(localColor)
      ? '#1f2937'   // dark text on light background
      : '#f3f4f6'   // light text on dark background
    : undefined;    // no color applied — use CSS defaults

  // ── Content area style ────────────────────────────────────────────────────
  // sticky: 8px amber strip + 36px header = 44px; others: 36px header only
  // When height is fixed (localH > 0): absolute positioning fills the space below
  // the header using left:0 right:0 bottom:0 — right:0 resolves to the right edge
  // of the root div's explicit width (localW), so widening the block is instant.
  // When height is auto (localH === 0): relative positioning grows with content.
  const headerHeight = isSticky ? 44 : 36;
  const contentStyle: React.CSSProperties = localH > 0
    ? { position: 'absolute', top: headerHeight, left: 0,
        right: 0, bottom: 0, overflowY: 'auto', padding: '0.75rem' }
    : { position: 'relative', overflowY: 'auto', padding: '0.75rem', minHeight: '3rem' };

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
        // position:absolute already creates a containing block for children,
        // but we also set it so the content area's right:0 resolves to localW.
        // localColor overrides default background; sticky keeps its amber border
        ...(localColor ? { backgroundColor: localColor } : {}),
        ...(isSticky ? { borderColor: '#92400e' } : {}),
        boxShadow: isSelected ? '0 0 0 2px #7c3aed, 0 0 16px #7c3aed44' : undefined,
        animation: isSelected
          ? 'blockAppear 0.25s ease-out forwards, glowPulse 2s ease-in-out infinite'
          : 'blockAppear 0.25s ease-out forwards',
      }}
      className={[
        'rounded-xl border shadow-md',
        'min-w-50 min-h-20',
        isSticky
          ? 'bg-amber-50 dark:bg-amber-900/40'
          : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800',
      ].join(' ')}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* ── Amber top strip for sticky cards ───────────────────────────── */}
      {isSticky && (
        <div className="h-2 rounded-t-xl" style={{ background: '#92400e' }} />
      )}

      {/* ── Drag handle header ─────────────────────────────────────────── */}
      <div
        className={[
          'relative flex items-center gap-1.5 px-3 py-1.5 select-none',
          'border-b cursor-grab active:cursor-grabbing',
          isSticky ? 'border-yellow-700/30' : 'border-neutral-200 dark:border-neutral-800',
        ].join(' ')}
        style={{ backdropFilter: 'blur(4px)' }}
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <GripVertical size={11} className="shrink-0 text-neutral-400 dark:text-neutral-600" />

        {/* ── Color picker button ─────────────────────────────────────── */}
        <button
          ref={colorBtnRef}
          type="button"
          className={[
            'w-3 h-3 rounded-full shrink-0',
            localColor
              ? 'border border-neutral-400 dark:border-neutral-600'
              : 'border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900',
          ].join(' ')}
          style={localColor ? { background: localColor } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            const rect = colorBtnRef.current?.getBoundingClientRect() ?? null;
            setPickerRect(rect);
            setColorPickerOpen(v => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Block color"
        />

        {/* ── Color swatch popup — portaled to document.body ──────────── */}
        {mounted && colorPickerOpen && pickerRect && createPortal(
          <div
            style={{
              position: 'fixed',
              top:      pickerRect.bottom + 4,
              left:     pickerRect.left,
              zIndex:   99999,
            }}
            className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 flex flex-wrap gap-1.5 w-44 shadow-lg"
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
          </div>,
          document.body,
        )}

        {/* ── Block type label — white text on dark pill, always readable ─ */}
        {(() => {
          const LABEL: Record<string, string> = {
            sticky:         '● Sticky',
            rich:           '≡ Rich',
            heading1:       'H¹ Heading',
            heading2:       'H² Heading',
            heading3:       'H³ Heading',
            image:          '🖼 Image',
            pdf:            '📄 PDF',
            paragraph:      '¶ Text',
            quote:          '" Quote',
            bullet_item:    '• Bullet',
            numbered_item:  '1. List',
            todo_item:      '☐ Todo',
            callout:        '💡 Callout',
            code:           '</> Code',
            divider:        '— Divider',
          };
          return (
            <span
              style={{
                color:           'white',
                backgroundColor: 'rgba(0,0,0,0.35)',
                borderRadius:    '4px',
                padding:         '1px 6px',
              }}
              className="text-xs truncate max-w-32"
            >
              {LABEL[block.block_type] ?? '≡ Text'}
            </span>
          );
        })()}
      </div>

      {/* ── Content area ────────────────────────────────────────────────── */}
      {/* Absolute when block has fixed height (fills below header perfectly). */}
      {/* Normal flow when height is auto (block grows with content).          */}
      {/* dynamicTextColor set here cascades to all child content.             */}
      <div
        style={{ ...contentStyle, color: dynamicTextColor }}
        className={dynamicTextColor ? '' : 'text-neutral-800 dark:text-neutral-200'}
      >
        {(block.block_type === 'text' || block.block_type === 'sticky') && (
          <TextContent block={block} onContentSave={onContentSave} />
        )}
        {(block.block_type === 'heading1' || block.block_type === 'heading2' || block.block_type === 'heading3') && (
          <HeadingContent block={block} />
        )}
        {block.block_type === 'image' && (
          <ImageContent block={block} onSaveContent={onSaveContent} />
        )}
        {block.block_type === 'pdf' && (
          <PdfContent block={block} onSaveContent={onSaveContent} />
        )}
        {block.block_type === 'rich' && (
          <RichPreviewContent block={block} onEditStart={onEditStart} />
        )}
        {(block.block_type === 'paragraph' || block.block_type === 'quote') && (
          <DocTextContent block={block} />
        )}
        {(block.block_type === 'bullet_item' || block.block_type === 'numbered_item' || block.block_type === 'todo_item') && (
          <DocListItemContent block={block} />
        )}
        {block.block_type === 'callout' && (
          <DocCalloutContent block={block} />
        )}
        {block.block_type === 'code' && (
          <DocCodeContent block={block} />
        )}
        {block.block_type === 'divider' && (
          <hr className="border-neutral-300 dark:border-neutral-700 my-2" />
        )}
        {block.block_type === 'column_container' && (
          <PlaceholderContent blockType="column layout" note="Edit in document mode" />
        )}
        {!['text', 'sticky', 'heading1', 'heading2', 'heading3', 'image', 'pdf', 'rich',
            'paragraph', 'quote', 'bullet_item', 'numbered_item', 'todo_item',
            'callout', 'code', 'divider', 'column_container'].includes(block.block_type) && (
          <PlaceholderContent blockType={block.block_type} />
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
// Text color is NOT passed as a prop — it cascades from the parent content div.
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
      className="canvas-mini-editor text-sm [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-8"
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
  const cls =
    block.block_type === 'heading1' ? 'text-xl font-bold' :
    block.block_type === 'heading2' ? 'text-lg font-semibold' :
                                      'text-base font-medium';
  return (
    <p className={`leading-snug wrap-break-word ${cls}`}>{text}</p>
  );
}

// ── ImageContent — upload zone → <img> once URL is stored ───────────────────

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface MediaContentProps {
  block:          Block;
  onSaveContent?: (content: Record<string, unknown>) => void;
}

function ImageContent({ block, onSaveContent }: MediaContentProps) {
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Support both content.url (new upload API) and content.src (legacy)
  const url = (block.content?.url ?? block.content?.src) as string | undefined;

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) { setError('Max 10 MB'); return; }
    setError('');
    setUploading(true);
    try {
      const result = await blockApi.uploadFile(file);
      onSaveContent?.({ url: result.url, filename: result.filename, alt: file.name });
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  if (!url) {
    return (
      <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <div
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !uploading && inputRef.current?.click()}
          className="flex min-h-28 flex-col items-center justify-center rounded-lg
                     border-2 border-dashed border-neutral-300 dark:border-neutral-700
                     cursor-pointer hover:border-violet-400 dark:hover:border-violet-500
                     transition-colors"
        >
          {uploading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          ) : (
            <>
              <span className="text-3xl mb-1">🖼</span>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Drop or click to upload</p>
              <p className="text-[10px] text-neutral-400 dark:text-neutral-600 mt-0.5">Max 10 MB</p>
            </>
          )}
        </div>
        <input ref={inputRef} type="file" className="hidden" accept="image/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-full h-full" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={String(block.content?.alt ?? '')}
        className="w-full h-full object-contain rounded"
        draggable={false}
      />
    </div>
  );
}

// ── PdfContent — upload zone → blob-URL iframe (bypasses X-Frame-Options) ────

function PdfContent({ block, onSaveContent }: MediaContentProps) {
  const [uploading,   setUploading]   = useState(false);
  const [error,       setError]       = useState('');
  const [pdfBlobUrl,  setPdfBlobUrl]  = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const url = block.content?.url as string | undefined;

  // Fetch PDF and create a same-origin blob URL to bypass X-Frame-Options: DENY
  useEffect(() => {
    if (!url) return;
    let objectUrl = '';
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch(() => { /* iframe will be empty; Open ↗ link still works */ });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) { setError('Max 10 MB'); return; }
    setError('');
    setUploading(true);
    try {
      const result = await blockApi.uploadFile(file);
      onSaveContent?.({ url: result.url, filename: result.filename, size: result.size });
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  if (!url) {
    return (
      <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <div
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !uploading && inputRef.current?.click()}
          className="flex min-h-28 flex-col items-center justify-center rounded-lg
                     border-2 border-dashed border-neutral-300 dark:border-neutral-700
                     cursor-pointer hover:border-violet-400 dark:hover:border-violet-500
                     transition-colors"
        >
          {uploading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          ) : (
            <>
              <span className="text-3xl mb-1">📄</span>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Drop or click to upload PDF</p>
              <p className="text-[10px] text-neutral-400 dark:text-neutral-600 mt-0.5">Max 10 MB</p>
            </>
          )}
        </div>
        <input ref={inputRef} type="file" className="hidden" accept="application/pdf"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-2 py-1
                      bg-black/10 dark:bg-black/20 rounded-t shrink-0">
        <span className="truncate text-xs opacity-60">
          {String(block.content?.filename ?? 'Document.pdf')}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 shrink-0 text-xs text-violet-400 hover:text-violet-300"
        >
          Open ↗
        </a>
      </div>
      {/* Iframe — uses blob URL to bypass X-Frame-Options: DENY */}
      {pdfBlobUrl ? (
        <iframe
          src={pdfBlobUrl}
          className="flex-1 w-full rounded-b min-h-36"
          title={String(block.content?.filename ?? 'PDF')}
        />
      ) : (
        <div className="flex flex-1 min-h-36 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      )}
    </div>
  );
}

// ── PlaceholderContent — unsupported block type ───────────────────────────────

function PlaceholderContent({ blockType, note }: { blockType: string; note?: string }) {
  return (
    <p className="text-xs italic opacity-60">
      [{blockType.replace(/_/g, ' ')}{note ? ` — ${note}` : ' — switch to document mode to edit'}]
    </p>
  );
}

// ── resolveBlockText — reads TipTap JSON or plain text string, whichever exists ─
// Blocks created via slash menu store { text: "...", marks: [] }.
// Blocks edited in TipTap store { json: { type: 'doc', content: [...] } }.
// This helper handles both so canvas previews always show the right content.
function resolveBlockText(block: Block): string {
  const jsonText = extractTipTapText(block.content?.json ?? {});
  if (jsonText) return jsonText;
  return String(block.content?.text ?? '');
}

// ── DocTextContent — paragraph / quote ────────────────────────────────────────

function DocTextContent({ block }: { block: Block }) {
  const text = resolveBlockText(block);
  const isQuote = block.block_type === 'quote';
  if (!text) {
    return <p className="text-xs italic opacity-40">{isQuote ? 'Empty quote' : 'No content'}</p>;
  }
  if (isQuote) {
    return (
      <blockquote className="border-l-2 border-neutral-400 dark:border-neutral-600 pl-2 text-sm italic opacity-80 wrap-break-word">
        {text}
      </blockquote>
    );
  }
  return <p className="text-sm leading-relaxed wrap-break-word">{text}</p>;
}

// ── DocListItemContent — bullet / numbered / todo ─────────────────────────────

function DocListItemContent({ block }: { block: Block }) {
  const text    = resolveBlockText(block);
  const checked = block.content?.checked === true;

  const bullet =
    block.block_type === 'bullet_item'   ? '•' :
    block.block_type === 'numbered_item' ? '1.' :
    checked                              ? '☑' : '☐';

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0 opacity-60 mt-px">{bullet}</span>
      <span className={`wrap-break-word ${checked ? 'line-through opacity-50' : ''}`}>
        {text || <span className="italic opacity-40">Empty item</span>}
      </span>
    </div>
  );
}

// ── DocCalloutContent — emoji + text ──────────────────────────────────────────

function DocCalloutContent({ block }: { block: Block }) {
  const emoji = String(block.content?.emoji ?? '💡');
  const text  = String(block.content?.text  ?? '');
  return (
    <div className="flex items-start gap-2 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 px-3 py-2">
      <span className="shrink-0 text-base">{emoji}</span>
      <p className="text-sm leading-relaxed wrap-break-word opacity-90">
        {text || <span className="italic opacity-40">Empty callout</span>}
      </p>
    </div>
  );
}

// ── DocCodeContent — language label + code preview ───────────────────────────

function DocCodeContent({ block }: { block: Block }) {
  const lang = String(block.content?.language ?? 'code');
  const code = String(block.content?.code      ?? '');
  return (
    <div className="rounded-lg bg-black/10 dark:bg-black/30 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-black/10 dark:bg-black/20">
        <span className="text-[10px] font-mono opacity-60">&lt;/&gt;</span>
        <span className="text-[10px] font-mono opacity-50">{lang}</span>
      </div>
      <pre className="text-[10px] font-mono px-2 py-1.5 overflow-hidden leading-relaxed">
        {code.slice(0, 200)}{code.length > 200 ? '…' : ''}
      </pre>
    </div>
  );
}

// ── RichPreviewContent — structured read-only preview for rich blocks ────────

function RichPreviewContent({
  block,
  onEditStart,
}: {
  block: Block;
  onEditStart?: () => void;
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
          <pre key={idx} className="text-[10px] bg-black/10 rounded px-2 py-1 font-mono overflow-hidden">
            {text.slice(0, 60)}{text.length > 60 ? '…' : ''}
          </pre>
        );
      case 'paragraph':
        return text ? <p key={idx} className="text-xs">{text}</p> : null;
      default:
        return text ? <p key={idx} className="text-xs opacity-70">{text}</p> : null;
    }
  }

  return (
    <div
      className="cursor-pointer select-none space-y-1 overflow-y-auto"
      style={{ maxHeight: '100%' }}
      onDoubleClick={(e) => { e.stopPropagation(); onEditStart?.(); }}
    >
      {nodes.length > 0
        ? nodes.slice(0, 6).map((n, i) => renderNode(n, i))
        : <p className="italic text-xs opacity-50">Double-click to edit…</p>
      }
    </div>
  );
}
