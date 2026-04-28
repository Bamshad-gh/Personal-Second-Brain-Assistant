/**
 * components/canvas/CanvasRichBlock.tsx
 *
 * What:    Full TipTap editor overlay for canvas 'rich' blocks.
 *          Rendered in canvas-space (inside the pan/zoom transform div) as an
 *          absolutely-positioned card directly over the block's canvas position.
 *
 * Features:
 *   - Full TipTap editor with slash commands, formatting, tasks, code
 *   - Slash menu via canvasSlashEventBus (isolated from document editor)
 *   - 500ms debounced auto-save + immediate save on close
 *   - Closes on Escape key or when CanvasView deselects the block
 *
 * Props:
 *   block    — the rich Block being edited (canvas_x/y/w required)
 *   onSave   — called with new TipTap JSON (debounced + on close)
 *   onClose  — tells CanvasView to clear editingBlockId
 *
 * Layout:
 *   Outer container is position:absolute (canvas placement) with overflow:hidden.
 *   Background color matches block.bg_color (defaults to #1a1a1a).
 *   Text color is computed from luminance so it is always readable on the bg.
 *   Header is a normal block-level div (~36px tall).
 *   Editor wrapper is position:absolute; top:36; left:0; right:0; bottom:0 so it
 *   always fills the remaining height regardless of how the block is resized.
 *   globals.css adds `color: inherit !important` to .tiptap-editor .ProseMirror
 *   so TipTap inherits the correct text color from the wrapper div.
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState, useEffect, useRef }          from 'react';
import { useEditor, EditorContent }             from '@tiptap/react';
import StarterKit                               from '@tiptap/starter-kit';
import Placeholder                             from '@tiptap/extension-placeholder';
import { TextStyle }                            from '@tiptap/extension-text-style';
import { Color }                               from '@tiptap/extension-color';
import Highlight                               from '@tiptap/extension-highlight';
import TaskList                                from '@tiptap/extension-task-list';
import TaskItem                                from '@tiptap/extension-task-item';
import CodeBlockLowlight                       from '@tiptap/extension-code-block-lowlight';
import Image                                   from '@tiptap/extension-image';
import { common, createLowlight }              from 'lowlight';
import { X }                                   from 'lucide-react';

const lowlight = createLowlight(common);

import type { Block }                           from '@/types';
import { CanvasSlashCommand }                   from '@/components/editor/extensions/CanvasSlashCommand';
import { canvasSlashEventBus }                  from '@/lib/canvasSlashEventBus';
import type { SlashOpenPayload }                from '@/lib/canvasSlashEventBus';
import { SlashMenuPortal }                      from '@/components/editor/SlashMenuPortal';
import { SlashMenuList }                        from '@/components/editor/SlashMenu';
import type { SlashMenuHandle, SlashCommandItem } from '@/components/editor/SlashMenu';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CanvasRichBlockProps {
  block:   Block;
  onSave:  (json: Record<string, unknown>) => void;
  onClose: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isLightBg(hex: string): boolean {
  if (!hex) {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('light') ||
        !document.documentElement.classList.contains('dark');
    }
    return false;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CanvasRichBlock({ block, onSave, onClose }: CanvasRichBlockProps) {

  // ── Background / text color derived from block color ─────────────────────
  const bgColor   = block.bg_color || '';
  const textColor = isLightBg(bgColor) ? '#111827' : '#f9fafb';

  // ── Header background — semi-transparent overlay over block color ─────────
  const headerBg        = isLightBg(bgColor) ? 'rgba(0,0,0,0.18)'  : 'rgba(255,255,255,0.18)';
  const headerBorder    = isLightBg(bgColor) ? 'rgba(0,0,0,0.25)'  : 'rgba(255,255,255,0.25)';
  const headerTextColor = isLightBg(bgColor) ? '#000000'            : '#ffffff';

  // ── Slash menu state ──────────────────────────────────────────────────────
  const [slashOpen,    setSlashOpen]    = useState(false);
  const [slashItems,   setSlashItems]   = useState<SlashCommandItem[]>([]);
  const [slashRect,    setSlashRect]    = useState<DOMRect | null>(null);
  const [slashCommand, setSlashCommand] = useState<((item: SlashCommandItem) => void) | null>(null);
  const slashMenuRef   = useRef<SlashMenuHandle>(null);
  const containerRef   = useRef<HTMLDivElement>(null);

  // ── Auto-save debounce ────────────────────────────────────────────────────
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold a ref to the latest onSave so the close handler always flushes correctly
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // ── TipTap editor ─────────────────────────────────────────────────────────
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, hardBreak: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Image,
      Placeholder.configure({ placeholder: 'Type / for commands…' }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CanvasSlashCommand,
    ],
    content: (block.content?.json as Record<string, unknown> | undefined) ?? undefined,
    onUpdate({ editor: e }) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        onSaveRef.current(e.getJSON() as Record<string, unknown>);
      }, 500);
    },
  });

  // ── Flush pending save + close ────────────────────────────────────────────
  function handleClose() {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (editor) {
      onSaveRef.current(editor.getJSON() as Record<string, unknown>);
    }
    onClose();
  }

  // ── Escape key to close ───────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Let the slash menu close first (CanvasSlashCommand returns true for Escape)
        // If slash menu is not open, close the editor
        if (!slashOpen) handleClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slashOpen]);

  // ── Cleanup autosave on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // ── Click-outside to close ────────────────────────────────────────────────
  // Uses refs for onClose/slashOpen so the handler doesn't need to re-register
  // on every slashOpen change — avoids a brief window where the old handler fires.
  const slashOpenRef = useRef(slashOpen);
  useEffect(() => { slashOpenRef.current = slashOpen; }, [slashOpen]);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (slashOpenRef.current) return; // user is interacting with the slash menu portal
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []); // stable — reads latest values via refs

  // ── Slash menu bus listeners ──────────────────────────────────────────────
  useEffect(() => {
    const onOpen = (data: SlashOpenPayload) => {
      setSlashItems(data.items);
      const rect = data.rect ?? containerRef.current?.getBoundingClientRect() ?? null;
      setSlashRect(rect);
      setSlashCommand(() => data.command);
      setSlashOpen(true);
    };
    const onUpdate = (data: SlashOpenPayload) => {
      setSlashItems(data.items);
      const rect = data.rect ?? containerRef.current?.getBoundingClientRect() ?? null;
      setSlashRect(rect);
      setSlashCommand(() => data.command);
    };
    const onKeydown = (data: { event: KeyboardEvent }) => {
      slashMenuRef.current?.onKeyDown(data.event);
    };
    const onCloseMenu = () => { setSlashOpen(false); };

    canvasSlashEventBus.on('slash:open',    onOpen);
    canvasSlashEventBus.on('slash:update',  onUpdate);
    canvasSlashEventBus.on('slash:keydown', onKeydown);
    canvasSlashEventBus.on('slash:close',   onCloseMenu);

    return () => {
      canvasSlashEventBus.off('slash:open',    onOpen);
      canvasSlashEventBus.off('slash:update',  onUpdate);
      canvasSlashEventBus.off('slash:keydown', onKeydown);
      canvasSlashEventBus.off('slash:close',   onCloseMenu);
    };
  }, []); // bus is module-level singleton — no dependency needed

  // ── Geometry ──────────────────────────────────────────────────────────────
  const left  = block.canvas_x ?? 0;
  const top   = block.canvas_y ?? 0;
  const width = Math.max(block.canvas_w ?? 300, 480);

  // ── Height — local state so resize prop changes re-render smoothly ────────
  const [localHeight, setLocalHeight] = useState(block.canvas_h ?? 320);
  useEffect(() => { setLocalHeight(block.canvas_h ?? 320); }, [block.canvas_h]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <>
      {/* ── Editor card ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          position:        'absolute',
          left,
          top,
          width,
          height:          localHeight,
          overflow:        'hidden',
          zIndex:          100,
          backgroundColor: bgColor || undefined,
          color:           textColor,
        }}
        className="rounded-xl border border-violet-500 shadow-2xl shadow-violet-500/20"
        // Stop pointer events from bubbling to CanvasView (prevents canvas pan/select)
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: headerBg,
            borderBottom:    `1px solid ${headerBorder}`,
            color:           headerTextColor,
            padding:         '6px 10px',
            display:         'flex',
            alignItems:      'center',
            gap:             '6px',
            flexShrink:      0,
          }}
        >
          <span style={{ color: headerTextColor, fontSize: '11px' }}>≡ Rich</span>
          <button
            type="button"
            onClick={handleClose}
            title="Close editor (Esc)"
            className="ml-auto flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-red-950/30"
            style={{ color: headerTextColor, opacity: 0.8 }}
          >
            <X size={11} />
          </button>
        </div>

        {/* ── Editor content — absolutely fills space below the header ──── */}
        {/* color cascades to .ProseMirror via `color: inherit !important` in globals.css */}
        <div
          style={{
            position:      'absolute',
            top:           36,
            left:          0,
            right:         0,
            bottom:        0,
            overflowY:     'auto',
            display:       'flex',
            flexDirection: 'column',
            color:         textColor,
          }}
          className="tiptap-editor"
        >
          <div
            className={[
              'flex-1 min-h-0 p-3',
              'text-sm',
              '[&_.ProseMirror]:outline-none',
              '[&_.ProseMirror]:min-h-48',
            ].join(' ')}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* ── Slash command menu (portal) ─────────────────────────────────── */}
      {slashOpen && (
        <SlashMenuPortal rect={slashRect}>
          <SlashMenuList
            ref={slashMenuRef}
            items={slashItems}
            command={(item) => {
              slashCommand?.(item);
              setSlashOpen(false);
            }}
          />
        </SlashMenuPortal>
      )}
    </>
  );
}
