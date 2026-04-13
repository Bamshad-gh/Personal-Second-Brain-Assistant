/**
 * components/blocks/ColumnContainerBlock.tsx
 *
 * What:    Renders a column_container block — two (or more) columns side-by-side
 *          with a draggable divider to resize proportions.
 *
 * Data model:
 *   column_container  block.content = { widths: [50, 50] }   (percentages, sum = 100)
 *     └── column      (child, order 1.0)
 *           └── any doc block (grandchild)
 *     └── column      (child, order 2.0)
 *           └── any doc block (grandchild)
 *
 * Resize:
 *   Pointer is captured on the divider (setPointerCapture) so dragging outside
 *   the element still works. Width delta is applied live via local state.
 *   onSave is called on pointerUp with the final widths array.
 *
 * Recursive rendering:
 *   Each column's child blocks are filtered from allBlocks (b.parent === col.id)
 *   and rendered via BlockRenderer — the same component used at the top level.
 *   This means columns support all block types including nested column_containers.
 *
 * Props passed through to inner BlockRenderers are the same callbacks that
 * DocumentEditor wires up, so saves/deletes/enter/slash all work normally
 * inside columns.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import type { Block }                    from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Lazy import type to avoid circular dependency (BlockRenderer imports this file)
type BlockRendererType = React.ComponentType<import('./BlockRenderer').BlockRendererProps>;

export interface ColumnContainerBlockProps {
  block:       Block;      // the column_container block
  allBlocks:   Block[];    // ALL page blocks — used to find column + grandchild blocks
  onSave:      (content: Record<string, unknown>) => void;

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

  // Injected by BlockRenderer to avoid circular static import
  BlockRenderer:             BlockRendererType;
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
}: ColumnContainerBlockProps) {

  // ── Column children (sorted by order) ────────────────────────────────────
  const columns = allBlocks
    .filter((b) => b.parent === block.id && b.block_type === 'column' && !b.is_deleted)
    .sort((a, b) => a.order - b.order);

  // ── Widths state — initialised from block.content.widths ─────────────────
  const rawWidths = Array.isArray(block.content.widths)
    ? (block.content.widths as number[])
    : columns.map(() => 100 / Math.max(columns.length, 1));

  const [widths, setWidths] = useState<number[]>(rawWidths);

  // Sync widths when block prop changes (e.g. after server invalidation)
  const prevWidthsKey = rawWidths.join(',');
  const lastSyncedKey = useRef(prevWidthsKey);
  if (lastSyncedKey.current !== prevWidthsKey) {
    lastSyncedKey.current = prevWidthsKey;
    setWidths(rawWidths);
  }

  // ── Divider drag ──────────────────────────────────────────────────────────
  const containerRef   = useRef<HTMLDivElement>(null);
  const dragIndexRef   = useRef<number | null>(null);   // index of divider being dragged
  const dragStartXRef  = useRef<number>(0);
  const dragStartWidths = useRef<number[]>([]);

  const onDividerPointerDown = useCallback((e: React.PointerEvent, dividerIndex: number) => {
    if (readOnly) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragIndexRef.current    = dividerIndex;
    dragStartXRef.current   = e.clientX;
    dragStartWidths.current = [...widths];
  }, [readOnly, widths]);

  const onDividerPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIndexRef.current === null || !containerRef.current) return;
    const containerWidth = containerRef.current.getBoundingClientRect().width;
    if (!containerWidth) return;

    const deltaX    = e.clientX - dragStartXRef.current;
    const deltaPct  = (deltaX / containerWidth) * 100;
    const idx       = dragIndexRef.current;

    const newWidths = [...dragStartWidths.current];
    const MIN_WIDTH = 10; // minimum column width in percent

    newWidths[idx]     = Math.max(MIN_WIDTH, dragStartWidths.current[idx]     + deltaPct);
    newWidths[idx + 1] = Math.max(MIN_WIDTH, dragStartWidths.current[idx + 1] - deltaPct);

    // Clamp so sum stays 100
    const total = newWidths[idx] + newWidths[idx + 1];
    newWidths[idx]     = Math.min(total - MIN_WIDTH, newWidths[idx]);
    newWidths[idx + 1] = total - newWidths[idx];

    setWidths(newWidths);
  }, []);

  const onDividerPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragIndexRef.current === null) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragIndexRef.current = null;

    // Persist the new widths to the backend
    setWidths((current) => {
      onSave({ widths: current });
      return current;
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
      className="flex w-full items-stretch gap-0 my-1"
    >
      {columns.map((col, colIdx) => {
        const colWidth = widths[colIdx] ?? (100 / columns.length);

        // Blocks that live directly inside this column
        const colBlocks = allBlocks
          .filter((b) => b.parent === col.id && b.doc_visible && !b.is_deleted)
          .sort((a, b) => a.order - b.order);

        return (
          <div key={col.id} className="flex items-stretch gap-0" style={{ width: `${colWidth}%` }}>

            {/* ── Column content ─────────────────────────────────────────── */}
            <div className="flex-1 min-w-0 px-2 py-1">
              {colBlocks.length === 0 ? (
                <div className="min-h-[2rem] rounded border border-dashed border-neutral-800
                                text-xs text-neutral-700 flex items-center justify-center
                                select-none">
                  empty column
                </div>
              ) : (
                colBlocks.map((childBlock, idx) => (
                  <BlockRenderer
                    key={childBlock.id}
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
                    readOnly={readOnly}
                  />
                ))
              )}
            </div>

            {/* ── Resize divider (between columns, not after last) ──────── */}
            {colIdx < columns.length - 1 && (
              <div
                className={[
                  'w-1 flex-shrink-0 relative group/divider',
                  readOnly ? 'cursor-default' : 'cursor-col-resize',
                ].join(' ')}
                onPointerDown={(e) => onDividerPointerDown(e, colIdx)}
                onPointerMove={onDividerPointerMove}
                onPointerUp={onDividerPointerUp}
              >
                {/* Visible track — thin line, widens on hover */}
                <div className={[
                  'absolute inset-y-0 left-1/2 -translate-x-1/2 w-px',
                  'bg-neutral-700 transition-all duration-150',
                  !readOnly && 'group-hover/divider:w-1 group-hover/divider:bg-violet-500/60',
                ].join(' ')} />
                {/* Wider invisible hit area so grabbing is easy */}
                <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
