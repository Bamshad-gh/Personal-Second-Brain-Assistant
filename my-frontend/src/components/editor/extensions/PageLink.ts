/**
 * extensions/PageLink.ts
 *
 * What:    Two TipTap extensions for the [[ page-link feature.
 *
 *   PageLinkNode       — inline atom node that renders as a styled [[Title]] chip.
 *                        Stores pageid, pagetitle, workspaceid as node attributes.
 *                        Click handling lives in Editor.tsx (delegated click on editor container).
 *
 *   PageLinkSuggestion — intercepts "[[ " and fires pageLinkEventBus events so
 *                        Editor.tsx can show <PageLinkPopup> and handle selection.
 *                        Keyboard delegation (arrow keys, Enter, Escape) mirrors
 *                        SlashCommand.ts exactly.
 *
 * Architecture:
 *   Same event-bus pattern as SlashCommand.ts / slashEventBus.ts.
 *   No ReactRenderer, no editor.emit/on, no stub divs.
 *   Editor.tsx listens to pageLinkEventBus and owns all React state.
 *
 * Events emitted (pageLinkEventBus):
 *   pagelink:open    — { query, rect, range }  on suggestion start and every keystroke
 *   pagelink:keydown — { event }               for ArrowUp / ArrowDown / Enter
 *   pagelink:close   — (no payload)            on Escape or suggestion exit
 *
 * Exports:
 *   PageLinkNode        — register in Editor.tsx extensions array
 *   PageLinkSuggestion  — register in Editor.tsx extensions array
 *
 * IMPORTANT: All render() lifecycle methods use arrow functions (not method shorthand)
 *   so they close over the correct props reference. See SlashCommand.ts for context.
 *
 * Used by:   Editor.tsx → extensions array
 * Depends:   @tiptap/suggestion, lib/pageLinkEventBus.ts
 */

'use client';

import { Node, Extension, mergeAttributes } from '@tiptap/core';
import Suggestion                            from '@tiptap/suggestion';
import type { SuggestionProps }              from '@tiptap/suggestion';
import { PluginKey }                         from '@tiptap/pm/state';

import { pageLinkEventBus } from '@/lib/pageLinkEventBus';

// ─────────────────────────────────────────────────────────────────────────────
// PageLinkNode — the rendered [[Title]] chip inside the editor
// ─────────────────────────────────────────────────────────────────────────────

export const PageLinkNode = Node.create({
  name: 'pageLink',

  // Inline content, sits among text — same group as text nodes
  group:  'inline',
  inline: true,

  // atom: true means TipTap treats this as a single non-editable unit.
  // The cursor jumps over it; you can't place the caret inside it.
  atom: true,

  // ── Node attributes (stored in the editor JSON) ─────────────────────────

  addAttributes() {
    return {
      /** UUID of the linked page — used for navigation and the relations API */
      pageid: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-page-id'),
        renderHTML: (attrs) => ({ 'data-page-id': attrs.pageid }),
      },

      /** Display title — shown in the chip and used as fallback if page is deleted */
      pagetitle: {
        default: '',
        parseHTML: (element) =>
          // Strip the surrounding [[ ]] from the text content to recover the title
          element.textContent?.replace(/^\[\[|\]\]$/g, '') ?? '',
        renderHTML: () => ({}), // title is the text content, not an attribute
      },

      /** UUID of the workspace the page lives in — used to build the nav URL */
      workspaceid: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-workspace-id'),
        renderHTML: (attrs) => ({ 'data-workspace-id': attrs.workspaceid }),
      },
    };
  },

  // ── HTML serialisation (what goes into the editor's HTML output) ─────────

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class:                'page-link-node',
        // data-page-id and data-workspace-id come from addAttributes renderHTML above
        // title attr gives a native browser tooltip showing where the link goes
        title: `Go to [[${node.attrs.pagetitle as string}]]`,
      }),
      `[[${node.attrs.pagetitle as string}]]`,
    ];
  },

  // ── HTML parsing (used when loading saved content back into TipTap) ──────

  parseHTML() {
    return [
      {
        // Match any <span> that has a data-page-id attribute
        tag: 'span[data-page-id]',
      },
    ];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PageLinkSuggestion — the [[ trigger that shows the search popup
// ─────────────────────────────────────────────────────────────────────────────

export const PageLinkSuggestion = Extension.create({
  name: 'pageLinkSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        // Unique key prevents collision with SlashCommand's suggestion$ plugin
        pluginKey: new PluginKey('pageLinkSuggestion'),
        editor: this.editor,

        // Trigger sequence — fires when user types "[["
        char:         '[[',
        startOfLine:  false,
        allowSpaces:  true, // page titles contain spaces — allow them in the query

        // items() is required by the Suggestion API but filtering happens in the
        // React popup (PageLinkPopup.tsx) where we have access to the page list.
        // Return a stable non-empty marker so onStart/onUpdate always fire.
        items: ({ query }: { query: string }): Array<{ query: string }> => [{ query }],

        // command() is called when the suggestion plugin resolves a selection.
        // We do NOT use this path — selection is handled entirely in Editor.tsx
        // via handlePageLinkSelect() which deletes the range and inserts the node.
        // This is a noop so the suggestion plugin stays happy.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        command: (_props) => {
          // Intentional noop — Editor.tsx owns the insert logic
        },

        // ── Render lifecycle ───────────────────────────────────────────────
        //
        // Mirror of SlashCommand.ts render().
        // Arrow functions required so props is captured from the correct closure.
        render: () => ({

          // Called once when "[[" is first typed
          onStart: (props: SuggestionProps) => {
            pageLinkEventBus.emit('pagelink:open', {
              query: props.query,
              rect:  props.clientRect?.() ?? null,
              range: props.range, // ProseMirror range covering "[[query" — used for deletion
            });
          },

          // Called on every subsequent keystroke while the suggestion is active
          onUpdate: (props: SuggestionProps) => {
            // Re-fire open with the updated query and range (range.to moves right as user types)
            pageLinkEventBus.emit('pagelink:open', {
              query: props.query,
              rect:  props.clientRect?.() ?? null,
              range: props.range,
            });
          },

          // Called when a key is pressed while the suggestion is active.
          // Return true = event consumed (prevent ProseMirror default).
          // Return false = let ProseMirror handle it.
          onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            // Escape — close popup without selecting anything
            if (event.key === 'Escape') {
              pageLinkEventBus.emit('pagelink:close');
              return true; // consumed
            }

            // Arrow keys and Enter — delegate to PageLinkPopup via Editor.tsx
            if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
              pageLinkEventBus.emit('pagelink:keydown', { event });
              return true; // consumed — prevent ProseMirror cursor movement
            }

            return false; // all other keys: let ProseMirror handle normally
          },

          // Called when the suggestion exits — user deleted "[[", clicked away, etc.
          onExit: () => {
            pageLinkEventBus.emit('pagelink:close');
          },
        }),
      }),
    ];
  },
});
