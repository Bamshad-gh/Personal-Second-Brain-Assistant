/**
 * components/AuthInitializer.tsx
 *
 * What:    Restores the JWT access token on every page load or refresh.
 *          The access token lives in memory (auth.ts) and resets on refresh.
 *          This component calls /api/auth/me/ which triggers the axios
 *          interceptor to use the httpOnly refresh cookie and get a new token.
 *
 * Why needed:
 *          Without this, every page refresh loses the access token.
 *          API calls then fail with 401 and redirect the user to login
 *          even though their session (refresh cookie) is still valid.
 *
 * How it works:
 *          1. Check if has_session cookie exists (means refresh token exists)
 *          2. Call /api/auth/me/ — this gets a 401 (no access token yet)
 *          3. Axios interceptor catches 401, calls /api/auth/refresh/
 *          4. Django returns new access token
 *          5. Interceptor stores token, retries /api/auth/me/
 *          6. We store the user in Zustand
 *          7. Call onReady() — AppShellClient shows the app
 *
 * Used by: AppShellClient.tsx — rendered before Sidebar and page content
 *          so token is ready before any other API calls happen.
 *
 * To expand:
 *          - Add a timeout so onReady() always fires even if network is slow
 *          - Add analytics tracking for session restore events
 */

'use client';

import { useEffect, useRef } from 'react';
import { hasRefreshToken, getAccessToken } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuthInitializerProps {
  /** Called when auth restore is complete (success or failure).
   *  AppShellClient waits for this before rendering the app. */
  onReady: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AuthInitializer({ onReady }: AuthInitializerProps) {

  // ── Store ──────────────────────────────────────────────────────────────────
  const setUser         = useAppStore((s) => s.setUser);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  // ── Ref — prevents running twice in React StrictMode ──────────────────────
  const initialized = useRef(false);

  // ── Effect — runs once on mount ───────────────────────────────────────────
  useEffect(() => {
    // Prevent double execution (React StrictMode mounts components twice in dev)
    if (initialized.current) return;
    initialized.current = true;

    // ── Case 1: Already authenticated in this session ────────────────────────
    // Zustand still has the user from a previous navigation (no refresh needed)
    if (isAuthenticated) {
      onReady();
      return;
    }

    // ── Case 2: No session cookie — user is logged out ───────────────────────
    // No point calling the API — redirect will happen via middleware
    if (!hasRefreshToken()) {
      onReady();
      return;
    }

    // ── Case 3: Session cookie exists but token is gone (page was refreshed) ──
    // Call getMe() which will:
    //   - Send request with no Authorization header
    //   - Get 401 from Django
    //   - Axios interceptor calls /api/auth/refresh/ with the httpOnly cookie
    //   - Django returns a new access token
    //   - Interceptor stores token via setAccessToken()
    //   - Interceptor retries getMe() — this time it succeeds
    //   - We get the user object back here
    authApi.getMe()
      .then((user) => {
        // Interceptor already stored the new access token in auth.ts
        // Read it back so we can pass it to setUser (which also calls setAccessToken)
        const token = getAccessToken();
        if (token) {
          setUser(user, token);
        }
      })
      .catch(() => {
        // Refresh failed — session is truly expired
        // We still call onReady() so the UI renders
        // The user will be redirected to login when they try any authenticated action
      })
      .finally(() => {
        // Always unblock the UI regardless of success or failure
        onReady();
      });

  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps intentional — this must only run once on mount
  // isAuthenticated and setUser are stable references, not reactive deps here

  // Renders nothing — this component is a pure side effect
  return null;
}