/**
 * components/canvas/CanvasToolbar.tsx
 *
 * What:    Fixed bottom-center toolbar for canvas mode.
 *          Provides add-block buttons, zoom controls, and a
 *          "← Document" button to switch back to document mode.
 *
 * Props:
 *   scale         — current zoom level (0.25–2.0); displayed as a percentage
 *   onZoomIn      — increase scale by ~10%
 *   onZoomOut     — decrease scale by ~10%
 *   onAddText     — create a text block at viewport centre
 *   onAddSticky   — create a sticky-note block at viewport centre
 *   onSwitchToDoc — switch page back to document mode
 *
 * Layout:
 *   [T Add text] [☆ Add sticky] | [−] [75%] [+] | [← Document]
 */

'use client';

import { Type, StickyNote, Minus, Plus, FileText, Image as ImageIcon, LayoutPanelLeft } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CanvasToolbarProps {
  scale:          number;
  onZoomIn:       () => void;
  onZoomOut:      () => void;
  onAddText:      () => void;
  onAddSticky:    () => void;
  onAddRich:      () => void;
  onSwitchToDoc:  () => void;
  hasCover?:      boolean;
  coverExpanded?: boolean;
  onToggleCover?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CanvasToolbar
// ─────────────────────────────────────────────────────────────────────────────

export function CanvasToolbar({
  scale,
  onZoomIn,
  onZoomOut,
  onAddText,
  onAddSticky,
  onAddRich,
  onSwitchToDoc,
  hasCover,
  coverExpanded,
  onToggleCover,
}: CanvasToolbarProps) {
  return (
    <div
      className={[
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-1',
        'rounded-xl border border-neutral-800 bg-neutral-900 shadow-xl',
        'px-3 py-2',
      ].join(' ')}
      // Prevent canvas pan/click handlers from firing when interacting with toolbar
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* ── Add text block ─────────────────────────────────────────────── */}
      <ToolbarButton onClick={onAddText} title="Add text block">
        <Type size={13} />
        <span>Text</span>
      </ToolbarButton>

      {/* ── Add sticky note ────────────────────────────────────────────── */}
      <ToolbarButton onClick={onAddSticky} title="Add sticky note">
        <StickyNote size={13} />
        <span>Sticky</span>
      </ToolbarButton>

      {/* ── Add rich block ─────────────────────────────────────────────── */}
      <ToolbarButton onClick={onAddRich} title="Add rich block">
        <LayoutPanelLeft size={13} />
        <span>Rich</span>
      </ToolbarButton>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <Divider />

      {/* ── Zoom out ───────────────────────────────────────────────────── */}
      <ToolbarIconButton onClick={onZoomOut} title="Zoom out (Ctrl+scroll)">
        <Minus size={13} />
      </ToolbarIconButton>

      {/* ── Zoom percentage display ────────────────────────────────────── */}
      <span className="min-w-[3rem] text-center text-xs text-neutral-400 tabular-nums">
        {Math.round(scale * 100)}%
      </span>

      {/* ── Zoom in ────────────────────────────────────────────────────── */}
      <ToolbarIconButton onClick={onZoomIn} title="Zoom in (Ctrl+scroll)">
        <Plus size={13} />
      </ToolbarIconButton>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <Divider />

      {/* ── Cover toggle (only when page has a cover) ──────────────────── */}
      {hasCover && onToggleCover && (
        <>
          <Divider />
          <ToolbarButton
            onClick={onToggleCover}
            title={coverExpanded ? 'Hide cover' : 'Show cover'}
            active={coverExpanded}
          >
            <ImageIcon size={13} />
            <span>{coverExpanded ? 'Hide cover' : 'Show cover'}</span>
          </ToolbarButton>
        </>
      )}

      {/* ── Switch to document mode ────────────────────────────────────── */}
      <ToolbarButton onClick={onSwitchToDoc} title="Switch to document mode">
        <FileText size={13} />
        <span>Document</span>
      </ToolbarButton>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick:  () => void;
  title:    string;
  active?:  boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5',
        'text-xs transition-colors',
        active
          ? 'bg-violet-900/30 text-violet-400 hover:bg-violet-900/50'
          : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ToolbarIconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick:  () => void;
  title:    string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'flex h-6 w-6 items-center justify-center rounded-md',
        'text-neutral-400 transition-colors',
        'hover:bg-neutral-800 hover:text-neutral-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-neutral-800" />;
}
