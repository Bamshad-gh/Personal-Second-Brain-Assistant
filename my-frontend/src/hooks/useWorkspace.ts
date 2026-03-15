/**
 * hooks/useWorkspace.ts
 *
 * What:    React Query hooks for workspace data — list, single, create, update, delete.
 *
 * React Query concept:
 *   useQuery fetches and caches data. The query key is like a cache key:
 *     ['workspaces']       → all workspaces for the current user
 *     ['workspace', id]    → one specific workspace
 *   When you call invalidateQueries(['workspaces']), all matching caches
 *   are marked stale and will refetch on next render.
 *
 *   useMutation handles writes (POST/PATCH/DELETE). It gives you:
 *     mutate(payload)  — fire and forget
 *     mutateAsync(payload) — await the result
 *     isLoading, isError, data — for showing status in the UI
 *
 * Django analogy:
 *   useQuery    → queryset.filter()  (reads from cache/DB)
 *   useMutation → form.save()        (writes to DB, then invalidates cache)
 *
 * Exports: useWorkspaces, useWorkspace, useCreateWorkspace,
 *          useUpdateWorkspace, useDeleteWorkspace
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workspaceApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import type { CreateWorkspacePayload, UpdateWorkspacePayload, Workspace } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys — centralised to avoid typos across files
// ─────────────────────────────────────────────────────────────────────────────

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (id: string) => ['workspace', id] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Read hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useWorkspaces — fetches all workspaces for the logged-in user.
 *
 * enabled: only runs if the user is authenticated.
 * Without this, the query fires on every page load — including the
 * login page — and gets a 401, which is wasteful.
 */
export function useWorkspaces() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: workspaceKeys.all,
    queryFn: () => workspaceApi.list(),
    enabled: isAuthenticated,
    // No select needed — workspaceApi.list() already normalises to Workspace[]
  });
}

/**
 * useWorkspace — fetches a single workspace by ID.
 * Also syncs the Zustand activeWorkspace when data loads.
 */
export function useWorkspace(id: string | null) {
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);

  return useQuery({
    queryKey: workspaceKeys.detail(id ?? ''),
    queryFn: () => workspaceApi.get(id!),
    enabled: !!id, // don't fetch if id is null/undefined
    // onSuccess equivalent in React Query v5: use the data in the component
    // or use a useEffect to sync Zustand when data changes.
    // We handle the Zustand sync in the (app) layout via useEffect.
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useCreateWorkspace — creates a new workspace and invalidates the list cache.
 *
 * After creating a workspace, the user's workspace list is stale.
 * invalidateQueries(['workspaces']) marks it stale so the next render
 * triggers a refetch — the new workspace appears in the sidebar automatically.
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);

  return useMutation({
    mutationFn: (payload: CreateWorkspacePayload) => workspaceApi.create(payload),
    onSuccess: (newWorkspace: Workspace) => {
      // Invalidate list so sidebar refetches
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      // Set as active workspace immediately (no extra network request)
      setActiveWorkspace(newWorkspace);
    },
  });
}

/** useUpdateWorkspace — updates workspace metadata and refreshes the cache */
export function useUpdateWorkspace(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateWorkspacePayload) => workspaceApi.update(id, payload),
    onSuccess: (updated: Workspace) => {
      // Update the single-workspace cache directly (no refetch needed)
      queryClient.setQueryData(workspaceKeys.detail(id), updated);
      // Also refresh the list (name/icon may have changed)
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

/** useDeleteWorkspace — soft-deletes a workspace and clears it from cache */
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  // Individual selectors — returning an object literal here would create a new
  // reference on every render and cause an infinite useSyncExternalStore loop.
  const activeWorkspace    = useAppStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  return useMutation({
    mutationFn: (id: string) => workspaceApi.delete(id),
    onSuccess: (_: void, deletedId: string) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      queryClient.removeQueries({ queryKey: workspaceKeys.detail(deletedId) });
      // If the deleted workspace was active, clear it
      if (activeWorkspace?.id === deletedId) {
        setActiveWorkspace(null);
      }
    },
  });
}
