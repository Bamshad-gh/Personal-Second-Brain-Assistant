/**
 * components/blocks/ColumnContainerBlock.tsx
 *
 * What:    Renders a column_container block — two (or more) columns side-by-side
 *          with a draggable divider to resize proportions.
 *
 * Data model:
 *   column_container  block.content = { widths: [50, 50] }
 *     └── column      (child, order 1.0)
 *           └── any doc block (grandchild)
 *     └── column      (child, order 2.0)
 *           └── any doc block (grandchild)
 *
 * Block interactions inside columns:
 *   Each block inside a column has:
 *     - data-blockid  attribute so DocumentEditor's global pointermove can
 *       target it for drag-and-drop (including dragging OUT of the column).
 *     - Edge-proximity insertion lines (same 12px EDGE_THRESHOLD as DocumentEditor).
 *     - A left gutter with a ⠿ drag handle that calls onBlockDragStart, which
 *       starts DocumentEditor's pointer-capture drag state.
 *     - Drop indicator (border-t-2 / border-b-2) when DocumentEditor reports
 *       this block as the drag-over target.
 *
 * Drag out of column:
 *   DocumentEditor's global pointermove finds column-internal blocks via
 *   data-blockid. On pointerup, if source.parent !== target.parent, it calls
 *   onUpdateBlock(sourceId, { parent: targetParent, order }) to move the
 *   block atomically. No extra endpoint needed.
 *
 * Divider resize:
 *   setPointerCapture on the divider so dragging outside the element works.
 *   Width delta applied live; onSave fires on pointerUp.
 *
 * Adding blocks inside a column:
 *   Insertion buttons call onBlockCreate(afterBlockId, 'paragraph', nextBlock, col.id).
 *   DocumentEditor's handleCreateBlockInColumn forwards this to onCreateBlock
 *   with parentId = col.id so the new block lands inside the column.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import type { Block, BlockType }         from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EDGE_THRESHOLD = 12; // px — same as DocumentEditor

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Lazy type to break circular import (BlockRenderer imports this file)
type BlockRendererType = React.ComponentType<import('./BlockRenderer').BlockRendererProps>;

export interface ColumnContainerBlockProps {
  block:      Block;
  allBlocks:  Block[];
  onSave:     (content: Record<string, unknown>) => void;

  // ── Pass-through props for nested BlockRenderers ──────────────────────────
  onBlockSave:               (blockId: string, content: Record<string, unknown>) => void;
  onBlockEnter:              (blockId: string) => void;
  onBlockDelete:             (blockId: string) => void;
  onBlockConvertToParagraph: (blockId: string) => void;
  onBlockFocus:              (blockId: string) => void;
  onBlockBlur:               (blockId: string) => void;
  onBlockSlash:              (blockId: string, query: string) => void;
  onBlockTextChange:         (blockId: string, text: string) => void;
  selectedBlockId:           string | null;
  readOnly?:                 boolean;

  // Injected by BlockRenderer to break circular static import
  BlockRenderer:             BlockRendererType;

  // ── Column interaction props (from DocumentEditor via BlockRenderer) ───────
  onBlockCreate?:       (afterBlockId: string | null, blockType: BlockType, nextBlock: Block | null, columnId: string) => void;
  onBlockDragStart?:    (blockId: string) => void;
  onBlockContextMenu?:  (blockId: string, anchor: HTMLElement) => void;
  isDragging?:          boolean;
  dragOverBlockId?:     string | null;
  dragOverPos?:         'top' | 'bottom';
  focusedBlockId?:      string | null;
  focusAtEndBlockId?:   string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ColumnContainerBlock({
  block,
  allBlocks,
  onSave,
  onBlockSave,
  onBlockEnter,
  onBlockDelete,
  onBlockConvertToParagraph,
  onBlockFocus,
  onBlockBlur,
  onBlockSlash,
  onBlockTextChange,
  selectedBlockId,
  readOnly = false,
  BlockRenderer,
  onBlockCreate,
  onBlockDragStart,
  onBlockContextMenu,
  isDragging        = false,
  dragOverBlockId   = null,
  dragOverPos       = 'bottom',
  focusedBlockId    = null,
  focusAtEndBlockId = null,
}: ColumnContainerBlockProps) {

  // ── Column children (sorted by order) ────────────────────────────────────
  const columns = allBlocks
    .filter((b) => b.parent === block.id && b.block_type === 'column' && !b.is_deleted)
    .sort((a, b) => a.order - b.order);

  // ── Widths state ──────────────────────────────────────────────────────────
  const rawWidths = Array.isArray(block.content.widths)
    ? (block.content.widths as number[])
    : columns.map(() => 100 / Math.max(columns.length, 1));

  const [widths, setWidths] = useState<number[]>(rawWidths);

  // Sync when server invalidates
  const lastWidthsKey = useRef(rawWidths.join(','));
  const currentKey    = rawWidths.join(',');
  if (lastWidthsKey.current !== currentKey) {
    lastWidthsKey.current = currentKey;
    setWidths(rawWidths);
  }

  // ── Column-internal insertion indicator ──────────────────────────────────
  // One shared state for the whole container — only one block can be near-edge
  // at any time.
  const [colInsertHoverId, setColInsertHoverId] = useState<string | null>(null);
  const [colInsertHalf,    setColInsertHalf]    = useState<'top' | 'bottom'>('bottom');

  // ── Divider drag ──────────────────────────────────────────────────────────
  const containerRef      = useRef<HTMLDivElement>(null);
  const dividerIndexRef   = useRef<number | null>(null);
  const dividerStartXRef  = useRef<number>(0);
  const dividerStartWidths = useRef<number[]>([]);

  const onDividerPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (readOnly) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dividerIndexRef.current    = idx;
    dividerStartXRef.current   = e.clientX;
    dividerStartWidths.current = [...widths];
  }, [readOnly, widths]);

  const onDividerPointerMove = useCallback((e: React.PointerEvent) => {
    if (dividerIndexRef.current === null || !containerRef.current) return;
    const containerWidth = containerRef.current.getBoundingClientRect().width;
    if (!containerWidth) return;

    const deltaX   = e.clientX - dividerStartXRef.current;
    const deltaPct = (deltaX / containerWidth) * 100;
    const idx      = dividerIndexRef.current;
    const MIN      = 10;

    const next = [...dividerStartWidths.current];
    next[idx]     = Math.max(MIN, dividerStartWidths.current[idx]     + deltaPct);
    next[idx + 1] = Math.max(MIN, dividerStartWidths.current[idx + 1] - deltaPct);

    const total   = next[idx] + next[idx + 1];
    next[idx]     = Math.min(total - MIN, next[idx]);
    next[idx + 1] = total - next[idx];

    setWidths(next);
  }, []);

  const onDividerPointerUp = useCallback((e: React.PointerEvent) => {
    if (dividerIndexRef.current === null) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dividerIndexRef.current = null;
    setWidths((cur) => {
      onSave({ widths: cur });
      return cur;
    });
  }, [onSave]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (columns.length === 0) {
    return (
      <div className="my-1 rounded border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-600">
        [empty column container]
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="col-container-bg flex w-full items-stretch gap-0 my-2 rounded-lg"
    >
      {columns.map((col, colIdx) => {
        const colWidth  = widths[colIdx] ?? (100 / columns.length);
        const colBlocks = allBlocks
          .filter((b) => b.parent === col.id && b.doc_visible && !b.is_deleted)
          .sort((a, b) => a.order - b.order);

        return (
          <div key={col.id} className="flex items-stretch" style={{ width: `${colWidth}%` }}>

            {/* ── Column content area ───────────────────────────────────────── */}
            <div className="flex-1 min-w-0 px-3 py-2 flex flex-col">

              {/* Blocks inside this column */}
              {colBlocks.map((childBlock, idx) => {
                const isColDragOver = dragOverBlockId === childBlock.id;
                const showInsert    = !readOnly && !isDragging
                  && colInsertHoverId === childBlock.id && colInsertHalf === 'bottom';

                return (
                  <div
                    key={childBlock.id}
                    data-blockid={childBlock.id}
                    className={[
                      'group/colblock relative flex items-start py-0.5',
                      isColDragOver && dragOverPos === 'top'    ? 'border-t-2 border-violet-500' : '',
                      isColDragOver && dragOverPos === 'bottom' ? 'border-b-2 border-violet-500' : '',
                    ].join(' ')}
                    style={(childBlock.bg_color || childBlock.text_color) ? {
                      ...(childBlock.bg_color   ? { backgroundColor: childBlock.bg_color, borderRadius: '4px' } : {}),
                      ...(childBlock.text_color ? { color: childBlock.text_color } : {}),
                    } : undefined}
                    onMouseMove={(e) => {
                      if (isDragging) return;
                      const rect      = e.currentTarget.getBoundingClientRect();
                      const distToBot = rect.bottom - e.clientY;

                      if (distToBot <= EDGE_THRESHOLD) {
                        if (colInsertHoverId !== childBlock.id || colInsertHalf !== 'bottom') {
                          setColInsertHoverId(childBlock.id);
                          setColInsertHalf('bottom');
                        }
                      } else if (colInsertHoverId === childBlock.id) {
                        setColInsertHoverId(null);
                      }
                    }}
                    onMouseLeave={() => {
                      if (colInsertHoverId === childBlock.id) setColInsertHoverId(null);
                    }}
                  >
                    {/* ── Drag handle — inline, left of content ────────────── */}
                    {!readOnly && (onBlockDragStart || onBlockContextMenu) && (
                      <div
                        className="block-drag-handle mt-0.5 mr-1 flex h-5 w-4 shrink-0
                                   cursor-grab select-none items-center justify-center rounded
                                   text-[11px] text-neutral-600
                                   opacity-0 transition-all duration-150
                                   group-hover/colblock:opacity-100
                                   hover:bg-neutral-700/60 hover:text-neutral-300
                                   active:cursor-grabbing"
                        title="Drag · Click for options"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onBlockDragStart?.(childBlock.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBlockContextMenu?.(childBlock.id, e.currentTarget as HTMLElement);
                        }}
                      >⠿</div>
                    )}

                    {/* ── Block content ────────────────────────────────────── */}
                    <div className="min-w-0 flex-1">
                      <BlockRenderer
                        block={childBlock}
                        index={idx}
                        allBlocks={allBlocks}
                        onSave={onBlockSave}
                        onEnter={onBlockEnter}
                        onDelete={onBlockDelete}
                        onConvertToParagraph={onBlockConvertToParagraph}
                        onFocus={onBlockFocus}
                        onBlur={onBlockBlur}
                        onSlash={onBlockSlash}
                        onTextChange={onBlockTextChange}
                        isSelected={selectedBlockId === childBlock.id}
                        autoFocus={focusedBlockId === childBlock.id}
                        focusAtEnd={focusAtEndBlockId === childBlock.id}
                        readOnly={readOnly}
                        onBlockCreate={onBlockCreate}
                        onBlockDragStart={onBlockDragStart}
                        isDragging={isDragging}
                        dragOverBlockId={dragOverBlockId}
                        dragOverPos={dragOverPos}
                        focusedBlockId={focusedBlockId}
                        focusAtEndBlockId={focusAtEndBlockId}
                      />
                    </div>

                    {/* ── Bottom insertion line (hover near bottom edge) ────── */}
                    {showInsert && (
                      <button
                        type="button"
                        aria-label="Add block below"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = colBlocks[idx + 1] ?? null;
                          onBlockCreate?.(childBlock.id, 'paragraph', next, col.id);
                          setColInsertHoverId(null);
                        }}
                        className="pointer-events-auto absolute bottom-0 left-0 right-0 z-20
                                   h-3 translate-y-1/2 flex cursor-pointer items-center
                                   outline-none animate-fade-in"
                      >
                        <span className="pointer-events-none relative z-10 flex h-4 w-4 shrink-0
                                         items-center justify-center rounded-full border-2
                                         border-violet-500 bg-neutral-950 text-[10px] font-bold
                                         leading-none text-violet-400">+</span>
                        <span className="pointer-events-none h-px flex-1 rounded-full bg-violet-500/50" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* ── Empty column: click-anywhere to add first block ───────────── */}
              {colBlocks.length === 0 && !readOnly && onBlockCreate && (
                <div
                  className="flex flex-1 min-h-12 cursor-pointer items-center justify-center
                             rounded border border-dashed border-neutral-800 text-xs
                             text-neutral-700 select-none transition-colors
                             hover:border-violet-500/30 hover:text-violet-600/70"
                  onClick={() => onBlockCreate(null, 'paragraph', null, col.id)}
                >
                  <span className="text-base leading-none mr-1">+</span> Write something
                </div>
              )}

              {/* ── Click below last block to append ─────────────────────────── */}
              {colBlocks.length > 0 && !readOnly && onBlockCreate && (
                <div
                  className="mt-0.5 min-h-4 flex-1 cursor-text"
                  onClick={() => {
                    const last = colBlocks[colBlocks.length - 1];
                    onBlockCreate(last?.id ?? null, 'paragraph', null, col.id);
                  }}
                />
              )}
            </div>

            {/* ── Resize divider (between columns, not after last) ──────────── */}
            {colIdx < columns.length - 1 && (
              <div
                className={[
                  'w-1.5 shrink-0 relative group/divider',
                  readOnly ? 'cursor-default' : 'cursor-col-resize',
                ].join(' ')}
                onPointerDown={(e) => onDividerPointerDown(e, colIdx)}
                onPointerMove={onDividerPointerMove}
                onPointerUp={onDividerPointerUp}
              >
                <div className={[
                  'absolute inset-y-3 left-1/2 -translate-x-1/2 w-px rounded-full',
                  'bg-neutral-700/60 transition-all duration-150',
                  !readOnly
                    ? 'group-hover/divider:w-0.75 group-hover/divider:bg-violet-500/60 group-hover/divider:shadow-[0_0_6px_rgba(139,92,246,0.35)]'
                    : '',
                ].join(' ')} />
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
