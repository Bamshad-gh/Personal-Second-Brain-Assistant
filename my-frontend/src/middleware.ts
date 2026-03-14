/**
 * middleware.ts
 *
 * What:    Next.js Edge Middleware — runs before every matching request,
 *          before the page renders. Protects routes by checking for a
 *          session cookie and redirecting if it's missing.
 *
 * Next.js concept: Middleware runs at the Edge (a CDN-like layer),
 *   not in Node.js. This makes it extremely fast — no cold starts,
 *   runs in milliseconds. The trade-off: no Node.js APIs, no database
 *   access, and no JWT validation (just cookie presence checks).
 *
 * Django analogy: Like a Django middleware class that runs before every
 *   view (process_request). The difference: this runs at the network
 *   edge, before the request even reaches your server.
 *
 * Route groups:
 *   (app)  routes = /workspace/*, /[workspaceId]/* — require authentication
 *   (auth) routes = /login, /register             — redirect if already logged in
 *
 * How to expand:
 *   - Add role-based access: check a role cookie and redirect non-admins
 *   - Add workspace membership check (but only via cookies — no DB access here)
 *   - Add CSP headers in the middleware response
 *
 * IMPORTANT: This file must be at src/middleware.ts (or middleware.ts if
 *   not using the src/ directory). Next.js looks for it automatically.
 */

import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Cookie name — must match what Django sets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The non-httpOnly cookie that signals "a session exists".
 * Django sets this alongside the httpOnly refresh token on login.
 * See lib/auth.ts for why we use a flag cookie instead of the real token.
 */
const SESSION_FLAG_COOKIE = 'has_session';

// ─────────────────────────────────────────────────────────────────────────────
// Route matchers
// ─────────────────────────────────────────────────────────────────────────────

/** Routes that require authentication. If no session → redirect to /login */
const PROTECTED_PATHS = ['/workspace', '/dashboard'];

/** Routes only for guests. If session exists → redirect to / */
const AUTH_ONLY_PATHS = ['/login', '/register'];

/** Returns true if the request path starts with any of the given prefixes */
function matchesAny(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname.startsWith(path));
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware function
// ─────────────────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Read the session flag cookie
  const hasSession = request.cookies.get(SESSION_FLAG_COOKIE)?.value === 'true';

  // ── Protected routes: require session ────────────────────────────────────
  if (matchesAny(pathname, PROTECTED_PATHS) && !hasSession) {
    // Build the redirect URL: /login?from=/workspace/abc
    // The 'from' param lets the login page redirect back after login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Auth-only routes: skip if already logged in ───────────────────────────
  if (matchesAny(pathname, AUTH_ONLY_PATHS) && hasSession) {
    // Already logged in — send to the app home (will redirect to workspace)
    return NextResponse.redirect(new URL('/', request.url));
  }

  // ── All other paths: pass through unchanged ───────────────────────────────
  return NextResponse.next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Matcher config — which paths to run middleware on
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The matcher tells Next.js which URLs to run this middleware for.
 * Excluding static files and API routes makes it faster — no point
 * checking auth for a .png image or a Next.js internal API call.
 *
 * This regex excludes:
 *   - _next/static  — bundled JS/CSS files
 *   - _next/image   — Next.js image optimization
 *   - favicon.ico   — browser favicon request
 *   - Files with extensions (.png, .jpg, .svg, etc.)
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
