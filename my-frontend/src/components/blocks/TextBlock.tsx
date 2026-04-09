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

import { useEffect, useRef }            from 'react';
import { useEditor, EditorContent }     from '@tiptap/react';
import StarterKit                       from '@tiptap/starter-kit';
import Placeholder                      from '@tiptap/extension-placeholder';
import { TextStyle }                    from '@tiptap/extension-text-style';
import { Color }                        from '@tiptap/extension-color';
import Highlight                        from '@tiptap/extension-highlight';
import { Extension }                    from '@tiptap/core';
import { SlashCommand }                 from '@/components/editor/extensions/SlashCommand';
import type { Block }                   from '@/types';

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
  callout:   'Callout…',
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
  callout:   'rounded-lg bg-neutral-800/50 px-4 py-3 text-sm',
  text:      'text-base leading-7',
};

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

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        hardBreak:       false,
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
            Enter: () => {
              // Flush any pending save before handing off to parent
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                onSaveRef.current({ text: this.editor.getText(), marks: [] });
              }
              onEnterRef.current();
              return true; // prevent TipTap's default Enter (new paragraph node)
            },
            Backspace: () => {
              const isEmpty = this.editor.getText().trim() === '';
              if (isEmpty) {
                onDeleteRef.current();
                return true;
              }
              return false; // let TipTap handle non-empty backspace normally
            },
          };
        },
      }),
    ],
    content:  String(block.content.text ?? ''),
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      const text = e.getText();
      // Notify DocumentEditor immediately (no debounce) so it always has the
      // latest clean text — critical for slash command block-type conversion.
      onTextChangeRef.current?.(text);
      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSaveRef.current({ text, marks: [] });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAtEnd, editor]);

  // ── Sync content when block prop changes externally ───────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editor) return;
    const blockText   = String(block.content.text ?? '');
    const editorText  = editor.getText();
    if (editorText !== blockText) {
      editor.commands.setContent(blockText, { emitUpdate: false });
    }
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
