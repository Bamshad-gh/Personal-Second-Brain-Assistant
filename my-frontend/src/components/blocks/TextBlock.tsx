/**
 * components/blocks/TextBlock.tsx
 *
 * What:    Renders paragraph, heading1/2/3, quote, and callout blocks.
 *          Each block is an independent mini TipTap editor with rich text
 *          support (bold, italic, inline code, text color, highlight).
 *
 * How it works:
 *   - One TipTap instance per block (no shared editor state)
 *   - Content stored as { text, marks } in block.content
 *   - Autosaves 300ms after last keystroke via debounce
 *   - Enter (without shift)  → calls onEnter() to create next block
 *   - Backspace on empty     → calls onDelete() to remove block
 *   - Typing '/'             → opens slash command menu via SlashCommand extension
 *
 * Keyboard shortcuts:
 *   Uses TipTap's built-in keyboard extension (addKeyboardShortcuts) instead
 *   of raw DOM keydown listeners — the correct TipTap pattern.
 *   Ctrl+B, Ctrl+I, Ctrl+E (inline code) work via StarterKit's defaults.
 *   The BubbleMenu toolbar makes these discoverable without requiring keyboard knowledge.
 *
 * Floating toolbar (BubbleMenu):
 *   Appears when the user selects text. Provides Bold, Italic, Strike, Code
 *   buttons plus 6 color swatches and a color-reset button.
 *   Hidden in readOnly mode.
 *
 * Slash menu:
 *   SlashCommand extension emits on slashEventBus; DocumentEditor listens and
 *   renders the SlashMenuPortal + SlashMenuList. No manual '/' detection needed.
 *
 * onTextChange:
 *   Called immediately (no debounce) on every editor update so DocumentEditor
 *   can track the current clean text. Used by handleSlashSelect to pass the
 *   post-deletion text as part of the block_type update — preventing the '/'
 *   trigger from persisting in the cache when the debounce hasn't flushed yet.
 *
 * focusAtEnd / autoFocus — retry pattern:
 *   Both use a 50ms-interval retry loop (up to 10 attempts) instead of a single
 *   fixed-delay setTimeout. TipTap initialises asynchronously; the retry ensures
 *   focus lands even if the editor isn't ready on the first attempt.
 *
 * Drag fix:
 *   onDrop on EditorContent stops propagation so TipTap does not receive the
 *   drag-reorder drop and insert the block UUID as text.
 */

'use client';

import { useEffect, useRef }                from 'react';
import { useEditor, EditorContent }             from '@tiptap/react';
import { BubbleMenu }                           from '@tiptap/react/menus';
import StarterKit                           from '@tiptap/starter-kit';
import Placeholder                          from '@tiptap/extension-placeholder';
import { TextStyle }                        from '@tiptap/extension-text-style';
import { Color }                            from '@tiptap/extension-color';
import Highlight                            from '@tiptap/extension-highlight';
import { Extension }                        from '@tiptap/core';
import { SlashCommand }                     from '@/components/editor/extensions/SlashCommand';
import type { Block }                       from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TextBlockProps {
  block:          Block;
  onSave:         (content: Record<string, unknown>) => void;
  onEnter:        () => void;              // create next block
  onDelete:       () => void;              // delete this block when empty
  onFocus:        () => void;
  onBlur:         () => void;
  onSlash:        (query: string) => void; // open block-type slash menu
  onTextChange?:  (text: string) => void;  // immediate (no debounce) text update
  isSelected:     boolean;
  autoFocus?:     boolean;
  focusAtEnd?:    boolean;                 // focus at end (after prev block deleted)
  readOnly?:      boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Placeholder text shown when a block is empty */
const PLACEHOLDERS: Record<string, string> = {
  paragraph: "Type '/' for commands…",
  heading1:  'Heading 1',
  heading2:  'Heading 2',
  heading3:  'Heading 3',
  quote:     'Quote…',
  // deprecated alias
  text:      "Type '/' for commands…",
};

/** Tailwind classes applied to the outer div per block type */
const TYPE_CLASSES: Record<string, string> = {
  paragraph: 'text-base leading-7',
  heading1:  'text-3xl font-bold leading-tight',
  heading2:  'text-2xl font-semibold leading-tight',
  heading3:  'text-xl font-semibold leading-snug',
  quote:     'border-l-4 border-neutral-500 pl-4 italic text-neutral-400',
  text:      'text-base leading-7',
};

/** Text color swatches shown in the BubbleMenu toolbar */
const TOOLBAR_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#facc15', // yellow
  '#4ade80', // green
  '#60a5fa', // blue
  '#a78bfa', // violet
] as const;

