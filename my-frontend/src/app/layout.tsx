/**
 * app/layout.tsx — Root Layout
 *
 * What:    The outermost shell rendered around every page in the app.
 *          Sets up providers, font, and metadata. Also mounts AuthInitializer
 *          which restores the user session on page refresh.
 *
 * Next.js concept: RootLayout is like Django's base.html — every page
 *   inherits it. Unlike base.html it wraps the React tree, so providers
 *   placed here are available to every component in the app.
 *
 * Provider order matters (outer → inner):
 *   1. Providers (React Query) — needs to wrap everything that fetches data
 *   2. AuthInitializer        — calls the API, so must be inside React Query
 *
 * How to expand:
 *   - Add a ThemeProvider here if you add theme switching later
 *   - Add a ToastProvider (e.g. react-hot-toast) here for global notifications
 *   - Add analytics/error monitoring initialization here
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import { Providers } from '@/lib/queryClient';
import { AuthInitializer } from '@/components/auth/AuthInitializer';

// ─────────────────────────────────────────────────────────────────────────────
// Font — Inter is clean, professional, works great at all weights
// ─────────────────────────────────────────────────────────────────────────────

/**
 * next/font/google downloads and self-hosts Inter — no Google tracking,
 * no CORS issues, fonts load instantly from your own server.
 * variable: '--font-inter' lets us use it in Tailwind via a CSS variable.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap', // show fallback font while Inter loads (prevents invisible text)
});

// ─────────────────────────────────────────────────────────────────────────────
// Metadata — sets <title> and <meta description> for every page
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: 'Second Brain',
    template: '%s | Second Brain', // individual pages can set their own title
  },
  description: 'Your personal workspace OS — notes, projects, clients, AI.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Root Layout
// ─────────────────────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      {/*
        bg-neutral-950: near-black background for the whole app
        text-neutral-100: light text by default
        antialiased: smoother font rendering
        font-sans: uses the CSS variable we set above (configured in tailwind.config.ts)
      */}
      <body className="bg-neutral-950 text-neutral-100 antialiased font-sans">
        {/*
          Providers wraps the app in React Query context.
          Every useQuery() call anywhere in the app can now access the cache.
        */}
        <Providers>
          {/*
            AuthInitializer is a 'use client' component.
            It runs once on mount, checks for a session, and populates the
            Zustand store. It renders nothing — it's invisible.
            Must be inside Providers so it can call the API via React Query.
          */}
          <AuthInitializer />
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1a1a1a',
                color: '#f5f5f5',
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#8b5cf6', secondary: '#1a1a1a' } },
              error:   { iconTheme: { primary: '#f87171', secondary: '#1a1a1a' } },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
