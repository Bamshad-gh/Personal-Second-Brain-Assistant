/**
 * app/layout.tsx — Root Layout
 *
 * What:    The outermost shell rendered around every page in the app.
 *          Sets up providers, font, and metadata. Also mounts AuthInitializer
 *          which restores the user session on page refresh.
 *
 * Provider order matters (outer → inner):
 *   1. ThemeProvider  — must wrap everything so CSS class is on <html>
 *   2. Providers (React Query) — needs to wrap everything that fetches data
 *   3. AuthInitializer — calls the API, so must be inside React Query
 *
 * WHERE TO FIND THINGS
 *   Theme toggle button:  src/components/ui/ThemeToggle.tsx
 *   Theme CSS variables:  src/app/globals.css → :root / .dark blocks
 *   ThemeProvider config: next-themes — attribute="class", defaultTheme="dark"
 */


import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import { Providers } from '@/lib/queryClient';
import { AuthInitializer } from '@/components/auth/AuthInitializer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Second Brain',
    template: '%s | Second Brain',
  },
  description: 'Your personal workspace OS — notes, projects, clients, AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes adds a class on the client before
    // React hydrates — this prevents a harmless "class mismatch" warning.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-neutral-950 text-neutral-100 antialiased font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="sb-theme"
        >
          <Providers>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
