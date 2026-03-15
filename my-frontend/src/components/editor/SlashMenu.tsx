/**
 * components/editor/SlashMenu.tsx
 *
 * What:    The slash command palette rendered by the SlashCommand TipTap extension.
 *          Shows when the user types "/" in the editor, lets them pick a block type.
 *
 * Architecture change from v1:
 *   Old: Editor.tsx detected "/" in onUpdate, positioned the menu via DOM rects,
 *        handled keyboard events via a global listener. Unreliable.
 *   New: SlashCommand.ts (the extension) uses @tiptap/suggestion — a proper
 *        ProseMirror plugin. It calls this component's imperative ref for
 *        keyboard events and passes filtered items as props.
 *
 * Exports:
 *   COMMANDS       — the full command list (used by SlashCommand.ts for filtering)
 *   SlashMenuList  — the React component (mounted by SlashCommand.ts via ReactRenderer)
 *   SlashMenuHandle — the ref type (onKeyDown delegate)
 *   SlashCommandItem — the command shape
 *
 * To add a command:  add an entry to COMMANDS below with a `command` function.
 * To add a group:    add a new string to the group union type.
 * To reorder items:  move entries in the COMMANDS array (group headers auto-generate).
 */

'use client';

import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { Editor } from '@tiptap/react';
import {
  Type, Heading1, Heading2, Heading3,
  Code, Quote, CheckSquare, Minus,
  List, ListOrdered, ChevronRight, Image, Lightbulb,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** The group header label shown above each section in the menu */
type SlashCommandGroup = 'Basic Blocks' | 'Media & Code' | 'Advanced';

export interface SlashCommandItem {
  id:          string;
  label:       string;
  description: string;
  group:       SlashCommandGroup;
  icon:        React.ReactNode;
  /** Receives the TipTap editor instance and inserts the block */
  command:     (editor: Editor) => void;
}

/**
 * Imperative handle exposed by SlashMenuList via forwardRef.
 * SlashCommand.ts calls onKeyDown() to delegate Arrow/Enter key handling
 * from the ProseMirror plugin to this React component.
 */
export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All available slash commands.
 *
 * IMPORTANT: use setNode() / toggleXxx() carefully.
 * setNode() is safer when the current node may not be a paragraph (heading, etc.)
 * because it always sets the type regardless of the current state.
 * toggleXxx() flips between active/inactive, which can cause unexpected results
 * when the cursor is already inside a different block type.
 *
 * Image and Callout are placeholders — Phase 2 will implement them.
 */
export const COMMANDS: SlashCommandItem[] = [
  // ── Basic Blocks ──────────────────────────────────────────────────────────
  {
    id: 'text',
    label: 'Text',
    description: 'Plain paragraph',
    group: 'Basic Blocks',
    icon: <Type size={15} />,
    command: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section title',
    group: 'Basic Blocks',
    icon: <Heading1 size={15} />,
    command: (e) => e.chain().focus().setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium sub-heading',
    group: 'Basic Blocks',
    icon: <Heading2 size={15} />,
    command: (e) => e.chain().focus().setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small sub-section',
    group: 'Basic Blocks',
    icon: <Heading3 size={15} />,
    command: (e) => e.chain().focus().setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Unordered list',
    group: 'Basic Blocks',
    icon: <List size={15} />,
    command: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'Numbered List',
    description: 'Ordered list',
    group: 'Basic Blocks',
    icon: <ListOrdered size={15} />,
    command: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'todo',
    label: 'To-do List',
    description: 'Checkbox task items',
    group: 'Basic Blocks',
    icon: <CheckSquare size={15} />,
    command: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'toggle',
    label: 'Toggle',
    description: 'Collapsible section',
    group: 'Basic Blocks',
    icon: <ChevronRight size={15} />,
    command: (e) =>
      e.chain().focus().insertContent({
        type: 'toggleBlock',
        attrs: { open: true },
        content: [{ type: 'paragraph' }],
      }).run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Indented blockquote',
    group: 'Basic Blocks',
    icon: <Quote size={15} />,
    command: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    group: 'Basic Blocks',
    icon: <Minus size={15} />,
    command: (e) => e.chain().focus().setHorizontalRule().run(),
  },

  // ── Media & Code ──────────────────────────────────────────────────────────
  {
    id: 'code',
    label: 'Code Block',
    description: 'Syntax-highlighted code',
    group: 'Media & Code',
    icon: <Code size={15} />,
    // setCodeBlock is provided by CustomCodeBlock (CodeBlockLowlight)
    command: (e) => e.chain().focus().setCodeBlock({ language: 'plaintext' }).run(),
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Upload from your computer',
    group: 'Media & Code',
    icon: <Image size={15} />,
    // Opens a native file picker; reads as base64 and inserts an image node.
    // Phase 2 will replace base64 with a Django upload endpoint.
    command: (editor) => {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (src) editor.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },

  // ── Advanced ──────────────────────────────────────────────────────────────
  {
    id: 'callout',
    label: 'Callout',
    description: 'Coming soon',
    group: 'Advanced',
    icon: <Lightbulb size={15} />,
    command: () => {}, // Phase 2
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SlashMenuList component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props shape coming from @tiptap/suggestion's render lifecycle.
 * `items`   — filtered list (already narrowed by the query)
 * `command` — call this with an item to select it (triggers extension's command())
 */
interface SlashMenuListProps {
  items:   SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

/**
 * The actual popup component.
 *
 * Uses forwardRef so SlashCommand.ts can call component.ref.onKeyDown(event)
 * to delegate keyboard events from the ProseMirror plugin to this component.
 *
 * Keyboard behaviour:
 *   ArrowDown  — move selection down (wraps)
 *   ArrowUp    — move selection up (wraps)
 *   Enter      — execute selected command
 *   Escape     — handled in SlashCommand.ts before reaching here
 */
export const SlashMenuList = forwardRef<SlashMenuHandle, SlashMenuListProps>(
  function SlashMenuList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const selectedRef = useRef<HTMLButtonElement>(null);

    // Reset selection when the filtered list changes (user typed a new char)
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    // Scroll the selected item into view whenever it changes
    useEffect(() => {
      selectedRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    // Expose keyboard handler to SlashCommand.ts via the imperative ref
    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent): boolean => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="slash-menu animate-fade-in" onMouseDown={(e) => e.preventDefault()}>
          <p className="slash-menu-group">No commands match</p>
        </div>
      );
    }

    // Build an ordered list of groups that actually have items
    const groups: SlashCommandGroup[] = [];
    for (const item of items) {
      if (!groups.includes(item.group)) groups.push(item.group);
    }

    let globalIndex = 0; // tracks flat index across groups for keyboard nav

    return (
      <div className="slash-menu animate-fade-in" onMouseDown={(e) => e.preventDefault()}>
        {groups.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          return (
            <div key={group}>
              <p className="slash-menu-group">{group}</p>

              {groupItems.map((item) => {
                const isSelected = globalIndex === selectedIndex;
                const currentIndex = globalIndex;
                globalIndex++;

                return (
                  <button
                    key={item.id}
                    ref={isSelected ? selectedRef : undefined}
                    onClick={() => command(item)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    className={`slash-menu-item${isSelected ? ' selected' : ''}${item.command.toString() === '() => {}' ? ' opacity-40 cursor-default' : ''}`}
                  >
                    <span className="slash-menu-item-icon">{item.icon}</span>
                    <span className="slash-menu-item-text">
                      <span className="slash-menu-item-label">{item.label}</span>
                      <span className="slash-menu-item-desc">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  },
);
