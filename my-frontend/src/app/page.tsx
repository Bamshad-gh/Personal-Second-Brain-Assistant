/**
 * app/page.tsx — Root Page (/)
 *
 * What:    The entry point of the app. Its only job is to redirect users
 *          to the right place based on their session state.
 *
 * This is a Server Component (no 'use client') so it can read cookies
 * directly and redirect before anything is sent to the browser.
 *
 * Redirect logic:
 *   Has session cookie → /workspace  (app shell, Step 3 will handle sub-redirect)
 *   No session         → /login
 *
 * Next.js redirect() — throws a special error that Next.js catches and
 *   converts into an HTTP 307 redirect. It stops execution immediately,
 *   so nothing below a redirect() call ever runs.
 *
 * How to expand:
 *   Step 3 will replace '/workspace' with the user's actual last-visited
 *   workspace ID, stored in a cookie after each visit.
 */

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

const SESSION_FLAG_COOKIE = 'has_session';

export default async function RootPage() {
  // Read cookies on the server — available in Server Components via next/headers
  const cookieStore = await cookies();
  const hasSession = cookieStore.get(SESSION_FLAG_COOKIE)?.value === 'true';

  if (hasSession) {
    // User is logged in — send to the app shell
    // Step 3 will enhance this to redirect to the last active workspace
    redirect('/workspace');
  }

  // No session — send to login
  redirect('/login');
}
