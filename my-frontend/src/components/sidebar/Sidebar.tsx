/**
 * components/sidebar/Sidebar.tsx
 *
 * What:    The main sidebar container. Fixed on the left, 260px wide.
 *          Contains: WorkspaceSwitcher, + New Page dropdown, PageTree, user footer.
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

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { Plus, LogOut, Settings, PanelLeftClose, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { useWorkspaces, useWorkspace } from '@/hooks/useWorkspace';
import { usePages, useCreatePage, useDeletePage, useUpdatePage } from '@/hooks/usePages';
import { useCustomPageTypes } from '@/hooks/useCustomPageTypes';
import { authApi, aiApi } from '@/lib/api';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { PageTree } from './PageTree';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { CustomPageTypeManager } from '@/components/workspace/CustomPageTypeManager';

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
  const router = useRouter();

  // ── Global state ──────────────────────────────────────────────────────────
  const user                  = useAppStore((s) => s.user);
  const logout                = useAppStore((s) => s.logout);
  const activeWorkspace       = useAppStore((s) => s.activeWorkspace);
  const setActiveWorkspace    = useAppStore((s) => s.setActiveWorkspace);
  const sidebarOpen           = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen        = useAppStore((s) => s.setSidebarOpen);
  const sidebarCollapsed      = useAppStore((s) => s.sidebarCollapsed);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: workspaces = [] } = useWorkspaces();
  const { data: workspaceData } = useWorkspace(workspaceId);
  const { data: pages = [], isLoading: pagesLoading } = usePages(workspaceId);
  const { data: customTypes = [] } = useCustomPageTypes(workspaceId);
  const createPage = useCreatePage(workspaceId);
  const deletePage = useDeletePage(workspaceId);
  const updatePage = useUpdatePage(workspaceId);
  const { data: aiUsage } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => aiApi.getUsage(),
    staleTime: 1000 * 60 * 5,
  });

  // ── Custom type manager popover state ─────────────────────────────────────
  const [customTypeManagerOpen, setCustomTypeManagerOpen] = useState(false);

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

  /** Create a new page — optionally scoped to a custom type */
  async function handleCreatePage(
    parentId: string | null = null,
    customPageTypeId?: string,
  ) {
    try {
      const newPage = await createPage.mutateAsync({
        title:            'Untitled',
        parent:           parentId,
        page_type:        'note',
        ...(customPageTypeId ? { custom_page_type: customPageTypeId } : {}),
      });
      router.push(`/${workspaceId}/${newPage.id}`);
    } catch {
      toast.error('Could not create page. Please try again.');
    }
  }

  /** Delete a page — soft delete on the backend */
  async function handleDeletePage(pageId: string) {
    try {
      await deletePage.mutateAsync(pageId);
      if (activePageId === pageId) {
        router.push(`/${workspaceId}`);
      }
    } catch {
      toast.error('Could not delete page. Please try again.');
    }
  }

  /** Rename a page — optimistic update via useUpdatePage */
  async function handleUpdatePage(pageId: string, payload: { title: string }) {
    try {
      await updatePage.mutateAsync({ id: pageId, payload });
    } catch {
      toast.error('Could not rename page.');
    }
  }

  /** Log out — call API to clear the httpOnly cookie, then reset state */
  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      logout();
      window.location.href = '/login';
    }
  }

  // ── "New page" dropdown items ─────────────────────────────────────────────
  const newPageMenuItems = [
    {
      label:   'New page',
      icon:    <span className="text-neutral-500">📄</span>,
      onClick: () => handleCreatePage(null),
    },
    // One item per custom type defined in this workspace
    ...customTypes.map((type) => ({
      label:   `New ${type.name}`,
      icon:    <span>{type.icon || '📄'}</span>,
      onClick: () => handleCreatePage(null, type.id),
    })),
  ];

  // ── The workspace to display ──────────────────────────────────────────────
  const displayWorkspace = activeWorkspace ?? workspaceData;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Mobile overlay ───────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ────────────────────────────────────────────────── */}
      <aside
        data-workspace-color={displayWorkspace?.color ?? 'white'}
        className={[
          'sidebar-workspace-tint',
          'fixed left-0 top-0 h-screen z-40 flex flex-col',
          'transition-all duration-200',
          sidebarCollapsed ? 'w-12' : 'w-[260px]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-full',
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
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        {/* ── New page dropdown ──────────────────────────────────────────── */}
        <div className="px-2 pb-2">
          <DropdownMenu items={newPageMenuItems} placement="right">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
            >
              <Plus size={14} />
              <span>New page</span>
            </button>
          </DropdownMenu>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="mx-2 border-t border-neutral-800" />

        {/* ── Page tree (scrollable) ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-2">
          {pagesLoading ? (
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
              onUpdatePage={handleUpdatePage}
              onDeletePage={handleDeletePage}
            />
          )}
        </div>

        {/* ── Footer: user + settings ────────────────────────────────────── */}
        <div className="border-t border-neutral-800 p-2">

          {/* Custom type manager popover — anchored above the footer */}
          {customTypeManagerOpen && (
            <div className="mb-2">
              <CustomPageTypeManager
                workspaceId={workspaceId}
                onClose={() => setCustomTypeManagerOpen(false)}
              />
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            {/* User avatar */}
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

            {/* Settings button */}
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
              title="Settings (coming soon)"
            >
              <Settings size={13} />
            </button>

            {/* Page type manager toggle */}
            <button
              onClick={() => setCustomTypeManagerOpen((v) => !v)}
              className={[
                'flex h-6 w-6 items-center justify-center rounded transition-colors',
                customTypeManagerOpen
                  ? 'bg-violet-700 text-white'
                  : 'text-neutral-600 hover:bg-neutral-700 hover:text-neutral-300',
              ].join(' ')}
              title="Manage page types"
            >
              <Layers size={13} />
            </button>

            {/* Theme toggle */}
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
