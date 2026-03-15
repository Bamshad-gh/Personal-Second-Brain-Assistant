/**
 * lib/pageLinkEventBus.ts
 *
 * What:    A singleton pub/sub bus that bridges PageLink.ts (TipTap extension)
 *          with Editor.tsx (React component) for the [[ page-link feature.
 *
 * Why not editor.emit/on:
 *   Same reason as slashEventBus — TipTap v3's EventEmitter only accepts
 *   events declared in EditorEvents. A standalone bus is simpler and stable.
 *
 * How it works:
 *   1. User types "[[" in the editor
 *   2. PageLink.ts suggestion fires pagelink:open with query + rect + range
 *   3. Editor.tsx listens and shows <PageLinkPopup>
 *   4. Arrow/Enter keys in the editor fire pagelink:keydown
 *   5. Editor.tsx forwards those to the popup via a ref
 *   6. On selection or Escape, pagelink:close fires and the popup unmounts
 *
 * Used by:
 *   PageLink.ts  — calls emit() (suggestion plugin callbacks)
 *   Editor.tsx   — calls on() / off() in a useEffect
 */

// ─────────────────────────────────────────────────────────────────────────────
// Payload types (exported so Editor.tsx can type its handlers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fired on both suggestion start and every keystroke update.
 * Editor.tsx stores range in a ref so handlePageLinkSelect() can
 * delete the "[[query" text before inserting the node.
 */
export type PageLinkOpenPayload = {
  query: string;                    // text typed after "[[" — used to filter the page list
  rect:  DOMRect | null;            // cursor bounding rect — used to position the popup
  range: { from: number; to: number }; // ProseMirror range covering "[[query" — deleted on insert
};

/** Forwarded keyboard events so the popup can handle ArrowUp/Down/Enter */
export type PageLinkKeydownPayload = {
  event: KeyboardEvent;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal event map
// ─────────────────────────────────────────────────────────────────────────────

type PageLinkEventMap = {
  'pagelink:open':    PageLinkOpenPayload;
  'pagelink:keydown': PageLinkKeydownPayload;
  'pagelink:close':   undefined;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (data: any) => void;

// Module-level registry — one instance per page load, shared by all consumers
const callbacks: Record<string, AnyFn[]> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Bus
// ─────────────────────────────────────────────────────────────────────────────

export const pageLinkEventBus = {
  on<E extends keyof PageLinkEventMap>(event: E, fn: (data: PageLinkEventMap[E]) => void) {
    (callbacks[event] ??= []).push(fn as AnyFn);
  },

  off<E extends keyof PageLinkEventMap>(event: E, fn: (data: PageLinkEventMap[E]) => void) {
    callbacks[event] = callbacks[event]?.filter((f) => f !== fn);
  },

  emit<E extends keyof PageLinkEventMap>(event: E, data?: PageLinkEventMap[E]) {
    callbacks[event]?.forEach((fn) => fn(data));
  },
};
