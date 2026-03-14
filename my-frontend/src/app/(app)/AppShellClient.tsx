/**
 * app/(app)/AppShellClient.tsx
 *
 * What:    The client-side half of the app shell. Renders the sidebar and
 *          main content area. Manages the sidebar toggle button.
 *
 * Why split from layout.tsx:
 *   layout.tsx is a Server Component (reads cookies, does auth check).
 *   The sidebar toggle needs useState — a Client Component.
 *   Splitting keeps the auth logic server-side and the UI logic client-side.
 *
 * Props:
 *   workspaceId — from the URL params (null on non-workspace routes)
 *   pageId      — from the URL params (null on non-page routes)
 *   children    — the page content
 */

'use client';

import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { Sidebar } from '@/components/sidebar/Sidebar';

interface AppShellClientProps {
  workspaceId: string | null;
  pageId: string | null;
  children: ReactNode;
}

export function AppShellClient({ workspaceId, pageId, children }: AppShellClientProps) {
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);

  return (
    <div className="flex min-h-screen bg-neutral-950">
      {/* ── Sidebar — only shown when a workspace is active ──────────────── */}
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
          // On desktop, shift right to make room for the sidebar
          workspaceId && sidebarOpen ? 'md:ml-[260px]' : '',
        ].join(' ')}
      >
        {/* ── Top bar: sidebar toggle + page-level content ─────────────── */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800/60">
          {/* Sidebar toggle — always visible, useful on all screen sizes */}
          {workspaceId && (
            <button
              onClick={toggleSidebar}
              className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <Menu size={16} />
            </button>
          )}
        </div>

        {/* ── Page content ─────────────────────────────────────────────── */}
        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
