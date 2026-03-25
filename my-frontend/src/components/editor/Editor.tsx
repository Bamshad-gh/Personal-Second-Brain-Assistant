/**
 * components/editor/Editor.tsx
 *
 * What:    The TipTap rich-text editor. Clean, distraction-free writing surface.
 *
 * Features:
 *   - StarterKit (bold, italic, lists, headings, code, blockquote, hr, undo/redo)
 *   - Task list (checkbox to-dos)
 *   - Code blocks with syntax highlighting + language selector (CustomCodeBlock)
 *   - Highlight (multi-color), TextStyle + Color (text color)
 *   - Toggle block (collapsible section)
 *   - Placeholder text
 *   - Inline toolbar: Bold / Italic / Code / H1 / H2 / H3 / List / Todo / Highlight / Color / Voice
 *   - Slash ("/") command menu via @tiptap/suggestion (SlashCommand extension)
 *   - Page link ("[[") popup via @tiptap/suggestion (PageLink extension) — Phase 2
 *   - Autosave: calls onSave(json) 500ms after the last keystroke
 *   - Save indicator: "Saving…" / "Saved ✓" in the toolbar
 *   - Voice-to-text: Web Speech API (Chrome/Edge) + Whisper fallback (all others)
 *   - Block handle: hover "+" button to insert paragraph below (AddBlockHandle, pure React)
 *
 * Props:
 *   initialContent  — JSON content from the database (or null for a new page)
 *   onSave          — called with the editor's JSON when autosave fires
 *   onTextChange    — called on every content change with plain text (for AI context)
 *   readOnly        — disables editing (for locked pages)
 *   workspaceId     — UUID of the current workspace; used by the page link popup to
 *                     load and filter workspace pages (Phase 2)
 *   pageId          — UUID of the current page; used to record page link connections
 *                     via relationsApi.createLink(pageId, targetPageId) (Phase 2)
 *
 * WHERE TO FIND THINGS
 *   Extensions list:     useEditor({ extensions: [...] }) below — TIPTAP SETUP section
 *   Toolbar buttons:     TOOLBAR COMPONENTS section below
 *   Voice handler:       toggleVoice() + startNativeSpeech() + startWhisperRecording() below
 *   Slash commands:      src/components/editor/SlashMenu.tsx → COMMANDS array
 *   Slash extension:     src/components/editor/extensions/SlashCommand.ts
 *   Page link extension: src/components/editor/extensions/PageLink.ts
 *   Page link popup:     src/components/editor/PageLinkPopup.tsx
 *   Code block UI:       src/components/editor/extensions/CodeBlockWrapper.tsx
 *   Toggle block:        src/components/editor/extensions/ToggleBlock.ts
 *   Block handle:        AddBlockHandle in src/components/editor/BlockWrapper.tsx
 */

'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTS — all external and internal dependencies
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { useRouter }                                 from 'next/navigation';
import { useEditor, EditorContent }                  from '@tiptap/react';
import type { Editor as TipTapEditor }               from '@tiptap/core';
import StarterKit                                    from '@tiptap/starter-kit';
import Placeholder                                   from '@tiptap/extension-placeholder';
import TaskList                                      from '@tiptap/extension-task-list';
import TaskItem                                      from '@tiptap/extension-task-item';
import Highlight                                     from '@tiptap/extension-highlight';
import { TextStyle }                                 from '@tiptap/extension-text-style';
import Color                                         from '@tiptap/extension-color';
import Image                                         from '@tiptap/extension-image';
import toast                                         from 'react-hot-toast';

import { useQueryClient }                            from '@tanstack/react-query';
import { getAccessToken }                            from '@/lib/auth';
import { relationsApi }                              from '@/lib/api';
import { usePages }                                  from '@/hooks/usePages';
import type { Page }                                 from '@/types';

