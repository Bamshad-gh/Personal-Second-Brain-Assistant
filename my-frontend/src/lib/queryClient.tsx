/**
 * lib/queryClient.ts
 *
 * What:    Configures React Query's QueryClient and exports a Providers
 *          wrapper component that wraps the app with QueryClientProvider.
 *
 * React Query concept:
 *   Think of it as a smart server-side cache. Every time a component calls
 *   useQuery('workspaces', workspaceApi.list), React Query:
 *     1. Returns cached data immediately (no loading flicker)
 *     2. Refetches in the background if the data is older than staleTime
 *     3. Deduplicates: 10 components requesting 'workspaces' = 1 API call
 *     4. Retries failed requests automatically
 *
 *   Django analogy: Like Django's cache framework + select_related combined.
 *   Queries are identified by a 'query key' (like a cache key in Django).
 *
 * How to expand:
 *   - Add global error handling in the QueryClient config
 *   - Adjust staleTime per-query using useQuery({ staleTime: ... })
 *   - For offline support later, add persistQueryClient from react-query
 *
 * Exports: Providers (React component), queryClient (direct access if needed)
 */

'use client';
// 'use client' is required because:
// 1. QueryClient must be created on the client (it holds browser memory)
// 2. ReactQueryDevtools only runs in the browser
// This directive tells Next.js "this module runs in the browser, not on the server"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// QueryClient configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new QueryClient with sensible defaults for this app.
 *
 * staleTime: 5 minutes — how long before cached data is considered "stale"
 *   (and a background refetch is triggered). 5 min is right for workspaces/pages
 *   since they don't change every second. Reduce for real-time data.
 *
 * retry: 1 — retry a failed request once before showing an error.
 *   Don't retry too many times or users will wait a long time on network issues.
 *
 * refetchOnWindowFocus: false — by default, React Query refetches when you
 *   switch back to the browser tab. Disabled because the editor would
 *   unexpectedly reload mid-typing.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0, // don't retry mutations (creates, updates, deletes)
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Providers wraps the entire app (in layout.tsx) with React Query context.
 *
 * Why useState instead of a module-level QueryClient?
 * In Next.js App Router, the root layout may be rendered on the server for
 * the first request. A module-level QueryClient would be shared between
 * all server renders (requests), leaking data between users. useState()
 * creates a new QueryClient per browser session.
 *
 * The pattern: create once, never recreate (no dependencies in the initializer).
 */
export function Providers({ children }: { children: ReactNode }) {
  // useState(() => makeQueryClient()) creates it once on mount, never again
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools only render in development (NODE_ENV check is built in) */}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  );
}

/**
 * Direct access to the QueryClient — useful for imperative cache updates.
 * Example: after creating a page, invalidate the pages list:
 *   queryClient.invalidateQueries({ queryKey: ['pages', workspaceId] })
 *
 * This is exported as a lazy getter to avoid creating a client at module load.
 * In components, prefer the useQueryClient() hook from React Query instead.
 */
export { makeQueryClient };
