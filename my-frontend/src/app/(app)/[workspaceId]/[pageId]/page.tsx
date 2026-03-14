/**
 * app/(app)/[workspaceId]/[pageId]/page.tsx — Page Editor
 *
 * What:    The full-screen editor for a single page.
 *          Loads page metadata + blocks, renders the TipTap editor,
 *          autosaves content changes, and hosts the AI panel.
 *
 * URL:     /:workspaceId/:pageId
 *
 * Autosave: editor JSON → single "text" block → PATCH or POST on save.
 *
 * AI Panel: toggle with the "✨ AI" button in the top toolbar.
 *   → Panel source:   src/components/ai/AiPanel.tsx
 *   → Backend:        Apps/ai_agent/views.py
 *   → Panel state:    useAppStore → aiPanelOpen / toggleAiPanel
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowLeft, Lock, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { pageApi } from '@/lib/api';
import { useBlocks, useCreateBlock, useUpdateBlock } from '@/hooks/useBlocks';
import { useUpdatePage } from '@/hooks/usePages';
import { useAppStore } from '@/lib/store';
import { Editor } from '@/components/editor/Editor';
import { AiPanel } from '@/components/ai/AiPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function PageEditorRoute() {
  const params      = useParams<{ workspaceId: string; pageId: string }>();
  const { workspaceId, pageId } = params;
  const router = useRouter();

  // ── AI panel state from Zustand ─────────────────────────────────────────
  const aiPanelOpen  = useAppStore((s) => s.aiPanelOpen);
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

  // ── Editable title ──────────────────────────────────────────────────────
  const [title, setTitle]           = useState('');
  const [titleSaved, setTitleSaved] = useState(false);
  const titleSaveTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (page?.title !== undefined) setTitle(page.title);
  }, [page?.title]);

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

  // ── Track editor plain text (for AI context) ────────────────────────────
  // Updated by the Editor via onContentChange callback
  const [editorText, setEditorText] = useState('');

  // ── Find the main content block ─────────────────────────────────────────
  const contentBlock = blocks.find((b) => b.block_type === 'text');

  // ── Autosave callback ───────────────────────────────────────────────────
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

  // ── Extract initial TipTap JSON ─────────────────────────────────────────
  const initialContent =
    contentBlock?.content?.json as Record<string, unknown> | null ?? null;

  // ── Loading / error ─────────────────────────────────────────────────────

  if (pageLoading || blocksLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-in">
        <div className="mb-8 h-10 w-2/3 animate-shimmer rounded-xl" />
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-shimmer rounded-lg"
              style={{ height: '1.25rem', width: `${60 + Math.random() * 35}%` }} />
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

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    // Outer flex row: editor content + optional AI panel
    <div className="flex h-full">

      {/* ── Editor column ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10 animate-fade-in">

          {/* Top bar */}
          <div className="mb-8 flex items-center gap-3">
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

            {/* AI toggle button */}
            <button
              onClick={toggleAiPanel}
              className={[
                'ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
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

            {page.is_locked && (
              <span className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-500">
                <Lock size={10} /> Locked
              </span>
            )}
          </div>

          {/* Icon + title */}
          <div className="mb-8">
            <div className="mb-3 text-4xl leading-none select-none">{page.icon || '📄'}</div>
            <input
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled"
              disabled={page.is_locked}
              className={[
                'w-full bg-transparent text-3xl font-bold text-neutral-100 placeholder-neutral-700',
                'border-none outline-none ring-0',
                'disabled:cursor-not-allowed disabled:opacity-50',
              ].join(' ')}
              aria-label="Page title"
            />
          </div>

          {/* TipTap editor */}
          <Editor
            initialContent={initialContent}
            onSave={handleSave}
            onTextChange={setEditorText}
            readOnly={page.is_locked}
          />
        </div>
      </div>

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
