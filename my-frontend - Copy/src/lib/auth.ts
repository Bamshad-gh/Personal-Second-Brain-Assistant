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
 *   Access token  → in-memory variable + sessionStorage fallback.
 *                   sessionStorage survives page refresh but clears
 *                   when the tab closes. Cannot be read cross-origin.
 *
 *   Refresh token → httpOnly cookie set by Django backend.
 *                   JS cannot read the value — browser sends it
 *                   automatically on requests to the same domain.
 *                   We can only check if it exists via a flag cookie.
 *
 * How to expand:
 *   - Change TOKEN_KEY if you want a different storage key name
 *   - Remove sessionStorage lines if you want pure in-memory only
 */

import Cookies from 'js-cookie';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Key used to store access token in sessionStorage */
const TOKEN_KEY = 'sb_access_token';

/** Name of the readable session flag cookie set by Django on login */
const SESSION_FLAG_COOKIE = 'has_session';

// ─────────────────────────────────────────────────────────────────────────────
// Access token — in-memory with sessionStorage fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level variable — persists across component re-renders
 * but resets when the browser tab is closed.
 * sessionStorage is checked as a fallback on page refresh.
 */
let _accessToken: string | null = null;

/**
 * Returns the current access token.
 * Checks memory first, then sessionStorage (survives page refresh).
 * Returns null if the user is not authenticated.
 */
export function getAccessToken(): string | null {
  if (_accessToken) return _accessToken;
  // Fallback: restore from sessionStorage after page refresh
  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) {
    _accessToken = stored;
  }
  return _accessToken;
}

/**
 * Stores a new access token.
 * Called after login or after a successful token refresh.
 * Saves to both memory and sessionStorage so page refresh works.
 */
export function setAccessToken(token: string): void {
  _accessToken = token;
  sessionStorage.setItem(TOKEN_KEY, token);
}

/**
 * Clears the access token from both memory and sessionStorage.
 * Called on logout or when token refresh fails.
 */
export function clearAccessToken(): void {
  _accessToken = null;
  sessionStorage.removeItem(TOKEN_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session flag cookie — tells us if a refresh token exists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the session flag cookie exists.
 * This means the user likely has a valid httpOnly refresh token.
 *
 * Used by:
 *   middleware.ts      — redirect unauthenticated users to /login
 *   AuthInitializer    — decide whether to attempt token restore on mount
 */
export function hasRefreshToken(): boolean {
  return Cookies.get(SESSION_FLAG_COOKIE) === 'true';
}

/**
 * Removes the session flag cookie.
 * The actual httpOnly refresh token is cleared by Django's logout endpoint.
 * We only clear the readable flag here.
 */
export function clearSessionCookie(): void {
  Cookies.remove(SESSION_FLAG_COOKIE);
}
