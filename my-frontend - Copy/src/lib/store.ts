/**
 * lib/store.ts
 *
 * What:    Zustand global store — shared client state that multiple
 *          unrelated components need without prop-drilling.
 *
 * What belongs here:
 *   ✅ Who is logged in (user object, access token)
 *   ✅ Which workspace is currently active
 *   ✅ UI state that spans multiple pages (sidebar open/closed)
 *
 * What does NOT belong here:
 *   ❌ Lists of pages, blocks — those go in React Query (server state)
 *   ❌ Form state — that stays local in the component using React Hook Form
 *   ❌ Data that only one component needs — use useState for that
 *
 * Django analogy: This is like Django's session — a shared bag of info
 *   that persists across the "requests" (page navigations) of this app.
 *
 * How to expand: Add a new slice interface + add it to AppStore.
 *   Never put async logic here — async goes in hooks that call api.ts.
 *
 * Zustand concept: Unlike Redux, there is no action/reducer pattern.
 *   You just call set() with the new state. Clean and simple.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import Cookies from 'js-cookie';
import type { User, Workspace } from '@/types';
import { clearAccessToken, clearSessionCookie, setAccessToken } from './auth';

/** Name must match SESSION_FLAG_COOKIE in auth.ts and middleware.ts */
const SESSION_FLAG_COOKIE = 'has_session';

// ─────────────────────────────────────────────────────────────────────────────
// Slice interfaces — each slice is a logical grouping of related state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AuthSlice — who is currently logged in
 *
 * user: the full User object (from /api/auth/me/)
 * isAuthenticated: computed from user !== null, but explicit for convenience
 */
interface AuthSlice {
  user: User | null;
  isAuthenticated: boolean;

  /** Called after login or on mount when /api/auth/me/ succeeds */
  setUser: (user: User, accessToken: string) => void;

  /** Called on logout or when token refresh fails */
  logout: () => void;
}

/**
 * WorkspaceSlice — which workspace the user is currently viewing
 *
 * We keep the full Workspace object so the sidebar and header
 * can display the name/icon without an extra API call.
 */
interface WorkspaceSlice {
  activeWorkspace: Workspace | null;

  /** Called when user navigates to a workspace or selects one */
  setActiveWorkspace: (workspace: Workspace | null) => void;
}

/**
 * UISlice — global UI state
 *
 * sidebarOpen:      whether the sidebar is visible (mobile toggle + desktop hamburger)
 * sidebarCollapsed: desktop-only collapse via the arrow button inside the sidebar
 * aiPanelOpen:      whether the AI panel is open (right-side drawer in editor)
 */
interface UISlice {
  sidebarOpen:      boolean;
  sidebarCollapsed: boolean;
  aiPanelOpen:      boolean;

  toggleSidebar:         () => void;
  setSidebarOpen:        (open: boolean) => void;
  toggleSidebarCollapse: () => void;
  toggleAiPanel:         () => void;
  setAiPanelOpen:        (open: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined store type
// ─────────────────────────────────────────────────────────────────────────────

/** AppStore combines all slices into one object */
type AppStore = AuthSlice & WorkspaceSlice & UISlice;

// ─────────────────────────────────────────────────────────────────────────────
// Store creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useAppStore — the main Zustand hook.
 *
 * Usage in a component:
 *   const user = useAppStore((state) => state.user);
 *   const logout = useAppStore((state) => state.logout);
 *
 * Always select only the piece you need (the selector pattern).
 * This prevents the component from re-rendering when unrelated state changes.
 * Selecting the whole store is an anti-pattern:
 *   ❌  const store = useAppStore(); // re-renders on every state change
 *   ✅  const user = useAppStore((s) => s.user); // re-renders only when user changes
 *
 * devtools() wraps the store so you can inspect it in the
 * Redux DevTools browser extension (works with Zustand too).
 */
export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      // ── Auth slice ────────────────────────────────────────────────────────

      user: null,
      isAuthenticated: false,

      setUser: (user: User, accessToken: string) => {
        // Store the access token in the auth module (in-memory)
        setAccessToken(accessToken);
        // Set the session flag cookie so middleware knows the user is logged in.
        // expires: 30 → cookie lasts 30 days (matches refresh token lifetime)
        // sameSite: 'Lax' → sent on same-site navigations, not cross-site requests
        Cookies.set(SESSION_FLAG_COOKIE, 'true', { expires: 30, sameSite: 'Lax' });
        // Store the user object in Zustand (triggers re-renders)
        set({ user, isAuthenticated: true }, false, 'auth/setUser');
      },

      logout: () => {
        // Clear the in-memory access token
        clearAccessToken();
        // Clear the session flag cookie
        clearSessionCookie();
        // Reset store to unauthenticated state
        set(
          { user: null, isAuthenticated: false, activeWorkspace: null },
          false,
          'auth/logout',
        );
      },

      // ── Workspace slice ───────────────────────────────────────────────────

      activeWorkspace: null,

      setActiveWorkspace: (workspace: Workspace | null) => {
        set({ activeWorkspace: workspace }, false, 'workspace/setActive');
      },

      // ── UI slice ──────────────────────────────────────────────────────────

      sidebarOpen:      true,
      sidebarCollapsed: false,
      aiPanelOpen:      false,

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }), false, 'ui/toggleSidebar');
      },
      setSidebarOpen: (open: boolean) => {
        set({ sidebarOpen: open }, false, 'ui/setSidebarOpen');
      },
      toggleSidebarCollapse: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }), false, 'ui/toggleSidebarCollapse');
      },
      toggleAiPanel: () => {
        set((state) => ({ aiPanelOpen: !state.aiPanelOpen }), false, 'ui/toggleAiPanel');
      },
      setAiPanelOpen: (open: boolean) => {
        set({ aiPanelOpen: open }, false, 'ui/setAiPanelOpen');
      },
    }),
    { name: 'SpatialScribeStore' }, // name shows up in Redux DevTools
  ),
);
