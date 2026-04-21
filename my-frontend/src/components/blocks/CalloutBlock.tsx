/**
 * components/blocks/CalloutBlock.tsx
 *
 * What:    A colored callout box with an emoji icon and a rich-text TipTap editor.
 *          Replaces the basic callout styling previously handled by TextBlock.
 *
 * Data model:
 *   block.content = {
 *     text:  string          — the body text
 *     emoji: string          — icon shown on the left (default: '💡')
 *     color: CalloutColor    — background/border theme (default: 'blue')
 *     marks: []              — (unused, kept for consistency)
 *   }
 *
 * Emoji cycling:
 *   Clicking the emoji button cycles to the next emoji in EMOJIS and saves
 *   immediately. No debounce — the save is instantaneous so the icon updates
 *   without waiting for the text autosave timer.
 *
 * Editor config:
 *   Same mini TipTap setup as TextBlock: StarterKit (block nodes disabled),
 *   Placeholder, TextStyle, Color, Highlight, SlashCommand, blockKeyboard.
 *   Same Enter / Backspace / autosave / focusAtEnd / autoFocus patterns.
 *
 * Color:
 *   Stored in block.content.color. The color picker in DocumentEditor's context
 *   menu sets block.bg_color (block-level). content.color is the callout's own
 *   themed color and is independent.
 */

'use client';

import { useEffect, useRef }        from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit                   from '@tiptap/starter-kit';
import Placeholder                  from '@tiptap/extension-placeholder';
import { TextStyle }                from '@tiptap/extension-text-style';
import { Color }                    from '@tiptap/extension-color';
import Highlight                    from '@tiptap/extension-highlight';
import { Extension }                from '@tiptap/core';
import { SlashCommand }             from '@/components/editor/extensions/SlashCommand';
import type { Block }               from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EMOJIS = ['💡', '⚠️', '❌', '✅', '📌', '🔥', '💬', '📎', '🎯', 'ℹ️'] as const;

type CalloutColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';

interface ColorClasses {
  bg:     string;
  border: string;
  text:   string;
}

const COLOR_MAP: Record<CalloutColor, ColorClasses> = {
  blue:   { bg: 'bg-blue-950/40',    border: 'border-blue-800/50',    text: 'text-blue-200'    },
  green:  { bg: 'bg-green-950/40',   border: 'border-green-800/50',   text: 'text-green-200'   },
  yellow: { bg: 'bg-yellow-950/40',  border: 'border-yellow-800/50',  text: 'text-yellow-200'  },
  red:    { bg: 'bg-red-950/40',     border: 'border-red-800/50',     text: 'text-red-200'     },
  purple: { bg: 'bg-violet-950/40',  border: 'border-violet-800/50',  text: 'text-violet-200'  },
  gray:   { bg: 'bg-neutral-800/40', border: 'border-neutral-700',    text: 'text-neutral-300' },
};

function isCalloutColor(v: unknown): v is CalloutColor {
  return typeof v === 'string' && v in COLOR_MAP;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CalloutBlockProps {
  block:         Block;
  onSave:        (content: Record<string, unknown>) => void;
  onEnter:       () => void;
  onDelete:      () => void;
  onFocus:       () => void;
  onBlur:        () => void;
  onTextChange?: (text: string) => void;
  isSelected:    boolean;
  autoFocus?:    boolean;
  focusAtEnd?:   boolean;
  readOnly?:     boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CalloutBlock({
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
}: CalloutBlockProps) {

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolved content fields
  const emoji = typeof block.content.emoji === 'string' && block.content.emoji
    ? block.content.emoji
    : '💡';
  const color: CalloutColor = isCalloutColor(block.content.color)
    ? block.content.color
    : 'blue';

  const { bg, border, text } = COLOR_MAP[color];

  // Keep stable refs so keyboard extension closures never stale
  const onSaveRef       = useRef(onSave);
  const onEnterRef      = useRef(onEnter);
  const onDeleteRef     = useRef(onDelete);
  const onFocusRef      = useRef(onFocus);
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => { onSaveRef.current       = onSave;       }, [onSave]);
  useEffect(() => { onEnterRef.current      = onEnter;      }, [onEnter]);
  useEffect(() => { onDeleteRef.current     = onDelete;     }, [onDelete]);
  useEffect(() => { onFocusRef.current      = onFocus;      }, [onFocus]);
  useEffect(() => { onTextChangeRef.current = onTextChange; }, [onTextChange]);

  // ── Emoji cycling ─────────────────────────────────────────────────────────
  function cycleEmoji() {
    if (readOnly) return;
    const idx     = EMOJIS.indexOf(emoji as typeof EMOJIS[number]);
    const nextIdx = idx === -1 ? 1 : (idx + 1) % EMOJIS.length;
    const next    = EMOJIS[nextIdx];
    const text    = editor?.getText() ?? '';
    onSaveRef.current({ text, emoji: next, color, marks: [] });
  }

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
      Placeholder.configure({ placeholder: 'Callout…' }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      SlashCommand,
      Extension.create({
        name: 'calloutKeyboard',
        addKeyboardShortcuts() {
          return {
            Enter: () => {
              if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                onSaveRef.current({ text: this.editor.getText(), emoji, color, marks: [] });
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
    content:  String(block.content.text ?? ''),
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      const t = e.getText();
      onTextChangeRef.current?.(t);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSaveRef.current({ text: t, emoji, color, marks: [] });
      }, 300);
    },
    onFocus: () => onFocus(),
    onBlur:  () => onBlur(),
  });

  // ── Auto-focus ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoFocus) return;
    let attempts = 0;
    let timerId: ReturnType<typeof setTimeout>;
    function tryFocus() {
      attempts++;
      if (editor && editor.isEditable) { editor.commands.focus('end'); return; }
      if (attempts < 10) timerId = setTimeout(tryFocus, 50);
    }
    timerId = setTimeout(tryFocus, 50);
    return () => clearTimeout(timerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, editor]);

  // ── Focus at end ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!focusAtEnd) return;
    let attempts = 0;
    let timerId: ReturnType<typeof setTimeout>;
    function tryFocus() {
      attempts++;
      if (editor && editor.isEditable) {
        editor.commands.focus('end');
        onFocusRef.current();
        return;
      }
      if (attempts < 10) timerId = setTimeout(tryFocus, 50);
    }
    timerId = setTimeout(tryFocus, 50);
    return () => clearTimeout(timerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAtEnd, editor]);

  // ── Sync external content changes ────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div
      className={[
        'rounded-lg border px-4 py-3 flex items-start gap-3',
        bg,
        border,
        text,
        isSelected ? 'ring-1 ring-violet-500/40' : '',
      ].join(' ')}
    >
      {/* Emoji — click to cycle, disabled in readOnly */}
      <button
        type="button"
        onClick={cycleEmoji}
        disabled={readOnly}
        className={[
          'text-xl shrink-0 mt-0.5 leading-none select-none',
          readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform',
        ].join(' ')}
        title={readOnly ? undefined : 'Click to change icon'}
      >
        {emoji}
      </button>

      {/* Rich-text body */}
      <div className="flex-1 min-w-0">
        <EditorContent
          editor={editor}
          className="outline-none w-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1.5em]"
          onDrop={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
