/**
 * components/blocks/TableBlock.tsx
 *
 * What:    TipTap-powered table block renderer.
 *          Stores the table as TipTap JSON in block.content.json,
 *          same convention as rich text blocks.
 *
 * Toolbar: Add/delete rows and columns, toggle header row, delete block.
 *          Shown above the table whenever the block is not readOnly.
 *
 * Styling: Scoped via .table-block CSS class defined in globals.css.
 *          Supports column resizing (resizable: true).
 *
 * Autosave: 500 ms debounce on every editor update.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent }       from '@tiptap/react';
import { StarterKit }                     from '@tiptap/starter-kit';
import { Table }                          from '@tiptap/extension-table';
import { TableRow }                       from '@tiptap/extension-table-row';
import { TableHeader }                    from '@tiptap/extension-table-header';
import { TableCell }                      from '@tiptap/extension-table-cell';
import type { Block }                     from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TableBlockProps {
  block:     Block;
  onSave:    (content: Record<string, unknown>) => void;
  onDelete:  () => void;
  readOnly?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DEFAULT CONTENT
// 3×3 table with a header row
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_TABLE_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph' }] },
            { type: 'tableHeader', content: [{ type: 'paragraph' }] },
            { type: 'tableHeader', content: [{ type: 'paragraph' }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function TableBlock({ block, onSave, onDelete, readOnly = false }: TableBlockProps) {

  // ── Autosave debounce ─────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutosave = useCallback(
    (getJson: () => Record<string, unknown>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave({ json: getJson() });
      }, 500);
    },
    [onSave],
  );

  // ── Editor ────────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: (block.content?.json as Record<string, unknown>) ?? DEFAULT_TABLE_CONTENT,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      scheduleAutosave(() => ed.getJSON() as Record<string, unknown>);
    },
  });

  // ── Cleanup timer on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Toolbar button helper ─────────────────────────────────────────────────
  const btn = (label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focused
        onClick();
      }}
      className="rounded bg-neutral-800 px-2 py-0.5 text-xs
                 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200
                 transition-colors"
    >
      {label}
    </button>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="w-full">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {!readOnly && editor && (
        <div className="mb-1 flex flex-wrap items-center gap-1">
          {btn('+ Row',  () => editor.chain().focus().addRowAfter().run())}
          {btn('+ Col',  () => editor.chain().focus().addColumnAfter().run())}
          {btn('− Row',  () => editor.chain().focus().deleteRow().run())}
          {btn('− Col',  () => editor.chain().focus().deleteColumn().run())}
          {btn('Header', () => editor.chain().focus().toggleHeaderRow().run())}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="rounded bg-neutral-800 px-2 py-0.5 text-xs
                       text-red-500 hover:bg-neutral-700 hover:text-red-400
                       transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* ── Table editor ────────────────────────────────────────────────── */}
      <div className="table-block tiptap-editor overflow-x-auto">
        <EditorContent editor={editor} />
      </div>

    </div>
  );
}
