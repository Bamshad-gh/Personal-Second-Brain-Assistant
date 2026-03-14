/**
 * extensions/ToggleBlock.ts
 *
 * Custom TipTap node: a collapsible toggle block (like Notion's toggle).
 *
 * Usage in editor:  /toggle → inserts a ToggleBlock
 * Renders via:      ToggleBlockView.tsx (React component)
 *
 * Storage format:   <details open> wraps the content
 * Attribute:        open (boolean) — whether the toggle is expanded
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ToggleBlockView } from './ToggleBlockView';

export const ToggleBlock = Node.create({
  name: 'toggleBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      open: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'details' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleBlockView);
  },
});
