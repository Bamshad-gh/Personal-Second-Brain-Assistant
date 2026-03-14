/**
 * components/editor/SlashMenu.tsx
 *
 * What:    A floating command palette that appears when the user types "/"
 *          at the start of an empty paragraph. Lets them insert block types
 *          without leaving the keyboard.
 *
 * How it works:
 *   1. The Editor detects a "/" keydown on an empty line
 *   2. It sets slashMenuOpen=true and passes the editor instance here
 *   3. This component renders a filtered list of commands
 *   4. On selection it runs editor.chain()... to transform the block type
 *   5. On Escape or click-outside it closes without changing anything
 *
 * How to expand:
 *   - Add search filtering (already wired via `query` prop)
 *   - Add "AI" section: summarize selection, continue writing, etc.
 *   - Add recently used commands at the top
 */

'use client';

import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Type, Heading1, Heading2, Heading3,
  Code, Quote, CheckSquare, Minus,
  List, ListOrdered,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Command definitions
// ─────────────────────────────────────────────────────────────────────────────

interface SlashCommand {
  id:          string;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  /** Called when the user selects this command */
  execute: (editor: Editor) => void;
}

const COMMANDS: SlashCommand[] = [
  {
    id: 'text',
    label: 'Text',
    description: 'Plain paragraph',
    icon: <Type size={16} />,
    execute: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section title',
    icon: <Heading1 size={16} />,
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium sub-title',
    icon: <Heading2 size={16} />,
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small sub-section',
    icon: <Heading3 size={16} />,
    execute: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bullet list',
    description: 'Unordered list',
    icon: <List size={16} />,
    execute: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'Numbered list',
    description: 'Ordered list',
    icon: <ListOrdered size={16} />,
    execute: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'todo',
    label: 'To-do',
    description: 'Checkbox task item',
    icon: <CheckSquare size={16} />,
    execute: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'code',
    label: 'Code block',
    description: 'Syntax-highlighted code',
    icon: <Code size={16} />,
    execute: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Indented blockquote',
    icon: <Quote size={16} />,
    execute: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    icon: <Minus size={16} />,
    execute: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SlashMenuProps {
  editor:      Editor;
  query:       string;          // text typed after "/"
  onClose:     () => void;
  /** Pixel position for the menu anchor (relative to editor container) */
  position:    { top: number; left: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SlashMenu({ editor, query, onClose, position }: SlashMenuProps) {
  const menuRef      = useRef<HTMLDivElement>(null);
  const activeRef    = useRef<HTMLButtonElement>(null);

  // Filter commands by query
  const filtered = COMMANDS.filter(
    (cmd) =>
      !query ||
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()),
  );

  // Delete the "/" character + query text before running the command
  function runCommand(cmd: SlashCommand) {
    // Select back from cursor to delete "/query" text
    const { from } = editor.state.selection;
    // The slash + query length
    const deleteFrom = from - 1 - query.length;
    editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
    cmd.execute(editor);
    onClose();
  }

  // Keyboard navigation inside the menu
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }

      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-cmd]');
      if (!items || items.length === 0) return;

      const active = menuRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]');
      const idx    = active ? Array.from(items).indexOf(active) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[(idx + 1) % items.length];
        items.forEach((el) => el.removeAttribute('data-active'));
        next.setAttribute('data-active', 'true');
        next.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        items.forEach((el) => el.removeAttribute('data-active'));
        prev.setAttribute('data-active', 'true');
        prev.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active) {
          const cmdId = active.getAttribute('data-cmd');
          const cmd   = filtered.find((c) => c.id === cmdId);
          if (cmd) runCommand(cmd);
        } else if (filtered.length > 0) {
          runCommand(filtered[0]);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, query]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="glass animate-fade-in absolute z-50 w-64 overflow-hidden rounded-xl shadow-2xl"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-1.5 max-h-72 overflow-y-auto">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
          Blocks
        </p>
        {filtered.map((cmd, i) => (
          <button
            key={cmd.id}
            ref={i === 0 ? activeRef : undefined}
            data-cmd={cmd.id}
            data-active={i === 0 ? 'true' : undefined}
            onClick={() => runCommand(cmd)}
            className={[
              'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors',
              'hover:bg-violet-600/20 hover:text-neutral-100',
              'data-[active=true]:bg-violet-600/20 data-[active=true]:text-neutral-100',
              'text-neutral-400',
            ].join(' ')}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-neutral-400">
              {cmd.icon}
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-neutral-200">{cmd.label}</span>
              <span className="text-xs text-neutral-600">{cmd.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
