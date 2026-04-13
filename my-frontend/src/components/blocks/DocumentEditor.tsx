/**
 * components/blocks/DocumentEditor.tsx
 *
 * What:    New document editor — renders one BlockRenderer per block instead
 *          of a single monolithic TipTap instance.
 *
 * How blocks are ordered:
 *   Each block has a float `order` field (fractional indexing).
 *   New blocks use the midpoint between afterBlock and nextBlock to prevent
 *   order collisions.
 *
 * Focus after Enter:
 *   page.tsx passes pendingFocusBlockId (the real ID returned by the API in
 *   onCreated) and onFocusHandled. The useEffect watches sortedBlocks; once
 *   the new block appears it sets focusedId directly by ID.
 *
 * Focus after Backspace-delete / convert-to-paragraph:
 *   focusEndId holds the id of the block that should receive focus at its end.
 *   focusEndIdRef + setTimeout(100) in handleFocus prevent premature clearing
 *   before the TextBlock's 150ms focusAtEnd effect fires.
 *
 * Insertion indicator (edge-proximity pattern):
 *   The insertion line only appears when the mouse is within EDGE_THRESHOLD (12px)
 *   of the top or bottom edge of a block. The middle content area is completely
 *   unaffected — no click interception while editing.
 *
 *   The insertion button is centered ON the edge (top-0 -translate-y-1/2 or
 *   bottom-0 translate-y-1/2) so it is always between two blocks, never over
 *   block content. pointer-events-none on child visuals means only the thin
 *   strip captures clicks.
 *
 * Drag-and-drop reorder (pointer events):
 *   setPointerCapture is NOT used — it breaks elementFromPoint.
 *   document-level pointermove/pointerup handle movement while isDragging.
 *
 * Column layout (Phase 4):
 *   Right-edge drop zone: if the dragged block is released over the right 25%
 *   of another block, the two blocks merge into a column_container layout via
 *   POST /api/blocks/make-columns/. A violet right-edge indicator shows during
 *   the hover to signal column mode vs. reorder mode.
 *
 *   allBlocks vs sortedBlocks:
 *     allBlocks    — all doc_visible non-deleted blocks (used by ColumnContainerBlock
 *                    to locate column children by parent id)
 *     sortedBlocks — allBlocks filtered to parent === null (top-level only)
 *                    column/column children are excluded from the top-level list
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BlockRenderer }                            from './BlockRenderer';
import { useMakeColumns }                           from '@/hooks/useDocumentBlocks';
import { slashEventBus }                            from '@/lib/slashEventBus';
import { SlashMenuPortal }                          from '@/components/editor/SlashMenuPortal';
import { SlashMenuList }                            from '@/components/editor/SlashMenu';
import type { SlashMenuHandle, SlashCommandItem }   from '@/components/editor/SlashMenu';
import type { Block, BlockType, BlockContent, UpdateBlockPayload } from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LIST_TYPES: BlockType[] = ['bullet_item', 'numbered_item', 'todo_item'];

/**
 * How close (px) the cursor must be to the top or bottom edge of a block before
 * the insertion line appears. Must not exceed half the minimum block height.
 * 12px works well for single-line blocks (~24px tall with 4px padding each side).
 */
const EDGE_THRESHOLD = 12;

/**
 * Fraction of block width from the RIGHT edge that triggers column-drop mode.
 * When the pointer is in the rightmost 25% during a drag, release creates a
 * column_container instead of reordering.
 */
