/**
 * hooks/usePages.ts
 *
 * What:    React Query hooks for page data — list, create, update, delete.
 *          Pages are scoped to a workspace: you always need a workspaceId.
 *
 * How to expand:
 *   - Add usePageSearch(query) for full-text search
 *   - Add usePinnedPages(workspaceId) for the sidebar pinned section
 *   - Add useRecentPages(workspaceId) for the workspace home
 *
 * Exports: usePages, useCreatePage, useUpdatePage, useDeletePage
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pageApi } from '@/lib/api';
import type { CreatePagePayload, Page, UpdatePagePayload } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const pageKeys = {
  all: (workspaceId: string) => ['pages', workspaceId] as const,
  detail: (pageId: string) => ['page', pageId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Read hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * usePages — fetches all pages in a workspace as a flat array.
 * The PageTree component builds the hierarchy client-side using the 'parent' field.
 *
 * Endpoint: GET /api/pages/?workspace=<id>  (PageListSerializer — flat, includes parent)
 * pageApi.list() handles pagination internally and always returns Page[].
 */
export function usePages(workspaceId: string | null) {
  return useQuery({
    queryKey: pageKeys.all(workspaceId ?? ''),
    queryFn: () => pageApi.list(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 min stale time — pages change frequently
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation hooks
// ─────────────────────────────────────────────────────────────────────────────

/** useCreatePage — creates a page and refreshes the workspace page list */
export function useCreatePage(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreatePagePayload) => pageApi.create(workspaceId, payload),
    onSuccess: () => {
      // Invalidate the pages list — new page appears in sidebar automatically
      queryClient.invalidateQueries({ queryKey: pageKeys.all(workspaceId) });
    },
  });
}

/**
 * useUpdatePage — updates page metadata (title, icon, parent, etc.)
 *
 * Uses optimistic update pattern:
 *   1. Update cache immediately (UI feels instant)
 *   2. Send PATCH request to backend
 *   3. On error: rollback to previous cache value
 *
 * This is what makes apps like Notion feel fast — the UI doesn't wait
 * for the server before showing the update.
 */
export function useUpdatePage(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePagePayload }) =>
      pageApi.update(id, payload),

    onMutate: async ({ id, payload }) => {
      // Cancel any in-flight queries for this page list (prevents race conditions)
      await queryClient.cancelQueries({ queryKey: pageKeys.all(workspaceId) });

      // Snapshot the current cache value (for rollback)
      const previousPages = queryClient.getQueryData<Page[]>(pageKeys.all(workspaceId));

      // Optimistically update the cache
      queryClient.setQueryData<Page[]>(pageKeys.all(workspaceId), (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...payload } : p)) ?? [],
      );

      // Return snapshot for rollback
      return { previousPages };
    },

    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousPages) {
        queryClient.setQueryData(pageKeys.all(workspaceId), context.previousPages);
      }
    },

    onSettled: () => {
      // Always refetch after mutation to sync with server
      queryClient.invalidateQueries({ queryKey: pageKeys.all(workspaceId) });
    },
  });
}

/** useDeletePage — soft-deletes a page and removes it from the list cache */
export function useDeletePage(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pageId: string) => pageApi.delete(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all(workspaceId) });
    },
  });
}
