/**
 * components/ui/Button.tsx
 *
 * What:    Reusable button component with variants, loading state, and
 *          full accessibility support. Used everywhere in the app.
 *
 * Props:
 *   variant    — 'primary' (violet fill) | 'secondary' (ghost outline) | 'danger' (red)
 *   size       — 'sm' | 'md' | 'lg'
 *   isLoading  — shows a spinner, disables the button, prevents double-submits
 *   className  — allows one-off style overrides without creating new variants
 *   ...rest    — all standard <button> HTML attributes (type, onClick, disabled, etc.)
 *
 * When to use it: Any clickable action. Replace <button> with <Button>.
 *
 * How to expand:
 *   - Add a new variant string + its classes in the variants object
 *   - Add an 'icon' prop for buttons with a leading icon
 *   - Add a 'fullWidth' boolean prop (currently use className="w-full")
 *
 * React concept — ComponentPropsWithoutRef:
 *   This extends the component's props with all standard HTML button attributes.
 *   It means <Button onClick={...} type="submit" disabled={...}> all work without
 *   you having to manually declare each prop. It's like **kwargs in Python.
 */

import { type ComponentPropsWithoutRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style maps — one place to change all button styles
// ─────────────────────────────────────────────────────────────────────────────

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-violet-600 text-white hover:bg-violet-500 focus-visible:ring-violet-500 ' +
    'disabled:bg-violet-800 disabled:text-violet-400',
  secondary:
    'bg-transparent text-neutral-300 border border-neutral-700 hover:bg-neutral-800 ' +
    'hover:border-neutral-600 focus-visible:ring-neutral-500 disabled:opacity-40',
  danger:
    'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 ' +
    'disabled:bg-red-900 disabled:text-red-400',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-10 px-4 text-sm rounded-lg',
  lg: 'h-12 px-6 text-base rounded-lg',
};

// ─────────────────────────────────────────────────────────────────────────────
// Spinner — shown when isLoading is true
// ─────────────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Button component
// ─────────────────────────────────────────────────────────────────────────────

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={[
        // Base styles — always applied
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-colors duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-neutral-950',
        'disabled:cursor-not-allowed',
        // Variant and size
        variantClasses[variant],
        sizeClasses[size],
        // Caller's overrides
        className,
      ].join(' ')}
      {...rest}
    >
      {isLoading && <Spinner />}
      {children}
    </button>
  );
}
