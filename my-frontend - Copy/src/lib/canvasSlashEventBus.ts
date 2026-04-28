/**
 * lib/canvasSlashEventBus.ts
 *
 * What:    Isolated pub/sub bus for the canvas rich-block editor's slash menu.
 *          Structurally identical to slashEventBus.ts but uses its own
 *          module-level `callbacks` map so canvas slash events never interfere
 *          with the document editor's slash menu.
 *
 * Used by:
 *   CanvasSlashCommand.ts — calls emit()
 *   CanvasRichBlock.tsx   — calls on() / off() in a useEffect
 */

import type { SlashCommandItem } from '@/components/editor/SlashMenu';

// ─────────────────────────────────────────────────────────────────────────────
// Payload types (re-exported so CanvasRichBlock.tsx can type its handlers)
// ─────────────────────────────────────────────────────────────────────────────

export type SlashOpenPayload    = { items: SlashCommandItem[]; rect: DOMRect | null; command: (item: SlashCommandItem) => void; };
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

// Separate module-level registry — completely isolated from slashEventBus.ts
const callbacks: Record<string, AnyFn[]> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Bus
// ─────────────────────────────────────────────────────────────────────────────

export const canvasSlashEventBus = {
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
