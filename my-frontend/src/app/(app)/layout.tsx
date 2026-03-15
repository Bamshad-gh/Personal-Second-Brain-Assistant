/**
 * app/(app)/layout.tsx — App Shell Layout
 *
 * What:    The layout for all authenticated routes. Shows the sidebar and
 *          a main content area. Also acts as the auth guard: if the user
 *          isn't authenticated (no session cookie), redirects to /login.
 *
 * Structure:
 *   <html>
 *     <body>
 *       <AppLayout>        ← this file
 *         <Sidebar />      ← fixed left, 260px
 *         <main>           ← remaining width
 *           {page content}
 *         </main>
 *       </AppLayout>
 *
 * Client vs Server:
 *   This is a Server Component — it reads cookies for the auth check
 *   without any client-side JavaScript. The Sidebar inside is a Client
 *   Component (it uses state/effects) but that's fine — layout.tsx just
 *   renders it, it doesn't need to be client itself.
 *
 * How to expand:
 *   - Add a top navigation bar (breadcrumbs, search, share button)
 *   - Add a right panel for the AI assistant (Step 6)
 *   - Add keyboard shortcut to toggle sidebar (⌘B)
 */

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShellClient } from './AppShellClient';

const SESSION_FLAG_COOKIE = 'has_session';

// NOTE: No params here — this layout sits at (app)/ which has no dynamic
// segment of its own. workspaceId and pageId live in nested routes
// ([workspaceId]/ and [workspaceId]/[pageId]/). Next.js App Router does NOT
// pass nested dynamic params up to ancestor layouts, so reading
// params.workspaceId here always returns undefined.
// AppShellClient uses useParams() instead — it reads the full URL client-side.
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Server-side auth check — runs before any JS loads in the browser
  const cookieStore = await cookies();
  const hasSession = cookieStore.get(SESSION_FLAG_COOKIE)?.value === 'true';

  if (!hasSession) {
    redirect('/login');
  }

  return <AppShellClient>{children}</AppShellClient>;
}
