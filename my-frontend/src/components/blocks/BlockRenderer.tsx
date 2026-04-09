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
 */

'use client';

import { TextBlock }    from './TextBlock';
import { ListBlock }    from './ListBlock';
import { CodeBlock }    from './CodeBlock';
import { MediaBlock }   from './MediaBlock';
import { DividerBlock } from './DividerBlock';
import type { Block }   from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface BlockRendererProps {
  block:                  Block;
  index:                  number;  // position in the block list (used by ListBlock for numbering)
  onSave:                 (blockId: string, content: Record<string, unknown>) => void;
  onEnter:                (blockId: string) => void;
  onDelete:               (blockId: string) => void;
  onConvertToParagraph:   (blockId: string) => void;  // first Backspace on empty list item
  onFocus:                (blockId: string) => void;
  onBlur:                 (blockId: string) => void;
  onSlash:                (blockId: string, query: string) => void;
  isSelected:             boolean;
  autoFocus?:             boolean;
  focusAtEnd?:            boolean;  // focus at end of content (after next block deleted)
  readOnly?:              boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function BlockRenderer({
  block,
  index,
  onSave,
  onEnter,
  onDelete,
  onConvertToParagraph,
  onFocus,
  onBlur,
  onSlash,
  isSelected,
  autoFocus,
  focusAtEnd,
  readOnly,
}: BlockRendererProps) {

  // ── Bind blockId into every callback ─────────────────────────────────────
  const save    = (content: Record<string, unknown>) => onSave(block.id, content);
  const enter   = ()           => onEnter(block.id);
  const del     = ()           => onDelete(block.id);
  const convert = ()           => onConvertToParagraph(block.id);
  const focus   = ()           => onFocus(block.id);
  const blur    = ()           => onBlur(block.id);
  const slash   = (q: string)  => onSlash(block.id, q);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ROUTE BY block_type
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  switch (block.block_type) {

    // ── Text blocks ──────────────────────────────────────────────────────────
    // 'text' is the deprecated alias for 'paragraph' — kept here so existing
    // blocks created before Phase 2 still render correctly.
    case 'text':
    case 'paragraph':
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'quote':
    case 'callout':
      return (
        <TextBlock
          block={block}
          onSave={save}
          onEnter={enter}
          onDelete={del}
          onFocus={focus}
          onBlur={blur}
          onSlash={slash}
          isSelected={isSelected}
          autoFocus={autoFocus}
          focusAtEnd={focusAtEnd}
          readOnly={readOnly}
        />
      );

    // ── List blocks ───────────────────────────────────────────────────────────
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
          autoFocus={autoFocus}
          focusAtEnd={focusAtEnd}
          readOnly={readOnly}
        />
      );

    // ── Code block ────────────────────────────────────────────────────────────
    case 'code':
      return (
        <CodeBlock
          block={block}
          onSave={save}
          onDelete={del}
          readOnly={readOnly}
        />
      );

    // ── Media blocks ──────────────────────────────────────────────────────────
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

    // ── Divider ───────────────────────────────────────────────────────────────
    case 'divider':
      return <DividerBlock />;

    // ── Unknown / future block types ──────────────────────────────────────────
    // Renders a placeholder so new registry types don't crash existing pages.
    default:
      return (
        <div className="my-1 rounded border border-dashed border-neutral-700 px-3 py-2 text-xs text-neutral-600">
          [{block.block_type} — renderer coming soon]
        </div>
      );
  }
}
