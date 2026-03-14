/**
 * app/(app)/workspace/create/page.tsx — Create Workspace
 *
 * Redesigned with:
 *   - Emoji grid picker (24 presets + clear button)
 *   - Color swatches using actual hex values for display
 *   - Gradient card border, gradient "Create" button
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Sparkles, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCreateWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { CreateWorkspacePayload } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Backend accepts these exact string values for the color field
const PRESET_COLORS = [
  { label: 'White',  value: 'white',  hex: '#e5e5e5' },
  { label: 'Red',    value: 'red',    hex: '#ef4444' },
  { label: 'Green',  value: 'green',  hex: '#10b981' },
  { label: 'Yellow', value: 'yellow', hex: '#f59e0b' },
  { label: 'Blue',   value: 'blue',   hex: '#3b82f6' },
  { label: 'Purple', value: 'purple', hex: '#8b5cf6' },
];

// Quick-pick emoji grid for the workspace icon
const EMOJI_PRESETS = [
  '🧠', '💼', '🚀', '🎯', '📊', '💡',
  '🔒', '🌟', '📝', '🎨', '⚡', '🔥',
  '🌿', '💎', '🏗️', '🎭', '📚', '🛠️',
  '🧩', '🎵', '🌐', '🤖', '🦋', '🏆',
];

// ─────────────────────────────────────────────────────────────────────────────
// Form shape
// ─────────────────────────────────────────────────────────────────────────────

interface CreateWorkspaceFormValues {
  name: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateWorkspacePage() {
  const router = useRouter();
  const createWorkspace = useCreateWorkspace();

  // Icon and color are controlled outside react-hook-form (they're not text inputs)
  const [selectedIcon, setSelectedIcon]   = useState('🧠');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[5]); // purple
  const [globalError, setGlobalError]     = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceFormValues>({
    defaultValues: { name: '', description: '' },
  });

  const watchedName = watch('name');

  async function onSubmit(values: CreateWorkspaceFormValues) {
    setGlobalError(null);
    try {
      const payload: CreateWorkspacePayload = {
        name:        values.name.trim(),
        icon:        selectedIcon,
        color:       selectedColor.value,   // backend expects 'purple', not hex
        description: values.description.trim(),
      };
      const workspace = await createWorkspace.mutateAsync(payload);
      toast.success('Workspace created!');
      router.push(`/${workspace.id}`);
    } catch {
      const msg = 'Failed to create workspace. Please try again.';
      setGlobalError(msg);
      toast.error(msg);
    }
  }

  return (
    <div className="bg-dot-grid flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-12">
      {/* Radial violet top glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.07) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md animate-fade-in">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                boxShadow: '0 0 32px rgba(139,92,246,0.35)',
              }}
            >
              <Sparkles className="text-white" size={26} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-neutral-100">
            Create your workspace
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            A workspace is your private space for notes, projects, and ideas.
          </p>
        </div>

        {/* ── Gradient-bordered card ──────────────────────────────────────── */}
        <div className="gradient-border">
          <div className="gradient-border-inner p-6">

            {/* Live preview */}
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-800/40 px-4 py-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl shadow-sm transition-all duration-200"
                style={{ backgroundColor: selectedColor.hex, boxShadow: `0 0 14px ${selectedColor.hex}55` }}
              >
                {selectedIcon}
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-200 leading-tight">
                  {watchedName || 'My Workspace'}
                </p>
                <p className="text-xs text-neutral-600 mt-0.5">Preview</p>
              </div>
            </div>

            {/* Error */}
            {globalError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {globalError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

              {/* Name */}
              <Input
                label="Workspace name"
                placeholder="My Brain"
                autoFocus
                error={errors.name?.message}
                {...register('name', {
                  required: 'Workspace name is required',
                  maxLength: { value: 50, message: 'Name is too long' },
                })}
              />

              {/* ── Emoji icon picker ─────────────────────────────────────── */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-300">Icon</label>
                <div className="grid grid-cols-8 gap-1 rounded-xl border border-neutral-800 bg-neutral-800/40 p-2">
                  {EMOJI_PRESETS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSelectedIcon(emoji)}
                      title={emoji}
                      className={[
                        'flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all duration-100',
                        selectedIcon === emoji
                          ? 'bg-violet-600/30 ring-1 ring-violet-500/60 scale-110'
                          : 'hover:bg-neutral-700/60',
                      ].join(' ')}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Color picker ──────────────────────────────────────────── */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-neutral-300">Accent color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      title={color.label}
                      className="relative flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110"
                      style={{ backgroundColor: color.hex }}
                    >
                      {selectedColor.value === color.value && (
                        <Check size={12} className="text-white drop-shadow" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description (optional) */}
              <Input
                label="Description (optional)"
                placeholder="What is this workspace for?"
                error={errors.description?.message}
                {...register('description')}
              />

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || createWorkspace.isPending}
                className={[
                  'mt-1 w-full rounded-lg py-2.5 text-sm font-semibold text-white',
                  'transition-all duration-200 hover:opacity-90 hover:shadow-lg',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                ].join(' ')}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                  boxShadow: '0 0 20px rgba(139,92,246,0.25)',
                }}
              >
                {isSubmitting || createWorkspace.isPending ? 'Creating…' : 'Create workspace'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
