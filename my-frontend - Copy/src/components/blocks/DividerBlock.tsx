/**
 * components/blocks/DividerBlock.tsx
 *
 * What: Renders a horizontal rule divider between blocks.
 *       No props — content is always the same visual line.
 *       Deletion is handled by BlockRenderer/DocumentEditor at the parent level.
 */

'use client';

export function DividerBlock() {
  return (
    <div className="my-4 flex items-center" role="separator" aria-orientation="horizontal">
      <div className="flex-1 border-t border-neutral-700" />
    </div>
  );
}
