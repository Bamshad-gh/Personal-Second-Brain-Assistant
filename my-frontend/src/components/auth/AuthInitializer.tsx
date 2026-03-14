/**
 * components/auth/AuthInitializer.tsx
 *
 * What:    An invisible component that runs once on mount to restore the
 *          user's session after a page refresh.
 *
 * Why it exists: JWT access tokens live in memory — they disappear when
 *   the page refreshes. The refresh token lives in an httpOnly cookie
 *   that persists. On mount, we call /api/auth/me/ which triggers the
 *   Axios interceptor to get a new access token via the refresh cookie,
 *   then returns the current user object to populate the Zustand store.
 *
 * What it renders: Nothing (returns null). It's purely a side-effect component.
 *
 * React concept — useEffect:
 *   useEffect(() => { ... }, []) runs once after the component mounts
 *   (after the browser has painted the page). The empty [] means "no
 *   dependencies — only run once". Django analogy: like a signal that
 *   fires once when the app starts.
 *
 * How to expand: Add workspace restoration here — after getting the user,
 *   check localStorage for the last active workspace ID and set it.
 */

'use client';

import { useEffect } from 'react';
import { authApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { hasRefreshToken } from '@/lib/auth';

export function AuthInitializer() {
  // Pull the setUser action from Zustand — we call this after /api/auth/me/ succeeds
  const setUser = useAppStore((state) => state.setUser);

  useEffect(() => {
    /**
     * restoreSession — called once on mount.
     * If there's a session cookie, try to get the current user.
     * The Axios interceptor handles getting a new access token silently.
     * If it fails (cookie expired), do nothing — user stays logged out.
     */
    async function restoreSession(): Promise<void> {
      // Skip the API call entirely if no session cookie exists
      // This avoids a pointless 401 on first visit
      if (!hasRefreshToken()) return;

      try {
        // /api/auth/me/ will:
        // 1. Try with access token (null on fresh page load → 401)
        // 2. Interceptor catches 401, calls /api/auth/token/refresh/
        // 3. Gets new access token from refresh cookie
        // 4. Retries /api/auth/me/ with new token
        // 5. Returns user object
        const user = await authApi.getMe();

        // Access token is now in memory (set by the interceptor).
        // We pass an empty string here — setUser just calls setAccessToken
        // internally, but getAccessToken() already has the right value
        // from the interceptor. We pass '' to satisfy the type signature.
        // A cleaner approach: make setUser accept just the user object
        // and call getAccessToken() internally — feel free to refactor.
        const { getAccessToken } = await import('@/lib/auth');
        const token = getAccessToken() ?? '';
        setUser(user, token);
      } catch {
        // Session has truly expired — user stays on public routes
        // The middleware will redirect them to /login if they try to access
        // a protected route
      }
    }

    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // This component renders nothing — it's a side-effect only
  return null;
}
