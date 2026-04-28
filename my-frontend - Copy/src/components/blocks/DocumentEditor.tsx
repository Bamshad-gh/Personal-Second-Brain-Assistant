/**
 * components/blocks/DocumentEditor.tsx
 *
 * What:    New document editor — renders one BlockRenderer per block instead
 *          of a single monolithic TipTap instance.
 *
 * Block lists:
 *   allBlocks    — all doc_visible non-deleted blocks sorted by order.
 *                  ColumnContainerBlock reads this to find its column children.
 *   sortedBlocks — allBlocks filtered to parent === null (top-level only).
 *                  Rendered in the main document flow.
 *   allBlocksRef — stable ref kept in sync with allBlocks so drag handlers
 *                  and callbacks (handleEnter, handleDelete) can reference
 *                  the current block list without stale closures.
 *
 * Column-aware Enter / Delete:
 *   handleEnter and handleDelete use allBlocksRef to find the block's parent.
 *   If the block is inside a column, siblings are computed from within that
 *   column so order and focus land on the right block.
 *
 * Cross-context drag (Phase 4 extension):
 *   When a dragged block is dropped on a block in a different parent context
 *   (e.g. column-child → top-level, or column A → column B), the handler
 *   calls onUpdateBlock(sourceId, { parent: targetParent, order }) instead of
 *   onReorderBlock, updating both parent and order atomically.
 *   BlockUpdateSerializer on the backend already accepts both fields.
 *
 * Ghost drag visual:
 *   A fixed-position div (ghostRef) follows the pointer during drag.
 *   Position is updated via direct DOM style mutation (no React state) to
 *   avoid re-rendering on every pointermove. Initial transform pushes it
 *   off-screen until the first pointermove fires.
 *
 * Column-drop mode:
 *   If pointer is in the rightmost COLUMN_EDGE_FRACTION of a target block
 *   during drag, release creates a column_container via POST /make-columns/.
 *   A violet right-edge indicator shows during hover.
 *
 * Insertion indicator (edge-proximity pattern):
 *   Insertion line appears only within EDGE_THRESHOLD px of block top/bottom
 *   edge. The middle content area is never intercepted.
 *
 * Block context menu:
 *   Clicking the ⠿ drag handle (not dragging) opens a fixed-position context
 *   menu via createPortal. Position is recomputed from the anchor element on
 *   every scroll (capture-phase listener) so it follows the page correctly
 *   and works inside column contexts. The menu has three sections:
 *     1. "Turn into" — block type switcher (paragraph, headings, lists, etc.)
 *     2. Background color — 8 swatches + clear
 *     3. Delete — red, calls onDeleteBlock
 *   The menu closes on any item click or outside mousedown.
 *   maxHeight + overflowY:auto prevents the menu from being cut off on short
 *   viewports.
 *
 * bg_color:
 *   block.bg_color is applied as an inline backgroundColor on the block row
 *   wrapper div. The context menu's color swatches write to this field via
 *   onUpdateBlock(blockId, { bg_color: color }).
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal }                             from 'react-dom';
import { BlockRenderer }                            from './BlockRenderer';
import { BlockAiActions }                           from './BlockAiActions';
import { useMakeColumns, useAddToColumn, useCollapseColumn } from '@/hooks/useDocumentBlocks';
import { slashEventBus }                            from '@/lib/slashEventBus';
import { SlashMenuPortal }                          from '@/components/editor/SlashMenuPortal';
import { SlashMenuList }                            from '@/components/editor/SlashMenu';
import type { SlashMenuHandle, SlashCommandItem }   from '@/components/editor/SlashMenu';
import type { Block, BlockType, BlockContent, UpdateBlockPayload } from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LIST_TYPES: BlockType[] = ['bullet_item', 'numbered_item', 'todo_item'];
const EDGE_THRESHOLD          = 12;   // px from top/bottom edge to activate insertion line

/** Convert a plain-text string (with \n line breaks) into TipTap JSON with HardBreak nodes.
 *  Used when AI actions return multi-line text that needs to render as actual line breaks. */
function textToTipTapJSON(text: string): Record<string, unknown> {
  const segments = text.split('\n');
  const content: Record<string, unknown>[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]) content.push({ type: 'text', text: segments[i] });
    if (i < segments.length - 1) content.push({ type: 'hardBreak' });
  }
  return {
    type:    'doc',
    content: [{ type: 'paragraph', content: content.length > 0 ? content : [] }],
  };
}

/** Block type options shown in the context menu "Turn into" section */
const TYPE_GROUPS: { label: string; types: { type: BlockType; label: string }[] }[] = [
  {
    label: 'Text',
    types: [
      { type: 'paragraph',     label: 'Text'       },
      { type: 'heading1',      label: 'Heading 1'  },
      { type: 'heading2',      label: 'Heading 2'  },
      { type: 'heading3',      label: 'Heading 3'  },
      { type: 'quote',         label: 'Quote'      },
      { type: 'callout',       label: 'Callout'    },
    ],
  },
  {
    label: 'List',
    types: [
      { type: 'bullet_item',   label: 'Bullet'     },
      { type: 'numbered_item', label: 'Numbered'   },
      { type: 'todo_item',     label: 'To-do'      },
    ],
  },
  {
    label: 'Other',
    types: [
      { type: 'code',          label: 'Code'       },
      { type: 'divider',       label: 'Divider'    },
    ],
  },
];

