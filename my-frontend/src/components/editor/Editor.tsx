/**
 * components/editor/Editor.tsx
 *
 * What:    The TipTap rich-text editor. Clean, distraction-free writing surface.
 *
 * Features:
 *   - Starter-kit (bold, italic, lists, headings, code, blockquote, hr, undo/redo)
 *   - Task list (checkbox to-dos)
 *   - Code blocks with lowlight syntax highlighting
 *   - Placeholder text
 *   - Floating bubble menu on selection: Bold / Italic / Code
 *   - Slash ("/") command menu for inserting block types
 *   - Autosave: calls onSave(json) 500ms after the last keystroke
 *   - Save indicator: "Saving…" / "Saved ✓" in the toolbar
 *
 * Props:
 *   initialContent  — JSON content from the database (or null for a new page)
 *   onSave          — called with the editor's JSON when autosave fires
 *   readOnly        — disables editing (for locked pages)
 *
 * How to expand:
 *   - Add @tiptap/extension-link for clickable URLs
 *   - Add @tiptap/extension-image for drag-and-drop image uploads
 *   - Add @tiptap/extension-collaboration for real-time multiplayer
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Bold, Italic, Code, CheckCheck, Clock, List, CheckSquare } from 'lucide-react';
import { SlashMenu } from './SlashMenu';

// ─────────────────────────────────────────────────────────────────────────────
// Lowlight instance — syntax highlighting for code blocks
// ─────────────────────────────────────────────────────────────────────────────

const lowlight = createLowlight(common);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EditorProps {
  initialContent:  Record<string, unknown> | null;
  onSave:          (json: Record<string, unknown>) => void;
  /** Called on every content change with the editor's plain text.
   *  Used by the AI panel to get the page text as context. */
  onTextChange?:   (text: string) => void;
  readOnly?:       boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Autosave hook — fires onSave 500ms after the last change
// ─────────────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved';

function useAutosave(
  getValue: () => Record<string, unknown> | null,
  onSave:   (json: Record<string, unknown>) => void,
): { triggerSave: () => void; status: SaveStatus } {
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const triggerSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('saving');
    timerRef.current = setTimeout(() => {
      const value = getValue();
      if (value) {
        onSave(value);
        setStatus('saved');
        // Reset "Saved ✓" back to idle after 2s
        setTimeout(() => setStatus('idle'), 2000);
      }
    }, 500);
  }, [getValue, onSave]);

  // Cleanup on unmount — flush any pending save immediately
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const value = getValue();
        if (value) onSave(value);
      }
    };
  // We only want this to run on unmount, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { triggerSave, status };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function Editor({ initialContent, onSave, onTextChange, readOnly = false }: EditorProps) {
  // ── Slash menu state ──────────────────────────────────────────────────────
  const [slashOpen,  setSlashOpen]  = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPos,   setSlashPos]   = useState({ top: 0, left: 0 });
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // ── TipTap editor ─────────────────────────────────────────────────────────
  const editor = useEditor({
    editable: !readOnly,

    extensions: [
      StarterKit.configure({
        // We use the CodeBlockLowlight extension instead of the built-in one
        codeBlock: false,
        // heading levels we support
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Press '/' for commands, or start writing…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
      CodeBlockLowlight.configure({ lowlight }),
    ],

    content: initialContent ?? undefined,

    // editorProps adds our CSS class for scoped editor styles
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },

    onUpdate({ editor: e }) {
      triggerSave();
      // Notify parent with plain text (used by AI panel for context)
      if (onTextChange) {
        onTextChange(e.getText());
      }

      // ── Slash menu detection ────────────────────────────────────────────
      // Check if the current text node starts with "/"
      const { state } = e;
      const { $from } = state.selection;

      // Get the text of the current paragraph from its start to the cursor
      const paraStart = $from.start();
      const textBefore = state.doc.textBetween(paraStart, $from.pos, '\0', '\0');

      if (textBefore.startsWith('/')) {
        // Everything after the "/" is the query for filtering commands
        setSlashQuery(textBefore.slice(1));

        // Position the menu below the cursor using the editor DOM
        const domAtPos = e.view.domAtPos($from.pos);
        const node     = domAtPos.node instanceof Text
          ? domAtPos.node.parentElement
          : (domAtPos.node as HTMLElement);

        if (node && editorContainerRef.current) {
          const containerRect = editorContainerRef.current.getBoundingClientRect();
          const nodeRect      = node.getBoundingClientRect();
          setSlashPos({
            top:  nodeRect.bottom - containerRect.top + 4,
            left: nodeRect.left   - containerRect.left,
          });
          setSlashOpen(true);
        }
      } else {
        setSlashOpen(false);
      }
    },
  });

  // Wire up autosave after editor is created
  const { triggerSave, status } = useAutosave(
    () => editor?.getJSON() as Record<string, unknown> ?? null,
    onSave,
  );

  // Update content when initialContent changes (page navigation)
  useEffect(() => {
    if (editor && initialContent) {
      // Only update if the content is actually different (avoids cursor jump)
      const current = JSON.stringify(editor.getJSON());
      const next    = JSON.stringify(initialContent);
      if (current !== next) {
        editor.commands.setContent(initialContent);
      }
    }
  }, [editor, initialContent]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!editor) return null;

  return (
    <div ref={editorContainerRef} className="relative">
      {/* ── Save status indicator ─────────────────────────────────────────── */}
      {status !== 'idle' && (
        <div
          className={[
            'absolute right-0 top-0 flex items-center gap-1.5 text-xs transition-opacity',
            status === 'saving' ? 'text-neutral-500' : 'text-violet-400',
          ].join(' ')}
        >
          {status === 'saving' ? (
            <><Clock size={11} className="animate-pulse" /> Saving…</>
          ) : (
            <><CheckCheck size={11} /> Saved</>
          )}
        </div>
      )}

      {/* ── Inline format toolbar — shown when editor is focused ─────────── */}
      <div className="mb-3 flex items-center gap-0.5 border-b border-neutral-800/60 pb-2">
        <BubbleButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold (⌘B)"
        >
          <Bold size={13} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic (⌘I)"
        >
          <Italic size={13} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive('code')}
          title="Inline code"
        >
          <Code size={13} />
        </BubbleButton>
        <div className="mx-1 h-4 w-px bg-neutral-800" />
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <span className="text-[11px] font-bold">H1</span>
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <span className="text-[11px] font-bold">H2</span>
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List size={13} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive('taskList')}
          title="To-do list"
        >
          <CheckSquare size={13} />
        </BubbleButton>
      </div>

      {/* ── Editor content ────────────────────────────────────────────────── */}
      <EditorContent editor={editor} />

      {/* ── Slash command menu ────────────────────────────────────────────── */}
      {slashOpen && (
        <SlashMenu
          editor={editor}
          query={slashQuery}
          position={slashPos}
          onClose={() => setSlashOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BubbleButton — tiny toolbar button for the floating bubble menu
// ─────────────────────────────────────────────────────────────────────────────

function BubbleButton({
  children,
  onClick,
  isActive,
  title,
}: {
  children: React.ReactNode;
  onClick:  () => void;
  isActive: boolean;
  title:    string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors',
        isActive
          ? 'bg-violet-600/40 text-violet-300'
          : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
