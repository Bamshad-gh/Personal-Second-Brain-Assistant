/**
 * app/(auth)/login/page.tsx — Login Page
 *
 * What:    The login form. Collects email + password, calls the backend,
 *          stores the returned user in Zustand, then redirects.
 *
 * 'use client' — Why:
 *   This page uses useState (for error display), useRouter (for redirect),
 *   and React Hook Form (for form state). All of these are browser APIs.
 *   Next.js Server Components can't use browser APIs — 'use client' opts
 *   this file into client-side rendering.
 *
 *   Django analogy: Server Components = Django template (rendered on server).
 *   Client Components = JavaScript that runs in the browser after the page loads.
 *
 * How to expand:
 *   - Add "Remember me" checkbox
 *   - Add Google/GitHub OAuth buttons (OAuth2 URLs from backend)
 *   - Add rate limiting feedback (e.g. "Too many attempts, try in 5 min")
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ApiError, LoginPayload } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Form shape — what React Hook Form tracks
// ─────────────────────────────────────────────────────────────────────────────

type LoginFormValues = LoginPayload; // { email: string; password: string }

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Where to go after login — from middleware's ?from= param, or default to /workspace
  const redirectTo = searchParams.get('from') ?? '/workspace';

  // Pull the setUser action from Zustand to populate global state after login
  const setUser = useAppStore((state) => state.setUser);

  // Global error (non-field errors like "Invalid credentials")
  const [globalError, setGlobalError] = useState<string | null>(null);

  /**
   * React Hook Form — useForm()
   *
   * register('fieldName') — connects an input to the form
   * handleSubmit(fn)      — runs validation, then calls fn with the values
   * formState.errors      — field-level validation errors
   * formState.isSubmitting — true while the async submit is running
   *
   * Django analogy: Like a Django Form class — defines fields, validates them,
   * and gives you cleaned_data on success.
   */
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>();

  // ── Submit handler ─────────────────────────────────────────────────────────

  /**
   * onSubmit — called by handleSubmit() after client-side validation passes.
   * Calls the backend, stores the user, redirects.
   */
  async function onSubmit(values: LoginFormValues): Promise<void> {
    setGlobalError(null); // clear previous errors

    try {
      const { user, tokens } = await authApi.login(values);

      // Store user + access token in Zustand (and in-memory via setAccessToken)
      setUser(user, tokens.access);

      // Navigate to the page the user was trying to access (or home)
      router.push(redirectTo);
      router.refresh(); // tells Next.js to re-run server components with new session
    } catch (err) {
      const apiError = err as ApiError;

      // Handle field-level errors from DRF (e.g. { email: ['Enter a valid email'] })
      if (apiError.fields) {
        Object.entries(apiError.fields).forEach(([field, messages]) => {
          setError(field as keyof LoginFormValues, { message: messages[0] });
        });
        return;
      }

      // Handle generic errors (e.g. "No active account found with the given credentials")
      setGlobalError(apiError.message ?? 'Login failed. Please try again.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Welcome back</h1>
        <p className="mt-1 text-sm text-neutral-400">Sign in to your account</p>
      </div>

      {/* Global error banner — shown for non-field errors */}
      {globalError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {globalError}
        </div>
      )}

      {/* Login form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Enter a valid email address',
            },
          })}
        />

        <div className="flex flex-col gap-1.5">
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Password must be at least 8 characters' },
            })}
          />
          {/* Forgot password link — placeholder for future feature */}
          <div className="flex justify-end">
            <span className="text-xs text-neutral-500 cursor-not-allowed select-none">
              Forgot password?
            </span>
          </div>
        </div>

        <Button
          type="submit"
          isLoading={isSubmitting}
          className="mt-2 w-full"
        >
          Sign in
        </Button>
      </form>

      {/* Register link */}
      <p className="mt-6 text-center text-sm text-neutral-500">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
