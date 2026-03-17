/**
 * hooks/useCustomPageTypes.ts
 *
 * What:    React Query hooks for CustomPageType CRUD.
 *          Custom page types are user-defined categories (e.g. "Client", "Project")
 *          that scope PropertyDefinitions to only appear on pages of that type.
 *
 * Hooks exported:
 *   useCustomPageTypes(workspaceId)       — list types for a workspace
 *   useCreateCustomPageType(workspaceId)  — POST a new type
 *   useUpdateCustomPageType(workspaceId)  — PATCH a type (name, icon, description)
 *   useDeleteCustomPageType(workspaceId)  — soft-delete a type
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customPageTypeApi } from '@/lib/api';
import type { CustomPageType } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const customPageTypeKeys = {
  all: (workspaceId: string) => ['custom-page-types', workspaceId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Read hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCustomPageTypes(workspaceId: string) {
  return useQuery({
    queryKey: customPageTypeKeys.all(workspaceId),
    queryFn:  () => customPageTypeApi.list(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 min — types rarely change
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateCustomPageType(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<CustomPageType, 'id'>) =>
      customPageTypeApi.create(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: customPageTypeKeys.all(workspaceId) }),
  });
}

export function useUpdateCustomPageType(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CustomPageType> }) =>
      customPageTypeApi.update(id, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: customPageTypeKeys.all(workspaceId) }),
  });
}

export function useDeleteCustomPageType(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customPageTypeApi.delete(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: customPageTypeKeys.all(workspaceId) }),
  });
}
