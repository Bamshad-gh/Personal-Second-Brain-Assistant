/**
 * extensions/CanvasSlashCommand.ts
 *
 * What:    TipTap Extension for the canvas rich-block editor's slash command palette.
 *          Structurally identical to SlashCommand.ts but uses:
 *            - canvasSlashEventBus (isolated from document editor's bus)
 *            - PluginKey('canvasSlashCommand') (unique — avoids ProseMirror collision)
 *
 * Used by: CanvasRichBlock.tsx → extensions array
 * Depends: @tiptap/suggestion, canvasSlashEventBus, SlashMenu.tsx (COMMANDS)
 */
'use client'
import { Extension }    from '@tiptap/core';
import Suggestion       from '@tiptap/suggestion';
import type { SuggestionProps } from '@tiptap/suggestion';
import { PluginKey }    from '@tiptap/pm/state';

import { COMMANDS }                 from '../SlashMenu';
import type { SlashCommandItem }    from '../SlashMenu';
import { canvasSlashEventBus }      from '@/lib/canvasSlashEventBus';

export const CanvasSlashCommand = Extension.create({
  name: 'canvasSlashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: new PluginKey('canvasSlashCommand'),
        editor: this.editor,

        char: '/',
        startOfLine: false,
        allowSpaces: false,

        items: ({ query }: { query: string }) =>
          COMMANDS.filter((cmd) =>
            !query ||
            cmd.label.toLowerCase().includes(query.toLowerCase()) ||
            cmd.group.toLowerCase().includes(query.toLowerCase()),
          ),

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        command: ({ editor, range, props }: any) => {
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },

        render: () => ({
          onStart: (props: SuggestionProps) => {
            canvasSlashEventBus.emit('slash:open', {
              items:   props.items   as SlashCommandItem[],
              rect:    props.clientRect?.() ?? null,
              command: props.command as (item: SlashCommandItem) => void,
            });
          },

          onUpdate: (props: SuggestionProps) => {
            canvasSlashEventBus.emit('slash:update', {
              items:   props.items   as SlashCommandItem[],
              rect:    props.clientRect?.() ?? null,
              command: props.command as (item: SlashCommandItem) => void,
            });
          },

          onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'Escape') {
              canvasSlashEventBus.emit('slash:close');
              return true;
            }
            if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
              canvasSlashEventBus.emit('slash:keydown', { event });
              return true;
            }
            return false;
          },

          onExit: () => {
            canvasSlashEventBus.emit('slash:close');
          },
        }),
      }),
    ];
  },
});
