/**
 * components/sidebar/Sidebar.tsx
 *
 * What:    The main sidebar container. Fixed on the left, 260px wide.
 *          Contains: WorkspaceSwitcher, + New Page button, PageTree, user footer.
 *          On mobile, slides in/out based on Zustand sidebarOpen state.
 *
 * Props:
 *   workspaceId   — the current workspace ID (for API calls and navigation)
 *   activePageId  — currently open page (for highlight in PageTree)
 *
 * How to expand:
 *   - Add a search/command palette trigger at the top
 *   - Add a pinned pages section
 *   - Add settings link at the bottom
 *   - Add sidebar resize by dragging the right edge
 */

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Plus, LogOut, Settings, PanelLeftClose } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { useWorkspaces, useWorkspace } from '@/hooks/useWorkspace';
import { usePages } from '@/hooks/usePages';
import { useCreatePage, useDeletePage } from '@/hooks/usePages';
import { authApi, aiApi } from '@/lib/api';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { PageTree } from './PageTree';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarProps {
  workspaceId: string;
  activePageId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar({ workspaceId, activePageId }: SidebarProps) {
  const pathname = usePathname();

  // ── Global state ──────────────────────────────────────────────────────────
  const { user, logout, activeWorkspace, setActiveWorkspace, sidebarOpen, setSidebarOpen, toggleSidebarCollapse } =
    useAppStore((state) => ({
      user: state.user,
      logout: state.logout,
      activeWorkspace: state.activeWorkspace,
      setActiveWorkspace: state.setActiveWorkspace,
      sidebarOpen: state.sidebarOpen,
      setSidebarOpen: state.setSidebarOpen,
      toggleSidebarCollapse: state.toggleSidebarCollapse,
    }));

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: workspaces = [] } = useWorkspaces();
  const { data: workspaceData } = useWorkspace(workspaceId);
  const { data: pages = [], isLoading: pagesLoading } = usePages(workspaceId);
  const createPage = useCreatePage(workspaceId);
  const deletePage = useDeletePage(workspaceId);
  const { data: aiUsage } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => aiApi.getUsage(),
    staleTime: 1000 * 60 * 5, // 5 min — usage doesn't need to be real-time
  });

  // Sync the workspace data into Zustand when it loads
  useEffect(() => {
    if (workspaceData) setActiveWorkspace(workspaceData);
  }, [workspaceData, setActiveWorkspace]);

  // Close sidebar on mobile when navigating to a new page
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [pathname, setSidebarOpen]);

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Create a new top-level page in this workspace */
  async function handleCreatePage(parentId: string | null = null) {
    try {
      const newPage = await createPage.mutateAsync({
        title: '',
        parent: parentId,
        page_type: 'note',
      });
      // Navigate to the new page immediately
      window.location.href = `/${workspaceId}/${newPage.id}`;
    } catch {
      toast.error('Could not create page. Please try again.');
    }
  }

  /** Delete a page — soft delete on the backend */
  async function handleDeletePage(pageId: string) {
    try {
      await deletePage.mutateAsync(pageId);
      // If the deleted page was the active one, redirect to workspace home
      if (activePageId === pageId) {
        window.location.href = `/${workspaceId}`;
      }
    } catch {
      toast.error('Could not delete page. Please try again.');
    }
  }

  /** Log out — call API to clear the httpOnly cookie, then reset state */
  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      logout(); // clear Zustand state regardless of API result
      window.location.href = '/login';
    }
  }

  // ── The workspace to display (prefer Zustand value, fallback to API data) ──
  const displayWorkspace = activeWorkspace ?? workspaceData;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Mobile overlay — closes sidebar when clicking outside ───────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ────────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed left-0 top-0 z-30 flex h-full w-[260px] flex-col',
          'border-r border-neutral-800 bg-neutral-900',
          'transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0', // always visible on desktop
        ].join(' ')}
      >
        {/* ── Header: workspace switcher + collapse button ───────────────── */}
        <div className="flex items-center gap-1 p-2 pt-3">
          <div className="flex-1 min-w-0">
            {displayWorkspace ? (
              <WorkspaceSwitcher
                activeWorkspace={displayWorkspace}
                workspaces={workspaces}
              />
            ) : (
              <div className="h-11 animate-pulse rounded-lg bg-neutral-800" />
            )}
          </div>
          {/* Collapse — hides the sidebar; use the hamburger in top bar to reopen */}
          <button
            onClick={() => { toggleSidebarCollapse(); setSidebarOpen(false); }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        {/* ── New page button ────────────────────────────────────────────── */}
        <div className="px-2 pb-2">
          <button
            onClick={() => handleCreatePage(null)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <Plus size={14} />
            <span>New page</span>
          </button>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="mx-2 border-t border-neutral-800" />

        {/* ── Page tree (scrollable) ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-2">
          {pagesLoading ? (
            // Skeleton rows while pages load
            <div className="space-y-1 px-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-7 animate-pulse rounded-md bg-neutral-800" />
              ))}
            </div>
          ) : (
            <PageTree
              pages={pages}
              activePageId={activePageId}
              workspaceId={workspaceId}
              onCreatePage={handleCreatePage}
              onDeletePage={handleDeletePage}
            />
          )}
        </div>

        {/* ── Footer: user + settings ────────────────────────────────────── */}
        <div className="border-t border-neutral-800 p-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            {/* User avatar — circle with initials */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-semibold text-white">
              {user?.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>

            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-neutral-200">
                {user?.display_name ?? user?.full_name ?? 'You'}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {aiUsage != null
                  ? `${aiUsage.calls_this_month} AI calls this month`
                  : user?.email}
              </p>
            </div>

            {/* Settings button — placeholder for later */}
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
              title="Settings (coming soon)"
            >
              <Settings size={13} />
            </button>

            {/* Theme toggle — switches dark / light mode */}
            <ThemeToggle />

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-700 hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
