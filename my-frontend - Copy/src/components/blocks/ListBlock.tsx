/**
 * components/blocks/ListBlock.tsx
 *
 * What:    Renders bullet_item, numbered_item, and todo_item blocks.
 *
 * Design decision — one block per list item:
 *   Each list item is its own Block in the database with its own mini TipTap
 *   editor. This matches the backend model (flat block list, fractional order)
 *   and makes insert/delete/reorder trivially independent operations.
 *
 * Todo items:
 *   Clicking the checkbox calls onSave immediately (no debounce) to toggle
 *   checked state. The text editor still debounces normally.
 *
 * Keyboard shortcuts:
 *   Uses TipTap's built-in keyboard extension (addKeyboardShortcuts) instead
 *   of raw DOM keydown listeners — the correct TipTap pattern.
 *
 *   Backspace (two-step, Notion-style):
 *     First Backspace on empty → convert block to paragraph (don't delete).
 *     Second Backspace on empty paragraph → delete block.
 *     convertedRef tracks whether we've done the first step so two Backspaces
 *     are always required. Reset when block_type changes (e.g. after conversion).
 *
 * Slash menu:
 *   SlashCommand extension emits on slashEventBus; DocumentEditor listens and
 *   renders the SlashMenuPortal overlay. Same pattern as TextBlock.
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
 *
 * Props:
 *   index — position in the parent list, used only for numbered_item display.
 */

'use client';

