/**
 * components/ui/Input.tsx
 *
 * What:    Reusable form input that includes a label, the input field,
 *          and an error message — all in one component. Designed to work
 *          seamlessly with React Hook Form.
 *
 * Props:
 *   label       — text label shown above the input
 *   error       — error message string (shown in red below the input)
 *   id          — links <label htmlFor> to <input id> for accessibility
 *   className   — style overrides for the wrapper div
 *   ...rest     — all standard HTML <input> attributes (type, placeholder, etc.)
 *
 * When to use it: Any form field. Pass the React Hook Form register() result
 *   directly as spread props: <Input {...register('email')} />
 *
 * How to expand:
 *   - Add a 'leftIcon' prop for search inputs with a search icon
 *   - Add a 'rightElement' prop for password show/hide toggle buttons
 *   - Add 'hint' prop for helper text below the input
 *
 * React Hook Form integration:
 *   register('fieldName') returns { name, ref, onChange, onBlur }
 *   Spreading it onto <Input> wires up the form automatically.
 *   Django analogy: like a BoundField — the form field connected to its value.
 */

import { type ComponentPropsWithoutRef, forwardRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface InputProps extends ComponentPropsWithoutRef<'input'> {
  label?: string;
  error?: string;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * forwardRef — React Hook Form needs a ref to the underlying <input> element
 * so it can focus the field on validation errors and read its value.
 * Without forwardRef, the ref would be lost at the wrapper component boundary.
 *
 * Django analogy: Like passing a reference to the actual HTML widget, not the
 * Python form field wrapper.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = '', ...rest },
  ref,
) {
  // Generate a stable id from the label if none is provided
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {/* Label — clicking it focuses the input (htmlFor links them) */}
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-neutral-300"
        >
          {label}
        </label>
      )}

      {/* The actual input */}
      <input
        ref={ref}
        id={inputId}
        className={[
          'h-10 w-full rounded-lg px-3 text-sm',
          'bg-neutral-800 border text-neutral-100',
          'placeholder:text-neutral-500',
          'transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1',
          'focus:ring-offset-neutral-950',
          // Red border when there's a validation error
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-neutral-700 focus:border-transparent',
        ].join(' ')}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        {...rest}
      />

      {/* Validation error message */}
      {error && (
        <p
          id={inputId ? `${inputId}-error` : undefined}
          role="alert"
          className="text-xs text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
});
