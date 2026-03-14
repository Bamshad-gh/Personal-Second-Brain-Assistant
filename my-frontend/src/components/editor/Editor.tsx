/**
 * components/editor/Editor.tsx
 *
 * What:    The TipTap rich-text editor. Clean, distraction-free writing surface.
 *
 * Features:
 *   - Starter-kit (bold, italic, lists, headings, code, blockquote, hr, undo/redo)
 *   - Task list (checkbox to-dos)
 *   - Code blocks with lowlight syntax highlighting
 *   - Highlight (multi-color), TextStyle + Color (text color)
 *   - Placeholder text
 *   - Inline toolbar: Bold / Italic / Code / H1 / H2 / H3 / List / Todo / Highlight / Color / Voice
 *   - Slash ("/") command menu for inserting block types
 *   - Autosave: calls onSave(json) 500ms after the last keystroke
 *   - Save indicator: "Saving…" / "Saved ✓" in the toolbar
 *   - Voice-to-text via Web Speech API (no extra packages)
 *
 * Props:
 *   initialContent  — JSON content from the database (or null for a new page)
 *   onSave          — called with the editor's JSON when autosave fires
 *   readOnly        — disables editing (for locked pages)
 *
 * WHERE TO FIND THINGS
 *   Extensions list:     useEditor({ extensions: [...] }) below
 *   Toolbar buttons:     "Inline format toolbar" section below
 *   Voice handler:       toggleVoice() function below
 *   Slash commands:      src/components/editor/SlashMenu.tsx → COMMANDS array
 *   Toggle block:        src/components/editor/extensions/ToggleBlock.ts
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
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { common, createLowlight } from 'lowlight';
import { ToggleBlock } from './extensions/ToggleBlock';
import {
  Bold, Italic, Code, CheckCheck, Clock,
  List, CheckSquare, Highlighter, Palette, Mic, MicOff,
} from 'lucide-react';
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

  // ── Voice-to-text state ───────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── TipTap editor ─────────────────────────────────────────────────────────
  const editor = useEditor({
    immediatelyRender: false, // fix SSR hydration mismatch
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
      // Text formatting extensions
      TextStyle,                               // required by Color
      Color,                                   // text color via setColor()
      Highlight.configure({ multicolor: true }),// background highlight
      ToggleBlock,                               // collapsible toggle block
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

  // ── Voice-to-text handler (Web Speech API — no extra packages) ────────────
  // TypeScript doesn't include Web Speech API types by default, so we use
  // a local interface cast to avoid adding a @types package.
  function toggleVoice() {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      // Browser doesn't support Speech API (e.g. Firefox without flag)
      alert('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = new SpeechRecognitionCtor();
    r.continuous     = true;
    r.interimResults = false;
    r.lang           = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      const text: string = e.results[e.results.length - 1][0].transcript;
      editor?.chain().focus().insertContent(text + ' ').run();
    };
    r.onerror = () => setIsRecording(false);
    r.onend   = () => setIsRecording(false);

    r.start();
    recognitionRef.current = r;
    setIsRecording(true);
  }

  // Stop recording if the component unmounts
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

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
      <div className="mb-3 flex flex-wrap items-center gap-0.5 border-b border-neutral-800/60 pb-2">
        {/* Text style */}
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

        {/* Headings */}
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
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <span className="text-[11px] font-bold">H3</span>
        </BubbleButton>

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        {/* Lists */}
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

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        {/* Highlight — toggles violet background on selected text */}
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#7c3aed33' }).run()}
          isActive={editor.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter size={13} />
        </BubbleButton>

        {/* Text color — native color picker */}
        <ColorPickerButton
          title="Text color"
          onChange={(color) => editor.chain().focus().setColor(color).run()}
          onReset={() => editor.chain().focus().unsetColor().run()}
        />

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        {/* Voice-to-text — Web Speech API */}
        <BubbleButton
          onClick={toggleVoice}
          isActive={isRecording}
          title={isRecording ? 'Stop recording' : 'Voice to text'}
        >
          {isRecording
            ? <MicOff size={13} className="text-red-400 animate-pulse" />
            : <Mic size={13} />}
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
// BubbleButton — tiny toolbar button
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

// ─────────────────────────────────────────────────────────────────────────────
// ColorPickerButton — Palette icon that opens a native <input type="color">
// ─────────────────────────────────────────────────────────────────────────────

function ColorPickerButton({
  onChange,
  onReset,
  title,
}: {
  onChange: (color: string) => void;
  onReset:  () => void;
  title:    string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <button
        onClick={() => inputRef.current?.click()}
        title={title}
        className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
        onContextMenu={(e) => { e.preventDefault(); onReset(); }}
      >
        <Palette size={13} />
      </button>
      {/* Right-click the palette button to reset color */}
      <input
        ref={inputRef}
        type="color"
        className="absolute left-0 top-0 h-0 w-0 opacity-0"
        onChange={(e) => onChange(e.target.value)}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