import { CustomCodeBlock }                           from './extensions/CustomCodeBlock';
import { SlashCommand }                              from './extensions/SlashCommand';
import { ToggleBlock }                               from './extensions/ToggleBlock';
import { PageLinkNode, PageLinkSuggestion }          from './extensions/PageLink';
import { SlashMenuPortal }                           from './SlashMenuPortal';
import { SlashMenuList }                             from './SlashMenu';
import type { SlashMenuHandle, SlashCommandItem }    from './SlashMenu';
import { PageLinkPopup }                             from './PageLinkPopup';
import type { PageLinkPopupHandle }                  from './PageLinkPopup';
import { PageHoverCard }                             from './PageHoverCard';
import { AddBlockHandle }                            from './BlockWrapper';
import { slashEventBus }                             from '@/lib/slashEventBus';
import type { SlashOpenPayload }                     from '@/lib/slashEventBus';
import { pageLinkEventBus }                          from '@/lib/pageLinkEventBus';
import type { PageLinkOpenPayload }                  from '@/lib/pageLinkEventBus';
import {
  Bold, Italic, Code, CheckCheck, Clock,
  List, CheckSquare, Highlighter, Palette, Mic, MicOff,
} from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES — EditorProps interface and SaveStatus
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface EditorProps {
  initialContent:       Record<string, unknown> | null;
  onSave:               (json: Record<string, unknown>) => void;
  /** Called on every content change with the editor's plain text.
   *  Used by the AI panel to get the page text as context. */
  onTextChange?:        (text: string) => void;
  /** Called whenever the selection changes; passes the selected text (empty string = no selection) */
  onSelectionChange?:   (selectedText: string) => void;
  /** Called when the user clicks an action button in the code block toolbar */
  onCodeAction?:        (actionType: string, code: string) => void;
  readOnly?:            boolean;
  /** UUID of the current workspace — used by the [[ page link popup */
  workspaceId:          string;
  /** UUID of the current page — used to record page link connections */
  pageId:               string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTOSAVE HOOK — fires onSave 500ms after the last change
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SaveStatus = 'idle' | 'saving' | 'saved';

function useAutosave(
  getValue: () => Record<string, unknown> | null,
  onSave:   (json: Record<string, unknown>) => void,
): { triggerSave: () => void; status: SaveStatus } {
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const triggerSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('saving');
    timerRef.current = setTimeout(() => {
      const value = getValue();
      if (value) {
        onSave(value);
        setStatus('saved');
        // Reset "Saved ✓" back to idle after 2s
        setTimeout(() => setStatus('idle'), 2000);
      }
    }, 500);
  }, [getValue, onSave]);

  // Cleanup on unmount — flush any pending save immediately
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const value = getValue();
        if (value) onSave(value);
      }
    };
  // We only want this to run on unmount, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { triggerSave, status };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT — main Editor export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const Editor = forwardRef<TipTapEditor, EditorProps>(function Editor({
  initialContent,
  onSave,
  onTextChange,
  onSelectionChange,
  onCodeAction,
  readOnly = false,
  workspaceId,
  pageId,
}: EditorProps, ref) {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STATE — all useState and useRef declarations
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const queryClient = useQueryClient();

  // Slash menu
  const [slashOpen,    setSlashOpen]    = useState(false);
  const [slashItems,   setSlashItems]   = useState<SlashCommandItem[]>([]);
  const [slashRect,    setSlashRect]    = useState<DOMRect | null>(null);
  const [slashCommand, setSlashCommand] = useState<((item: SlashCommandItem) => void) | null>(null);
  const slashMenuRef = useRef<SlashMenuHandle>(null);

  // Page link popup (Phase 2 — [[ trigger)
  const [pageLinkOpen,  setPageLinkOpen]  = useState(false);
  const [pageLinkQuery, setPageLinkQuery] = useState('');
  const [pageLinkRect,  setPageLinkRect]  = useState<DOMRect | null>(null);
  // Range stored as a ref — updated on every keystroke but only read on selection.
  // Using a ref (not state) avoids an extra re-render per keystroke.
  const pageLinkRangeRef = useRef<{ from: number; to: number } | null>(null);
  const pageLinkPopupRef = useRef<PageLinkPopupHandle>(null);

  // Voice-to-text
  const [isRecording, setIsRecording] = useState(false);

  // Chrome/Edge: native Web Speech API ref
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Firefox and others: MediaRecorder-based Whisper path
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);

  // Hover card — shown 500ms after hovering a [[Page Link]] chip
  const [hoveredPageId,      setHoveredPageId]      = useState<string | null>(null);
  const [hoveredChipRect,    setHoveredChipRect]    = useState<DOMRect | null>(null);
  const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState<string | null>(null);
  const hoverTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Code block toolbar — true when cursor is inside a code block
  const [isInCodeBlock, setIsInCodeBlock] = useState(false);

  // Block handle — tracks which block the pointer is over for the "+" button
  const [blockHandle, setBlockHandle] = useState<{
    top:        number;
    nodePos:    number;
    isListItem: boolean;
  } | null>(null);

  // Autosave ref — keeps onUpdate from capturing a stale triggerSave.
  // useEditor() is called before useAutosave(), so triggerSave does not exist
  // yet at the time the onUpdate closure is created. A ref bridges the gap:
  // onUpdate always calls the latest version via the ref, avoiding stale closures.
  const triggerSaveRef = useRef<(() => void) | null>(null);

  // Router — used by handleEditorClick for page link chip navigation
  const router = useRouter();

  // Workspace pages — loaded for the [[ page link search popup
  const { data: workspacePages = [] } = usePages(workspaceId);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TIPTAP SETUP — useEditor call and extensions config
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const editor = useEditor({
    immediatelyRender: false, // fix SSR hydration mismatch

    editable: !readOnly,

    extensions: [
      /**
       * StarterKit — all sub-extensions declared explicitly.
       *
       * WHY explicit: In TipTap v3, leaving options unspecified can cause
       * silent conflicts when other extensions (e.g. CodeBlockLowlight) also
       * register node types. Explicit config makes conflicts obvious.
       *
       * codeBlock: false — we use CustomCodeBlock (CodeBlockLowlight + UI)
       * instead of StarterKit's built-in plain code block.
       *
       * NOTE: @tiptap/extension-typography is intentionally EXCLUDED.
       * It conflicts with block-level node parsing in TipTap v3 — enabling it
       * causes all block types (headings, lists, etc.) to merge into plain text.
       */
      StarterKit.configure({
        heading:        { levels: [1, 2, 3] },
        codeBlock:      false,      // replaced by CustomCodeBlock below
        /**
         * hardBreak: false — CRITICAL for correct block behaviour.
         *
         * With hardBreak enabled (the default), Shift+Enter inserts a <br>
         * INSIDE the current block node rather than splitting it. This makes
         * the editor feel like "everything is one continuous block" because
         * newlines never create new ProseMirror nodes. Disabling it makes
         * both Enter AND Shift+Enter split the current node into two separate
         * block-level nodes, which is the expected Notion-style behaviour.
         */
        hardBreak:      false,
        bulletList:     {},
        orderedList:    {},
        listItem:       {},
        blockquote:     {},
        horizontalRule: {},
        bold:           {},
        italic:         {},
        strike:         {},
        code:           {},
      }),

      // Code blocks with syntax highlighting + language selector dropdown
      // (CustomCodeBlock wraps CodeBlockLowlight with a ReactNodeViewRenderer)
      CustomCodeBlock,

      // Placeholder — context-aware message per node type
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Heading...';
          return "Type '/' for commands, '[[ ' to link a page, or start writing…";
        },
      }),

      // Text formatting
      TextStyle,                              // required by Color
      Color,                                  // text color via setColor()
      Highlight.configure({ multicolor: true }), // background highlight

      // Custom toggle block — collapsible section with open/close state
      ToggleBlock,

      // Task list (checkbox to-dos)
      TaskList,
      TaskItem.configure({ nested: true }),

      // Slash command palette — intercepts "/" using @tiptap/suggestion
      // (replaces the old manual detection in onUpdate)
      SlashCommand,

      // Page link chip — intercepts "[[" using @tiptap/suggestion (Phase 2)
      // PageLinkNode:       inline atom node that renders as [[Title]] chip
      // PageLinkSuggestion: suggestion plugin that fires pageLinkEventBus events
      PageLinkNode,
      PageLinkSuggestion,

      // Image blocks — base64 preview (Phase 2 will upload to Django)
      // inline:false  → image is its own block node, not inline
      // allowBase64   → accept data URIs from paste/drop/file picker
      Image.configure({ inline: false, allowBase64: true }),
    ],

    content: initialContent ?? undefined,

    editorProps: {
      attributes: {},

      /**
       * handlePaste — intercept clipboard images.
       * When the user pastes an image (Ctrl+V / Cmd+V) the browser puts a
       * File item in clipboardData. We read it as a base64 data URL and
       * insert it as an image node. Returns true to prevent TipTap's default
       * paste handling for that item.
       */
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (!item.type.startsWith('image/')) continue;

          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (e) => {
            const src = e.target?.result as string;
            if (!src) return;
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src }),
              ),
            );
          };
          reader.readAsDataURL(file);
          return true; // consumed — suppress TipTap's default paste
        }
        return false;
      },

      /**
       * handleDrop — intercept image files dragged into the editor.
       * Inserts the image at the drop position rather than the selection.
       */
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        for (const file of Array.from(files)) {
          if (!file.type.startsWith('image/')) continue;

          const reader = new FileReader();
          reader.onload = (e) => {
            const src = e.target?.result as string;
            if (!src) return;
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top:  event.clientY,
            });
            if (!coordinates) return;
            const node = view.state.schema.nodes.image.create({ src });
            view.dispatch(
              view.state.tr.insert(coordinates.pos, node),
            );
          };
          reader.readAsDataURL(file);
          return true;
        }
        return false;
      },
    },

    onUpdate({ editor: e }) {
      // Call via ref so this closure always reaches the latest triggerSave,
      // even though useAutosave() runs after useEditor() in call order.
      triggerSaveRef.current?.();
      if (onTextChange) onTextChange(e.getText());
    },

    onSelectionUpdate({ editor: e }) {
      const { from, to } = e.state.selection;
      const text = from !== to ? e.state.doc.textBetween(from, to, ' ') : '';
      onSelectionChange?.(text);
      setIsInCodeBlock(e.isActive('codeBlock'));
    },
  });

  // Wire up autosave after editor is created
  const { triggerSave, status } = useAutosave(
    () => editor?.getJSON() as Record<string, unknown> ?? null,
    onSave,
  );

  // Expose the TipTap editor instance via ref so page.tsx can call
  // editor.chain().focus().insertContent(text).run() from outside.
  // editor is guaranteed non-null here because the `if (!editor) return null`
  // guard above prevents this code path from running when editor is null.
  useImperativeHandle(ref, () => editor!, [editor]);

  // Returns the text content of the code block the cursor is currently inside.
  function getCodeBlockText(): string {
    if (!editor) return '';
    const { $from } = editor.state.selection;
    return $from.node($from.depth)?.textContent ?? '';
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EFFECTS — triggerSave sync, slash menu listeners, page link listeners,
  //           content sync, voice cleanup
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Keep the triggerSave ref in sync so onUpdate always calls the latest version.
  // Cleanup: set to null so a pending rAF/timer can't fire after unmount.
  useEffect(() => {
    triggerSaveRef.current = triggerSave;
    return () => { triggerSaveRef.current = null; };
  }, [triggerSave]);

  // Slash menu event listeners — uses slashEventBus (lib/slashEventBus.ts), a
  // standalone module-level bus that SlashCommand.ts emits on.
  useEffect(() => {
    const onOpen = (data: SlashOpenPayload) => {
      setSlashItems(data.items);
      setSlashRect(data.rect);
      setSlashCommand(() => data.command);
      setSlashOpen(true);
    };
    const onUpdate = (data: SlashOpenPayload) => {
      setSlashItems(data.items);
      setSlashRect(data.rect);
      setSlashCommand(() => data.command);
    };
    const onKeydown = (data: { event: KeyboardEvent }) => {
      slashMenuRef.current?.onKeyDown(data.event);
    };
    const onClose = () => { setSlashOpen(false); };

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
  }, []); // bus is a module-level singleton — no dependency needed

  // Page link event listeners — pageLinkEventBus (lib/pageLinkEventBus.ts),
  // emitted by PageLinkSuggestion in extensions/PageLink.ts.
  useEffect(() => {
    const onOpen = (data: PageLinkOpenPayload) => {
      // Store the ProseMirror range in a ref — needed by handlePageLinkSelect
      // to delete "[[query" before inserting the node. Using a ref avoids
      // a re-render on every keystroke while the popup is open.
      pageLinkRangeRef.current = data.range;
      setPageLinkQuery(data.query);
      setPageLinkRect(data.rect);
      setPageLinkOpen(true);
    };
    const onKeydown = (data: { event: KeyboardEvent }) => {
      // Delegate ArrowUp / ArrowDown / Enter to the popup's imperative handle
      pageLinkPopupRef.current?.onKeyDown(data.event);
    };
    const onClose = () => {
      setPageLinkOpen(false);
      pageLinkRangeRef.current = null;
    };

    pageLinkEventBus.on('pagelink:open',    onOpen);
    pageLinkEventBus.on('pagelink:keydown', onKeydown);
    pageLinkEventBus.on('pagelink:close',   onClose);

    return () => {
      pageLinkEventBus.off('pagelink:open',    onOpen);
      pageLinkEventBus.off('pagelink:keydown', onKeydown);
      pageLinkEventBus.off('pagelink:close',   onClose);
    };
  }, []); // bus is a module-level singleton — no dependency needed

  // Update content when initialContent changes (page navigation)
  useEffect(() => {
    if (editor && initialContent) {
      // Only update if the content is actually different (avoids cursor jump)
      const current = JSON.stringify(editor.getJSON());
      const next    = JSON.stringify(initialContent);
      if (current !== next) {
        editor.commands.setContent(initialContent);
      }
    }
  }, [editor, initialContent]);

  // Stop any active recording if the component unmounts
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Clear hover timers on unmount
  useEffect(() => {
    return () => { clearHoverTimer(); cancelDismiss(); };
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VOICE TO TEXT — Web Speech API (Chrome/Edge) + Whisper fallback
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // Strategy:
  //   Chrome/Edge → native Web Speech API (free, real-time, no server call)
  //   Firefox + all others → MediaRecorder → POST /api/ai/transcribe/ → whisper-1
  //
  // The mic button is ALWAYS shown. No browser gating, no alert(), no crash.

  // Detect native Speech API support once (constant across the component lifetime)
  const useNativeSpeech =
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in (window as any));

  /** Start native (Chrome/Edge) speech recognition */
  function startNativeSpeech() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = new SpeechRecognitionCtor();
    r.continuous     = true;
    r.interimResults = false;
    r.lang           = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      const text: string = e.results[e.results.length - 1][0].transcript;
      editor?.chain().focus().insertContent(text + ' ').run();
    };
    r.onerror = () => setIsRecording(false);
    r.onend   = () => setIsRecording(false);

    r.start();
    recognitionRef.current = r;
    setIsRecording(true);
  }

  /**
   * Start recording via MediaRecorder, then send to Whisper when stopped.
   * Used as fallback for Firefox and any browser without the Web Speech API.
   */
  async function startWhisperRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Release the microphone immediately after recording stops
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);

        // Send to backend Whisper endpoint
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        try {
          const res = await fetch('/api/ai/transcribe/', {
            method:  'POST',
            headers: { Authorization: `Bearer ${getAccessToken()}` },
            body:    formData,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { text } = await res.json();
          if (text) editor?.chain().focus().insertContent(text + ' ').run();
        } catch {
          toast.error('Transcription failed. Please try again.');
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error('Microphone access denied.');
    }
  }

  /** Toggle voice input — stops if recording, starts via the correct path if not */
  function toggleVoice() {
    if (isRecording) {
      // Stop whichever recorder is currently active
      if (useNativeSpeech) {
        recognitionRef.current?.stop();
      } else {
        mediaRecorderRef.current?.stop();
      }
      setIsRecording(false);
      return;
    }

    if (useNativeSpeech) {
      startNativeSpeech();
    } else {
      startWhisperRecording();
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EVENT HANDLERS — mouse tracking, block handle, page link selection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!editor || readOnly) {
      setBlockHandle(null);
      return;
    }

    // Walk up from the hovered element to find
    // a direct child of ProseMirror (= a block node)
    let node = e.target as HTMLElement;
    while (node && node.parentElement) {
      if (node.parentElement.classList.contains('ProseMirror')) break;
      node = node.parentElement;
    }

    // Not hovering inside editor content — return silently to preserve the handle
    // while the mouse crosses the left padding area toward the buttons.
    // onMouseLeave (with 100ms delay) is the sole mechanism that clears the handle.
    if (!node?.parentElement?.classList.contains('ProseMirror')) {
      return;
    }

    // Get position relative to the container div (position:relative)
    const containerRect = e.currentTarget.getBoundingClientRect();
    const nodeRect      = node.getBoundingClientRect();
    const top = nodeRect.top - containerRect.top + nodeRect.height / 2 - 10;

    // Get ProseMirror document position for insertContentAt
    let nodePos: number;
    try {
      nodePos = editor.view.posAtDOM(node, 0);
    } catch {
      setBlockHandle(null);
      return;
    }

    // Direct ProseMirror children for lists are <ul>/<ol>; closest('li') catches nested lists
    const isListItem = node.tagName === 'UL' ||
                       node.tagName === 'OL' ||
                       node.tagName === 'LI' ||
                       node.closest('li') !== null;

    setBlockHandle({ top, nodePos, isListItem });
  }

  /** Drop handler — moves a dragged block to the drop position */
  function handleBlockDrop(e: React.DragEvent<HTMLDivElement>) {
    const fromPosStr = e.dataTransfer.getData('application/nexus-block');
    if (!fromPosStr) return;

    e.preventDefault();
    e.stopPropagation();

    if (!editor) return;

    const fromPos = parseInt(fromPosStr, 10);
    if (isNaN(fromPos)) return;

    const view  = editor.view;
    const state = view.state;

    // Get the drop target position
    const toCoords = view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (!toCoords) return;

    // Resolve the FROM position to get the top-level block
    const $from     = state.doc.resolve(fromPos);
    // depth 0 = doc, depth 1 = top-level block
    const blockStart = $from.before(1);
    const blockEnd   = $from.after(1);
    const node       = state.doc.nodeAt(blockStart);
    if (!node) return;

    // Resolve the TO position to get the target top-level block boundary
    const $to       = state.doc.resolve(toCoords.pos);
    let insertPos   = $to.before(1);

    // If dropping below the midpoint of the target block, insert after it
    const targetDOM = view.nodeDOM($to.before(1));
    if (targetDOM instanceof HTMLElement) {
      const rect = targetDOM.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY > midY) {
        insertPos = $to.after(1);
      }
    }

    // Do not move if source and target are the same block
    if (insertPos === blockStart || insertPos === blockEnd) return;

    // Build transaction: delete from old position, insert at new position.
    // Adjust insert position if it comes after the deleted block.
    const adjustedInsert = insertPos > blockEnd
      ? insertPos - node.nodeSize
      : insertPos;

    const tr = state.tr
      .delete(blockStart, blockEnd)
      .insert(adjustedInsert, node);

    view.dispatch(tr);
  }

  function handleBlockDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  /**
   * handlePageLinkSelect — called when the user picks a page from the popup.
   *
   * Steps:
   *   1. Delete the "[[query" text that triggered the popup (using stored range)
   *   2. Insert a PageLinkNode chip with the selected page's id and title
   *   3. Close the popup and clear the stored range
   *   4. Record the connection in the backend (fire-and-forget with logged error)
   *
   * useCallback: editor and workspaceId/pageId are stable across re-renders
   * triggered by the popup's own state (query, selectedIndex).
   */
  const handlePageLinkSelect = useCallback((page: Page) => {
    if (!editor || !pageLinkRangeRef.current) return;

    editor
      .chain()
      .focus()
      // Delete the "[[query" text the user typed (range from the suggestion plugin)
      .deleteRange(pageLinkRangeRef.current)
      // Insert the inline node chip that renders as [[Page Title]]
      .insertContent({
        type: 'pageLink',
        attrs: {
          pageid:      page.id,
          pagetitle:   page.title || 'Untitled',
          workspaceid: workspaceId,
        },
      })
      .run();

    // Close popup and clear the stored range
    setPageLinkOpen(false);
    pageLinkRangeRef.current = null;

    // Record the connection in the backend, then refresh backlinks + graph.
    // Backend upserts so calling this twice for the same pair is safe.
    relationsApi.createLink(pageId, page.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['backlinks', pageId] });
        queryClient.invalidateQueries({ queryKey: ['workspace-graph', workspaceId] });
      })
      .catch((err) => console.warn('Failed to create page link:', err));
  }, [editor, workspaceId, pageId, queryClient]);

  // ── Hover card helpers ───────────────────────────────────────────────────

  function clearHoverTimer() {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  }
  function startDismiss() {
    dismissTimerRef.current = setTimeout(() => setHoveredPageId(null), 100);
  }
  function cancelDismiss() {
    if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null; }
  }

  function handleEditorMouseOver(e: React.MouseEvent<HTMLDivElement>) {
    const chip = (e.target as HTMLElement).closest('.page-link-node') as HTMLElement | null;
    if (!chip) return;
    cancelDismiss();
    if (hoverTimerRef.current) return; // already counting down
    hoverTimerRef.current = setTimeout(() => {
      const rect = chip.getBoundingClientRect();
      const pid  = chip.getAttribute('data-page-id');
      const wid  = chip.getAttribute('data-workspace-id');
      if (pid && wid) {
        setHoveredPageId(pid);
        setHoveredChipRect(rect);
        setHoveredWorkspaceId(wid);
      }
      hoverTimerRef.current = null;
    }, 500);
  }

  function handleEditorMouseOut(e: React.MouseEvent<HTMLDivElement>) {
    const chip        = (e.target as HTMLElement).closest('.page-link-node') as HTMLElement | null;
    const relatedChip = (e.relatedTarget as HTMLElement | null)?.closest?.('.page-link-node');
    if (chip && !relatedChip) {
      clearHoverTimer();
      startDismiss();
    }
  }

  /**
   * handleEditorClick — event delegation for clicking [[Page Title]] chips.
   *
   * Instead of attaching an onClick to every chip (which would require a
   * ReactNodeViewRenderer and complicate the node definition), we use a single
   * click handler on the editor container and walk up from the target.
   * This is the same pattern browsers use for link handling.
   */
  function handleEditorClick(e: React.MouseEvent<HTMLDivElement>) {
    const chip = (e.target as HTMLElement).closest('.page-link-node') as HTMLElement | null;
    if (!chip) return; // normal click — not on a page link chip

    const linkedPageId      = chip.getAttribute('data-page-id');
    const linkedWorkspaceId = chip.getAttribute('data-workspace-id');
    if (!linkedPageId || !linkedWorkspaceId) return;

    // Navigate to the linked page
    router.push(`/${linkedWorkspaceId}/${linkedPageId}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER — editor layout with toolbar, content, slash menu, page link popup
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (!editor) return null;

  return (
    <div
      className="relative pl-14"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setTimeout(() => setBlockHandle(null), 1000); }}
      onMouseOver={handleEditorMouseOver}
      onMouseOut={handleEditorMouseOut}
      onDrop={handleBlockDrop}
      onDragOver={handleBlockDragOver}
      onClick={handleEditorClick}
    >
      {/* ── Block handle — "+" button beside the hovered block ───────────── */}
      {blockHandle && !readOnly && (
        <AddBlockHandle
          top={blockHandle.top}
          nodePos={blockHandle.nodePos}
          isListItem={blockHandle.isListItem}
          editor={editor as TipTapEditor}
          onMouseLeave={() => setBlockHandle(null)}
          onAdd={() => {
            const node = editor.state.doc.nodeAt(blockHandle.nodePos);
            if (!node) return;
            const insertPos = blockHandle.nodePos + node.nodeSize;
            editor.chain().focus().insertContentAt(insertPos, { type: 'paragraph' }).run();
            setBlockHandle(null);
          }}
        />
      )}

      {/* ── Save status indicator ─────────────────────────────────────────── */}
      {status !== 'idle' && (
        <div
          className={[
            'absolute right-0 top-0 flex items-center gap-1.5 text-xs transition-opacity',
            status === 'saving' ? 'text-neutral-500' : 'text-violet-400',
          ].join(' ')}
        >
          {status === 'saving' ? (
            <><Clock size={11} className="animate-pulse" /> Saving…</>
          ) : (
            <><CheckCheck size={11} /> Saved</>
          )}
        </div>
      )}

      {/* ── Inline format toolbar ─────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-0.5 border-b border-neutral-800/60 pb-2">
        {/* Text style */}
        <BubbleButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold (⌘B)"
        >
          <Bold size={13} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic (⌘I)"
        >
          <Italic size={13} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive('code')}
          title="Inline code"
        >
          <Code size={13} />
        </BubbleButton>

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        {/* Headings */}
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <span className="text-[11px] font-bold">H1</span>
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <span className="text-[11px] font-bold">H2</span>
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <span className="text-[11px] font-bold">H3</span>
        </BubbleButton>

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        {/* Lists */}
        <BubbleButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List size={13} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive('taskList')}
          title="To-do list"
        >
          <CheckSquare size={13} />
        </BubbleButton>

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        {/* Highlight — toggles violet background on selected text */}
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#7c3aed33' }).run()}
          isActive={editor.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter size={13} />
        </BubbleButton>

        {/* Text color — native color picker */}
        <ColorPickerButton
          title="Text color"
          onChange={(color) => editor.chain().focus().setColor(color).run()}
          onReset={() => editor.chain().focus().unsetColor().run()}
        />

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        {/* Voice-to-text — Chrome/Edge: native; Firefox+others: Whisper */}
        <BubbleButton
          onClick={toggleVoice}
          isActive={isRecording}
          title={isRecording ? 'Stop recording' : 'Voice to text'}
        >
          {isRecording
            ? <MicOff size={13} className="text-red-400 animate-pulse" />
            : <Mic size={13} />}
        </BubbleButton>
      </div>

      {/* ── Code block toolbar — appears when cursor is inside a code block ── */}
      {isInCodeBlock && onCodeAction && (
        <div className="absolute top-0 right-0 z-20 flex items-center gap-1 rounded-lg
                        border border-neutral-700 bg-neutral-900 px-2 py-1 shadow-lg">
          <span className="mr-1 text-[10px] text-neutral-500">Code:</span>
          {(['explain_code', 'add_comments', 'fix_code'] as const).map((type) => (
            <button
              key={type}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onCodeAction(type, getCodeBlockText())}
              className="rounded px-1.5 py-0.5 text-xs text-neutral-400
                         hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            >
              {({ explain_code: '🔍 Explain', add_comments: '💬 Comment', fix_code: '🐛 Fix' } as Record<string, string>)[type]}
            </button>
          ))}
        </div>
      )}

      {/* ── Editor content ────────────────────────────────────────────────── */}
      <div className="tiptap-editor">
        <EditorContent editor={editor} />
      </div>

      {/* ── Slash command menu ────────────────────────────────────────────── */}
      {slashOpen && (
        <SlashMenuPortal rect={slashRect}>
          <SlashMenuList
            ref={slashMenuRef}
            items={slashItems}
            command={(item) => {
              slashCommand?.(item);
              setSlashOpen(false);
            }}
          />
        </SlashMenuPortal>
      )}

      {/* ── Page link popup — shown when user types [[ in the editor ──────── */}
      {pageLinkOpen && (
        <PageLinkPopup
          ref={pageLinkPopupRef}
          query={pageLinkQuery}
          rect={pageLinkRect}
          pages={workspacePages}
          onSelect={handlePageLinkSelect}
          onClose={() => setPageLinkOpen(false)}
        />
      )}

      {/* ── Hover card — shown 500ms after hovering a [[Page Link]] chip ───── */}
      {hoveredPageId && hoveredChipRect && hoveredWorkspaceId && (
        <PageHoverCard
          pageId={hoveredPageId}
          workspaceId={hoveredWorkspaceId}
          anchorRect={hoveredChipRect}
          onMouseEnter={cancelDismiss}
          onMouseLeave={startDismiss}
        />
      )}
    </div>
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOOLBAR COMPONENTS — BubbleButton and ColorPickerButton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BubbleButton({
  children,
  onClick,
  isActive,
  title,
}: {
  children: React.ReactNode;
  onClick:  () => void;
  isActive: boolean;
  title:    string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors',
        isActive
          ? 'bg-violet-600/40 text-violet-300'
          : 'text-neutral-400 hover:bg-white/10 hover:text-neutral-200',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ColorPickerButton({
  onChange,
  onReset,
  title,
}: {
  onChange: (color: string) => void;
  onReset:  () => void;
  title:    string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <button
        onClick={() => inputRef.current?.click()}
        title={title}
        className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
        onContextMenu={(e) => { e.preventDefault(); onReset(); }}
      >
        <Palette size={13} />
      </button>
      {/* Right-click the palette button to reset color to default */}
      <input
        ref={inputRef}
        type="color"
        className="absolute left-0 top-0 h-0 w-0 opacity-0"
        onChange={(e) => onChange(e.target.value)}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