const COLUMN_EDGE_FRACTION = 0.25;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DocumentEditorProps {
  blocks:               Block[];
  pageId:               string;   // required for useMakeColumns
  readOnly?:            boolean;
  onCreateBlock:        (afterBlockId: string | null, blockType: BlockType, nextBlock?: Block | null) => void;
  onUpdateBlock:        (blockId: string, payload: UpdateBlockPayload) => void;
  onDeleteBlock:        (blockId: string) => void;
  onReorderBlock:       (blockId: string, newOrder: number) => void;
  pendingFocusBlockId?: string | null;
  onFocusHandled?:      () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function DocumentEditor({
  blocks,
  pageId,
  readOnly = false,
  onCreateBlock,
  onUpdateBlock,
  onDeleteBlock,
  onReorderBlock,
  pendingFocusBlockId,
  onFocusHandled,
}: DocumentEditorProps) {

  // ── Column layout mutation ────────────────────────────────────────────────
  const makeColumns = useMakeColumns(pageId);

  // ── Focus / selection state ───────────────────────────────────────────────
  const [focusedId,  setFocusedId]  = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusEndId, setFocusEndId] = useState<string | null>(null);

  const focusEndIdRef = useRef<string | null>(null);
  useEffect(() => { focusEndIdRef.current = focusEndId; }, [focusEndId]);

  // ── Insertion indicator state ─────────────────────────────────────────────
  // insertHoverId: block whose edge the cursor is near
  // insertHalf:    'top' = near top edge, 'bottom' = near bottom edge
  const [insertHoverId, setInsertHoverId] = useState<string | null>(null);
  const [insertHalf,    setInsertHalf]    = useState<'top' | 'bottom'>('bottom');

  // ── Slash menu state ──────────────────────────────────────────────────────
  const [slashOpen,    setSlashOpen]    = useState(false);
  const [slashItems,   setSlashItems]   = useState<SlashCommandItem[]>([]);
  const [slashRect,    setSlashRect]    = useState<DOMRect | null>(null);
  const [slashCommand, setSlashCommand] = useState<((item: SlashCommandItem) => void) | null>(null);
  const slashMenuRef = useRef<SlashMenuHandle>(null);

  const focusedIdRef  = useRef<string | null>(null);
  useEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);

  // Tracks the latest editor text for each block (updated immediately, no debounce).
  // handleSlashSelect reads this to write the post-'/' text into the block_type
  // update payload so the '/' never persists in the cache even if the debounce
  // hasn't flushed yet.
  const currentTextRef = useRef<Map<string, string>>(new Map());

  // ── Pointer drag state ────────────────────────────────────────────────────
  const [dragOverId,  setDragOverId]  = useState<string | null>(null);
  const [dragPos,     setDragPos]     = useState<'top' | 'bottom'>('bottom');
  const [dropMode,    setDropMode]    = useState<'reorder' | 'column'>('reorder');
  const [isDragging,  setIsDragging]  = useState(false);

  const dragSourceIdRef = useRef<string | null>(null);
  const dragOverIdRef   = useRef<string | null>(null);
  const dragPosRef      = useRef<'top' | 'bottom'>('bottom');
  const dropModeRef     = useRef<'reorder' | 'column'>('reorder');
  const isDraggingRef   = useRef(false);
  const sortedBlocksRef = useRef<Block[]>([]);
  const deletingIdsRef  = useRef<Set<string>>(new Set());

  // ── Block lists ───────────────────────────────────────────────────────────
  // allBlocks: all doc_visible non-deleted blocks, sorted by order.
  //   ColumnContainerBlock uses this to find column + grandchild blocks by parent id.
  // sortedBlocks: top-level only (parent === null).
  //   Used to render the document's root block list and for insertion/reorder logic.
  const allBlocks = [...blocks]
    .filter((b) => b.doc_visible && !b.is_deleted)
    .sort((a, b) => a.order - b.order);

  const sortedBlocks = allBlocks.filter((b) => b.parent === null);

  sortedBlocksRef.current = sortedBlocks;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FOCUS NEW BLOCK AFTER ENTER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    if (!pendingFocusBlockId) return;
    const newBlock = sortedBlocks.find((b) => b.id === pendingFocusBlockId);
    if (newBlock) {
      setFocusedId(newBlock.id);
      setSelectedId(newBlock.id);
      onFocusHandled?.();
    }
  }, [sortedBlocks, pendingFocusBlockId, onFocusHandled]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLASH MENU — event bus wiring
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    const onOpen = (data: { items: SlashCommandItem[]; rect: DOMRect | null; command: (item: SlashCommandItem) => void }) => {
      setSlashItems(data.items);
      setSlashRect(data.rect);
      setSlashCommand(() => data.command);
      setSlashOpen(true);
    };
    const onUpdate = (data: { items: SlashCommandItem[]; rect: DOMRect | null; command: (item: SlashCommandItem) => void }) => {
      setSlashItems(data.items);
      setSlashRect(data.rect);
      setSlashCommand(() => data.command);
    };
    const onKeydown = (data: { event: KeyboardEvent }) => {
      slashMenuRef.current?.onKeyDown(data.event);
    };
    const onClose = () => setSlashOpen(false);

    slashEventBus.on('slash:open',    onOpen);
    slashEventBus.on('slash:update',  onUpdate);
    slashEventBus.on('slash:keydown', onKeydown);
    slashEventBus.on('slash:close',   onClose);
    return () => {
      slashEventBus.off('slash:open',    onOpen);
      slashEventBus.off('slash:update',  onUpdate);
      slashEventBus.off('slash:keydown', onKeydown);
      slashEventBus.off('slash:close',   onClose);
    };
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLASH COMMAND SELECTION HANDLER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleSlashSelect = useCallback((item: SlashCommandItem, tiptapCommand: ((item: SlashCommandItem) => void) | null) => {
    // tiptapCommand deletes the '/' range inside TipTap synchronously.
    // We capture the text AFTER deletion from currentTextRef so the optimistic
    // cache update includes clean content (no '/' left over from debounce lag).
    tiptapCommand?.(item);
    setSlashOpen(false);

    if (!item.blockType) return;

    const currentId = focusedIdRef.current;
    if (item.blockType === 'divider') {
      onCreateBlock(currentId, 'divider' as BlockType);
    } else if (currentId) {
      // Include the current clean text so the cache write clears the '/' trigger
      // even if the 300ms debounce save hasn't fired yet.
      const cleanText = currentTextRef.current.get(currentId) ?? '';
      onUpdateBlock(currentId, {
        block_type: item.blockType as BlockType,
        content:    { text: cleanText, marks: [] },
      });
    }
  }, [onCreateBlock, onUpdateBlock]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK HANDLERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleEnter = useCallback((blockId: string) => {
    const currentIdx   = sortedBlocks.findIndex((b) => b.id === blockId);
    const currentBlock = sortedBlocks[currentIdx] ?? null;
    const nextBlock    = sortedBlocks[currentIdx + 1] ?? null;

    const isListType = LIST_TYPES.includes(currentBlock?.block_type as BlockType);
    const newType    = isListType
      ? (currentBlock?.block_type ?? 'paragraph') as BlockType
      : 'paragraph';

    onCreateBlock(blockId, newType, nextBlock);
  }, [onCreateBlock, sortedBlocks]);

  const handleDelete = useCallback((blockId: string) => {
    if (deletingIdsRef.current.has(blockId)) return;
    deletingIdsRef.current.add(blockId);

    const idx = sortedBlocks.findIndex((b) => b.id === blockId);
    onDeleteBlock(blockId);
    if (idx > 0) {
      const prevId = sortedBlocks[idx - 1].id;
      setSelectedId(prevId);
      setFocusEndId(prevId);
    }

    setTimeout(() => { deletingIdsRef.current.delete(blockId); }, 2000);
  }, [onDeleteBlock, sortedBlocks]);

  const handleConvertToParagraph = useCallback((blockId: string) => {
    onUpdateBlock(blockId, { block_type: 'paragraph' });
    setFocusEndId(blockId);
  }, [onUpdateBlock]);

  const handleSave = useCallback((blockId: string, content: Record<string, unknown>) => {
    onUpdateBlock(blockId, { content: content as BlockContent });
  }, [onUpdateBlock]);

  const handleFocus = useCallback((blockId: string) => {
    setFocusedId(blockId);
    setSelectedId(blockId);
    if (focusEndIdRef.current === blockId) {
      setTimeout(() => setFocusEndId(null), 100);
    }
  }, []);

  const handleBlur = useCallback((blockId: string) => {
    setFocusedId((prev) => (prev === blockId ? null : prev));
  }, []);

  const handleSlash = useCallback((_blockId: string, _query: string) => {
    // Handled by SlashCommand extension + slashEventBus
  }, []);

  const handleTextChange = useCallback((blockId: string, text: string) => {
    currentTextRef.current.set(blockId, text);
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POINTER DRAG — global document listeners
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    if (!isDragging) return;

    function onMove(e: PointerEvent) {
      if (!isDraggingRef.current) return;

      const el      = document.elementFromPoint(e.clientX, e.clientY);
      const blockEl = el?.closest('[data-blockid]') as HTMLElement | null;
      const overId  = blockEl?.dataset['blockid'] ?? null;

      if (overId && overId !== dragSourceIdRef.current) {
        const rect = blockEl!.getBoundingClientRect();

        // Detect right-edge drop zone (rightmost COLUMN_EDGE_FRACTION of width)
        const isRightEdge = e.clientX > rect.right - rect.width * COLUMN_EDGE_FRACTION;
        const mode: 'reorder' | 'column' = isRightEdge ? 'column' : 'reorder';
        dropModeRef.current = mode;
        setDropMode(mode);

        const pos: 'top' | 'bottom' = e.clientY < rect.top + rect.height / 2
          ? 'top' : 'bottom';
        dragOverIdRef.current = overId;
        dragPosRef.current    = pos;
        setDragOverId(overId);
        setDragPos(pos);
      } else if (!overId) {
        dragOverIdRef.current = null;
        setDragOverId(null);
      }
    }

    function onUp() {
      isDraggingRef.current = false;
      setIsDragging(false);

      const sourceId = dragSourceIdRef.current;
      const targetId = dragOverIdRef.current;
      const pos      = dragPosRef.current;
      const mode     = dropModeRef.current;

      dragSourceIdRef.current = null;
      dragOverIdRef.current   = null;
      dropModeRef.current     = 'reorder';
      setDragOverId(null);
      setDropMode('reorder');

      if (!sourceId || !targetId || targetId === sourceId) return;

      // ── Column drop: merge into column_container ──────────────────────────
      if (mode === 'column') {
        makeColumns.mutate({ sourceId, targetId });
        return;
      }

      // ── Normal reorder ────────────────────────────────────────────────────
      const sb        = sortedBlocksRef.current;
      const targetIdx = sb.findIndex((b) => b.id === targetId);
      if (targetIdx === -1) return;

      let newOrder: number;
      if (pos === 'top') {
        const prev = sb[targetIdx - 1];
        newOrder = prev
          ? (prev.order + sb[targetIdx].order) / 2
          : sb[targetIdx].order - 1;
      } else {
        const next = sb[targetIdx + 1];
        newOrder = next
          ? (sb[targetIdx].order + next.order) / 2
          : sb[targetIdx].order + 1;
      }
      onReorderBlock(sourceId, newOrder);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
    };
  }, [isDragging, onReorderBlock, makeColumns]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (sortedBlocks.length === 0) {
    return (
      <div
        className="min-h-32 cursor-text py-2 text-base text-neutral-600 transition-colors hover:text-neutral-500"
        onClick={() => !readOnly && onCreateBlock(null, 'paragraph')}
      >
        Click to start writing…
      </div>
    );
  }

  return (
    <div className="relative w-full pl-10">
      {sortedBlocks.map((block, index) => {
        const isDragOver    = dragOverId === block.id;
        const isColumnDrop  = isDragOver && dropMode === 'column';
        const isReorderDrop = isDragOver && dropMode === 'reorder';
        const showTop       = !readOnly && !isDragging && insertHoverId === block.id && insertHalf === 'top';
        const showBottom    = !readOnly && !isDragging && insertHoverId === block.id && insertHalf === 'bottom';

        return (
          <div
            key={block.id}
            data-blockid={block.id}
            className={[
              'group relative py-1',
              isDragging && dragSourceIdRef.current === block.id ? 'opacity-30' : '',
              isReorderDrop && dragPos === 'top'    ? 'border-t-2 border-violet-500' : '',
              isReorderDrop && dragPos === 'bottom' ? 'border-b-2 border-violet-500' : '',
            ].join(' ')}
            onMouseMove={(e) => {
              if (isDraggingRef.current) return;
              // Only activate near edges — never in the middle content area.
              // This prevents the insertion button from intercepting text clicks.
              const rect        = e.currentTarget.getBoundingClientRect();
              const distToTop   = e.clientY - rect.top;
              const distToBot   = rect.bottom - e.clientY;

              if (distToTop <= EDGE_THRESHOLD) {
                if (insertHoverId !== block.id || insertHalf !== 'top') {
                  setInsertHoverId(block.id);
                  setInsertHalf('top');
                }
              } else if (distToBot <= EDGE_THRESHOLD) {
                if (insertHoverId !== block.id || insertHalf !== 'bottom') {
                  setInsertHoverId(block.id);
                  setInsertHalf('bottom');
                }
              } else if (insertHoverId === block.id) {
                // Cursor moved away from both edges — clear immediately
                setInsertHoverId(null);
              }
            }}
            onMouseLeave={() => {
              if (insertHoverId === block.id) setInsertHoverId(null);
            }}
          >

            {/* ── Column-drop right-edge indicator ───────────────────────────
                Violet vertical bar on the right edge, visible during a drag
                when the pointer is in the rightmost 25% of the block.
                Signals "release here to create a column layout".
            ──────────────────────────────────────────────────────────────── */}
            {isColumnDrop && (
              <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-20
                              w-0.5 rounded-full bg-violet-500 shadow-[0_0_6px_2px_rgba(139,92,246,0.4)]" />
            )}

            {/* ── TOP insertion line ──────────────────────────────────────────
                Centered on the TOP edge (top-0 -translate-y-1/2) so half the
                hit zone is in the gap ABOVE this block, half is in this block's
                top padding. Never overlaps the content area.
                pointer-events-none on children so only the button itself is
                clickable — the visual circle/line are decorative overflow.
            ──────────────────────────────────────────────────────────────── */}
            {showTop && (
              <button
                type="button"
                aria-label="Add block above"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx  = sortedBlocks.findIndex((b) => b.id === block.id);
                  const prev = sortedBlocks[idx - 1] ?? null;
                  onCreateBlock(prev?.id ?? null, 'paragraph', block);
                  setInsertHoverId(null);
                }}
                className="absolute left-0 right-0 top-0 z-20
                           h-3 -translate-y-1/2 outline-none
                           flex cursor-pointer items-center
                           animate-fade-in"
              >
                {/* + circle */}
                <span
                  className="pointer-events-none relative z-10 flex h-4.5 w-4.5 shrink-0
                             -translate-x-2 items-center justify-center
                             rounded-full border-2 border-violet-500
                             bg-neutral-950 text-[11px] font-bold leading-none
                             text-violet-400 shadow-sm shadow-violet-900/40
                             transition-transform duration-100 hover:scale-110"
                >+</span>
                {/* Horizontal line */}
                <span className="pointer-events-none h-px flex-1 rounded-full bg-violet-500/60" />
              </button>
            )}

            {/* ── BOTTOM insertion line ───────────────────────────────────────
                Centered on the BOTTOM edge (bottom-0 translate-y-1/2).
            ──────────────────────────────────────────────────────────────── */}
            {showBottom && (
              <button
                type="button"
                aria-label="Add block below"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx  = sortedBlocks.findIndex((b) => b.id === block.id);
                  const next = sortedBlocks[idx + 1] ?? null;
                  onCreateBlock(block.id, 'paragraph', next);
                  setInsertHoverId(null);
                }}
                className="absolute left-0 right-0 bottom-0 z-20
                           h-3 translate-y-1/2 outline-none
                           flex cursor-pointer items-center
                           animate-fade-in"
              >
                <span
                  className="pointer-events-none relative z-10 flex h-4.5 w-4.5 shrink-0
                             -translate-x-2 items-center justify-center
                             rounded-full border-2 border-violet-500
                             bg-neutral-950 text-[11px] font-bold leading-none
                             text-violet-400 shadow-sm shadow-violet-900/40
                             transition-transform duration-100 hover:scale-110"
                >+</span>
                <span className="pointer-events-none h-px flex-1 rounded-full bg-violet-500/60" />
              </button>
            )}

            {/* ── Left gutter (drag handle) ──────────────────────────────────
                Appears on group-hover. Only the drag handle lives here now —
                insertion is handled by the edge-proximity insertion lines above.
            ──────────────────────────────────────────────────────────────── */}
            {!readOnly && (
              <div
                className={[
                  'absolute -left-8 top-1/2 -translate-y-1/2',
                  'flex items-center',
                  'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                  'select-none',
                ].join(' ')}
              >
                <div
                  className="flex h-6 w-6 cursor-grab items-center justify-center
                             rounded-md border border-transparent text-xs
                             text-neutral-600 transition-all duration-150
                             hover:border-neutral-700 hover:bg-neutral-800
                             hover:text-neutral-300 active:cursor-grabbing"
                  title="Drag to reorder — drag to right edge of another block to create columns"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setInsertHoverId(null);
                    dragSourceIdRef.current = block.id;
                    isDraggingRef.current   = true;
                    setIsDragging(true);
                  }}
                >
                  ⠿
                </div>
              </div>
            )}

            {/* ── Block content ──────────────────────────────────────────── */}
            <BlockRenderer
              block={block}
              index={index}
              allBlocks={allBlocks}
              onSave={handleSave}
              onEnter={handleEnter}
              onDelete={handleDelete}
              onConvertToParagraph={handleConvertToParagraph}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onSlash={handleSlash}
              onTextChange={handleTextChange}
              isSelected={selectedId === block.id}
              autoFocus={focusedId === block.id}
              focusAtEnd={focusEndId === block.id}
              readOnly={readOnly}
            />
          </div>
        );
      })}

      {/* ── Add-block affordance at end ───────────────────────────────────── */}
      {!readOnly && (
        <div
          className="mt-2 cursor-text py-4 text-sm text-neutral-700
                     transition-colors hover:text-neutral-500"
          onClick={() => {
            const last = sortedBlocks[sortedBlocks.length - 1];
            onCreateBlock(last?.id ?? null, 'paragraph');
          }}
        >
          + Add a block
        </div>
      )}

      {/* ── Slash command menu portal ─────────────────────────────────────── */}
      {slashOpen && slashRect && (
        <SlashMenuPortal rect={slashRect}>
          <SlashMenuList
            ref={slashMenuRef}
            items={slashItems}
            command={(item) => handleSlashSelect(item, slashCommand)}
          />
        </SlashMenuPortal>
      )}
    </div>
  );
}
