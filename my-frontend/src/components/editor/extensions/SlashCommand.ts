/**
 * extensions/SlashCommand.ts
 *
 * What:    TipTap Extension that intercepts "/" and shows a command palette.
 *
 * Architecture:
 *   Uses @tiptap/suggestion for ProseMirror integration.
 *   Communicates with Editor.tsx via slashEventBus (lib/slashEventBus.ts)
 *   instead of ReactRenderer or TipTap's editor.emit/on.
 *
 * Why slashEventBus instead of editor.emit/on:
 *   TipTap v3's EventEmitter only accepts events declared in EditorEvents.
 *   Custom events require TypeScript augmentation but runtime behaviour is not
 *   guaranteed. A standalone module-level bus is simpler and reliable.
 *
 * Events emitted:
 *   slash:open    — { items, rect, command }
 *   slash:update  — { items, rect, command }
 *   slash:keydown — { event }
 *   slash:close   — (no payload)
 *
 * IMPORTANT: All render() lifecycle methods MUST use arrow function syntax.
 *   Arrow functions capture variables from the enclosing closure.
 *   Method shorthand (onStart() {}) does NOT close over those variables.
 *
 * To add commands:   edit COMMANDS in SlashMenu.tsx
 * To change trigger: change `char: '/'` below
 *
 * Used by:   Editor.tsx → extensions array
 * Depends:   @tiptap/suggestion
 *            SlashMenu.tsx (COMMANDS, SlashCommandItem)
 *            lib/slashEventBus.ts
 */
'use client'
import { Extension }    from '@tiptap/core';
import Suggestion       from '@tiptap/suggestion';
import type { SuggestionProps } from '@tiptap/suggestion';
import { PluginKey }    from '@tiptap/pm/state';

import { COMMANDS }        from '../SlashMenu';
import type { SlashCommandItem } from '../SlashMenu';
import { slashEventBus }   from '@/lib/slashEventBus';

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        // Unique key prevents collision with PageLinkSuggestion's suggestion$ plugin
        pluginKey: new PluginKey('slashCommand'),
        editor: this.editor,

        // Trigger character — "/" anywhere in a paragraph (not just start of line)
        char: '/',
        startOfLine: false,
        allowSpaces: false,

        // Filter the command list as the user types after "/"
        items: ({ query }: { query: string }) =>
          COMMANDS.filter((cmd) =>
            !query ||
            cmd.label.toLowerCase().includes(query.toLowerCase()) ||
            cmd.group.toLowerCase().includes(query.toLowerCase()),
          ),

        // Called when the user selects a command (Enter key or click).
        // Deletes "/" + query text, then runs the selected block command.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        command: ({ editor, range, props }: any) => {
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },

        // ── Render lifecycle ────────────────────────────────────────────────
        //
        // No ReactRenderer, no stub div, no editor.emit/on.
        // Each lifecycle method emits on slashEventBus; Editor.tsx listens.
        render: () => ({
          onStart: (props: SuggestionProps) => {
            slashEventBus.emit('slash:open', {
              items:   props.items   as SlashCommandItem[],
              rect:    props.clientRect?.() ?? null,
              command: props.command as (item: SlashCommandItem) => void,
            });
          },

          onUpdate: (props: SuggestionProps) => {
            slashEventBus.emit('slash:update', {
              items:   props.items   as SlashCommandItem[],
              rect:    props.clientRect?.() ?? null,
              command: props.command as (item: SlashCommandItem) => void,
            });
          },

          onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            // Escape — close menu without selecting
            if (event.key === 'Escape') {
              slashEventBus.emit('slash:close');
              return true; // consumed
            }
            // Arrow keys + Enter — delegate to SlashMenuList via Editor.tsx
            if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
              slashEventBus.emit('slash:keydown', { event });
              return true; // consumed — prevent ProseMirror default
            }
            return false;
          },

          onExit: () => {
            // Called when "/" is deleted, focus leaves, or Escape was pressed.
            slashEventBus.emit('slash:close');
          },
        }),
      }),
    ];
  },
});