/** Highlight (background) colors for the BubbleMenu — softer tones */
const HIGHLIGHT_COLORS = [
  '#fca5a5', // red-300
  '#fdba74', // orange-300
  '#fde047', // yellow-300
  '#86efac', // green-300
  '#93c5fd', // blue-300
  '#c4b5fd', // violet-300
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function TextBlock({
  block,
  onSave,
  onEnter,
  onDelete,
  onFocus,
  onBlur,
  onTextChange,
  isSelected,
  autoFocus  = false,
  focusAtEnd = false,
  readOnly   = false,
}: TextBlockProps) {

  const saveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last text we wrote to the server so the sync effect can
  // skip "echo" updates and avoid stomping on TipTap's undo history.
  const lastSavedTextRef = useRef(String(block.content.text ?? ''));

  // Keep stable refs for callbacks so the keyboard extension closure never stales
  const onSaveRef        = useRef(onSave);
  const onEnterRef       = useRef(onEnter);
  const onDeleteRef      = useRef(onDelete);
  const onFocusRef       = useRef(onFocus);
  const onTextChangeRef  = useRef(onTextChange);
  useEffect(() => { onSaveRef.current       = onSave;       }, [onSave]);
  useEffect(() => { onEnterRef.current      = onEnter;      }, [onEnter]);
  useEffect(() => { onDeleteRef.current     = onDelete;     }, [onDelete]);
  useEffect(() => { onFocusRef.current      = onFocus;      }, [onFocus]);
  useEffect(() => { onTextChangeRef.current = onTextChange; }, [onTextChange]);

  // ── Editor ────────────────────────────────────────────────────────────────
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable block-level nodes — TextBlock is a single inline content area
        heading:         false,
        blockquote:      false,
        bulletList:      false,
        orderedList:     false,
        listItem:        false,
        codeBlock:       false,
        horizontalRule:  false,
        // hardBreak enabled (default) so Shift+Enter inserts a <br> within a block
      }),
      Placeholder.configure({
        placeholder: PLACEHOLDERS[block.block_type] ?? "Type '/' for commands…",
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),

      // ── Slash command menu ─────────────────────────────────────────────
      // Emits events on slashEventBus; DocumentEditor listens and renders
      // the SlashMenuPortal overlay.
      SlashCommand,

      // ── Block-level keyboard shortcuts ─────────────────────────────────
      Extension.create({
        name: 'blockKeyboard',
        addKeyboardShortcuts() {
          return {
            // Enter in middle of text → hard break (newline within block).
            // Enter at end of text → flush save and create a new block.
            Enter: () => {
              const { to } = this.editor.state.selection;
              const docEnd  = this.editor.state.doc.content.size - 1;

              if (to >= docEnd) {
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                  lastSavedTextRef.current = this.editor.getText();
                  onSaveRef.current({ json: this.editor.getJSON(), text: lastSavedTextRef.current });
                }
                onEnterRef.current();
                return true;
              }
              // Mid-text: insert a line break without creating a new block
              this.editor.commands.setHardBreak();
              return true;
            },
            // Shift+Enter always creates a new block (power-user shortcut)
            'Shift-Enter': () => {
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                lastSavedTextRef.current = this.editor.getText();
                onSaveRef.current({ json: this.editor.getJSON(), text: lastSavedTextRef.current });
              }
              onEnterRef.current();
              return true;
            },
            Backspace: () => {
              const isEmpty = this.editor.getText().trim() === '';
              if (isEmpty) {
                onDeleteRef.current();
                return true;
              }
              return false;
            },
          };
        },
      }),
    ],
    content:  (block.content.json as object | undefined) ?? String(block.content.text ?? ''),
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      const text = e.getText();
      onTextChangeRef.current?.(text);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        lastSavedTextRef.current = text;
        onSaveRef.current({ json: e.getJSON(), text });
      }, 300);
    },
    onFocus: () => onFocus(),
    onBlur:  () => onBlur(),
  });

  // ── Auto-focus on mount ───────────────────────────────────────────────────
  // Retry pattern: the editor may not be initialised (isEditable) when this
  // first fires. Poll every 50ms up to 10 times so focus always lands.
  useEffect(() => {
    if (!autoFocus) return;
    let attempts = 0;
    const maxAttempts = 10;
    let timerId: ReturnType<typeof setTimeout>;

    function tryFocus() {
      attempts++;
      if (editor && editor.isEditable) {
        editor.commands.focus('end');
        return;
      }
      if (attempts < maxAttempts) {
        timerId = setTimeout(tryFocus, 50);
      }
    }

    timerId = setTimeout(tryFocus, 50);
    return () => clearTimeout(timerId);
  // editor intentionally included so a late-init editor triggers a retry
  }, [autoFocus, editor]);

  // ── Focus at end when previous block is deleted / block converted ────────────
  // focusAtEnd is set by DocumentEditor after:
  //   (a) next block deleted via Backspace, or
  //   (b) a ListBlock is converted to paragraph (ListBlock unmounts, this mounts).
  //
  // Retry pattern: after a ListBlock→paragraph conversion TipTap may not be
  // ready yet when this first fires (editor initialises asynchronously and
  // React Query may also be mid-refetch). We poll every 50ms up to 10 times
  // (500ms total) so focus always lands even under slow refetch conditions.
  useEffect(() => {
    if (!focusAtEnd) return;
    let attempts = 0;
    const maxAttempts = 10;
    let timerId: ReturnType<typeof setTimeout>;

    function tryFocus() {
      attempts++;
      if (editor && editor.isEditable) {
        editor.commands.focus('end');
        onFocusRef.current();
        return;
      }
      if (attempts < maxAttempts) {
        timerId = setTimeout(tryFocus, 50);
      }
    }

    timerId = setTimeout(tryFocus, 50);
    return () => clearTimeout(timerId);
  // editor is intentionally included so a late-init editor triggers a retry
  }, [focusAtEnd, editor]);

  // ── Sync content when block prop changes externally ───────────────────────
  // We only reload if the incoming text differs from what we last saved.
  // This prevents the server "echo" from overwriting TipTap's local undo history
  // (Ctrl+Z works correctly because we don't reset TipTap after our own saves).
  useEffect(() => {
    if (!editor) return;
    const blockText = String(block.content.text ?? '');
    if (blockText === lastSavedTextRef.current) return; // echo of our own save — skip
    const content = (block.content.json as object | undefined) ?? blockText;
    editor.commands.setContent(content, { emitUpdate: false });
    lastSavedTextRef.current = blockText;
  // editor intentionally omitted — we only want to sync on prop change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content.text]);

  // ── Debounce cleanup ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const typeClass = TYPE_CLASSES[block.block_type] ?? TYPE_CLASSES.paragraph;

  return (
    <div
      className={[
        'group relative w-full',
        typeClass,
        isSelected ? 'bg-violet-500/5 rounded' : '',
      ].join(' ')}
    >
      {/* ── Floating format toolbar ───────────────────────────────────────────
          Appears on text selection via TipTap BubbleMenu.
          Hidden in readOnly mode — readOnly editors have no selection UI.
          Each button uses onMouseDown + preventDefault to avoid blurring the
          editor before the toggle command fires.
      */}
      {editor && !readOnly && (
        <BubbleMenu
          editor={editor}
          className="flex flex-wrap items-center gap-0.5 rounded-lg border border-neutral-700
                     bg-neutral-900 shadow-xl px-1.5 py-1.5 max-w-xs"
        >
          {/* ── Format toggle buttons ── */}
          {(
            [
              { mark: 'bold',   label: 'B',  cls: 'font-bold',             cmd: () => editor.chain().focus().toggleBold().run()   },
              { mark: 'italic', label: 'I',  cls: 'italic',                cmd: () => editor.chain().focus().toggleItalic().run() },
              { mark: 'strike', label: 'S',  cls: 'line-through',          cmd: () => editor.chain().focus().toggleStrike().run() },
              { mark: 'code',   label: '<>', cls: 'font-mono text-[10px]', cmd: () => editor.chain().focus().toggleCode().run()   },
            ] as const
          ).map(({ mark, label, cls, cmd }) => (
            <button
              key={mark}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cmd(); }}
              className={[
                'min-w-7 min-h-7 px-1.5 rounded text-xs transition-colors select-none',
                cls,
                editor.isActive(mark)
                  ? 'bg-violet-600 text-white'
                  : 'text-neutral-300 hover:bg-neutral-800',
              ].join(' ')}
            >
              {label}
            </button>
          ))}

          {/* ── Divider ── */}
          <div className="w-px h-5 bg-neutral-700 mx-0.5 shrink-0" />

          {/* ── Text color label ── */}
          <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500 px-0.5 select-none">A</span>

          {/* ── Text color swatches ── */}
          {TOOLBAR_COLORS.map((color) => (
            <button
              key={`tc-${color}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().setColor(color).run();
              }}
              className="w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform shrink-0"
              style={{
                backgroundColor: color,
                borderColor: editor.isActive('textStyle', { color }) ? 'white' : 'transparent',
              }}
              title={`Text color ${color}`}
            />
          ))}

          {/* ── Reset text color ── */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().unsetColor().run();
            }}
            className="w-5 h-5 rounded-full border border-neutral-600
                       bg-neutral-700 text-[8px] text-neutral-400
                       flex items-center justify-center
                       hover:bg-neutral-600 transition-colors shrink-0"
            title="Reset text color"
          >✕</button>

          {/* ── Divider ── */}
          <div className="w-px h-5 bg-neutral-700 mx-0.5 shrink-0" />

          {/* ── Highlight label ── */}
          <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500 px-0.5 select-none" title="Highlight background">H</span>

          {/* ── Highlight color swatches ── */}
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={`hl-${color}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().toggleHighlight({ color }).run();
              }}
              className="w-5 h-5 rounded border-2 hover:scale-110 transition-transform shrink-0"
              style={{
                backgroundColor: color,
                borderColor: editor.isActive('highlight', { color }) ? '#7c3aed' : 'transparent',
              }}
              title={`Highlight ${color}`}
            />
          ))}

          {/* ── Reset highlight ── */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().unsetHighlight().run();
            }}
            className="w-5 h-5 rounded border border-neutral-600
                       bg-neutral-700 text-[8px] text-neutral-400
                       flex items-center justify-center
                       hover:bg-neutral-600 transition-colors shrink-0"
            title="Remove highlight"
          >✕</button>
        </BubbleMenu>
      )}

      {/*
        onDrop stops propagation so TipTap/ProseMirror never receives the
        drag-reorder drop event. Without this, ProseMirror inserts the
        text/plain payload (block UUID) into the editor as text.
      */}
      <EditorContent
        editor={editor}
        className="outline-none w-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1.5em]"
        onDrop={(e) => e.stopPropagation()}
      />
    </div>
  );
}
