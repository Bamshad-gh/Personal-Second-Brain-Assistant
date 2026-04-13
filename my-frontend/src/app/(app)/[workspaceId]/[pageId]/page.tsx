/**
 * app/(app)/[workspaceId]/[pageId]/page.tsx — Page Editor
 *
 * What:    The full-screen editor for a single page.
 *          Loads page metadata + blocks, renders DocumentEditor
 *          (document mode) or the infinite canvas (canvas mode),
 *          autosaves content changes, and hosts the AI panel.
 *
 * URL:     /:workspaceId/:pageId
 *
 * Document mode (Phase 2+):
 *   Uses DocumentEditor with per-block create/update/delete.
 *   Each block is an independent row with its own mini TipTap editor.
 *   Blocks are stored with doc_visible=true and sorted by fractional order.
 *
 * Canvas mode:
 *   Unchanged. CanvasView receives canvas_visible blocks + the first
 *   doc block for the document card preview.
 *
 * View modes:
 *   document — DocumentEditor (vertical scroll, per-block)
 *   canvas   — infinite 2D space; blocks positioned with canvas_x/y
 *   Toggle via the Canvas / Document button in the top bar.
 *   PATCH /api/pages/:id/ with { view_mode } persists the choice.
 *
 * AI Panel: toggle with the "✨ AI" button in the top toolbar.
 *   → Panel source:   src/components/ai/AiPanel.tsx
 *   → Backend:        Apps/ai_agent/views.py
 *   → Panel state:    useAppStore → aiPanelOpen / toggleAiPanel
 *   → pageContent:    concatenation of all doc block texts
 *
 * Page options "..." menu (top-right):
 *   → Rename    — focuses the title input
 *   → Duplicate — POST /api/pages/:id/duplicate/ → navigate to copy
 *   → Copy link — navigator.clipboard
 *   → Delete    — confirm in-dropdown → DELETE + navigate to workspace
 *
 * Bottom tab bar (document mode only): sticky bottom bar with "Linked Pages"
 * and "Canvas Blocks" tabs. Rendered by BottomTabBar component.
 *   → Backlinks backend: GET /api/relations/pages/{id}/backlinks/
 *   → Component: src/components/editor/BottomTabBar.tsx
 *
 * Canvas compact header:
 *   In canvas mode the full header is replaced by a slim ~36px bar showing
 *   only the page icon, truncated title, and controls. A fullscreen button
 *   hides even that bar and gives the canvas 100% of the screen.
 */

'use client';

import { useParams, useRouter }                       from 'next/navigation';
import { useState, useEffect, useCallback, useRef }   from 'react';
import { createPortal }                               from 'react-dom';
import { ArrowLeft, Lock, Sparkles,
         MoreHorizontal, Pencil, Files, Copy, Trash2,
         LayoutDashboard, FileText, Layers,
         Maximize2, Minimize2 }                       from 'lucide-react';
import toast                                          from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient }      from '@tanstack/react-query';
import { pageApi }                                    from '@/lib/api';
import { useBlocks, useCreateBlock, useUpdateBlock }  from '@/hooks/useBlocks';
import { useUpdatePage, useDeletePage, pageKeys }     from '@/hooks/usePages';
import { useCustomPageTypes }                         from '@/hooks/useCustomPageTypes';
import { useAppStore }                                from '@/lib/store';
import { DocumentEditor }                             from '@/components/blocks/DocumentEditor';
import { AiPanel }                                    from '@/components/ai/AiPanel';
import { DropdownMenu }                               from '@/components/ui/DropdownMenu';
import { PropertyBar }                                from '@/components/properties/PropertyBar';
import { CanvasView }                                 from '@/components/canvas/CanvasView';
import { PageCover }                                  from '@/components/editor/PageCover';
import { BottomTabBar }                               from '@/components/editor/BottomTabBar';
import {
  useCreateDocBlock,
  useUpdateDocBlock,
  useDeleteDocBlock,
}                                                     from '@/hooks/useDocumentBlocks';
import type { BacklinkPage, Block, BlockType, UpdateBlockPayload } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants — icon picker + color picker
// ─────────────────────────────────────────────────────────────────────────────