/** Background color swatches for the context menu — empty string = clear */
const BG_COLORS: { color: string; label: string }[] = [
  { color: '',        label: 'None'   },
  { color: '#f87171', label: 'Red'    },
  { color: '#fb923c', label: 'Orange' },
  { color: '#facc15', label: 'Yellow' },
  { color: '#4ade80', label: 'Green'  },
  { color: '#60a5fa', label: 'Blue'   },
  { color: '#a78bfa', label: 'Violet' },
  { color: '#f0abfc', label: 'Pink'   },
];

/** Text color swatches for the context menu — empty string = default (inherit) */
const TEXT_COLORS: { color: string; label: string }[] = [
  { color: '',        label: 'Default' },
  { color: '#f87171', label: 'Red'     },
  { color: '#fb923c', label: 'Orange'  },
  { color: '#facc15', label: 'Yellow'  },
  { color: '#4ade80', label: 'Green'   },
  { color: '#60a5fa', label: 'Blue'    },
  { color: '#a78bfa', label: 'Violet'  },
  { color: '#f0abfc', label: 'Pink'    },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Compute fixed-position coordinates for the context menu from its anchor element. */
function getMenuPosition(anchor: HTMLElement): { top: number; left: number } {
  const rect = anchor.getBoundingClientRect();
  return { top: rect.top, left: rect.right + 8 };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DocumentEditorProps {
  blocks:                Block[];
  pageId:                string;
  readOnly?:             boolean;
  onCreateBlock:         (afterBlockId: string | null, blockType: BlockType, nextBlock?: Block | null, parentId?: string) => void;
  onUpdateBlock:         (blockId: string, payload: UpdateBlockPayload) => void;
  onDeleteBlock:         (blockId: string) => void;
  onReorderBlock:        (blockId: string, newOrder: number) => void;
  pendingFocusBlockId?:  string | null;
  onFocusHandled?:       () => void;
  /** Optional — when provided, shows a per-block canvas share toggle in the gutter. */
  onToggleCanvasShare?:  (blockId: string) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function DocumentEditor({
  blocks,
  pageId,
  readOnly = false,
  onCreateBlock,
  onUpdateBlock,
  onDeleteBlock,
  onReorderBlock,
  pendingFocusBlockId,
  onFocusHandled,
  onToggleCanvasShare,
}: DocumentEditorProps) {

  // ── Column layout mutations ───────────────────────────────────────────────
  const makeColumns    = useMakeColumns(pageId);
  const addToColumn    = useAddToColumn(pageId);
  const collapseColumn = useCollapseColumn(pageId);

  // ── Focus / selection state ───────────────────────────────────────────────
  const [focusedId,  setFocusedId]  = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusEndId, setFocusEndId] = useState<string | null>(null);

  const focusEndIdRef = useRef<string | null>(null);
  useEffect(() => { focusEndIdRef.current = focusEndId; }, [focusEndId]);

  // ── Insertion indicator state ─────────────────────────────────────────────
  const [insertHoverId, setInsertHoverId] = useState<string | null>(null);
  const [insertHalf,    setInsertHalf]    = useState<'top' | 'bottom'>('bottom');

  // ── Slash menu state ──────────────────────────────────────────────────────
  const [slashOpen,    setSlashOpen]    = useState(false);
  const [slashItems,   setSlashItems]   = useState<SlashCommandItem[]>([]);
  const [slashRect,    setSlashRect]    = useState<DOMRect | null>(null);
  const [slashCommand, setSlashCommand] = useState<((item: SlashCommandItem) => void) | null>(null);
  const slashMenuRef = useRef<SlashMenuHandle>(null);

  const focusedIdRef = useRef<string | null>(null);
  useEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);

  // Immediate (non-debounced) text cache — used by handleSlashSelect
  // to write clean post-'/' content in the optimistic update.
  const currentTextRef = useRef<Map<string, string>>(new Map());

  // ── Block context menu ────────────────────────────────────────────────────
  // Store the anchor element (drag handle) instead of static coordinates.
  // Position is recomputed on every render and on scroll so the menu follows
  // the page correctly even when the user scrolls after opening.
  const [contextMenuAnchor,  setContextMenuAnchor]  = useState<HTMLElement | null>(null);
  const [contextMenuBlockId, setContextMenuBlockId] = useState<string | null>(null);
  const [menuPos,            setMenuPos]            = useState({ top: 0, left: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ── AI quick-actions popover ──────────────────────────────────────────────
  const [aiActionBlockId, setAiActionBlockId] = useState<string | null>(null);
  const [aiActionAnchor,  setAiActionAnchor]  = useState<HTMLElement | null>(null);

  function closeContextMenu() {
    setContextMenuAnchor(null);
    setContextMenuBlockId(null);
  }

  const handleOpenContextMenu = useCallback((blockId: string, anchor: HTMLElement) => {
    setContextMenuAnchor(anchor);
    setContextMenuBlockId(blockId);
  }, []);

  // ── Pointer drag state ────────────────────────────────────────────────────
  const [dragOverId,  setDragOverId]  = useState<string | null>(null);
  const [dragPos,     setDragPos]     = useState<'top' | 'bottom'>('bottom');
  const [dropMode,    setDropMode]    = useState<'reorder' | 'column' | 'add-to-column'>('reorder');
  const [isDragging,  setIsDragging]  = useState(false);

  const dragSourceIdRef    = useRef<string | null>(null);
  const dragOverIdRef      = useRef<string | null>(null);
  const dragPosRef         = useRef<'top' | 'bottom'>('bottom');
  const dropModeRef        = useRef<'reorder' | 'column' | 'add-to-column'>('reorder');
  const isDraggingRef      = useRef(false);
  const deletingIdsRef     = useRef<Set<string>>(new Set());
  const collapsingColsRef  = useRef<Set<string>>(new Set());

  // ── Block lists ───────────────────────────────────────────────────────────
  const allBlocks = [...blocks]
    .filter((b) => b.doc_visible && !b.is_deleted)
    .sort((a, b) => a.order - b.order);

  const sortedBlocks = allBlocks.filter((b) => b.parent === null);

  // Stable refs — drag + callback closures read these instead of capturing
  // stale array values.
  const allBlocksRef    = useRef<Block[]>([]);
  const sortedBlocksRef = useRef<Block[]>([]);
  allBlocksRef.current    = allBlocks;
  sortedBlocksRef.current = sortedBlocks;

  // ── Ghost drag ────────────────────────────────────────────────────────────
  // Position is set via direct DOM style mutation in pointermove for performance
  // (no React state re-render per pixel).
  const ghostRef      = useRef<HTMLDivElement>(null);
  const ghostLabelRef = useRef<string>('');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FOCUS NEW BLOCK AFTER ENTER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    if (!pendingFocusBlockId) return;
    // Use allBlocks so column-internal blocks (parent !== null) are also found.
    const newBlock = allBlocks.find((b) => b.id === pendingFocusBlockId);
    if (newBlock) {
      setFocusedId(newBlock.id);
      setSelectedId(newBlock.id);
      onFocusHandled?.();
    }
  }, [allBlocks, pendingFocusBlockId, onFocusHandled]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLASH MENU — event bus wiring
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    const onOpen = (data: { items: SlashCommandItem[]; rect: DOMRect | null; command: (item: SlashCommandItem) => void }) => {
      setSlashItems(data.items);
      setSlashRect(data.rect);
      setSlashCommand(() => data.command);
      setSlashOpen(true);
    };
    const onUpdate = (data: { items: SlashCommandItem[]; rect: DOMRect | null; command: (item: SlashCommandItem) => void }) => {
      setSlashItems(data.items);
      setSlashRect(data.rect);
      setSlashCommand(() => data.command);
    };
    const onKeydown = (data: { event: KeyboardEvent }) => {
      slashMenuRef.current?.onKeyDown(data.event);
    };
    const onClose = () => setSlashOpen(false);

    slashEventBus.on('slash:open',    onOpen);
    slashEventBus.on('slash:update',  onUpdate);
    slashEventBus.on('slash:keydown', onKeydown);
    slashEventBus.on('slash:close',   onClose);
    return () => {
      slashEventBus.off('slash:open',    onOpen);
      slashEventBus.off('slash:update',  onUpdate);
      slashEventBus.off('slash:keydown', onKeydown);
      slashEventBus.off('slash:close',   onClose);
    };
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CONTEXT MENU — position tracking + close on outside click
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Recompute position whenever the anchor changes or the page is scrolled.
  // Using capture phase so we catch scroll events from any scrollable ancestor
  // (document editor container, column scrollers, etc.).
  useEffect(() => {
    if (!contextMenuAnchor) return;

    function updatePos() {
      if (contextMenuAnchor) {
        setMenuPos(getMenuPosition(contextMenuAnchor));
      }
    }

    updatePos(); // set initial position immediately
    window.addEventListener('scroll', updatePos, true);
    return () => window.removeEventListener('scroll', updatePos, true);
  }, [contextMenuAnchor]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuAnchor) return;
    function handleOutside(e: MouseEvent) {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      if (contextMenuAnchor?.contains(e.target as Node)) return;
      closeContextMenu();
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [contextMenuAnchor]);

  // Close slash menu when user clicks outside any editor and outside the menu
  useEffect(() => {
    if (!slashOpen) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Element | null;
      if (t?.closest('.slash-menu')) return;   // clicked inside menu
      if (t?.closest('.ProseMirror')) return;  // clicked inside an editor
      setSlashOpen(false);
    }
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, [slashOpen]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SLASH COMMAND SELECTION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleSlashSelect = useCallback((item: SlashCommandItem, tiptapCommand: ((item: SlashCommandItem) => void) | null) => {
    tiptapCommand?.(item);
    setSlashOpen(false);

    if (!item.blockType) return;

    const currentId    = focusedIdRef.current;
    const focusedBlock = currentId ? allBlocksRef.current.find(b => b.id === currentId) : null;
    const parentId     = focusedBlock?.parent ?? undefined;

    if (item.blockType === 'divider') {
      onCreateBlock(currentId, 'divider' as BlockType, null, parentId);
    } else if (currentId) {
      const cleanText = currentTextRef.current.get(currentId) ?? '';
      onUpdateBlock(currentId, {
        block_type: item.blockType as BlockType,
        content:    { text: cleanText, marks: [] },
      });
    }
  }, [onCreateBlock, onUpdateBlock]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOCK HANDLERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Column-aware Enter: uses allBlocksRef so blocks inside columns can
   * insert a new sibling in the same column context (same parentId).
   */
  const handleEnter = useCallback((blockId: string) => {
    const ab           = allBlocksRef.current;
    const currentBlock = ab.find(b => b.id === blockId) ?? null;
    if (!currentBlock) return;

    const parentId = currentBlock.parent ?? undefined;

    // Siblings in the same context (same parent, or top-level if no parent)
    const siblings = parentId !== undefined
      ? ab.filter(b => b.parent === parentId && b.doc_visible && !b.is_deleted)
           .sort((a, b) => a.order - b.order)
      : sortedBlocksRef.current;

    const currentIdx = siblings.findIndex(b => b.id === blockId);
    const nextBlock  = siblings[currentIdx + 1] ?? null;

    const isListType = LIST_TYPES.includes(currentBlock.block_type as BlockType);
    const newType    = isListType ? (currentBlock.block_type as BlockType) : 'paragraph';

    onCreateBlock(blockId, newType, nextBlock, parentId);
  }, [onCreateBlock]);

  /**
   * Reactive auto-collapse: after every confirmed server-state update to
   * allBlocks, find any `column` block that has zero content children and
   * collapse it via the atomic backend endpoint.
   *
   * Using confirmed server state (not optimistic) eliminates the race
   * condition that occurred when collapse-column fired before the block-move
   * PATCH was committed: the effect only runs after React Query has refetched
   * and confirmed the new state, so the column is truly empty in the DB when
   * we send the collapse request.
   *
   * collapsingColsRef prevents double-firing if allBlocks changes twice
   * before the first collapse resolves.
   */
  useEffect(() => {
    for (const col of allBlocks) {
      if (col.block_type !== 'column') continue;
      if (collapsingColsRef.current.has(col.id)) continue;
      if (!allBlocks.some(b => b.parent === col.id)) {
        collapsingColsRef.current.add(col.id);
        collapseColumn.mutate(col.id, {
          onSettled: () => { collapsingColsRef.current.delete(col.id); },
        });
      }
    }
  }, [allBlocks, collapseColumn]);

  /**
   * Column-aware Delete: finds the previous sibling within the same parent
   * context so focus lands on the right block even inside a column.
   * Empty-column cleanup is handled reactively by the useEffect above.
   */
  const handleDelete = useCallback((blockId: string) => {
    if (deletingIdsRef.current.has(blockId)) return;
    deletingIdsRef.current.add(blockId);

    const ab       = allBlocksRef.current;
    const block    = ab.find(b => b.id === blockId);
    const parentId = block?.parent ?? null;

    const siblings = parentId !== null
      ? ab.filter(b => b.parent === parentId && b.doc_visible && !b.is_deleted)
           .sort((a, b) => a.order - b.order)
      : sortedBlocksRef.current;

    const idx = siblings.findIndex(b => b.id === blockId);
    if (idx > 0) {
      const prevId = siblings[idx - 1].id;
      setSelectedId(prevId);
      setFocusEndId(prevId);
    }
    onDeleteBlock(blockId);
    setTimeout(() => { deletingIdsRef.current.delete(blockId); }, 2000);
  }, [onDeleteBlock]);

  const handleConvertToParagraph = useCallback((blockId: string) => {
    onUpdateBlock(blockId, { block_type: 'paragraph' });
    setFocusEndId(blockId);
  }, [onUpdateBlock]);

  const handleSave = useCallback((blockId: string, content: Record<string, unknown>) => {
    onUpdateBlock(blockId, { content: content as BlockContent });
  }, [onUpdateBlock]);

  const handleFocus = useCallback((blockId: string) => {
    setFocusedId(blockId);
    setSelectedId(blockId);
    if (focusEndIdRef.current === blockId) {
      setTimeout(() => setFocusEndId(null), 100);
    }
  }, []);

  const handleBlur = useCallback((blockId: string) => {
    setFocusedId((prev) => (prev === blockId ? null : prev));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSlash = useCallback((_blockId: string, _query: string) => {
    // Handled by SlashCommand extension + slashEventBus
  }, []);

  const handleTextChange = useCallback((blockId: string, text: string) => {
    currentTextRef.current.set(blockId, text);
  }, []);

  /**
   * handleBlockDragStart — used by both DocumentEditor's own drag handles and
   * by ColumnContainerBlock's per-block drag handles (passed via BlockRenderer).
   * Sets the ghost label from the block's current text content.
   */
  const handleBlockDragStart = useCallback((blockId: string) => {
    setInsertHoverId(null);
    const block = allBlocksRef.current.find(b => b.id === blockId);
    ghostLabelRef.current = String(
      (block?.content as Record<string, unknown>)?.text || block?.block_type || 'block',
    );
    dragSourceIdRef.current = blockId;
    isDraggingRef.current   = true;
    setIsDragging(true);
  }, []);

  /**
   * handleCreateBlockInColumn — wrapper that forwards column creation requests
   * (with a parentId = columnId) to the parent-owned onCreateBlock.
   */
  const handleCreateBlockInColumn = useCallback((
    afterBlockId: string | null,
    blockType:    BlockType,
    nextBlock:    Block | null,
    columnId:     string,
  ) => {
    onCreateBlock(afterBlockId, blockType, nextBlock ?? undefined, columnId);
  }, [onCreateBlock]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POINTER DRAG — global document listeners
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    if (!isDragging) return;

    function onMove(e: PointerEvent) {
      if (!isDraggingRef.current) return;

      // Move ghost to follow pointer (direct DOM — no React re-render)
      if (ghostRef.current) {
        ghostRef.current.style.transform =
          `translate(${e.clientX + 18}px, ${e.clientY - 10}px)`;
      }

      const el      = document.elementFromPoint(e.clientX, e.clientY);
      const blockEl = el?.closest('[data-blockid]') as HTMLElement | null;
      const overId  = blockEl?.dataset['blockid'] ?? null;

      if (overId && overId !== dragSourceIdRef.current) {
        const rect = blockEl!.getBoundingClientRect();

        // Right-edge zone → column drop (only for top-level source + target)
        const ab       = allBlocksRef.current;
        const srcBlock = ab.find(b => b.id === dragSourceIdRef.current);
        const tgtBlock = ab.find(b => b.id === overId);
        const isTopLevel = !srcBlock?.parent && !tgtBlock?.parent;
        const fromRight  = rect.right - e.clientX;
        const blockWidth = rect.width;

        let mode: 'reorder' | 'column' | 'add-to-column';
        if (isTopLevel && fromRight < blockWidth * 0.20) {
          // Far-right 20% — always create nested column_container
          mode = 'column';
        } else if (isTopLevel && fromRight < blockWidth * 0.40 && tgtBlock?.block_type === 'column_container') {
          // Near-right 20–40%, target is already a container → add as new column
          mode = 'add-to-column';
        } else {
          mode = 'reorder';
        }

        dropModeRef.current = mode;
        setDropMode(mode);

        const pos: 'top' | 'bottom' = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
        dragOverIdRef.current = overId;
        dragPosRef.current    = pos;
        setDragOverId(overId);
        setDragPos(pos);
      } else if (!overId) {
        dragOverIdRef.current = null;
        setDragOverId(null);
      }
    }

    function onUp() {
      isDraggingRef.current = false;
      setIsDragging(false);

      const sourceId = dragSourceIdRef.current;
      const targetId = dragOverIdRef.current;
      const pos      = dragPosRef.current;
      const mode     = dropModeRef.current;

      dragSourceIdRef.current = null;
      dragOverIdRef.current   = null;
      dropModeRef.current     = 'reorder';
      setDragOverId(null);
      setDropMode('reorder');

      if (!sourceId || !targetId || targetId === sourceId) return;

      // ── Add to existing column_container ─────────────────────────────────
      if (mode === 'add-to-column') {
        addToColumn.mutate({ sourceId, containerId: targetId });
        return;
      }

      // ── Column-drop: create new column_container ──────────────────────────
      if (mode === 'column') {
        makeColumns.mutate({ sourceId, targetId });
        return;
      }

      // ── Reorder / cross-context move ──────────────────────────────────────
      const ab          = allBlocksRef.current;
      const sourceBlock = ab.find(b => b.id === sourceId);
      const targetBlock = ab.find(b => b.id === targetId);

      const sourceParent = sourceBlock?.parent ?? null;
      const targetParent = targetBlock?.parent ?? null;

      // Compute new order from siblings in the target context
      const siblings = targetParent !== null
        ? ab.filter(b => b.parent === targetParent && b.doc_visible && !b.is_deleted)
             .sort((a, b) => a.order - b.order)
        : sortedBlocksRef.current;

      const targetIdx = siblings.findIndex(b => b.id === targetId);
      if (targetIdx === -1) return;

      let newOrder: number;
      if (pos === 'top') {
        const prev = siblings[targetIdx - 1];
        newOrder = prev
          ? (prev.order + siblings[targetIdx].order) / 2
          : siblings[targetIdx].order - 1;
      } else {
        const next = siblings[targetIdx + 1];
        newOrder = next
          ? (siblings[targetIdx].order + next.order) / 2
          : siblings[targetIdx].order + 1;
      }

      if (sourceParent !== targetParent) {
        // Cross-context move: update parent + order atomically.
        // Empty-column cleanup is handled reactively by the collapseColumn
        // useEffect — it fires after React Query confirms the server state,
        // eliminating the race condition between this PATCH and collapse POST.
        onUpdateBlock(sourceId, { parent: targetParent, order: newOrder });
      } else {
        onReorderBlock(sourceId, newOrder);
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
    };
  }, [isDragging, onReorderBlock, onUpdateBlock, makeColumns, addToColumn]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (sortedBlocks.length === 0) {
    return (
      <div
        className="min-h-32 cursor-text py-2 text-base text-neutral-600 transition-colors hover:text-neutral-500"
        onClick={() => !readOnly && onCreateBlock(null, 'paragraph')}
      >
        Click to start writing…
      </div>
    );
  }

  // ── Context menu smart positioning ───────────────────────────────────────
  // Flip LEFT if menu would overflow right viewport edge.
  // Flip UP   if there is more space above than below the anchor.
  const CMENU_W   = 208; // px — matches min-w-52 below
  const CMENU_MAX = 340; // max height in px
  const spaceBelow = window.innerHeight - menuPos.top - 8;
  const spaceAbove = menuPos.top - 8;
  const openAbove  = spaceBelow < CMENU_MAX && spaceAbove > spaceBelow;

  const adjustedMenuLeft = menuPos.left + CMENU_W > window.innerWidth
    ? menuPos.left - CMENU_W - 8
    : menuPos.left;
  const adjustedMenuTop  = openAbove
    ? Math.max(8, menuPos.top - Math.min(CMENU_MAX, spaceAbove))
    : menuPos.top;
  const menuMaxHeight    = openAbove
    ? Math.min(CMENU_MAX, spaceAbove)
    : Math.min(CMENU_MAX, spaceBelow);

  return (
    <div className="relative w-full pl-10">
      {sortedBlocks.map((block, index) => {
        const isDragOver    = dragOverId === block.id;
        const isColumnDrop  = isDragOver && dropMode === 'column';
        const isAddToColumn = isDragOver && dropMode === 'add-to-column';
        const isReorderDrop = isDragOver && dropMode === 'reorder';
        const showTop       = !readOnly && !isDragging && insertHoverId === block.id && insertHalf === 'top';
        const showBottom    = !readOnly && !isDragging && insertHoverId === block.id && insertHalf === 'bottom';

        const isShared = onToggleCanvasShare && block.canvas_visible;

        return (
          <div
            key={block.id}
            data-blockid={block.id}
            className={[
              'group relative py-1',
              isDragging && dragSourceIdRef.current === block.id ? 'opacity-30' : '',
              isReorderDrop && dragPos === 'top'    ? 'border-t-2 border-violet-500' : '',
              isReorderDrop && dragPos === 'bottom' ? 'border-b-2 border-violet-500' : '',
            ].join(' ')}
            style={(block.bg_color || block.text_color) ? {
              ...(block.bg_color   ? { backgroundColor: block.bg_color, borderRadius: '6px' } : {}),
              ...(block.text_color ? { color: block.text_color } : {}),
            } : undefined}
            onMouseMove={(e) => {
              if (isDraggingRef.current) return;
              const rect      = e.currentTarget.getBoundingClientRect();
              const distToTop = e.clientY - rect.top;
              const distToBot = rect.bottom - e.clientY;

              if (distToTop <= EDGE_THRESHOLD) {
                if (insertHoverId !== block.id || insertHalf !== 'top') {
                  setInsertHoverId(block.id);
                  setInsertHalf('top');
                }
              } else if (distToBot <= EDGE_THRESHOLD) {
                if (insertHoverId !== block.id || insertHalf !== 'bottom') {
                  setInsertHoverId(block.id);
                  setInsertHalf('bottom');
                }
              } else if (insertHoverId === block.id) {
                setInsertHoverId(null);
              }
            }}
            onMouseLeave={() => {
              if (insertHoverId === block.id) setInsertHoverId(null);
            }}
          >

            {/* ── Column-drop right-edge indicator (nest) ──────────────────── */}
            {isColumnDrop && (
              <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-20
                              w-0.5 rounded-full bg-violet-500 shadow-[0_0_6px_2px_rgba(139,92,246,0.4)]" />
            )}

            {/* ── Add-to-column indicator (merge into existing container) ───── */}
            {isAddToColumn && (
              <div className="pointer-events-none absolute bottom-0 top-0 z-20
                              w-0.5 rounded-full bg-blue-400 shadow-[0_0_6px_2px_rgba(96,165,250,0.4)]"
                   style={{ right: '20%' }} />
            )}

            {/* ── TOP insertion line ────────────────────────────────────────── */}
            {showTop && (
              <button
                type="button"
                aria-label="Add block above"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx  = sortedBlocks.findIndex((b) => b.id === block.id);
                  const prev = sortedBlocks[idx - 1] ?? null;
                  onCreateBlock(prev?.id ?? null, 'paragraph', block);
                  setInsertHoverId(null);
                }}
                className="absolute left-0 right-0 top-0 z-20
                           h-3 -translate-y-1/2 outline-none
                           flex cursor-pointer items-center animate-fade-in"
              >
                <span className="pointer-events-none relative z-10 flex h-4.5 w-4.5 shrink-0
                                 -translate-x-2 items-center justify-center rounded-full
                                 border-2 border-violet-500 bg-neutral-950 text-[11px]
                                 font-bold leading-none text-violet-400
                                 shadow-sm shadow-violet-900/40">+</span>
                <span className="pointer-events-none h-px flex-1 rounded-full bg-violet-500/60" />
              </button>
            )}

            {/* ── BOTTOM insertion line ─────────────────────────────────────── */}
            {showBottom && (
              <button
                type="button"
                aria-label="Add block below"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx  = sortedBlocks.findIndex((b) => b.id === block.id);
                  const next = sortedBlocks[idx + 1] ?? null;
                  onCreateBlock(block.id, 'paragraph', next);
                  setInsertHoverId(null);
                }}
                className="absolute left-0 right-0 bottom-0 z-20
                           h-3 translate-y-1/2 outline-none
                           flex cursor-pointer items-center animate-fade-in"
              >
                <span className="pointer-events-none relative z-10 flex h-4.5 w-4.5 shrink-0
                                 -translate-x-2 items-center justify-center rounded-full
                                 border-2 border-violet-500 bg-neutral-950 text-[11px]
                                 font-bold leading-none text-violet-400
                                 shadow-sm shadow-violet-900/40">+</span>
                <span className="pointer-events-none h-px flex-1 rounded-full bg-violet-500/60" />
              </button>
            )}

            {/* ── Canvas-shared sticker — always visible when block is on canvas ── */}
            {isShared && (
              <div
                title="Shared to canvas"
                className="pointer-events-none absolute -left-5 top-2
                           z-10 flex items-center justify-center
                           h-4 w-4 rounded-full bg-violet-900/60 text-[9px] text-violet-300
                           border border-violet-600/50 shadow-sm select-none"
              >
                ◈
              </div>
            )}

            {/* ── Left gutter — canvas share toggle + drag handle ──────────── */}
            {!readOnly && (
              <div className="absolute -left-14 top-1/2 -translate-y-1/2 flex items-center gap-0.5
                              opacity-0 group-hover:opacity-100 transition-opacity duration-150
                              select-none">

                {/* Canvas share toggle */}
                {onToggleCanvasShare && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCanvasShare(block.id);
                    }}
                    title={block.canvas_visible ? 'Remove from canvas' : 'Share to canvas'}
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded text-[10px]',
                      'transition-colors',
                      block.canvas_visible
                        ? 'text-violet-400 hover:text-violet-300'
                        : 'text-neutral-600 hover:text-neutral-400',
                    ].join(' ')}
                  >
                    {block.canvas_visible ? '◈' : '◇'}
                  </button>
                )}

                {/* Drag handle */}
                <div
                  className="block-drag-handle flex h-6 w-6 cursor-grab items-center justify-center
                             rounded-md border border-transparent text-xs
                             text-neutral-600 transition-all duration-150
                             hover:border-neutral-700 hover:bg-neutral-800
                             hover:text-neutral-300 active:cursor-grabbing"
                  title="Drag to reorder · Click for options"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleBlockDragStart(block.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenContextMenu(block.id, e.currentTarget as HTMLElement);
                  }}
                >⠿</div>

              </div>
            )}

            {/* ── AI quick-actions button — top-right of block border ────────── */}
            {!readOnly && block.block_type !== 'code' && (
              <button
                type="button"
                title="AI actions"
                onClick={(e) => {
                  e.stopPropagation();
                  if (aiActionBlockId === block.id) {
                    setAiActionBlockId(null);
                    setAiActionAnchor(null);
                  } else {
                    setAiActionBlockId(block.id);
                    setAiActionAnchor(e.currentTarget as HTMLElement);
                  }
                }}
                className={[
                  'absolute top-1 right-1 z-10',
                  'flex h-5 w-5 items-center justify-center rounded-md text-[11px]',
                  'transition-all duration-150',
                  aiActionBlockId === block.id
                    ? 'opacity-100 border border-violet-600/50 bg-violet-600/20 text-violet-300'
                    : 'opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-violet-400 hover:bg-neutral-800',
                ].join(' ')}
              >
                ✨
              </button>
            )}

            {/* ── Block content ─────────────────────────────────────────────── */}
            <BlockRenderer
              block={block}
              index={index}
              allBlocks={allBlocks}
              onSave={handleSave}
              onEnter={handleEnter}
              onDelete={handleDelete}
              onConvertToParagraph={handleConvertToParagraph}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onSlash={handleSlash}
              onTextChange={handleTextChange}
              isSelected={selectedId === block.id}
              autoFocus={focusedId === block.id}
              focusAtEnd={focusEndId === block.id}
              readOnly={readOnly}
              // Column-specific pass-throughs
              onBlockCreate={handleCreateBlockInColumn}
              onBlockDragStart={handleBlockDragStart}
              onBlockContextMenu={handleOpenContextMenu}
              isDragging={isDragging}
              dragOverBlockId={dragOverId}
              dragOverPos={dragPos}
              focusedBlockId={focusedId}
              focusAtEndBlockId={focusEndId}
            />

            {/* ── AI quick-actions popover ──────────────────────────────────── */}
            {aiActionBlockId === block.id && aiActionAnchor && (
              <BlockAiActions
                block={block}
                anchorEl={aiActionAnchor}
                isCode={block.block_type === 'code'}
                codeLanguage={block.block_type === 'code' ? String(block.content.language ?? 'plaintext') : undefined}
                onApply={(newText) => {
                  if (block.block_type === 'code') {
                    onUpdateBlock(block.id, { content: { ...block.content, code: newText } });
                  } else {
                    // Save as TipTap JSON so \n renders as actual line breaks (bullet points, etc.)
                    onUpdateBlock(block.id, { content: { ...block.content, json: textToTipTapJSON(newText), text: newText } });
                  }
                  setAiActionBlockId(null);
                  setAiActionAnchor(null);
                }}
                onClose={() => {
                  setAiActionBlockId(null);
                  setAiActionAnchor(null);
                }}
              />
            )}
          </div>
        );
      })}

      {/* ── Add-block affordance at end ──────────────────────────────────── */}
      {!readOnly && (
        <div
          className="mt-2 cursor-text py-4 text-sm text-neutral-700
                     transition-colors hover:text-neutral-500"
          onClick={() => {
            const last = sortedBlocks[sortedBlocks.length - 1];
            onCreateBlock(last?.id ?? null, 'paragraph');
          }}
        >
          + Add a block
        </div>
      )}

      {/* ── Slash menu portal ────────────────────────────────────────────── */}
      {slashOpen && slashRect && (
        <SlashMenuPortal rect={slashRect}>
          <SlashMenuList
            ref={slashMenuRef}
            items={slashItems}
            command={(item) => handleSlashSelect(item, slashCommand)}
          />
        </SlashMenuPortal>
      )}

      {/* ── Drag ghost ───────────────────────────────────────────────────── */}
      {isDragging && (
        <div
          ref={ghostRef}
          className="fixed top-0 left-0 z-9999 pointer-events-none select-none
                     max-w-50 truncate rounded-lg border border-violet-500/40
                     bg-neutral-900/95 px-3 py-1.5 text-sm text-neutral-200
                     shadow-[0_8px_32px_rgba(0,0,0,0.6)]
                     ring-1 ring-violet-500/20 backdrop-blur-sm"
          style={{ transform: 'translate(-9999px, -9999px)' }}
        />
      )}

      {/* ── Block context menu ───────────────────────────────────────────── */}
      {contextMenuAnchor && contextMenuBlockId && createPortal(
        <div
          ref={contextMenuRef}
          style={{
            position:  'fixed',
            top:       adjustedMenuTop,
            left:      adjustedMenuLeft,
            zIndex:    9999,
            maxHeight: menuMaxHeight,
            overflowY: 'auto',
            width:     CMENU_W,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="animate-fade-in"
        >
          <div className="overflow-hidden rounded-xl border border-neutral-700
                          bg-neutral-900 shadow-2xl">

            {/* ── Turn into — compact 2-col grid ─────────────────────────── */}
            <p className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase
                          tracking-wider text-neutral-500">
              Turn into
            </p>
            {TYPE_GROUPS.map((group) => (
              <div key={group.label} className="px-1.5 pb-0.5">
                <p className="px-1 pb-0.5 text-[9px] text-neutral-600">{group.label}</p>
                <div className="grid grid-cols-2 gap-0.5">
                  {group.types.map(({ type, label }) => (
                    <button
                      key={type}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onUpdateBlock(contextMenuBlockId, { block_type: type });
                        closeContextMenu();
                      }}
                      className="rounded px-2 py-1.5 text-left text-xs
                                 text-neutral-300 hover:bg-neutral-800 transition-colors
                                 min-h-9 active:bg-neutral-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="my-1 mx-2 h-px bg-neutral-800" />

            {/* ── Background color ─────────────────────────────────────── */}
            <div className="px-2.5 pb-2">
              <p className="pt-1 pb-1.5 text-[9px] font-semibold uppercase
                            tracking-wider text-neutral-500">
                Background
              </p>
              <div className="flex flex-wrap gap-1.5">
                {BG_COLORS.map(({ color, label }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onUpdateBlock(contextMenuBlockId, { bg_color: color });
                      closeContextMenu();
                    }}
                    className={[
                      'h-6 w-6 rounded-md border-2 transition-all hover:scale-110 active:scale-95',
                      color === ''
                        ? 'border-neutral-600 bg-neutral-800 text-[8px] text-neutral-400 flex items-center justify-center'
                        : 'border-transparent hover:border-white/30',
                    ].join(' ')}
                    style={color ? { backgroundColor: color } : undefined}
                  >
                    {color === '' ? '✕' : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-1 mx-2 h-px bg-neutral-800" />

            {/* ── Text color ────────────────────────────────────────────── */}
            <div className="px-2.5 pb-2">
              <p className="pt-1 pb-1.5 text-[9px] font-semibold uppercase
                            tracking-wider text-neutral-500">
                Text Color
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEXT_COLORS.map(({ color, label }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onUpdateBlock(contextMenuBlockId, { text_color: color });
                      closeContextMenu();
                    }}
                    className={[
                      'h-6 w-6 rounded-md border-2 transition-all hover:scale-110 active:scale-95',
                      color === ''
                        ? 'border-neutral-600 bg-neutral-800 text-[8px] text-neutral-400 flex items-center justify-center'
                        : 'border-transparent hover:border-white/30',
                    ].join(' ')}
                    style={color ? { backgroundColor: color } : undefined}
                  >
                    {color === '' ? '✕' : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-2 h-px bg-neutral-800" />

            {/* ── Delete ───────────────────────────────────────────────── */}
            <div className="p-1">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onDeleteBlock(contextMenuBlockId);
                  closeContextMenu();
                }}
                className="flex w-full items-center rounded px-2.5 py-2 text-left text-xs
                           font-medium text-red-400 hover:bg-red-950/30 transition-colors
                           active:bg-red-950/50"
              >
                Delete block
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
