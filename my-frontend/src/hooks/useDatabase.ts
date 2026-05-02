import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { databaseApi } from '@/lib/api';
import type { CreateColumnPayload, UpdateCellPayload } from '@/types';

export const dbKeys = {
  view: (blockId: string) => ['db-view', blockId] as const,
  rows: (blockId: string) => ['db-rows', blockId] as const,
};

export function useDatabaseView(blockId: string) {
  return useQuery({
    queryKey: dbKeys.view(blockId),
    queryFn:  () => databaseApi.getView(blockId),
    enabled:  !!blockId,
    staleTime: 1000 * 30,
  });
}

export function useDatabaseRows(blockId: string) {
  return useQuery({
    queryKey: dbKeys.rows(blockId),
    queryFn:  () => databaseApi.listRows(blockId),
    enabled:  !!blockId,
    staleTime: 1000 * 15,
  });
}

export function useUpdateView(blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => databaseApi.updateView(blockId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbKeys.view(blockId) });
      qc.invalidateQueries({ queryKey: dbKeys.rows(blockId) });
    },
  });
}

export function useCreateRow(blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => databaseApi.createRow(blockId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbKeys.rows(blockId) });
    },
  });
}

export function useDeleteRow(blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => databaseApi.deleteRow(blockId, rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbKeys.rows(blockId) });
    },
  });
}

export function useUpdateCell(blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, defId, payload }: {
      rowId:   string;
      defId:   string;
      payload: UpdateCellPayload;
    }) => databaseApi.updateCell(blockId, rowId, defId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbKeys.rows(blockId) });
    },
  });
}

export function useCreateColumn(blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateColumnPayload) => databaseApi.createColumn(blockId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbKeys.view(blockId) });
      qc.invalidateQueries({ queryKey: dbKeys.rows(blockId) });
    },
  });
}

export function useUpdateColumn(blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ colId, payload }: {
      colId:   string;
      payload: Partial<CreateColumnPayload & { order: number }>;
    }) => databaseApi.updateColumn(blockId, colId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbKeys.view(blockId) });
    },
  });
}

export function useDeleteColumn(blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (colId: string) => databaseApi.deleteColumn(blockId, colId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbKeys.view(blockId) });
      qc.invalidateQueries({ queryKey: dbKeys.rows(blockId) });
    },
  });
}

export function useSendEmail(blockId: string) {
  return useMutation({
    mutationFn: (payload: { to: string[]; subject: string; body: string }) =>
      databaseApi.sendEmail(blockId, payload),
  });
}
