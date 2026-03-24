/**
 * hooks/useBlocks.ts
 *
 * What:    React Query hooks for block data on a single page.
 *          Blocks are the content units inside a TipTap editor page.
 *          For the TipTap integration we primarily use a single "content" block
 *          that stores the entire editor JSON. Additional hooks are here for
 *          future block-level operations (inline AI, reordering, etc.)
 *
 * Exports: useBlocks, useCreateBlock, useUpdateBlock, useDeleteBlock
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockApi } from '@/lib/api';
import type { Block, CreateBlockPayload, UpdateBlockPayload } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const blockKeys = {
  all:    (pageId: string) => ['blocks', pageId] as const,
  detail: (blockId: string) => ['block', blockId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const POSITION_KEYS = new Set(['canvas_x', 'canvas_y', 'canvas_z']);

function isPositionOnlyPayload(payload: UpdateBlockPayload): boolean {
  return Object.keys(payload).every((k) => POSITION_KEYS.has(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/** useBlocks — fetches all blocks for a page, ordered by block.order */
export function useBlocks(pageId: string | null) {
  return useQuery({
    queryKey:   blockKeys.all(pageId ?? ''),
    queryFn:    () => blockApi.list(pageId!),
    enabled:    !!pageId,
    select:     (data) => [...data].sort((a, b) => a.order - b.order),
    staleTime:  1000 * 30, // blocks change frequently, only 30s stale time
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/** useCreateBlock — creates a block and adds it to the page cache */
export function useCreateBlock(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBlockPayload) => blockApi.create(pageId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockKeys.all(pageId) });
    },
  });
}

/**
 * useUpdateBlock — updates a block's content with optimistic update.
 *
 * Why optimistic: the editor feels laggy if it waits for the network.
 * We immediately update the cache, send the PATCH, and rollback on failure.
 *
 * Cache strategy:
 *   onMutate  — optimistically write new values into cache.
 *               cancelQueries is SKIPPED for canvas position-only updates
 *               (canvas_x/y/z) because calling it on rapid drag mutations
 *               causes React Query's mutation queue to break after ~3 drags.
 *               cancelQueries is only appropriate for cancelling background
 *               refetches before an optimistic write — not for cancelling
 *               other mutations.
 *   onSuccess — write server-confirmed block directly into cache (no refetch)
 *   onError   — rollback to pre-mutation snapshot
 *   onSettled — invalidate for non-position updates only; position updates
 *               rely on onSuccess setQueryData to avoid racing refetches
 */
export function useUpdateBlock(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBlockPayload }) =>
      blockApi.update(id, payload),

    onMutate: async ({ id, payload }) => {
      // For canvas position-only updates (drag), skip cancelQueries entirely.
      // cancelQueries on rapid successive mutations causes the mutation queue
      // to break after ~3 drags — each mutation's response gets cancelled by
      // the next onMutate before it can resolve.
      if (!isPositionOnlyPayload(payload)) {
        await queryClient.cancelQueries({ queryKey: blockKeys.all(pageId) });
      }

      const previousBlocks = queryClient.getQueryData<Block[]>(blockKeys.all(pageId));

      queryClient.setQueryData<Block[]>(blockKeys.all(pageId), (old) =>
        old?.map((b) => (b.id === id ? { ...b, ...payload } : b)) ?? [],
      );

      return { previousBlocks };
    },

    onSuccess: (serverBlock, { id }) => {
      // Write server-confirmed block data directly into cache.
      // This keeps canvas_x/y accurate without triggering a full refetch
      // that could race with a subsequent drag's optimistic update.
      queryClient.setQueryData<Block[]>(blockKeys.all(pageId), (old) =>
        old?.map((b) => (b.id === id ? { ...b, ...serverBlock } : b)) ?? [],
      );
    },

    onError: (_err, _vars, context) => {
      if (context?.previousBlocks) {
        queryClient.setQueryData(blockKeys.all(pageId), context.previousBlocks);
      }
    },

    onSettled: (_data, _error, variables) => {
      // Canvas position-only updates (canvas_x/y/z) skip invalidation entirely.
      // The onSuccess setQueryData already wrote the server-confirmed values,
      // so a refetch here would only race with the next drag's optimistic update.
      // All other updates (content, doc_visible, canvas_visible, order, etc.)
      // still invalidate to pull in any server-side changes.
      if (!isPositionOnlyPayload(variables.payload)) {
        queryClient.invalidateQueries({ queryKey: blockKeys.all(pageId) });
      }
    },
  });
}

/** useDeleteBlock — soft-deletes a block and removes it from the page cache */
export function useDeleteBlock(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blockId: string) => blockApi.delete(blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockKeys.all(pageId) });
    },
  });
}