import { useEffect, useRef }        from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit                   from '@tiptap/starter-kit';
import Placeholder                  from '@tiptap/extension-placeholder';
import { Extension }                from '@tiptap/core';
import { SlashCommand }             from '@/components/editor/extensions/SlashCommand';
import type { Block }               from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ListBlockProps {
  block:                  Block;
  index:                  number;  // used for numbered_item display (1-based)
  onSave:                 (content: Record<string, unknown>) => void;
  onEnter:                () => void;
  onDelete:               () => void;
  onConvertToParagraph:   () => void;  // first Backspace on empty: convert type
  onFocus:                () => void;
  onBlur:                 () => void;
  onTextChange?:          (text: string) => void;  // immediate (no debounce) text update
  autoFocus?:             boolean;
  focusAtEnd?:            boolean;     // focus at end (after next block deleted via Backspace)
  readOnly?:              boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ListBlock({
  block,
  index,
  onSave,
  onEnter,
  onDelete,
  onConvertToParagraph,
  onFocus,
  onBlur,
  onTextChange,
  autoFocus  = false,
  focusAtEnd = false,
  readOnly   = false,
}: ListBlockProps) {

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep stable refs for callbacks so the keyboard extension closure never stales
  const onSaveRef               = useRef(onSave);
  const onEnterRef              = useRef(onEnter);
  const onDeleteRef             = useRef(onDelete);
  const onConvertToParagraphRef = useRef(onConvertToParagraph);
  const onFocusRef              = useRef(onFocus);
  const onTextChangeRef         = useRef(onTextChange);
  useEffect(() => { onSaveRef.current               = onSave;               }, [onSave]);
  useEffect(() => { onEnterRef.current              = onEnter;              }, [onEnter]);
  useEffect(() => { onDeleteRef.current             = onDelete;             }, [onDelete]);
  useEffect(() => { onConvertToParagraphRef.current = onConvertToParagraph; }, [onConvertToParagraph]);
  useEffect(() => { onFocusRef.current              = onFocus;              }, [onFocus]);
  useEffect(() => { onTextChangeRef.current         = onTextChange;         }, [onTextChange]);

  // Use a ref for isChecked so the onUpdate closure never goes stale
  const isCheckedRef = useRef<boolean>(Boolean(block.content.checked));
  useEffect(() => {
    isCheckedRef.current = Boolean(block.content.checked);
  }, [block.content.checked]);

  // Tracks whether the first Backspace (convert) has already fired.
  // Reset when block_type changes so a freshly-converted paragraph can be
  // deleted normally on the next Backspace.
  const convertedRef = useRef(false);
  useEffect(() => {
    convertedRef.current = false;
  }, [block.block_type]);

  // ── Editor ────────────────────────────────────────────────────────────────
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading:        false,
        blockquote:     false,
        bulletList:     false,
        orderedList:    false,
        listItem:       false,
        codeBlock:      false,
        horizontalRule: false,
        hardBreak:      false,
      }),
      Placeholder.configure({ placeholder: 'List item…' }),

      // ── Slash command menu ───────────────────────────────────────────────
      // Emits events on slashEventBus; DocumentEditor listens and renders
      // the SlashMenuPortal overlay. Same pattern as TextBlock.
      SlashCommand,

      // ── Block-level keyboard shortcuts ─────────────────────────────────
      Extension.create({
        name: 'listBlockKeyboard',
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              // Flush any pending save before handing off to parent
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                onSaveRef.current({
                  text:    this.editor.getText(),
                  checked: isCheckedRef.current,
                  marks:   [],
                });
              }
              onEnterRef.current();
              return true; // prevent TipTap's default Enter (new paragraph node)
            },
            Backspace: () => {
              const isEmpty = this.editor.getText().trim() === '';
              if (isEmpty) {
                // First Backspace: convert to paragraph instead of deleting
                if (!convertedRef.current) {
                  convertedRef.current = true;
                  onConvertToParagraphRef.current();
                  return true;
                }
                // Second Backspace on still-empty block: delete
                onDeleteRef.current();
                return true;
              }
              // Block has content — reset flag and let TipTap handle normally
              convertedRef.current = false;
              return false;
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
        onSaveRef.current({
          text,
          checked: isCheckedRef.current,
          marks:   [],
        });
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

  // ── Focus at end when next block is deleted ───────────────────────────────
  // Uses the same retry pattern as TextBlock: poll every 50ms up to 10 times
  // so focus lands even if the editor initialises slowly after a refetch.
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
  // editor intentionally included — late-init editor re-triggers the effect
  }, [focusAtEnd, editor]);

  // ── Sync content when block prop changes externally ───────────────────────
  useEffect(() => {
    if (!editor) return;
    const blockText  = String(block.content.text ?? '');
    const editorText = editor.getText();
    if (editorText !== blockText) {
      editor.commands.setContent(blockText, { emitUpdate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content.text]);

  // ── Debounce cleanup ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Checkbox toggle — saves immediately (no debounce) ────────────────────
  function toggleChecked() {
    const newChecked = !isCheckedRef.current;
    isCheckedRef.current = newChecked;
    onSaveRef.current({
      text:    editor?.getText() ?? '',
      checked: newChecked,
      marks:   [],
    });
  }

  const isChecked = Boolean(block.content.checked);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="flex items-start gap-2 py-0.5">

      {/* ── Bullet indicator ──────────────────────────────────────────────── */}
      {block.block_type === 'bullet_item' && (
        <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
      )}

      {/* ── Number indicator ──────────────────────────────────────────────── */}
      {block.block_type === 'numbered_item' && (
        <span className="mt-0.5 min-w-5 shrink-0 text-right text-sm text-neutral-400">
          {index + 1}.
        </span>
      )}

      {/* ── Checkbox ──────────────────────────────────────────────────────── */}
      {block.block_type === 'todo_item' && (
        <button
          type="button"
          onClick={toggleChecked}
          disabled={readOnly}
          className={[
            'mt-1 flex h-4 w-4 shrink-0 items-center justify-center',
            'rounded border transition-colors',
            isChecked
              ? 'border-violet-500 bg-violet-500 text-white'
              : 'border-neutral-600 hover:border-violet-400',
            readOnly ? 'cursor-default' : 'cursor-pointer',
          ].join(' ')}
        >
          {isChecked && <span className="text-[10px] leading-none">✓</span>}
        </button>
      )}

      {/* ── Text editor ───────────────────────────────────────────────────── */}
      <div className={[
        'flex-1',
        isChecked && block.block_type === 'todo_item'
          ? 'text-neutral-500 line-through'
          : '',
      ].join(' ')}>
        {/*
          onDrop stops propagation so TipTap/ProseMirror never receives the
          drag-reorder drop event and does not insert the UUID as text.
        */}
        <EditorContent
          editor={editor}
          className="outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1.5em]"
          onDrop={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
