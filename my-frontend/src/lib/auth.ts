/**
 * lib/auth.ts
 *
 * What:    Token storage helpers. The single place where JWT tokens are
 *          stored, read, and cleared. No React — pure functions only.
 *
 * Why separate: api.ts needs token access, store.ts needs token access,
 *          middleware.ts needs token access. Putting token logic here
 *          prevents circular imports and keeps concerns clean.
 *
 * Security design:
 *   Access token  → stored in a module-level variable (in-memory).
 *                   Survives component re-renders, dies on page refresh.
 *                   Cannot be read by XSS (unlike localStorage).
 *
 *   Refresh token → httpOnly cookie set by Django backend.
 *                   JS cannot read the value — browser sends it
 *                   automatically on requests to the same domain.
 *                   We can only check if it *exists* via a flag cookie.
 *
 * How to expand: If you later add "remember me", you could optionally
 *          persist the access token to sessionStorage for the tab lifetime.
 *          Never store tokens in localStorage.
 */

import Cookies from 'js-cookie';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory access token store
// ─────────────────────────────────────────────────────────────────────────────

/**
 * This variable lives at the module level.
 * In React terms: it's outside all components, so it persists across renders
 * but resets when the browser tab is refreshed or closed.
 *
 * Django analogy: Like Python's module-level singleton — one instance
 * shared across all imports of this module.
 */
let _accessToken: string | null = null;

/** Returns the current access token, or null if the user is not authenticated */
export function getAccessToken(): string | null {
  return _accessToken;
}

/** Stores a new access token in memory after login or token refresh */
export function setAccessToken(token: string): void {
  _accessToken = token;
}

/** Wipes the access token — called on logout or when refresh fails */
export function clearAccessToken(): void {
  _accessToken = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token presence check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The name of the non-httpOnly "flag" cookie.
 *
 * Django sets TWO cookies on login:
 *   1. refresh_token    (httpOnly=True)  — the actual secret, JS can't read it
 *   2. has_session      (httpOnly=False) — a boolean flag, JS CAN read it
 *
 * This lets our frontend know "a session exists" without exposing the token.
 *
 * IMPORTANT: Make sure your Django backend sets a cookie named exactly
 * 'has_session' with httpOnly=False alongside the refresh token.
 * If it uses a different name, change this constant.
 */
const SESSION_FLAG_COOKIE = 'has_session';

/**
 * Returns true if a session cookie exists, meaning the user likely has a
 * valid refresh token (even though we can't read it from JS).
 *
 * Used by:
 *   - middleware.ts: to redirect unauthenticated users to /login
 *   - AuthInitializer: to decide whether to call /api/auth/me/ on mount
 */
export function hasRefreshToken(): boolean {
  return Cookies.get(SESSION_FLAG_COOKIE) === 'true';
}

/**
 * Clears the session flag cookie on logout.
 * The actual httpOnly refresh token is cleared by the backend's logout endpoint.
 * We only clear our readable flag here.
 */
export function clearSessionCookie(): void {
  Cookies.remove(SESSION_FLAG_COOKIE);
}
