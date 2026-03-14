/**
 * app/(app)/[workspaceId]/page.tsx — Workspace Home
 *
 * Redesigned with:
 *   - Gradient greeting text
 *   - Page type color badges
 *   - Card hover lift effect (card-hover utility from globals.css)
 *   - Gradient "New page" button
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { Plus, Clock, Zap } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePages, useCreatePage } from '@/hooks/usePages';
import { useAppStore } from '@/lib/store';
import toast from 'react-hot-toast';
import type { Page, PageType } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  if (!isoString) return '';
  const diffMs  = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7)  return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// Page type → accent color (Tailwind class fragments for inline style)
const PAGE_TYPE_COLORS: Record<PageType, string> = {
  note:      '#6b7280',
  secure:    '#7c3aed',
  template:  '#0891b2',
  client:    '#059669',
  project:   '#d97706',
  invoice:   '#dc2626',
  expense:   '#9333ea',
  dashboard: '#2563eb',
};

function PageTypeBadge({ type }: { type: PageType }) {
  const color = PAGE_TYPE_COLORS[type] ?? '#6b7280';
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium capitalize tracking-wide"
      style={{ color, backgroundColor: `${color}20` }}
    >
      {type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspaceHomePage() {
  const params      = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const router      = useRouter();

  const user      = useAppStore((state) => state.user);
  const { data: workspace }            = useWorkspace(workspaceId);
  const { data: pages = [], isLoading } = usePages(workspaceId);
  const createPage = useCreatePage(workspaceId);

  const recentPages: Page[] = [...pages]
    .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
    .slice(0, 8);

  async function handleNewPage() {
    try {
      const newPage = await createPage.mutateAsync({ title: 'Untitled', page_type: 'note' });
      router.push(`/${workspaceId}/${newPage.id}`);
    } catch {
      toast.error('Could not create page. Please try again.');
    }
  }

  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.full_name?.split(' ')[0] ?? user?.display_name?.split(' ')[0] ?? '';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-in">

      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold leading-tight">
          <span className="gradient-text">{greeting}</span>
          {firstName && <span className="text-neutral-100">, {firstName}</span>}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded text-xs"
            style={{ backgroundColor: workspace?.color ? `${workspace.color}33` : '#7c3aed33' }}
          >
            {workspace?.icon ?? '🧠'}
          </span>
          {workspace?.name ?? 'Your workspace'}
          <span className="text-neutral-700">·</span>
          {pages.length} page{pages.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div className="mb-10 flex gap-3">
        <button
          onClick={handleNewPage}
          disabled={createPage.isPending}
          className={[
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white',
            'transition-all duration-200 hover:opacity-90 hover:shadow-lg',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            boxShadow: '0 0 16px rgba(139,92,246,0.25)',
          }}
        >
          <Plus size={15} />
          {createPage.isPending ? 'Creating…' : 'New page'}
        </button>
      </div>

      {/* ── Recent pages ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Clock size={13} className="text-neutral-600" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
            Recently updated
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 animate-shimmer rounded-xl" />
            ))}
          </div>
        ) : recentPages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-800 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-800/60">
              <Zap size={22} className="text-neutral-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-400">No pages yet</p>
              <p className="mt-0.5 text-xs text-neutral-600">Start writing, planning, or building</p>
            </div>
            <button
              onClick={handleNewPage}
              className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
              Create your first page →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recentPages.map((page) => (
              <button
                key={page.id}
                onClick={() => router.push(`/${workspaceId}/${page.id}`)}
                className="card-hover group flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left"
              >
                {/* Icon + title */}
                <div className="flex items-center gap-2.5">
                  <span className="text-lg leading-none">{page.icon || '📄'}</span>
                  <span className="flex-1 truncate text-sm font-medium text-neutral-200 group-hover:text-white transition-colors">
                    {page.title || 'Untitled'}
                  </span>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-2">
                  <PageTypeBadge type={page.page_type} />
                  <span className="text-xs text-neutral-600">
                    {formatRelativeTime(page.updated_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
