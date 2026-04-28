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
        {/* Logo image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="SpatialScribe" style={{ height: '48px', width: 'auto' }} />
        <span className="text-lg font-semibold text-neutral-100 tracking-tight">
          SpatialScribe
        </span>
        <span className="text-xs text-neutral-500">Your spatial workspace for ideas</span>
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
        &copy; {new Date().getFullYear()} SpatialScribe
      </p>
    </div>
  );
}
