/**
 * hooks/usePageTypeGroups.ts
 *
 * What:    React Query hooks for PageTypeGroup CRUD.
 *          Page type groups are named, coloured buckets that organise
 *          CustomPageTypes in the sidebar and in the CustomPageTypeManager panel.
 *
 * Hooks exported:
 *   usePageTypeGroups(workspaceId)       — list groups for a workspace
 *   useCreatePageTypeGroup(workspaceId)  — POST a new group
 *   useUpdatePageTypeGroup(workspaceId)  — PATCH a group (name, color, order)
 *   useDeletePageTypeGroup(workspaceId)  — soft-delete a group (backend unlinks types first)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pageTypeGroupApi } from '@/lib/api';
import type { PageTypeGroup } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const pageTypeGroupKeys = {
  all: (workspaceId: string) => ['page-type-groups', workspaceId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Read hook
// ─────────────────────────────────────────────────────────────────────────────

export function usePageTypeGroups(workspaceId: string) {
  return useQuery({
    queryKey: pageTypeGroupKeys.all(workspaceId),
    queryFn:  () => pageTypeGroupApi.list(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 min — groups rarely change
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useCreatePageTypeGroup(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { workspace: string; name: string; color?: string; order?: number }) =>
      pageTypeGroupApi.create(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: pageTypeGroupKeys.all(workspaceId) }),
  });
}

export function useUpdatePageTypeGroup(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Pick<PageTypeGroup, 'name' | 'color' | 'order'>> }) =>
      pageTypeGroupApi.update(id, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: pageTypeGroupKeys.all(workspaceId) }),
  });
}

export function useDeletePageTypeGroup(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pageTypeGroupApi.delete(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: pageTypeGroupKeys.all(workspaceId) }),
  });
}
