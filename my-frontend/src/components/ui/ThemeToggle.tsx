/**
 * components/ui/ThemeToggle.tsx
 *
 * What:  A single button that toggles between dark and light mode.
 *        Uses next-themes under the hood — it adds/removes class="dark"
 *        on <html>, which triggers the CSS overrides in globals.css.
 *
 * Usage: Mount anywhere in the layout. Currently used in Sidebar footer.
 */

'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
    </button>
  );
}
