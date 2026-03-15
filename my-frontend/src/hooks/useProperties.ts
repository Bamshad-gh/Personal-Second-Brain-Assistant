/**
 * hooks/useProperties.ts
 *
 * What:    React Query hooks for PropertyDefinition and PropertyValue.
 *          Definitions describe the schema (name, type, options).
 *          Values hold the actual per-page data.
 *
 * Hooks exported:
 *   usePropertyDefinitions(workspaceId) — list definitions for a workspace
 *   usePropertyValues(pageId)           — list values for a page
 *   useCreateDefinition(workspaceId)    — POST a new definition
 *   useUpdateDefinition(workspaceId)    — PATCH a definition
 *   useDeleteDefinition(workspaceId)    — soft-delete a definition
 *   useUpdateValue(pageId)              — PATCH an existing value
 *   useUpsertValue(pageId, existing)    — POST or PATCH (avoids unique_together 400)
 *
 * Upsert logic:
 *   PropertyValue has unique_together=(page, definition).
 *   Posting a duplicate would fail with 400. useUpsertValue receives the
 *   already-fetched values list and decides POST vs PATCH based on whether
 *   a value for that (page, definition) pair already exists.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { propertyApi } from '@/lib/api';
import type { PropertyDefinition, PropertyValue } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const propertyKeys = {
  definitions: (workspaceId: string) =>
    ['properties', 'definitions', workspaceId] as const,
  values: (pageId: string) =>
    ['properties', 'values', pageId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Read hooks
// ─────────────────────────────────────────────────────────────────────────────

export function usePropertyDefinitions(workspaceId: string) {
  return useQuery({
    queryKey: propertyKeys.definitions(workspaceId),
    queryFn:  () => propertyApi.listDefinitions(workspaceId),
    enabled:  !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 min — definitions rarely change
  });
}

export function usePropertyValues(pageId: string) {
  return useQuery({
    queryKey: propertyKeys.values(pageId),
    queryFn:  () => propertyApi.listValues(pageId),
    enabled:  !!pageId,
    staleTime: 1000 * 30,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Definition mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateDefinition(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<PropertyDefinition>) =>
      propertyApi.createDefinition(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: propertyKeys.definitions(workspaceId) }),
  });
}

export function useUpdateDefinition(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PropertyDefinition> }) =>
      propertyApi.updateDefinition(id, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: propertyKeys.definitions(workspaceId) }),
  });
}

export function useDeleteDefinition(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => propertyApi.deleteDefinition(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: propertyKeys.definitions(workspaceId) }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Value mutations
// ─────────────────────────────────────────────────────────────────────────────

export function useUpdateValue(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PropertyValue> }) =>
      propertyApi.updateValue(id, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: propertyKeys.values(pageId) }),
  });
}

/**
 * useUpsertValue — POST to create if no existing value for (page, definition),
 * PATCH to update if one already exists. Avoids unique_together 400 errors.
 *
 * Usage:
 *   const upsert = useUpsertValue(pageId, values);
 *   upsert.mutate({ page: pageId, definition: defId, value_date: '2026-03-15' });
 */
export function useUpsertValue(pageId: string, existingValues: PropertyValue[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<PropertyValue>) => {
      const existing = existingValues.find(
        (v) => v.definition === payload.definition && v.page === payload.page,
      );
      if (existing) {
        return propertyApi.updateValue(existing.id, payload);
      }
      return propertyApi.createValue(payload);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: propertyKeys.values(pageId) }),
  });
}
