/**
 * hooks/useBlockConnections.ts
 *
 * What:    React Query hooks for canvas arrow connections between blocks.
 *          Each connection is a BLOCK_LINK Connection row on the backend.
 *          Mirrors the structure of useBlocks.ts exactly.
 *
 * Exports: blockConnectionKeys, useBlockConnections,
 *          useCreateBlockConnection, useUpdateBlockConnection,
 *          useDeleteBlockConnection
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockConnectionApi } from '@/lib/api';
import type { BlockConnection } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const blockConnectionKeys = {
  all: (pageId: string) => ['block-connections', pageId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/** useBlockConnections — fetches all BLOCK_LINK connections for a page */
export function useBlockConnections(pageId: string) {
  return useQuery({
    queryKey: blockConnectionKeys.all(pageId),
    queryFn:  () => blockConnectionApi.list(pageId),
    enabled:  !!pageId,
    staleTime: 1000 * 30,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/** useCreateBlockConnection — creates an arrow between two blocks */
export function useCreateBlockConnection(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Parameters<typeof blockConnectionApi.create>[0]) =>
      blockConnectionApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockConnectionKeys.all(pageId) });
    },
  });
}

/** useUpdateBlockConnection — updates label, direction, or arrow_type */
export function useUpdateBlockConnection(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: {
      id:      string;
      payload: Partial<Pick<BlockConnection, 'label' | 'direction' | 'arrow_type'>>;
    }) => blockConnectionApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockConnectionKeys.all(pageId) });
    },
  });
}

/** useDeleteBlockConnection — soft-deletes a connection */
export function useDeleteBlockConnection(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => blockConnectionApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockConnectionKeys.all(pageId) });
    },
  });
}
