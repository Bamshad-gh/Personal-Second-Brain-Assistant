/**
 * app/(app)/[workspaceId]/[pageId]/page.tsx — Page Editor
 *
 * What:    The full-screen editor for a single page.
 *          Loads page metadata + blocks, renders the TipTap editor
 *          (document mode) or the infinite canvas (canvas mode),
 *          autosaves content changes, and hosts the AI panel.
 *
 * URL:     /:workspaceId/:pageId
 *
 * Autosave: editor JSON → single "text" block → PATCH or POST on save.
 *
 * View modes:
 *   document — current vertical scroll TipTap editor (default)
 *   canvas   — infinite 2D space; blocks positioned with canvas_x/y
 *   Toggle via the Canvas / Document button in the top bar.
 *   PATCH /api/pages/:id/ with { view_mode } persists the choice.
 *
 * AI Panel: toggle with the "✨ AI" button in the top toolbar.
 *   → Panel source:   src/components/ai/AiPanel.tsx
 *   → Backend:        Apps/ai_agent/views.py
 *   → Panel state:    useAppStore → aiPanelOpen / toggleAiPanel
 *
 * Page options "..." menu (top-right):
 *   → Rename    — focuses the title input
 *   → Duplicate — POST /api/pages/:id/duplicate/ → navigate to copy
 *   → Copy link — navigator.clipboard
 *   → Delete    — confirm in-dropdown → DELETE + navigate to workspace
 *
 * Backlinks panel (document mode only): shown below the editor when
 * other pages link here.
 *   → Backend:  GET /api/relations/pages/{id}/backlinks/
 *   → API call: pageApi.backlinks(pageId) in lib/api.ts
 *   → Component: BacklinksPanel (defined at the bottom of this file)
 */

'use client';

import { useParams, useRouter }                       from 'next/navigation';
import Link                                           from 'next/link';
import { useState, useEffect, useCallback, useRef }   from 'react';
import { ArrowLeft, Lock, Sparkles, Link2,
         MoreHorizontal, Pencil, Files, Copy, Trash2,
         LayoutDashboard, FileText, Layers }           from 'lucide-react';
