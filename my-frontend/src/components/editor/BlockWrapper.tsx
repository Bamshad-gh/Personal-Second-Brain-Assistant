/**
 * components/editor/BlockWrapper.tsx
 *
 * What:    A floating handle that appears to the left of the block the pointer
 *          is hovering over. Contains up to four controls:
 *            • "+" button       — inserts a new empty paragraph below the block
 *            • "→" indent right — sinks a list item one level deeper (list only)
 *            • "←" indent left  — lifts a list item one level up (list only)
 *            • Drag grip        — HTML5 drag-and-drop to reorder the block
 *
 * Architecture:
 *   Pure React — no @tiptap/extension-drag-handle-react (that package causes
 *   a Performance.measure crash in TipTap v3). Position is absolute relative
 *   to the editor's `relative pl-14` container, so it stays aligned regardless
 *   of sidebar state or screen size.
 *
 *   The outer overlay div uses `pointerEvents: 'none'` so it never blocks
 *   editor clicks. Individual buttons opt back in with `pointerEvents: 'auto'`.
 *   Each button also calls `onMouseMove.stopPropagation()` to prevent the
 *   editor's handleMouseMove from seeing the event and updating blockHandle.
 *
 * Used by: Editor.tsx — renders <AddBlockHandle> when blockHandle state is set.
 */

'use client';

import { Plus, GripVertical, ChevronRight, ChevronLeft } from 'lucide-react';
import type { Editor as TipTapEditor } from '@tiptap/core';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AddBlockHandle — floating controls positioned left of the hovered block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AddBlockHandleProps {
  /** Vertical midpoint of the hovered block in px from editor container top */
  top:          number;
  /** ProseMirror document position of the hovered block (for drag + insert) */
  nodePos:      number;
  /** True when the hovered block is a list (ul/ol) — shows indent buttons */
  isListItem:   boolean;
  /** Called when the user clicks the "+" button */
  onAdd:        () => void;
  /** Called when the mouse exits the overlay strip */
  onMouseLeave: () => void;
  /** TipTap editor instance (needed for indent commands + drag drop) */
  editor:       TipTapEditor;
}

export function AddBlockHandle({
  top, nodePos, isListItem, onAdd, onMouseLeave, editor,
}: AddBlockHandleProps) {
  function handleDragStart(e: React.DragEvent) {
  // Use custom MIME type so TipTap does not interpret this as text to insert
  e.dataTransfer.setData('application/nexus-block', String(nodePos));
  e.dataTransfer.effectAllowed = 'move';

  // Hide the default drag ghost
  const canvas = document.createElement('canvas');
  canvas.width = 0;
  canvas.height = 0;
  e.dataTransfer.setDragImage(canvas, 0, 0);
}

  return (
    <div
      style={{
        position:      'absolute',
        top:           top - 4,
        left:          -7,                    // matches pl-14 (72px) gutter in Editor
        height:        28,
        width:         'calc(100% + 7px)',
        display:       'flex',
        alignItems:    'center',
        gap:           2,
        pointerEvents: 'auto', // pass-through so editor clicks are never blocked
        
      }}
      // onMouseMove={(e) => e.stopPropagation()}
      onMouseLeave={onMouseLeave}
    >
      {/* ── "+" insert button ─────────────────────────────────────────────── */}
      <button
        onMouseDown={(e) => e.preventDefault()} // don't steal editor focus
        onMouseMove={(e) => e.stopPropagation()} // don't trigger handleMouseMove
        onClick={onAdd}
        style={{ pointerEvents: 'auto' }}
        className="flex h-5 w-5 items-center justify-center rounded
                   text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300
                   transition-colors"
        title="Add block below"
      >
        <Plus size={12} />
      </button>

      {/* ── Indent right — only for list blocks ──────────────────────────── */}
      {isListItem && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={(e) => e.stopPropagation()}
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          style={{ pointerEvents: 'auto' }}
          className="flex h-5 w-5 items-center justify-center rounded
                     text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300
                     transition-colors"
          title="Indent right"
        >
          <ChevronRight size={12} />
        </button>
      )}

      {/* ── Indent left — only for list blocks ───────────────────────────── */}
      {isListItem && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={(e) => e.stopPropagation()}
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          style={{ pointerEvents: 'auto' }}
          className="flex h-5 w-5 items-center justify-center rounded
                     text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300
                     transition-colors"
          title="Indent left"
        >
          <ChevronLeft size={12} />
        </button>
      )}

      {/* ── Drag grip ─────────────────────────────────────────────────────── */}
      <div
        draggable
        onDragStart={handleDragStart}
        onMouseMove={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
        className="flex h-5 w-5 cursor-grab items-center justify-center rounded
                   text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300
                   transition-colors"
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </div>
    </div>
  );
}
