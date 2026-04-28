/**
 * hooks/useDocumentBlocks.ts
 *
 * What:    React Query hooks for document-mode block operations.
 *          Separate from useBlocks.ts which is used by the canvas.
 *
 * Operations:
 *   useDocBlocks        — fetch + filter doc blocks for a page
 *   useCreateDocBlock   — create a block after another block (or at start)
 *   useUpdateDocBlock   — update block content/type with optimistic update
 *   useDeleteDocBlock   — soft-delete a block
 *   useReorderDocBlocks — bulk fractional reorder
 *
 * Fractional ordering:
 *   Block order is a float. Inserting between A and B uses the midpoint
 *   (A.order + B.order) / 2 to prevent collisions. The old approach of
 *   afterBlock.order + 0.5 caused collisions when the next block was already
 *   at afterBlock.order + 0.5.
 *
 *   Order rules:
 *     afterBlock + nextBlock present → midpoint = (after.order + next.order) / 2
 *     afterBlock only (insert at end) → after.order + 1.0
 *     nextBlock only (insert at start) → next.order - 1.0
 *     neither                          → 1.0
 *
 * onCreated callback (useCreateDocBlock):
 *   Called in onSuccess with the full Block returned by the API.
 *   page.tsx uses this to get the real block ID and pass it to DocumentEditor
 *   as pendingFocusBlockId — replacing the old positional pendingFocusAfterId
 *   approach which focused the wrong block because it fired before the new
 *   block existed in sortedBlocks.
 *
 * Cache invalidation:
 *   All mutations invalidate BOTH ['doc-blocks', pageId] AND ['blocks', pageId]
 *   so the DocumentEditor and CanvasView (which reads from useBlocks) stay in sync.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockApi }                              from '@/lib/api';
import type {
  Block,
  BlockType,
  UpdateBlockPayload,
}                                                from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUERY KEYS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const docBlockKeys = {
  all: (pageId: string) => ['doc-blocks', pageId] as const,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FETCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * useDocBlocks — fetches all blocks for a page, filtered to doc-visible
 * non-deleted blocks, sorted by fractional order.
 */
export function useDocBlocks(pageId: string) {
  return useQuery({
    queryKey: docBlockKeys.all(pageId),
    queryFn:  () => blockApi.list(pageId),
    staleTime: 1000 * 30,
    select: (data) =>
      [...data]
        .filter((b) => b.doc_visible && !b.is_deleted)
        .sort((a, b) => a.order - b.order),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CREATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * useCreateDocBlock — creates a new block.
 *
 * Parameters:
 *   pageId    — page to create the block in
 *   onCreated — optional callback called with the newly created Block
 *               (from the API response). page.tsx uses this to get the real
 *               block ID for focus, avoiding the position-based focus bug.
 *
 * Mutation variables:
 *   afterBlock — the block to insert after (null = insert at/before start)
 *   nextBlock  — the block currently after afterBlock (null = inserting at end)
 *   blockType  — registry type for the new block
 *
 * Order calculation (collision-free midpoint):
 *   both present  → (afterBlock.order + nextBlock.order) / 2
 *   after only    → afterBlock.order + 1.0   (inserting at end)
 *   next only     → nextBlock.order  - 1.0   (inserting at start)
 *   neither       → 1.0
 */
export function useCreateDocBlock(
  pageId:     string,
  onCreated?: (newBlock: Block) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      afterBlock,
      nextBlock,
      blockType,
      parentId,
    }: {
      afterBlock: Block | null;
      nextBlock:  Block | null;
      blockType:  BlockType;
      parentId?:  string;   // column block id when creating inside a column
    }) => {
      let newOrder: number;
      if (afterBlock && nextBlock) {
        newOrder = (afterBlock.order + nextBlock.order) / 2;
      } else if (afterBlock) {
        newOrder = afterBlock.order + 1.0;
      } else if (nextBlock) {
        newOrder = nextBlock.order - 1.0;
      } else {
        newOrder = 1.0;
      }

      return blockApi.create(pageId, {
        block_type:     blockType,
        content:        {},
        order:          newOrder,
        doc_visible:    true,
        canvas_visible: false,
        ...(parentId !== undefined ? { parent: parentId } : {}),
      });
    },
    onSuccess: (newBlock) => {
      queryClient.invalidateQueries({ queryKey: docBlockKeys.all(pageId) });
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
      onCreated?.(newBlock);
    },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UPDATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * useUpdateDocBlock — updates a block with an optimistic cache write.
 *
 * onMutate  — immediately writes new values to cache (no flicker)
 * onError   — rolls back to the pre-mutation snapshot
 * onSettled — invalidates to pull in server-confirmed state
 */
export function useUpdateDocBlock(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id:      string;
      payload: UpdateBlockPayload;
    }) => blockApi.update(id, payload),

    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: docBlockKeys.all(pageId) });
      const prev = queryClient.getQueryData<Block[]>(docBlockKeys.all(pageId));

      queryClient.setQueryData<Block[]>(docBlockKeys.all(pageId), (old) =>
        old?.map((b) => (b.id === id ? { ...b, ...payload } : b)) ?? [],
      );

      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(docBlockKeys.all(pageId), ctx.prev);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: docBlockKeys.all(pageId) });
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
    },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * useDeleteDocBlock — soft-deletes a block (sets is_deleted=true on backend).
 * Invalidates the page block list so deleted blocks disappear immediately.
 */
export function useDeleteDocBlock(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blockId: string) => blockApi.delete(blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: docBlockKeys.all(pageId) });
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
    },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REORDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * useReorderDocBlocks — batch-updates the order field on multiple blocks.
 *
 * Variables: array of { id, order } pairs.
 * The hook wraps them in the { blocks: [...] } shape that the API expects.
 */
export function useReorderDocBlocks(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reorderData: Array<{ id: string; order: number }>) =>
      blockApi.reorder({ blocks: reorderData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: docBlockKeys.all(pageId) });
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
    },
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAKE COLUMNS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * useMakeColumns — converts two top-level blocks into a column layout.
 *
 * Calls POST /api/blocks/make-columns/ which creates a column_container
 * with two column children and moves source + target into them.
 * Invalidates the page's block list so the new structure renders immediately.
 */
export function useMakeColumns(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      blockApi.makeColumns(sourceId, targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: docBlockKeys.all(pageId) });
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
    },
  });
}

/**
 * useAddToColumn — adds a top-level block as a new column in an existing container.
 *
 * Calls POST /api/blocks/add-to-column/ which creates a new column child inside
 * the container and moves the source block into it. Widths redistribute equally.
 * Use this when the target is already a column_container (builds 3-col, 4-col, etc.)
 */
export function useAddToColumn(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, containerId }: { sourceId: string; containerId: string }) =>
      blockApi.addToColumn(sourceId, containerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: docBlockKeys.all(pageId) });
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
    },
  });
}

/**
 * useCollapseColumn — atomically removes an empty column from its container.
 *
 * Delegates all logic to the backend (POST /api/blocks/collapse-column/) so
 * the dissolution runs in one DB transaction — no race condition.
 *
 * Cases handled server-side:
 *   0 cols remain → soft-delete container
 *   1 col remains → move content to top-level, soft-delete col + container
 *   2+ cols remain → soft-delete column, redistribute widths equally
 */
export function useCollapseColumn(pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (columnId: string) => blockApi.collapseColumn(columnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: docBlockKeys.all(pageId) });
      queryClient.invalidateQueries({ queryKey: ['blocks', pageId] });
    },
  });
}
