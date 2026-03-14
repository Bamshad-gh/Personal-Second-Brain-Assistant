/**
 * app/(auth)/layout.tsx — Auth Layout
 *
 * Wraps /login and /register with a full-page centered frame.
 * Design: dot-grid background, gradient-bordered card, glowing brand mark.
 */

import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    /* Dot-grid dark background — defined in globals.css */
    <div className="bg-dot-grid min-h-screen flex flex-col items-center justify-center bg-neutral-950 px-4">

      {/* Radial vignette so edges are darker than center */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.08) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* ── Brand mark ──────────────────────────────────────────────────── */}
      <div className="relative mb-8 flex flex-col items-center gap-2">
        {/* Glowing logo */}
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white text-lg font-bold"
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            boxShadow: '0 0 24px rgba(139,92,246,0.4)',
          }}
        >
          S
        </div>
        <span className="text-lg font-semibold text-neutral-100 tracking-tight">
          Second Brain
        </span>
        <span className="text-xs text-neutral-500">Your personal workspace OS</span>
      </div>

      {/* ── Auth card — glowing gradient border ─────────────────────────── */}
      <div className="relative w-full max-w-md">
        {/* Outer glow ring */}
        <div
          className="absolute -inset-px rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.5) 0%, rgba(168,85,247,0.3) 50%, rgba(30,27,75,0.1) 100%)',
          }}
          aria-hidden="true"
        />
        {/* Card surface */}
        <div className="relative rounded-2xl bg-neutral-900/95 p-8 shadow-2xl backdrop-blur-sm">
          {children}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <p className="relative mt-8 text-xs text-neutral-700">
        &copy; {new Date().getFullYear()} Second Brain
      </p>
    </div>
  );
}
