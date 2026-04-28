/**
 * app/(app)/AppShellClient.tsx
 *
 * What:    The client-side app shell. Manages the sidebar, top bar,
 *          and blocks rendering until the auth token is restored.
 *
 * Why split from layout.tsx:
 *          layout.tsx is a Server Component — it reads cookies for the
 *          initial auth check but cannot use React state or effects.
 *          This file handles everything that needs client-side React.
 *
 * Auth flow:
 *          1. AuthInitializer mounts and restores the JWT access token
 *          2. A spinner is shown while this happens
 *          3. Once onReady() fires, the full UI renders
 *          This prevents the Sidebar from making API calls before the
 *          token is available, which would cause a redirect to login.
 *
 * Sidebar params:
 *          workspaceId and pageId come from useParams() not from props.
 *          Next.js App Router layouts cannot receive dynamic params from
 *          nested route segments — useParams() reads the full URL correctly.
 *
 * To expand:
 *          - Add a right-side AI panel drawer
 *          - Add breadcrumbs to the top bar
 *          - Add a keyboard shortcut for sidebar toggle (Cmd+B)
 *          - Add a command palette trigger (Cmd+K)
 */

'use client';

import { useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { AuthInitializer } from '@/components/AuthInitializer';
import { GlobalAiAssistant } from '@/components/ai/GlobalAiAssistant';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AppShellClientProps {
  /** Page content from Next.js — rendered inside the main area */
  children: ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AppShellClient({ children }: AppShellClientProps) {

  // ── URL params — read from the current page URL ───────────────────────────
  // useParams() always returns all dynamic segments regardless of nesting depth
  const params      = useParams<{ workspaceId?: string; pageId?: string }>();
  const workspaceId = params.workspaceId ?? null;
  const pageId      = params.pageId      ?? null;

  // ── Global state ──────────────────────────────────────────────────────────
  const toggleSidebar    = useAppStore((s) => s.toggleSidebar);
  const sidebarOpen      = useAppStore((s) => s.sidebarOpen);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);

  // ── Auth ready state ──────────────────────────────────────────────────────
  // Blocks the UI from rendering until AuthInitializer has restored the token.
  // Without this gate, Sidebar mounts and makes API calls before the token
  // is available, causing a redirect to login on every page refresh.
  const [authReady, setAuthReady] = useState(false);

  // ── Sidebar margin — shifts main content right on desktop ────────────────
  // Mobile always gets ml-0 (sidebar overlays as drawer).
  // Desktop always gets ml-* (sidebar is pinned — sidebarOpen only affects mobile).
  const sidebarMargin = workspaceId
    ? sidebarCollapsed
      ? 'ml-0 md:ml-12'        // collapsed rail — 48px on desktop
      : 'ml-0 md:ml-[260px]'   // full sidebar — 260px on desktop
    : '';

  // ── Loading state — shown while token is being restored ──────────────────
  if (!authReady) {
    return (
      <>
        {/* AuthInitializer runs in background, calls onReady when done */}
        <AuthInitializer onReady={() => setAuthReady(true)} />

        {/* Spinner — shown while token restore is in progress */}
        <div className="flex min-h-screen items-center justify-center bg-neutral-950">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-violet-500" />
        </div>
      </>
    );
  }

  // ── Main render — only shown after auth is ready ──────────────────────────
  return (
    <div className="flex min-h-screen bg-neutral-950">

      {/* ── Sidebar — only shown when inside a workspace ──────────────────── */}
      {workspaceId && (
        <Sidebar
          workspaceId={workspaceId}
          activePageId={pageId}
        />
      )}

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <main
        className={[
          'flex flex-1 flex-col min-w-0 transition-all duration-200',
          sidebarMargin,
        ].join(' ')}
      >

        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800/60">

          {/* Sidebar toggle — always visible so user can reopen closed sidebar */}
          {workspaceId && (
            <button
              onClick={toggleSidebar}
              className="flex h-7 w-7 items-center justify-center rounded-md
                         text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300
                         transition-colors shrink-0"
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <Menu size={16} />
            </button>
          )}
        </div>

        {/* ── Page content ──────────────────────────────────────────────────── */}
        <div className="flex-1">
          {children}
        </div>

      </main>

      {/* ── Global AI assistant — floating button + chat panel ─────────────── */}
      {workspaceId && (
        <GlobalAiAssistant
          workspaceId={workspaceId}
          currentPageId={pageId ?? undefined}
        />
      )}
    </div>
  );
}
