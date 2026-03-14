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
 * This is the same pattern as useUpdatePage.
 */
export function useUpdateBlock(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBlockPayload }) =>
      blockApi.update(id, payload),

    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: blockKeys.all(pageId) });
      const previousBlocks = queryClient.getQueryData<Block[]>(blockKeys.all(pageId));

      queryClient.setQueryData<Block[]>(blockKeys.all(pageId), (old) =>
        old?.map((b) => (b.id === id ? { ...b, ...payload } : b)) ?? [],
      );

      return { previousBlocks };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousBlocks) {
        queryClient.setQueryData(blockKeys.all(pageId), context.previousBlocks);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: blockKeys.all(pageId) });
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