import toast                                          from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient }      from '@tanstack/react-query';
import { pageApi }                                    from '@/lib/api';
import { useBlocks, useCreateBlock, useUpdateBlock }  from '@/hooks/useBlocks';
import { useUpdatePage, useDeletePage, pageKeys }     from '@/hooks/usePages';
import { useCustomPageTypes }                         from '@/hooks/useCustomPageTypes';
import { useAppStore }                                from '@/lib/store';
import { Editor }                                     from '@/components/editor/Editor';
import { EditorErrorBoundary }                        from '@/components/editor/EditorErrorBoundary';
import { AiPanel }                                    from '@/components/ai/AiPanel';
import { DropdownMenu }                               from '@/components/ui/DropdownMenu';
import { PropertyBar }                                from '@/components/properties/PropertyBar';
import { CanvasView }                                 from '@/components/canvas/CanvasView';
import type { BacklinkPage }                          from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function PageEditorRoute() {
  const params      = useParams<{ workspaceId: string; pageId: string }>();
  const { workspaceId, pageId } = params;
  const router = useRouter();

  // ── AI panel state from Zustand ─────────────────────────────────────────
  const aiPanelOpen   = useAppStore((s) => s.aiPanelOpen);
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);

  // ── Load page metadata ──────────────────────────────────────────────────
  const { data: page, isLoading: pageLoading, error: pageError } = useQuery({
    queryKey: ['page', pageId],
    queryFn:  () => pageApi.get(pageId),
    enabled:  !!pageId,
    staleTime: 1000 * 60,
  });

  // ── Load blocks ─────────────────────────────────────────────────────────
  const { data: blocks = [], isLoading: blocksLoading } = useBlocks(pageId);
  const createBlock = useCreateBlock(pageId);
  const updateBlock = useUpdateBlock(pageId);
  const updatePage  = useUpdatePage(workspaceId);
  const deletePage  = useDeletePage(workspaceId);

  // ── Custom page types (for type picker + badge) ──────────────────────────
  const { data: customTypes = [] } = useCustomPageTypes(workspaceId);

  // ── Duplicate mutation ───────────────────────────────────────────────────
  const queryClient   = useQueryClient();
  const duplicatePage = useMutation({
    mutationFn: () => pageApi.duplicate(pageId),
    onSuccess: (newPage) => {
      // Refresh sidebar so the copy appears immediately
      queryClient.invalidateQueries({ queryKey: pageKeys.all(workspaceId) });
      router.push(`/${workspaceId}/${newPage.id}`);
    },
    onError: () => toast.error('Could not duplicate page.'),
  });

  // ── Editable title ──────────────────────────────────────────────────────
  const [title, setTitle]           = useState('');
  const [titleSaved, setTitleSaved] = useState(false);
  const titleSaveTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef               = useRef<HTMLInputElement>(null);

  // Sync title when a different page loads.
  const [lastLoadedPageId, setLastLoadedPageId] = useState<string | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (page?.id && page.id !== lastLoadedPageId) {
      setLastLoadedPageId(page.id);
      if (page.title !== undefined) setTitle(page.title);
    }
  }, [page?.id, page?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      updatePage.mutate(
        { id: pageId, payload: { title: e.target.value } },
        {
          onSuccess: () => { setTitleSaved(true); setTimeout(() => setTitleSaved(false), 2000); },
          onError:   () => toast.error('Could not save title.'),
        },
      );
    }, 600);
  }

  // ── Page options "..." menu state ───────────────────────────────────────
  // When true, the dropdown shows a delete confirmation instead of normal items.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // ── Change type inline picker ────────────────────────────────────────────
  const [changingType, setChangingType] = useState(false);

  // ── Track editor plain text (for AI context — document mode only) ────────
  const [editorText, setEditorText] = useState('');

  // ── Find the main content block (document mode autosave) ────────────────
  // canvas_x === null guards against canvas text blocks contaminating the document editor
  const contentBlock = blocks.find((b) => b.block_type === 'text' && b.canvas_x === null);

  // ── Canvas blocks — only blocks explicitly pinned to the canvas ───────────
  const canvasBlocks = blocks.filter((b) => b.canvas_visible);

  // ── Autosave callback (document mode) ───────────────────────────────────
  const handleSave = useCallback(
    async (json: Record<string, unknown>) => {
      try {
        if (contentBlock) {
          await updateBlock.mutateAsync({
            id:      contentBlock.id,
            payload: { content: { json } },
          });
        } else {
          await createBlock.mutateAsync({
            block_type: 'text',
            content:    { json },
            order:      1,
          });
        }
      } catch {
        toast.error('Auto-save failed. Your changes may not be saved.');
      }
    },
    [contentBlock, updateBlock, createBlock],
  );

  // ── Extract initial TipTap JSON (document mode) ─────────────────────────
  const initialContent =
    contentBlock?.content?.json as Record<string, unknown> | null ?? null;

  // ── Loading / error ─────────────────────────────────────────────────────

  if (pageLoading || blocksLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-in">
        <div className="mb-8 h-10 w-2/3 animate-shimmer rounded-xl" />
        <div className="space-y-3">
          {[75, 90, 65, 85, 70, 95, 60, 80].map((w, i) => (
            <div key={i} className="animate-shimmer rounded-lg"
              style={{ height: '1.25rem', width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (pageError || !page) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center text-neutral-500">
        <p className="text-4xl mb-4">🔍</p>
        <p className="text-lg font-medium text-neutral-300">Page not found</p>
        <button onClick={() => router.push(`/${workspaceId}`)}
          className="mt-4 text-sm text-violet-400 hover:text-violet-300 transition-colors">
          ← Back to workspace
        </button>
      </div>
    );
  }

  // ── Derived: are we in canvas mode? ─────────────────────────────────────
  const isCanvas = page.view_mode === 'canvas';

  // ── Derived: current custom type (for badge + type picker) ───────────────
  const currentType = customTypes.find((t) => t.id === page.custom_page_type) ?? null;

  // ── Page options dropdown items ──────────────────────────────────────────
  //
  // When confirmingDelete is true the dropdown shows a two-step confirmation
  // so the user cannot accidentally delete with a single click.

  const pageMenuItems = confirmingDelete
    ? [
        {
          label:    'Delete this page?',
          onClick:  () => {},
          disabled: true,
        },
        {
          label:   'Yes, delete',
          variant: 'danger' as const,
          icon:    <Trash2 size={13} />,
          onClick: async () => {
            await deletePage.mutateAsync(pageId);
            router.push(`/${workspaceId}`);
          },
        },
        {
          label:   'Cancel',
          onClick: () => setConfirmingDelete(false),
        },
      ]
    : [
        {
          label:   'Rename',
          icon:    <Pencil size={13} />,
          // Small delay lets the dropdown close animation finish before focus
          onClick: () => { setTimeout(() => titleInputRef.current?.focus(), 50); },
        },
        {
          label:    'Duplicate',
          icon:     <Files size={13} />,
          disabled: duplicatePage.isPending,
          onClick:  () => duplicatePage.mutate(),
        },
        {
          label:   'Copy link',
          icon:    <Copy size={13} />,
          onClick: () => {
            navigator.clipboard.writeText(window.location.href);
            toast.success('Link copied');
          },
        },
        {
          label:   'Change type',
          icon:    <Layers size={13} />,
          onClick: () => setChangingType((v) => !v),
        },
        {
          label:   'Delete',
          icon:    <Trash2 size={13} />,
          variant: 'danger' as const,
          onClick: () => setConfirmingDelete(true),
        },
      ];

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    // Outer flex row: main content column + optional AI panel
    <div className="flex h-full">

      {/* ── Main column ────────────────────────────────────────────────────
          In document mode: overflow-y-auto (scrollable)
          In canvas  mode:  overflow-hidden + flex-col (canvas fills remaining height) */}
      <div className={[
        'flex-1',
        isCanvas ? 'overflow-hidden flex flex-col' : 'overflow-y-auto',
      ].join(' ')}>

        {/* ── Header section — always constrained to max-w-3xl ─────────── */}
        <div className="mx-auto w-full max-w-3xl px-6 pt-10 animate-fade-in">

          {/* Top bar */}
          <div className="mb-8 flex items-center gap-3">

            {/* ← Back to workspace */}
            <button
              onClick={() => router.push(`/${workspaceId}`)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
              title="Back to workspace"
            >
              <ArrowLeft size={15} />
            </button>

            {titleSaved && (
              <span className="text-xs text-violet-400">Saved ✓</span>
            )}

            {/* Right-side controls */}
            <div className="ml-auto flex items-center gap-1">

              {/* AI toggle button */}
              <button
                onClick={toggleAiPanel}
                className={[
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                  'transition-all duration-200',
                  aiPanelOpen
                    ? 'text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200',
                ].join(' ')}
                style={aiPanelOpen ? {
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                  boxShadow: '0 0 12px rgba(139,92,246,0.3)',
                } : {}}
                title="Toggle AI assistant"
              >
                <Sparkles size={13} />
                AI
              </button>

              {/* View mode toggle — Canvas ↔ Document */}
              {!page.is_locked && (
                <button
                  onClick={() => {
                    const next = isCanvas ? 'document' : 'canvas';
                    updatePage.mutate({ id: pageId, payload: { view_mode: next } });
                  }}
                  disabled={updatePage.isPending}
                  className={[
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                    'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200',
                    'transition-all duration-200 disabled:opacity-50',
                  ].join(' ')}
                  title={isCanvas ? 'Switch to document mode' : 'Switch to canvas mode'}
                >
                  {isCanvas
                    ? <><FileText size={13} /> Document</>
                    : <><LayoutDashboard size={13} /> Canvas</>
                  }
                </button>
              )}

              {/* "..." page options menu */}
              <DropdownMenu items={pageMenuItems}>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
                  title="Page options"
                >
                  <MoreHorizontal size={15} />
                </button>
              </DropdownMenu>

            </div>

            {page.is_locked && (
              <span className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-500">
                <Lock size={10} /> Locked
              </span>
            )}
          </div>

          {/* Icon + title */}
          <div className="mb-6">
            <div className="mb-3 text-4xl leading-none select-none">{page.icon || '📄'}</div>

            {/* Title row — input + optional type badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={titleInputRef}
                value={title}
                onChange={handleTitleChange}
                placeholder="Untitled"
                disabled={page.is_locked}
                className={[
                  'flex-1 min-w-0 bg-transparent text-3xl font-bold text-neutral-100 placeholder-neutral-700',
                  'border-none outline-none ring-0',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
                aria-label="Page title"
              />
              {currentType && (
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 shrink-0">
                  {currentType.icon || '📄'} {currentType.name}
                </span>
              )}
            </div>

            {/* Type picker — shown when "Change type" is toggled */}
            {changingType && (
              <div className="mt-2 mb-3 flex flex-wrap gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 p-2 animate-fade-in">
                <button
                  onClick={() => {
                    updatePage.mutate({ id: pageId, payload: { custom_page_type: null } });
                    setChangingType(false);
                  }}
                  className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                  📄 Note
                </button>
                {customTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      updatePage.mutate({ id: pageId, payload: { custom_page_type: t.id } });
                      setChangingType(false);
                    }}
                    className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
                  >
                    {t.icon || '📄'} {t.name}
                  </button>
                ))}
              </div>
            )}

            {/* Properties row — typed metadata fields below the title */}
            <PropertyBar
              workspaceId={workspaceId}
              pageId={pageId}
              readOnly={page.is_locked}
              customPageTypeId={page.custom_page_type ?? null}
            />
          </div>

        </div>{/* end header section */}

        {/* ── Content section — editor (document) or canvas ─────────────── */}
        {isCanvas ? (

          // ── Canvas mode: fills remaining flex height, full width ────────
          <div className="flex-1 min-h-0">
            <CanvasView
              blocks={canvasBlocks}
              pageId={pageId}
              workspaceId={workspaceId}
              readOnly={page.is_locked}
              onSwitchToDoc={() =>
                updatePage.mutate({ id: pageId, payload: { view_mode: 'document' } })
              }
            />
          </div>

        ) : (

          // ── Document mode: constrained, scrollable editor ───────────────
          <div className="mx-auto w-full max-w-3xl px-6 pb-10">
            {/* TipTap editor — wrapped in error boundary to prevent blank screen on crash */}
            <EditorErrorBoundary>
              <Editor
                initialContent={initialContent}
                onSave={handleSave}
                onTextChange={setEditorText}
                readOnly={page.is_locked}
                workspaceId={workspaceId}
                pageId={pageId}
              />
            </EditorErrorBoundary>

            {/* Backlinks panel — shows pages that [[link]] to this page.
                Renders nothing when there are no backlinks. */}
            <BacklinksPanel pageId={pageId} workspaceId={workspaceId} />

            {/* Shared canvas blocks — canvas blocks also marked doc_visible */}
            {blocks.filter((b) => b.canvas_visible && b.doc_visible).length > 0 && (
              <div className="mt-8 border-t border-neutral-800 pt-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 mb-3">
                  Canvas blocks
                </p>
                {blocks
                  .filter((b) => b.canvas_visible && b.doc_visible)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="mb-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-sm text-neutral-400"
                    >
                      {b.block_type === 'sticky' || b.block_type === 'text'
                        ? <p>{JSON.stringify(b.content).slice(0, 100)}…</p>
                        : <p className="italic">[{b.block_type} canvas block]</p>
                      }
                    </div>
                  ))
                }
              </div>
            )}
          </div>

        )}

      </div>{/* end main column */}

      {/* ── AI Panel (slides in from right) ────────────────────────────── */}
      {aiPanelOpen && (
        <AiPanel
          pageId={pageId}
          pageContent={`${title}\n\n${editorText}`}
          onClose={() => toggleAiPanel()}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BacklinksPanel
//
// What:    Shows a "Linked from" section at the bottom of the page listing
//          all other pages that contain a [[link]] pointing to this page.
//
// Props:
//   pageId      — UUID of the current page (the link target)
//   workspaceId — UUID of the current workspace; used to build nav URLs
//
// Behaviour:
//   - Returns null when there are no backlinks (renders nothing, no empty state)
//   - Refreshes when the user navigates to a new page (pageId changes)
//   - staleTime: 60s — backlinks change only when another page is saved
//
// Files that import this:
//   This file only — defined here because it is tightly coupled to this route.
// ─────────────────────────────────────────────────────────────────────────────

interface BacklinksPanelProps {
  pageId:      string;
  workspaceId: string;
}

function BacklinksPanel({ pageId, workspaceId }: BacklinksPanelProps) {
  const { data: backlinks = [] } = useQuery<BacklinkPage[]>({
    queryKey: ['backlinks', pageId],
    queryFn:  () => pageApi.backlinks(pageId),
    enabled:  !!pageId,
    staleTime: 1000 * 60, // backlinks change only when another page inserts a link
  });

  // Render nothing when no pages link here — avoids an empty section
  if (backlinks.length === 0) return null;

  return (
    <div className="mt-16 border-t border-neutral-800 pt-6 animate-fade-in">

      {/* Section header */}
      <div className="mb-3 flex items-center gap-2">
        <Link2 size={13} className="text-neutral-600" />
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
          Linked from
        </p>
        {/* Count badge */}
        <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500">
          {backlinks.length}
        </span>
      </div>

      {/* One row per backlink */}
      <div className="space-y-1">
        {backlinks.map((b) => (
          <Link
            key={b.id}
            href={`/${workspaceId}/${b.source_page_id}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-violet-400 transition-colors hover:bg-neutral-800 hover:text-violet-300"
          >
            {/* Chip-style label mirrors how page links look in the editor */}
            <span className="font-medium">[[{b.source_page_title || 'Untitled'}]]</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
