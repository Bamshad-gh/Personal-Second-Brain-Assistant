/**
 * lib/slashEventBus.ts
 *
 * What:    A tiny singleton pub/sub bus that bridges SlashCommand.ts (TipTap
 *          extension) with Editor.tsx (React component).
 *
 * Why not editor.emit/on:
 *   TipTap v3's EventEmitter only accepts events declared in EditorEvents.
 *   TypeScript augmentation satisfies the type checker, but the runtime
 *   behaviour for non-built-in event names is not guaranteed across TipTap
 *   versions. A standalone bus is simpler and guaranteed to work.
 *
 * Used by:
 *   SlashCommand.ts — calls emit()
 *   Editor.tsx      — calls on() / off() in a useEffect
 */

import type { SlashCommandItem } from '@/components/editor/SlashMenu';

// ─────────────────────────────────────────────────────────────────────────────
// Payload types (exported so Editor.tsx can type its handlers)
// ─────────────────────────────────────────────────────────────────────────────

export type SlashOpenPayload = {
  items:   SlashCommandItem[];
  rect:    DOMRect | null;
  command: (item: SlashCommandItem) => void;
};
export type SlashUpdatePayload  = SlashOpenPayload;
export type SlashKeydownPayload = { event: KeyboardEvent };

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type SlashEventMap = {
  'slash:open':    SlashOpenPayload;
  'slash:update':  SlashUpdatePayload;
  'slash:keydown': SlashKeydownPayload;
  'slash:close':   undefined;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (data: any) => void;

// Module-level registry — one per page load, shared by all consumers
const callbacks: Record<string, AnyFn[]> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Bus
// ─────────────────────────────────────────────────────────────────────────────

export const slashEventBus = {
  on<E extends keyof SlashEventMap>(event: E, fn: (data: SlashEventMap[E]) => void) {
    (callbacks[event] ??= []).push(fn as AnyFn);
  },

  off<E extends keyof SlashEventMap>(event: E, fn: (data: SlashEventMap[E]) => void) {
    callbacks[event] = callbacks[event]?.filter((f) => f !== fn);
  },

  emit<E extends keyof SlashEventMap>(event: E, data?: SlashEventMap[E]) {
    callbacks[event]?.forEach((fn) => fn(data));
  },
};
