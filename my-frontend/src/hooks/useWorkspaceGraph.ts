/**
 * hooks/useWorkspaceGraph.ts
 *
 * What:    React Query hook that fetches the full page graph for a workspace
 *          in a single request — used by the Knowledge Map view.
 *
 * Hooks exported:
 *   useWorkspaceGraph(workspaceId)  — fetch { nodes, edges } for the graph page
 *
 * Data shape:
 *   nodes  GraphNode[]  — every non-deleted page in the workspace
 *   edges  GraphEdge[]  — every non-deleted PAGE_LINK connection (includes
 *                         auto-created parent/child edges from signals.py)
 *
 * Stale time is short (30 s) so the graph reflects recent page/link changes
 * without requiring a manual refresh. Background refetch keeps it current
 * while the tab is open.
 */

import { useQuery } from '@tanstack/react-query';
import { graphApi } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const workspaceGraphKeys = {
  graph: (workspaceId: string) => ['workspace-graph', workspaceId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Read hook
// ─────────────────────────────────────────────────────────────────────────────

export function useWorkspaceGraph(workspaceId: string) {
  return useQuery({
    queryKey:  workspaceGraphKeys.graph(workspaceId),
    queryFn:   () => graphApi.getWorkspaceGraph(workspaceId),
    enabled:   !!workspaceId,
    staleTime: 1000 * 30,  // 30 s — graph should feel live
  });
}