/** ~80 common emojis for the icon picker, grouped loosely by category. */
const EMOJI_LIST = [
  // Documents & work
  '📄','📝','📋','📊','📈','📉','🗒','📅','📌','📍','🗂','📁','📂','🗃',
  // People & communication
  '🤝','👤','👥','💬','📧','📞','☎','📱','💌','🎤',
  // Business & finance
  '💼','🏢','💰','💵','🧾','🪙','📦','🚀','⚡','🔑',
  // Nature & symbols
  '🌟','⭐','✨','🎯','🏆','🥇','🎖','🏅','🎗','🔥',
  // Objects & tools
  '🛠','⚙','🔧','🔨','💡','🔍','🔎','📡','🧲','🖥',
  // Art & creativity
  '🎨','✏','🖊','🖋','🎭','🎬','🎵','🎶','📸','🖼',
  // Nature
  '🌱','🌿','🍀','🌸','🌺','🌻','🌊','🏔','🌙','☀',
  // Misc
  '❤','💙','💚','💛','🧡','💜','🖤','🤍','💎','🎁',
];

/** 12 colour swatches for the page colour picker. */
const COLOR_SWATCHES = [
  '#7c3aed', // violet (default)
  '#60a5fa', // blue
  '#34d399', // green
  '#f59e0b', // amber
  '#f87171', // red
  '#a78bfa', // purple
  '#fb923c', // orange
  '#4ade80', // emerald
  '#38bdf8', // sky
  '#e879f9', // pink
  '#94a3b8', // slate
  '#1e293b', // dark
];

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

  // ── Load blocks (shared between doc + canvas) ───────────────────────────
  const { data: blocks = [], isLoading: blocksLoading } = useBlocks(pageId);
  useCreateBlock(pageId); // kept to maintain hook call order; canvas create is via updateBlock
  const updateBlock = useUpdateBlock(pageId);
  const updatePage  = useUpdatePage(workspaceId);
  const deletePage  = useDeletePage(workspaceId);

  // ── Document block mutations (Phase 2 DocumentEditor) ───────────────────
  // pendingFocusBlockId: set via onCreated callback with the real new block ID.
  // Passed to DocumentEditor so it can focus the correct block after creation
  // (avoids the positional pendingFocusAfterId bug that focused the wrong block).
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);
  const createDocBlock = useCreateDocBlock(pageId, (newBlock) => {
    setPendingFocusBlockId(newBlock.id);
  });
  const updateDocBlock = useUpdateDocBlock(pageId);
  const deleteDocBlock = useDeleteDocBlock(pageId);

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // ── Type picker portal ───────────────────────────────────────────────────
  const [mounted, setMounted]                   = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const typeBadgeRef                            = useRef<HTMLButtonElement>(null);
  const typePortalRef                           = useRef<HTMLDivElement>(null);
  const [typePickerOpen, setTypePickerOpen]     = useState(false);
  const [typePickerPos, setTypePickerPos]       = useState({ top: 0, left: 0 });

  function openTypePicker() {
    const anchor = typeBadgeRef.current;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      setTypePickerPos({ top: r.bottom + 4, left: r.left });
    } else {
      setTypePickerPos({ top: 120, left: 320 });
    }
    setTypePickerOpen(true);
  }

  useEffect(() => {
    if (!typePickerOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (typeBadgeRef.current?.contains(e.target as Node)) return;
      if (typePortalRef.current?.contains(e.target as Node)) return;
      setTypePickerOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setTypePickerOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [typePickerOpen]);

  // ── Icon picker portal ───────────────────────────────────────────────────
  const iconBtnRef                            = useRef<HTMLButtonElement>(null);
  const iconPortalRef                         = useRef<HTMLDivElement>(null);
  const [iconPickerOpen, setIconPickerOpen]   = useState(false);
  const [iconPickerPos, setIconPickerPos]     = useState({ top: 0, left: 0 });
  const [iconSearch, setIconSearch]           = useState('');

  function openIconPicker() {
    if (iconBtnRef.current) {
      const r = iconBtnRef.current.getBoundingClientRect();
      setIconPickerPos({ top: r.bottom + 6, left: r.left });
    }
    setIconSearch('');
    setIconPickerOpen(true);
  }

  useEffect(() => {
    if (!iconPickerOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (iconBtnRef.current?.contains(e.target as Node)) return;
      if (iconPortalRef.current?.contains(e.target as Node)) return;
      setIconPickerOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setIconPickerOpen(false); }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [iconPickerOpen]);

  // ── Color picker portal ──────────────────────────────────────────────────
  const colorBtnRef                             = useRef<HTMLButtonElement>(null);
  const colorPortalRef                          = useRef<HTMLDivElement>(null);
  const [colorPickerOpen, setColorPickerOpen]   = useState(false);
  const [colorPickerPos, setColorPickerPos]     = useState({ top: 0, left: 0 });

  function openColorPicker() {
    if (colorBtnRef.current) {
      const r = colorBtnRef.current.getBoundingClientRect();
      setColorPickerPos({ top: r.bottom + 6, left: r.left });
    }
    setColorPickerOpen(true);
  }

  useEffect(() => {
    if (!colorPickerOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (colorBtnRef.current?.contains(e.target as Node)) return;
      if (colorPortalRef.current?.contains(e.target as Node)) return;
      setColorPickerOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setColorPickerOpen(false); }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [colorPickerOpen]);

  // ── AI panel state ───────────────────────────────────────────────────────
  // selectedText: whatever the user has highlighted in any block editor
  // (populated via browser selection API in Phase 4; empty string for now)
  const [selectedText] = useState(''); // Phase 4: populated via browser selection API

  // ── Backlinks (for bottom tab bar) ──────────────────────────────────────
  const { data: backlinks = [] } = useQuery<BacklinkPage[]>({
    queryKey:  ['backlinks', pageId],
    queryFn:   () => pageApi.backlinks(pageId),
    enabled:   !!pageId,
    staleTime: 1000 * 5,
  });

  // ── Local cover URL override + cover expanded state ──────────────────────
  const [localCoverUrl, setLocalCoverUrl] = useState<string | null>(null);
  const [coverExpanded, setCoverExpanded] = useState(false);

  // ── Canvas fullscreen state ───────────────────────────────────────────────
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);

  // ── Block template panel (canvas mode) ───────────────────────────────────
  const [showBlockPanel, setShowBlockPanel] = useState(false);

  // Reset local cover override when navigating to a different page
  useEffect(() => { setLocalCoverUrl(null); }, [pageId]);

  // Collapse cover + exit fullscreen whenever we leave canvas mode
  useEffect(() => {
    if (page?.view_mode !== 'canvas') {
      setCoverExpanded(false);
      setCanvasFullscreen(false);
    }
  }, [page?.view_mode]);

  // Escape key exits fullscreen (fires before CanvasView's own Escape handler)
  useEffect(() => {
    if (!canvasFullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setCanvasFullscreen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canvasFullscreen]);

  // ── Document block callbacks — must be before any early return ───────────

  /**
   * Update a block's content (or any other field).
   * DocumentEditor wraps raw content objects in { content: ... } before
   * calling this — so `payload` is a full UpdateBlockPayload.
   */
  const handleUpdateBlock = useCallback(
    (blockId: string, payload: UpdateBlockPayload) => {
      updateDocBlock.mutate({ id: blockId, payload });
      if (payload.content) {
        queryClient.invalidateQueries({ queryKey: ['backlinks', pageId] });
        queryClient.invalidateQueries({ queryKey: ['workspace-graph', workspaceId] });
      }
    },
    [updateDocBlock, queryClient, pageId, workspaceId],
  );

  /** Soft-delete a block via the document editor (backspace on empty). */
  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      deleteDocBlock.mutate(blockId);
    },
    [deleteDocBlock],
  );

  /** Reorder a block by patching its fractional order field. */
  const handleReorderBlock = useCallback(
    (blockId: string, newOrder: number) => {
      updateDocBlock.mutate({ id: blockId, payload: { order: newOrder } });
    },
    [updateDocBlock],
  );

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

  // ── Derived: view mode ───────────────────────────────────────────────────
  const isCanvas = page.view_mode === 'canvas';

  // ── Derived: doc blocks — sorted, visible, non-deleted ──────────────────
  // These are the blocks rendered by DocumentEditor in document mode.
  const docBlocks = [...blocks]
    .filter((b) => b.doc_visible && !b.is_deleted)
    .sort((a, b) => a.order - b.order);

  // ── Derived: canvas blocks — all canvas-visible blocks ──────────────────
  // Passed to CanvasView; unchanged from previous behavior.
  const canvasBlocks = blocks.filter((b) => b.canvas_visible);

  // ── Derived: shared blocks — visible in both doc + canvas + positioned ───
  const sharedBlocks = blocks.filter(
    (b) => b.canvas_visible && b.doc_visible && b.canvas_x !== null,
  );

  // ── Derived: AI panel page content ──────────────────────────────────────
  // Concatenate title + all doc block texts (text or code content).
  const pageContent = `${title}\n\n${
    docBlocks
      .map((b) => {
        const t = b.content.text;
        const c = b.content.code;
        return (typeof t === 'string' ? t : typeof c === 'string' ? c : '');
      })
      .filter(Boolean)
      .join('\n')
  }`;

  // ── Derived: sync state — are all doc blocks synced to canvas? ──────────
  const allSynced = docBlocks.length > 0 && docBlocks.every((b) => b.canvas_visible);

  // ── Derived: current custom type ─────────────────────────────────────────
  const currentType = customTypes.find((t) => t.id === page.custom_page_type) ?? null;

  // ── Derived: effective accent color ──────────────────────────────────────
  const effectiveColor = page.color || currentType?.default_color || '#7c3aed';

  // ── Derived: color_style helpers ─────────────────────────────────────────
  const colorStyle = page.color_style ?? 'both';
  const showAccent = colorStyle === 'accent' || colorStyle === 'both';
  const showTint   = colorStyle === 'tint'   || colorStyle === 'both';

  // ── Derived: cover URL ────────────────────────────────────────────────────
  const rawPic = page.header_pic;
  const picUrl = rawPic
    ? rawPic.startsWith('http')
      ? rawPic
      : `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${rawPic}`
    : null;
  const coverUrl: string | null =
    localCoverUrl
    ?? ((page.header_pic_url && page.header_pic_url.trim())
      ? page.header_pic_url.trim()
      : picUrl);

  // ─────────────────────────────────────────────────────────────────────────
  // Document block handlers (Phase 2 DocumentEditor)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new block after `afterBlockId`.
   * nextBlock is passed by DocumentEditor so we can compute a collision-free
   * midpoint order instead of always using afterBlock.order + 0.5.
   * afterBlockId=null → insert before any existing blocks.
   */
  function handleCreateBlock(
    afterBlockId: string | null,
    blockType: BlockType,
    nextBlock?: Block | null,
  ) {
    const afterBlock = afterBlockId
      ? docBlocks.find((b) => b.id === afterBlockId) ?? null
      : null;
    createDocBlock.mutate({ afterBlock, nextBlock: nextBlock ?? null, blockType });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas sync handler
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Toggle canvas_visible on ALL doc blocks at once.
   * When syncing for the first time, assign default canvas positions to
   * blocks that don't yet have coordinates (matching CanvasView's grid).
   */
  function handleSyncToCanvas() {
    const nextSynced = !allSynced;
    docBlocks.forEach((b, idx) => {
      const needsPosition = nextSynced && b.canvas_x === null;
      updateBlock.mutate({
        id:      b.id,
        payload: {
          canvas_visible: nextSynced,
          ...(needsPosition ? {
            canvas_x: (idx % 3) * 350 + 50,
            canvas_y: Math.floor(idx / 3) * 250 + 50,
            canvas_w: 300,
          } : {}),
        },
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Page options dropdown
  // ─────────────────────────────────────────────────────────────────────────

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
          onClick: openTypePicker,
        },
        {
          label:   'Delete',
          icon:    <Trash2 size={13} />,
          variant: 'danger' as const,
          onClick: () => setConfirmingDelete(true),
        },
      ];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
    {/* Outer flex row: main content column + optional AI panel */}
    <div className="flex h-full">

      {/* ── Main column ────────────────────────────────────────────────────
          In document mode: overflow-y-auto (scrollable)
          In canvas  mode:  overflow-hidden + flex-col (canvas fills remaining height) */}
      <div
        className={[
          'flex-1',
          isCanvas ? 'overflow-hidden flex flex-col' : 'overflow-y-auto',
        ].join(' ')}
        style={showTint ? { backgroundColor: `${effectiveColor}08` } : undefined}
      >

        {/* ── Cover image banner — full-width, above the header ──────────── */}
        <PageCover
          pageId={pageId}
          workspaceId={workspaceId}
          coverUrl={coverUrl}
          readOnly={page.is_locked}
          onCoverChange={setLocalCoverUrl}
          collapsed={isCanvas && !coverExpanded}
          onExpandRequest={() => setCoverExpanded(true)}
        />

        {/* ── Header section ──────────────────────────────────────────────
            Canvas mode: compact ~36px bar (icon + title + controls).
            Document mode: full header with title, icon, property bar.      */}
        {isCanvas ? (

          /* ── Compact canvas header (hidden when fullscreen) ─────────── */
          !canvasFullscreen ? (
            <div className="flex shrink-0 items-center gap-1 border-b border-neutral-800 px-3 py-2">

              {/* ← Back to workspace */}
              <button
                onClick={() => router.push(`/${workspaceId}`)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
                title="Back to workspace"
              >
                <ArrowLeft size={13} />
              </button>

              {/* Page icon + title */}
              <span className="select-none text-base leading-none">{page.icon || '📄'}</span>
              <span className="max-w-45 truncate text-sm text-neutral-300">
                {title || 'Untitled'}
              </span>

              {titleSaved && (
                <span className="text-xs text-violet-400">Saved ✓</span>
              )}

              {/* Right-side controls */}
              <div className="ml-auto flex items-center gap-1">

                {/* AI toggle */}
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

                {/* Sync all doc blocks to canvas */}
                {docBlocks.length > 0 && (
                  <button
                    onClick={handleSyncToCanvas}
                    className={[
                      'flex items-center gap-1.5 rounded-lg px-2 py-1.5',
                      'text-xs transition-colors',
                      allSynced
                        ? 'bg-violet-900/30 text-violet-400 hover:bg-violet-900/50'
                        : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300',
                    ].join(' ')}
                    title={allSynced
                      ? 'All doc blocks synced to canvas — click to unsync'
                      : 'Sync all document blocks to canvas'}
                  >
                    <LayoutDashboard size={12} />
                    <span>{allSynced ? 'Synced' : 'Sync to canvas'}</span>
                  </button>
                )}

                {/* Block template panel toggle */}
                <button
                  onClick={() => setShowBlockPanel(v => !v)}
                  className={[
                    'flex items-center gap-1.5 rounded-lg px-2 py-1.5',
                    'text-xs transition-colors',
                    showBlockPanel
                      ? 'bg-violet-900/30 text-violet-400'
                      : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300',
                  ].join(' ')}
                  title="Show document blocks panel"
                >
                  <FileText size={12} />
                  <span>Blocks</span>
                </button>

                {/* Switch to document mode */}
                {!page.is_locked && (
                  <button
                    onClick={() =>
                      updatePage.mutate({ id: pageId, payload: { view_mode: 'document' } })
                    }
                    disabled={updatePage.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-all duration-200 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-50"
                    title="Switch to document mode"
                  >
                    <FileText size={13} /> Document
                  </button>
                )}

                {/* Fullscreen toggle */}
                <button
                  onClick={() => setCanvasFullscreen(true)}
                  title="Fullscreen canvas"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
                >
                  <Maximize2 size={13} />
                </button>

                {/* Page options "..." */}
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
          ) : null

        ) : (

          /* ── Full document header ────────────────────────────────────── */
          <div className={`mx-auto w-full max-w-3xl px-6 ${coverUrl ? 'pt-6' : 'pt-10'} animate-fade-in`}>

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

                {/* Sync all doc blocks to canvas */}
                {docBlocks.length > 0 && (
                  <button
                    onClick={handleSyncToCanvas}
                    className={[
                      'flex items-center gap-1.5 rounded-lg px-2 py-1.5',
                      'text-xs transition-colors',
                      allSynced
                        ? 'bg-violet-900/30 text-violet-400 hover:bg-violet-900/50'
                        : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300',
                    ].join(' ')}
                    title={allSynced
                      ? 'All doc blocks synced to canvas — click to unsync'
                      : 'Sync all document blocks to canvas'}
                  >
                    <LayoutDashboard size={12} />
                    <span>
                      {allSynced ? 'Synced' : 'Sync to canvas'}
                    </span>
                  </button>
                )}

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
              <div className="mb-3 flex items-center gap-2">
                {/* Icon — clickable to open emoji picker */}
                <button
                  ref={iconBtnRef}
                  onClick={openIconPicker}
                  disabled={page.is_locked}
                  className="text-4xl leading-none select-none rounded-lg p-0.5 hover:bg-neutral-800 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  title="Change icon"
                >
                  {page.icon || '📄'}
                </button>
                {/* Color pill — clickable to open color picker */}
                <button
                  ref={colorBtnRef}
                  onClick={openColorPicker}
                  disabled={page.is_locked}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                  title="Change page color"
                >
                  <span
                    className="h-3.5 w-5 rounded-sm shrink-0"
                    style={{ backgroundColor: effectiveColor }}
                  />
                  <span className="text-xs text-neutral-400">Color</span>
                </button>
              </div>

              {/* Title row — input + optional type badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={handleTitleChange}
                  onBlur={() => {
                    if (title !== (page?.title ?? '')) {
                      updatePage.mutate({ id: pageId, payload: { title } });
                    }
                  }}
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
                  <button
                    ref={typeBadgeRef}
                    onClick={openTypePicker}
                    className="inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 transition-colors shrink-0"
                    title="Change page type"
                  >
                    {currentType.icon || '📄'} {currentType.name}
                  </button>
                )}
              </div>

              {/* Properties row — typed metadata fields below the title */}
              <div className="mt-2">
                <PropertyBar
                  workspaceId={workspaceId}
                  pageId={pageId}
                  readOnly={page.is_locked}
                  customPageTypeId={page.custom_page_type ?? null}
                />
              </div>
            </div>

          </div>
        )}{/* end header section */}

        {/* ── Content section — DocumentEditor (document) or CanvasView ── */}
        {isCanvas ? (

          // ── Canvas mode: fills remaining flex height, full width ────────
          <div className={canvasFullscreen ? 'fixed inset-0 z-50 bg-neutral-950' : 'flex-1 min-h-0'}>
            <CanvasView
              blocks={canvasBlocks}
              pageId={pageId}
              workspaceId={workspaceId}
              readOnly={page.is_locked}
              onSwitchToDoc={() =>
                updatePage.mutate({ id: pageId, payload: { view_mode: 'document' } })
              }
              title={page.title}
              contentBlock={docBlocks[0]}
              hasCover={!!coverUrl}
              coverExpanded={coverExpanded}
              onToggleCover={() => setCoverExpanded((v) => !v)}
              fullscreen={canvasFullscreen}
              showBlockPanel={showBlockPanel}
              sharedBlocks={sharedBlocks}
            />

            {/* Floating exit-fullscreen button */}
            {canvasFullscreen && (
              <button
                onClick={() => setCanvasFullscreen(false)}
                title="Exit fullscreen (Esc)"
                className="fixed right-2 top-2 z-50 flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900/80 px-2 py-1.5 text-xs text-neutral-400 backdrop-blur-sm transition-colors hover:text-neutral-200"
              >
                <Minimize2 size={14} />
                Exit fullscreen
              </button>
            )}
          </div>

        ) : (

          // ── Document mode: constrained, scrollable DocumentEditor ───────
          <div className="mx-auto w-full max-w-3xl px-6 pb-10">
            {/* Accent line — rendered when color_style is 'accent' or 'both' */}
            {showAccent && (
              <div
                style={{ backgroundColor: effectiveColor }}
                className="h-0.5 w-full rounded-full mb-3 opacity-60"
              />
            )}

            {/* DocumentEditor — per-block editing (Phase 2+) */}
            <DocumentEditor
              blocks={docBlocks}
              pageId={pageId}
              readOnly={page.is_locked}
              onCreateBlock={handleCreateBlock}
              onUpdateBlock={handleUpdateBlock}
              onDeleteBlock={handleDeleteBlock}
              onReorderBlock={handleReorderBlock}
              pendingFocusBlockId={pendingFocusBlockId}
              onFocusHandled={() => setPendingFocusBlockId(null)}
            />

            {/* Bottom tab bar — Linked Pages + Canvas Blocks tabs */}
            <BottomTabBar
              pageId={pageId}
              workspaceId={workspaceId}
              backlinkPages={backlinks}
              canvasBlocks={blocks.filter(b => b.canvas_visible && b.canvas_x !== null)}
            />
          </div>

        )}

      </div>{/* end main column */}

      {/* ── AI Panel (slides in from right) ────────────────────────────── */}
      {aiPanelOpen && (
        <AiPanel
          pageId={pageId}
          pageContent={pageContent}
          onClose={() => toggleAiPanel()}
          selectedText={selectedText}
        />
      )}
    </div>

    {/* ── Icon picker portal ───────────────────────────────────────────── */}
    {iconPickerOpen && mounted && createPortal(
      <div
        ref={iconPortalRef}
        style={{
          position: 'fixed',
          top:      iconPickerPos.top,
          left:     iconPickerPos.left,
          zIndex:   'var(--z-popup)' as unknown as number,
        }}
        className="rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl p-3 w-72 animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <input
          autoFocus
          type="text"
          placeholder="Search emoji…"
          value={iconSearch}
          onChange={(e) => setIconSearch(e.target.value)}
          className="mb-2 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-violet-500 transition-colors"
        />
        {/* Emoji grid */}
        <div className="grid grid-cols-9 gap-0.5 max-h-48 overflow-y-auto">
          {EMOJI_LIST
            .filter((e) => !iconSearch.trim() || e.includes(iconSearch.trim()))
            .map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  updatePage.mutate({ id: pageId, payload: { icon: emoji } });
                  setIconPickerOpen(false);
                }}
                className="flex items-center justify-center rounded p-1 text-lg hover:bg-neutral-700 transition-colors"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
        </div>
        {/* Remove icon */}
        <button
          onClick={() => {
            updatePage.mutate({ id: pageId, payload: { icon: '' } });
            setIconPickerOpen(false);
          }}
          className="mt-2 w-full rounded-md border border-neutral-800 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
        >
          Remove icon
        </button>
      </div>,
      document.body,
    )}

    {/* ── Color picker portal ──────────────────────────────────────────── */}
    {colorPickerOpen && mounted && createPortal(
      <div
        ref={colorPortalRef}
        style={{
          position: 'fixed',
          top:      colorPickerPos.top,
          left:     colorPickerPos.left,
          zIndex:   'var(--z-popup)' as unknown as number,
        }}
        className="rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl p-3 w-52 animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Page color</p>
        {/* Swatch grid */}
        <div className="grid grid-cols-6 gap-1.5">
          {COLOR_SWATCHES.map((hex) => (
            <button
              key={hex}
              onClick={() => {
                updatePage.mutate({ id: pageId, payload: { color: hex } });
                setColorPickerOpen(false);
              }}
              className="h-6 w-6 rounded-full border-2 transition-all hover:scale-110"
              style={{
                backgroundColor: hex,
                borderColor: hex === effectiveColor && page.color === hex
                  ? '#ffffff'
                  : 'transparent',
                boxShadow: hex === effectiveColor && page.color === hex
                  ? `0 0 0 1px ${hex}`
                  : 'none',
              }}
              title={hex}
            />
          ))}
        </div>
        {/* Reset to type default */}
        <button
          onClick={() => {
            updatePage.mutate({ id: pageId, payload: { color: '' } });
            setColorPickerOpen(false);
          }}
          className="mt-2.5 w-full rounded-md border border-neutral-800 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
        >
          Reset to type default
        </button>
        {/* Style section */}
        <div className="mt-3 border-t border-neutral-800 pt-2">
          <p className="text-[10px] text-neutral-500 mb-1.5">Show color as</p>
          <div className="flex gap-1">
            {(['none', 'accent', 'tint', 'both'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => updatePage.mutate({ id: pageId, payload: { color_style: opt } })}
                className={[
                  'px-2 py-1 rounded text-[10px] capitalize transition-colors',
                  colorStyle === opt
                    ? 'bg-violet-900/50 text-violet-300'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700',
                ].join(' ')}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body,
    )}

    {/* ── Type picker portal ───────────────────────────────────────────── */}
    {typePickerOpen && mounted && createPortal(
      <div
        ref={typePortalRef}
        style={{
          position: 'fixed',
          top:      typePickerPos.top,
          left:     typePickerPos.left,
          zIndex:   'var(--z-popup)' as unknown as number,
        }}
        className="flex flex-col gap-0.5 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl min-w-40 animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* No type option */}
        <button
          onClick={() => {
            updatePage.mutate({ id: pageId, payload: { custom_page_type: null } });
            setTypePickerOpen(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors text-left"
        >
          📄 Note (no type)
        </button>
        <div className="my-0.5 border-t border-neutral-800" />
        {/* Custom types */}
        {customTypes.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              updatePage.mutate({ id: pageId, payload: { custom_page_type: t.id } });
              setTypePickerOpen(false);
            }}
            className={[
              'flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
              t.id === page.custom_page_type
                ? 'bg-violet-900/30 text-violet-300'
                : 'text-neutral-300 hover:bg-neutral-800',
            ].join(' ')}
          >
            {t.icon || '📄'} {t.name}
          </button>
        ))}
      </div>,
      document.body
    )}
    </>
  );
}
