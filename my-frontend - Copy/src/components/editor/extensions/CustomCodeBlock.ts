/**
 * extensions/CustomCodeBlock.ts
 *
 * What:    Extends TipTap's CodeBlockLowlight with a React node view
 *          that adds a language selector dropdown above the code.
 *
 * Why:     CodeBlockLowlight alone only does syntax highlighting — it renders
 *          a plain <pre><code>. We want a UI control to switch languages.
 *          addNodeView() lets us replace the default renderer with our own
 *          React component (CodeBlockWrapper) while TipTap still handles
 *          cursor movement and text editing inside the node.
 *
 * To add languages:      edit LANGUAGES in CodeBlockWrapper.tsx
 * To change default:     update `defaultLanguage` in the .configure() call
 * To add more lowlight:  import specific languages instead of `common`
 *                        e.g. import { javascript } from 'highlight.js/lib/languages/javascript'
 *                             lowlight.register('javascript', javascript)
 *
 * Used by:  Editor.tsx → extensions array (replaces StarterKit's codeBlock)
 * Depends:  CodeBlockWrapper.tsx, lowlight (already in package.json)
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import { CodeBlockWrapper } from './CodeBlockWrapper';

// createLowlight(common) bundles ~40 common languages (JS, TS, Python, etc.)
// It's tree-shakeable — only the languages listed in `common` are included.
const lowlight = createLowlight(common);

export const CustomCodeBlock = CodeBlockLowlight.extend({
  /**
   * Override the default node view renderer with our React component.
   * ReactNodeViewRenderer bridges TipTap's ProseMirror world and React:
   *   - Passes node.attrs (language, etc.) as props
   *   - Exposes updateAttributes() for the language selector
   *   - Wraps NodeViewContent so the code area stays editable
   */
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockWrapper);
  },
}).configure({
  lowlight,
  defaultLanguage: 'plaintext',
  // Adds class="code-block" to the outer element — useful for CSS targeting
  HTMLAttributes: { class: 'code-block' },
});
