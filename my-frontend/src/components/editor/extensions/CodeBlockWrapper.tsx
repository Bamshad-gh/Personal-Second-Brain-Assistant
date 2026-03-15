/**
 * extensions/CodeBlockWrapper.tsx
 *
 * What:    React node view for code blocks rendered inside TipTap.
 *          Displays the code content + a language selector dropdown in the header.
 *
 * Why:     TipTap's default CodeBlockLowlight renders a plain <pre><code>.
 *          We need a language picker so users can change syntax highlighting.
 *          ReactNodeViewRenderer lets us mount a full React component as the
 *          node view — TipTap still manages the cursor and text editing inside
 *          NodeViewContent, we just wrap it in custom UI.
 *
 * How it works:
 *   1. CustomCodeBlock.ts extends CodeBlockLowlight with addNodeView()
 *   2. That calls ReactNodeViewRenderer(CodeBlockWrapper)
 *   3. TipTap mounts this component whenever a codeBlock node is rendered
 *   4. The <select> calls updateAttributes({ language }) — TipTap re-highlights
 *   5. NodeViewContent as="pre" renders the editable code area
 *
 * To add languages:  add an entry to the LANGUAGES array below.
 * To change styling: edit the className strings in the JSX.
 *
 * Used by:  CustomCodeBlock.ts → addNodeView()
 * Mounted:  by TipTap's ReactNodeViewRenderer (not by React directly)
 */

'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';

// All languages available in the selector.
// Each entry must be a valid lowlight language identifier.
// To add more: https://github.com/highlightjs/highlight.js/blob/main/SUPPORTED_LANGUAGES.md
export const LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'html',
  'css',
  'json',
  'bash',
  'sql',
  'rust',
  'go',
  'java',
  'cpp',
  'php',
  'ruby',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CodeBlockWrapper({ node, updateAttributes }: any) {
  const language: string = node.attrs.language || 'plaintext';

  return (
    <NodeViewWrapper className="relative my-4">
      <div className="rounded-lg overflow-hidden border border-neutral-800 bg-[#111]">
        {/* ── Header: "code" label + language selector ────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900">
          <span className="text-xs font-mono text-neutral-600">code</span>

          {/* Language selector — contentEditable=false so TipTap ignores clicks on it */}
          <select
            value={language}
            onChange={(e) => updateAttributes({ language: e.target.value })}
            contentEditable={false}
            className={[
              'text-xs font-mono bg-neutral-800 text-neutral-400',
              'border border-neutral-700 rounded px-1.5 py-0.5',
              'hover:border-neutral-600 focus:outline-none focus:border-violet-500',
              'cursor-pointer transition-colors',
            ].join(' ')}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang} className="bg-neutral-900">
                {lang}
              </option>
            ))}
          </select>
        </div>

        {/* ── Code content — TipTap manages cursor/selection here ──────────── */}
        {/* NodeViewContent only accepts as="div" in TipTap v3, so we wrap
            it in a <pre> for correct semantic rendering and scrolling.      */}
        <pre className="p-4 overflow-x-auto text-sm leading-relaxed m-0">
          <NodeViewContent />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
