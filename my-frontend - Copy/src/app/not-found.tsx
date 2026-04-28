/**
 * app/not-found.tsx — Global 404 Handler
 *
 * What:    Next.js automatically renders this file for any URL that
 *          matches no route (e.g. /register/typo, /anything/random).
 *          Instead of showing a blank error page, it redirects the user
 *          to the right place based on whether they are logged in.
 *
 * Logic:
 *   Has session cookie  →  redirect to /workspace  (picks up their workspace)
 *   No session cookie   →  redirect to /login
 *
 * Next.js concept — Special files:
 *   Next.js App Router has a set of reserved filenames that do specific things:
 *     page.tsx       → the page content
 *     layout.tsx     → wraps child pages
 *     not-found.tsx  → rendered when notFound() is called OR no route matches
 *     error.tsx      → rendered when an unhandled error is thrown
 *     loading.tsx    → shown as a Suspense fallback while a page loads
 *
 * This is a Server Component (no 'use client') so it can:
 *   - Read cookies directly via next/headers
 *   - Call redirect() before any HTML is sent to the browser
 *   - Work even if JavaScript is disabled in the browser
 *
 * How to expand:
 *   - Add a brief flash message: "Page not found — redirecting…"
 *   - Log 404s to analytics before redirecting
 */

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

const SESSION_FLAG_COOKIE = 'has_session';

export default async function NotFound() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.get(SESSION_FLAG_COOKIE)?.value === 'true';

  if (hasSession) {
    // Logged in — send to their workspace hub (which will pick the right workspace)
    redirect('/workspace');
  }

  // Not logged in — send to login
  redirect('/login');
}
