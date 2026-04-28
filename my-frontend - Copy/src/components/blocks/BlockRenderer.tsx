/**
 * components/blocks/BlockRenderer.tsx
 *
 * What:    Routes a block's block_type to the correct renderer component.
 *          This is the single place that maps types to renderers.
 *
 * HOW TO ADD A NEW BLOCK TYPE RENDERER:
 *   1. Create MyBlock.tsx in this folder
 *   2. Import it here
 *   3. Add a case to the switch statement below
 *   Nothing else needs to change.
 *
 * Unknown types:
 *   Any block_type not yet implemented renders a placeholder pill instead
 *   of crashing the editor. This allows the backend registry to grow ahead
 *   of the frontend without breaking existing pages.
 *
 * Column layout:
 *   column_container → renders ColumnContainerBlock (passes itself as BlockRenderer
 *                      to avoid a circular static import)
 *   column           → returns null (rendered inside ColumnContainerBlock, not top-level)
 *
 * Column pass-through props (optional, only used by column_container):
 *   onBlockCreate    — create a block inside a column (passes parentId = columnId)
 *   onBlockDragStart — start a drag from inside a column (sets DocumentEditor state)
 *   isDragging       — whether any block is being dragged (disables hover states)
 *   dragOverBlockId  — the block currently being dragged over
 *   dragOverPos      — 'top' | 'bottom' position of drop indicator
 *   focusedBlockId   — which block currently has focus (for autoFocus inside columns)
 *   focusAtEndBlockId— which block should focus at end (for focusAtEnd inside columns)
 */

'use client';

import { TextBlock }             from './TextBlock';
import { CalloutBlock }          from './CalloutBlock';
import { ListBlock }             from './ListBlock';
import { CodeBlock }             from './CodeBlock';
import { MediaBlock }            from './MediaBlock';
import { DividerBlock }          from './DividerBlock';
import { TableBlock }            from './TableBlock';
import { ColumnContainerBlock }  from './ColumnContainerBlock';
import type { Block, BlockType } from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BlockRendererProps {
  block:                  Block;
  index:                  number;
  allBlocks?:             Block[];
  onSave:                 (blockId: string, content: Record<string, unknown>) => void;
  onEnter:                (blockId: string) => void;
  onDelete:               (blockId: string) => void;
  onConvertToParagraph:   (blockId: string) => void;
  onFocus:                (blockId: string) => void;
  onBlur:                 (blockId: string) => void;
  onSlash:                (blockId: string, query: string) => void;
  onTextChange:           (blockId: string, text: string) => void;
  isSelected:             boolean;
  autoFocus?:             boolean;
  focusAtEnd?:            boolean;
  readOnly?:              boolean;

  // ── Column pass-through props (optional) ─────────────────────────────────
  // Populated by DocumentEditor; forwarded to ColumnContainerBlock.
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

export function BlockRenderer({
  block,
  index,
  allBlocks = [],
  onSave,
  onEnter,
  onDelete,
  onConvertToParagraph,
  onFocus,
  onBlur,
  onSlash,
  onTextChange,
  isSelected,
  autoFocus,
  focusAtEnd,
  readOnly,
  onBlockCreate,
  onBlockDragStart,
  onBlockContextMenu,
  isDragging,
  dragOverBlockId,
  dragOverPos,
  focusedBlockId,
  focusAtEndBlockId,
}: BlockRendererProps) {

  // ── Bind blockId into every callback ─────────────────────────────────────
  const save       = (content: Record<string, unknown>) => onSave(block.id, content);
  const enter      = ()           => onEnter(block.id);
  const del        = ()           => onDelete(block.id);
  const convert    = ()           => onConvertToParagraph(block.id);
  const focus      = ()           => onFocus(block.id);
  const blur       = ()           => onBlur(block.id);
  const slash      = (q: string)  => onSlash(block.id, q);
  const textChange = (t: string)  => onTextChange(block.id, t);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROUTE BY block_type
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  switch (block.block_type) {

    case 'text':
    case 'paragraph':
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'quote':
      return (
        <TextBlock
          block={block}
          onSave={save}
          onEnter={enter}
          onDelete={del}
          onFocus={focus}
          onBlur={blur}
          onSlash={slash}
          onTextChange={textChange}
          isSelected={isSelected}
          autoFocus={autoFocus}
          focusAtEnd={focusAtEnd}
          readOnly={readOnly}
        />
      );

    case 'bullet_item':
    case 'numbered_item':
    case 'todo_item':
      return (
        <ListBlock
          block={block}
          index={index}
          onSave={save}
          onEnter={enter}
          onDelete={del}
          onConvertToParagraph={convert}
          onFocus={focus}
          onBlur={blur}
          onTextChange={textChange}
          autoFocus={autoFocus}
          focusAtEnd={focusAtEnd}
          readOnly={readOnly}
        />
      );

    case 'code':
      return (
        <CodeBlock
          block={block}
          onSave={save}
          onDelete={del}
          readOnly={readOnly}
        />
      );

    case 'image':
    case 'file':
    case 'pdf':
    case 'video':
      return (
        <MediaBlock
          block={block}
          onSave={save}
          onDelete={del}
          readOnly={readOnly}
        />
      );

    case 'callout':
      return (
        <CalloutBlock
          block={block}
          onSave={save}
          onEnter={enter}
          onDelete={del}
          onFocus={focus}
          onBlur={blur}
          onTextChange={textChange}
          isSelected={isSelected}
          autoFocus={autoFocus}
          focusAtEnd={focusAtEnd}
          readOnly={readOnly}
        />
      );

    case 'divider':
      return <DividerBlock />;

    case 'table':
      return (
        <TableBlock
          block={block}
          onSave={save}
          onDelete={del}
          readOnly={readOnly}
        />
      );

    // ── Column container ──────────────────────────────────────────────────────
    // Renders the column layout. Passes itself to ColumnContainerBlock as
    // BlockRenderer to break the circular static import.
    case 'column_container':
      return (
        <ColumnContainerBlock
          block={block}
          allBlocks={allBlocks}
          onSave={save}
          onBlockSave={onSave}
          onBlockEnter={onEnter}
          onBlockDelete={onDelete}
          onBlockConvertToParagraph={onConvertToParagraph}
          onBlockFocus={onFocus}
          onBlockBlur={onBlur}
          onBlockSlash={onSlash}
          onBlockTextChange={onTextChange}
          selectedBlockId={isSelected ? block.id : null}
          readOnly={readOnly}
          BlockRenderer={BlockRenderer}
          // Column interaction props (optional — only present when rendered inside DocumentEditor)
          onBlockCreate={onBlockCreate}
          onBlockDragStart={onBlockDragStart}
          onBlockContextMenu={onBlockContextMenu}
          isDragging={isDragging}
          dragOverBlockId={dragOverBlockId}
          dragOverPos={dragOverPos}
          focusedBlockId={focusedBlockId}
          focusAtEndBlockId={focusAtEndBlockId}
        />
      );

    // ── Column ────────────────────────────────────────────────────────────────
    // Rendered inside ColumnContainerBlock, not at top-level.
    case 'column':
      return null;

    default:
      return (
        <div className="my-1 rounded border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-600">
          [{block.block_type} — renderer coming soon]
        </div>
      );
  }
}
