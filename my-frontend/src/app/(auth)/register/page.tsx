/**
 * app/(auth)/register/page.tsx — Register Page
 *
 * What:    New user registration form. Collects full_name, email, password,
 *          and confirm password (password2 — required by the Django backend).
 *          On success, auto-logs the user in and redirects to workspace creation.
 *
 * How to expand:
 *   - Add terms of service checkbox
 *   - Add invite code field if you want invite-only signup
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ApiError, RegisterPayload } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Form shape — matches RegisterPayload which includes password2
// ─────────────────────────────────────────────────────────────────────────────

type RegisterFormValues = RegisterPayload; // { email, password, password2, full_name }

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAppStore((state) => state.setUser);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,       // watch('password') so we can compare with password2
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>();

  // Watch the password field so the confirm-password validator can compare
  const passwordValue = watch('password');

  // ── Submit handler ────────────────────────────────────────────────────────

  async function onSubmit(values: RegisterFormValues): Promise<void> {
    setGlobalError(null);

    try {
      const { user, tokens } = await authApi.register(values);

      // Auto-login: store user + token + set has_session cookie
      setUser(user, tokens.access);

      // After registration, send user to create their first workspace
      router.push('/workspace/create');
      router.refresh();
    } catch (err) {
      const apiError = err as ApiError;

      if (apiError.fields) {
        Object.entries(apiError.fields).forEach(([field, messages]) => {
          setError(field as keyof RegisterFormValues, { message: messages[0] });
        });
        return;
      }

      setGlobalError(apiError.message ?? 'Registration failed. Please try again.');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Start building your second brain today
        </p>
      </div>

      {/* Global error banner */}
      {globalError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {globalError}
        </div>
      )}

      {/* Register form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">

        <Input
          label="Full name"
          type="text"
          placeholder="Your Name"
          autoComplete="name"
          autoFocus
          error={errors.full_name?.message}
          {...register('full_name', {
            required: 'Full name is required',
            minLength: { value: 2, message: 'Name must be at least 2 characters' },
          })}
        />

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Enter a valid email address',
            },
          })}
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password', {
            required: 'Password is required',
            minLength: { value: 8, message: 'Must be at least 8 characters' },
            pattern: {
              value: /^(?=.*[A-Za-z])(?=.*[0-9])/,
              message: 'Must contain at least one letter and one number',
            },
          })}
        />

        {/* Confirm password — backend requires password2 to match password */}
        <Input
          label="Confirm password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          error={errors.password2?.message}
          {...register('password2', {
            required: 'Please confirm your password',
            validate: (value) =>
              value === passwordValue || 'Passwords do not match',
          })}
        />

        <Button
          type="submit"
          isLoading={isSubmitting}
          className="mt-2 w-full"
        >
          Create account
        </Button>
      </form>

      {/* Login link */}
      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
