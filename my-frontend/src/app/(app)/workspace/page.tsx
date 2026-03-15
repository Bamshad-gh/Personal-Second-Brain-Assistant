/**
 * app/(app)/workspace/page.tsx — Workspace Redirect Hub
 *
 * What:    Handles the /workspace route. Fetches the user's workspaces and
 *          redirects to the first one, or to /workspace/create if none exist.
 *
 * This is a 'use client' component because:
 *   - It needs React Query (useWorkspaces) to fetch data
 *   - Server-side redirect would require forwarding the auth token,
 *     which is in-memory (not accessible server-side)
 *
 * How to expand:
 *   - Save the last-visited workspace ID in localStorage
 *   - Redirect to that workspace instead of always the first one
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaces } from '@/hooks/useWorkspace';
import { useAppStore } from '@/lib/store';

export default function WorkspaceRedirectPage() {
  const router = useRouter();
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const { data: workspaces, isLoading, isError } = useWorkspaces();

  useEffect(() => {
    // Wait for AuthInitializer to restore the session before the query fires.
    // Without this guard, isLoading=false + workspaces=undefined (query disabled)
    // triggers an immediate redirect to /workspace/create on every page refresh.
    if (!isAuthenticated) return;
    if (isLoading) return;

    if (isError || !workspaces) {
      // API error — send to create since we can't determine what to show
      router.replace('/workspace/create');
      return;
    }

    if (workspaces.length === 0) {
      // No workspaces — first-time user or all deleted
      router.replace('/workspace/create');
      return;
    }

    // Redirect to the first workspace
    // TODO: replace with last-visited workspace from localStorage
    router.replace(`/${workspaces[0].id}`);
  }, [workspaces, isLoading, isError, router, isAuthenticated]);

  // Show a loading state while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-violet-500" />
        <p className="text-sm text-neutral-500">Loading your workspace…</p>
      </div>
    </div>
  );
}
