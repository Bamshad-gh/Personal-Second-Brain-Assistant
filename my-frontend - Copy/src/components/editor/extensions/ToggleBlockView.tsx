/**
 * extensions/ToggleBlockView.tsx
 *
 * React node view for the ToggleBlock extension.
 * Renders a collapsible section with a chevron toggle button.
 */

'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ToggleBlockView({ node, updateAttributes }: any) {
  const [open, setOpen] = useState<boolean>(node.attrs.open ?? true);

  function toggle() {
    const next = !open;
    setOpen(next);
    updateAttributes({ open: next });
  }

  return (
    <NodeViewWrapper>
      <div className="border-l-2 border-violet-600/40 pl-3 my-1">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 text-sm text-neutral-300 hover:text-neutral-100"
        >
          <ChevronRight
            size={12}
            className={`transition-transform text-violet-400 ${open ? 'rotate-90' : ''}`}
          />
          <span className="font-medium">Toggle</span>
        </button>
        {open && (
          <div className="mt-1 pl-3">
            <NodeViewContent />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
