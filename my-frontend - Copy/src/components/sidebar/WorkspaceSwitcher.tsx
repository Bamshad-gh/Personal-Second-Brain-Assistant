/**
 * components/sidebar/WorkspaceSwitcher.tsx
 *
 * Shows the active workspace at the top of the sidebar.
 * Dropdown uses glassmorphism (defined in globals.css as .glass).
 *
 * Color names from the backend ('purple', 'blue', etc.) are mapped to
 * actual hex values via WORKSPACE_COLOR_MAP for display purposes.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { Workspace } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Color map — backend stores color names, we need hex for display
// ─────────────────────────────────────────────────────────────────────────────

const WORKSPACE_COLOR_MAP: Record<string, string> = {
  white:  '#e5e5e5',
  red:    '#ef4444',
  green:  '#10b981',
  yellow: '#f59e0b',
  blue:   '#3b82f6',
  purple: '#8b5cf6',
};

function getWorkspaceColor(color: string): string {
  return WORKSPACE_COLOR_MAP[color] ?? color; // fallback: use the value as-is (hex)
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WorkspaceSwitcherProps {
  activeWorkspace: Workspace;
  workspaces: Workspace[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WorkspaceSwitcher({ activeWorkspace, workspaces }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSwitch(workspace: Workspace) {
    setActiveWorkspace(workspace);
    setIsOpen(false);
    router.push(`/${workspace.id}`);
  }

  const accentHex = getWorkspaceColor(activeWorkspace.color);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ── Trigger ───────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={[
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-2',
          'transition-colors hover:bg-neutral-800/70 cursor-pointer',
          isOpen ? 'bg-neutral-800/70' : '',
        ].join(' ')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {/* Workspace icon with gradient-tinted background */}
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base shadow-sm"
          style={{ backgroundColor: accentHex, boxShadow: `0 0 10px ${accentHex}55` }}
        >
          <span>{activeWorkspace.icon || '🧠'}</span>
        </div>

        <span className="flex-1 truncate text-left text-sm font-medium text-neutral-100">
          {activeWorkspace.name}
        </span>

        <ChevronDown
          size={14}
          className={`shrink-0 text-neutral-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Dropdown — glassmorphism ───────────────────────────────────────── */}
      {isOpen && (
        <div className="glass animate-fade-in absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl shadow-2xl">
          {/* Workspace list */}
          <div className="p-1.5" role="listbox" aria-label="Switch workspace">
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
              Workspaces
            </p>

            {workspaces.map((ws) => {
              const hex = getWorkspaceColor(ws.color);
              return (
                <button
                  key={ws.id}
                  role="option"
                  aria-selected={ws.id === activeWorkspace.id}
                  onClick={() => handleSwitch(ws)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/5"
                >
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm"
                    style={{ backgroundColor: hex }}
                  >
                    {ws.icon || '🧠'}
                  </div>
                  <span className="flex-1 truncate text-left text-neutral-300">{ws.name}</span>
                  {ws.id === activeWorkspace.id && (
                    <Check size={13} className="shrink-0 text-violet-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="mx-1.5 border-t border-white/5" />

          {/* Create workspace */}
          <div className="p-1.5">
            <button
              onClick={() => { setIsOpen(false); router.push('/workspace/create'); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300"
            >
              <Plus size={14} />
              <span>New workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
