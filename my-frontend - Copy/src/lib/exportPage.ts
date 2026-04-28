/**
 * lib/exportPage.ts
 *
 * What:    Pure utility functions for exporting a page's blocks to Markdown.
 *          No React imports — safe to use from any context.
 *
 * Usage:
 *   import { blocksToMarkdown, downloadMarkdown } from '@/lib/exportPage';
 *   const md = blocksToMarkdown(docBlocks);
 *   downloadMarkdown(md, pageTitle || 'untitled');
 */

import type { Block } from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERNAL HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function text(block: Block): string {
  return String(block.content.text ?? '').trim();
}

/** Render a single block to a markdown string. Returns '' for unknown types. */
function blockToMd(block: Block): string {
  switch (block.block_type) {
    case 'text':
    case 'paragraph':
      return `${text(block)}\n\n`;

    case 'heading1':
      return `# ${text(block)}\n\n`;

    case 'heading2':
      return `## ${text(block)}\n\n`;

    case 'heading3':
      return `### ${text(block)}\n\n`;

    case 'quote':
      return `> ${text(block)}\n\n`;

    case 'callout': {
      const emoji = typeof block.content.emoji === 'string' && block.content.emoji
        ? block.content.emoji
        : '💡';
      return `> ${emoji} ${text(block)}\n\n`;
    }

    case 'bullet_item':
      return `- ${text(block)}\n`;

    case 'numbered_item':
      return `1. ${text(block)}\n`;

    case 'todo_item': {
      const checked = block.content.checked ? 'x' : ' ';
      return `- [${checked}] ${text(block)}\n`;
    }

    case 'code': {
      const lang = String(block.content.language ?? '');
      const code = String(block.content.code ?? '');
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    case 'divider':
      return `---\n\n`;

    // column_container: render each column's child blocks inline
    case 'column_container':
      return '';   // handled by the caller via column recursion

    // column, image, file, pdf, video, unknown → skip
    default:
      return '';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Convert an array of blocks (as returned by the API) to a Markdown string.
 *
 * Rules:
 *  - Only blocks where doc_visible === true and is_deleted !== true are included.
 *  - Blocks are sorted by their `order` field before rendering.
 *  - Top-level blocks (parent === null) are rendered in order.
 *  - column_container blocks trigger recursion: find their column children, then
 *    find each column's content children, and render those inline separated by
 *    a horizontal rule per column boundary.
 */
export function blocksToMarkdown(blocks: Block[]): string {
  // Filter to visible, non-deleted blocks and sort
  const visible = blocks
    .filter((b) => b.doc_visible && !b.is_deleted)
    .sort((a, b) => a.order - b.order);

  // Build a parentId → children lookup for fast recursion
  const byParent = new Map<string | null, Block[]>();
  for (const b of visible) {
    const key = b.parent ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(b);
  }

  function renderChildren(parentId: string | null): string {
    const children = byParent.get(parentId) ?? [];
    let out = '';

    for (const block of children) {
      if (block.block_type === 'column_container') {
        // Find columns (direct children of this container)
        const columns = byParent.get(block.id) ?? [];
        const columnOutputs: string[] = [];

        for (const col of columns) {
          // Render the content blocks inside each column
          const colContent = renderChildren(col.id);
          if (colContent.trim()) columnOutputs.push(colContent.trim());
        }

        if (columnOutputs.length > 0) {
          out += columnOutputs.join('\n\n---\n\n') + '\n\n';
        }
      } else if (block.block_type === 'column') {
        // columns are handled inside column_container — skip if encountered top-level
        continue;
      } else {
        out += blockToMd(block);
      }
    }

    return out;
  }

  return renderChildren(null).trimEnd() + '\n';
}

/**
 * Trigger a browser download of `content` as a `.md` file named `filename`.
 * Appends ".md" if not already present.
 */
export function downloadMarkdown(content: string, filename: string): void {
  const name = filename.endsWith('.md') ? filename : `${filename}.md`;
  const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const anchor      = document.createElement('a');
  anchor.href       = url;
  anchor.download   = name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
