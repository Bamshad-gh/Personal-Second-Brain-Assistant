/**
 * components/editor/SlashMenu.tsx
 *
 * What:    The slash command palette rendered by the SlashCommand TipTap extension.
 *          Shows when the user types "/" in the editor, lets them pick a block type.
 *
 * Architecture:
 *   Old: command() ran TipTap node commands (heading, bulletList, etc.).
 *        These fail in DocumentEditor's TextBlock because StarterKit disables
 *        those node types (heading: false, bulletList: false, etc.).
 *   New: command() only deletes the '/' trigger character. The actual block type
 *        change is communicated via `item.blockType` — DocumentEditor reads this
 *        field in its slash command handler and calls onUpdateBlock({ block_type }).
 *
 * blockType field:
 *   Each SlashCommandItem optionally carries a `blockType` string that maps
 *   directly to the backend block_type registry key. DocumentEditor uses this
 *   to change the focused block's type via onUpdateBlock, or to create a new
 *   block (for types like 'divider' where you always want a fresh block).
 *
 * Exports:
 *   COMMANDS        — the full command list (used by SlashCommand.ts for filtering)
 *   SlashMenuList   — the React component (mounted by SlashCommand.ts via ReactRenderer)
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
  FileText, Video, Table2,
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
  /**
   * The backend block_type this command maps to.
   * DocumentEditor reads this to call onUpdateBlock({ block_type }) on the
   * focused block, or onCreateBlock for block types that are always new
   * (e.g. 'divider'). Undefined = no block type change (future use).
   */
  blockType?:  string;
  /** Receives the TipTap editor instance — only deletes '/' trigger. */
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
// Shared command function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * No-op. The '/' trigger range is already deleted by SlashCommand.ts's
 * `command` callback via `editor.chain().focus().deleteRange(range).run()`
 * before this function is called. A second deleteRange attempt would corrupt
 * real content immediately after the trigger.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function deleteSlashTrigger(_editor: Editor): void {
  // Intentionally empty — deletion handled by SlashCommand extension
}

// ─────────────────────────────────────────────────────────────────────────────
// Command list
// ─────────────────────────────────────────────────────────────────────────────

export const COMMANDS: SlashCommandItem[] = [
  // ── Basic Blocks ──────────────────────────────────────────────────────────
  {
    id:          'text',
    label:       'Text',
    description: 'Plain paragraph',
    group:       'Basic Blocks',
    icon:        <Type size={15} />,
    blockType:   'paragraph',
    command:     deleteSlashTrigger,
  },
  {
    id:          'heading1',
    label:       'Heading 1',
    description: 'Large section title',
    group:       'Basic Blocks',
    icon:        <Heading1 size={15} />,
    blockType:   'heading1',
    command:     deleteSlashTrigger,
  },
  {
    id:          'heading2',
    label:       'Heading 2',
    description: 'Medium sub-heading',
    group:       'Basic Blocks',
    icon:        <Heading2 size={15} />,
    blockType:   'heading2',
    command:     deleteSlashTrigger,
  },
  {
    id:          'heading3',
    label:       'Heading 3',
    description: 'Small sub-section',
    group:       'Basic Blocks',
    icon:        <Heading3 size={15} />,
    blockType:   'heading3',
    command:     deleteSlashTrigger,
  },
  {
    id:          'bullet',
    label:       'Bullet List',
    description: 'Unordered list item',
    group:       'Basic Blocks',
    icon:        <List size={15} />,
    blockType:   'bullet_item',
    command:     deleteSlashTrigger,
  },
  {
    id:          'numbered',
    label:       'Numbered List',
    description: 'Ordered list item',
    group:       'Basic Blocks',
    icon:        <ListOrdered size={15} />,
    blockType:   'numbered_item',
    command:     deleteSlashTrigger,
  },
  {
    id:          'todo',
    label:       'To-do',
    description: 'Checkbox task item',
    group:       'Basic Blocks',
    icon:        <CheckSquare size={15} />,
    blockType:   'todo_item',
    command:     deleteSlashTrigger,
  },
  {
    id:          'toggle',
    label:       'Toggle',
    description: 'Collapsible section',
    group:       'Basic Blocks',
    icon:        <ChevronRight size={15} />,
    blockType:   'callout',
    command:     deleteSlashTrigger,
  },
  {
    id:          'quote',
    label:       'Quote',
    description: 'Indented blockquote',
    group:       'Basic Blocks',
    icon:        <Quote size={15} />,
    blockType:   'quote',
    command:     deleteSlashTrigger,
  },
  {
    id:          'divider',
    label:       'Divider',
    description: 'Horizontal rule',
    group:       'Basic Blocks',
    icon:        <Minus size={15} />,
    blockType:   'divider',
    command:     deleteSlashTrigger,
  },

  // ── Media & Code ──────────────────────────────────────────────────────────
  {
    id:          'code',
    label:       'Code Block',
    description: 'Syntax-highlighted code',
    group:       'Media & Code',
    icon:        <Code size={15} />,
    blockType:   'code',
    command:     deleteSlashTrigger,
  },
  {
    id:          'image',
    label:       'Image',
    description: 'Upload from your computer',
    group:       'Media & Code',
    icon:        <Image size={15} />,
    blockType:   'image',
    command:     deleteSlashTrigger,
  },
  {
    id:          'pdf',
    label:       'PDF',
    description: 'Embed a PDF document',
    group:       'Media & Code',
    icon:        <FileText size={15} />,
    blockType:   'pdf',
    command:     deleteSlashTrigger,
  },
  {
    id:          'video',
    label:       'Video',
    description: 'Embed a video',
    group:       'Media & Code',
    icon:        <Video size={15} />,
    blockType:   'video',
    command:     deleteSlashTrigger,
  },
  {
    id:          'table',
    label:       'Table',
    description: 'Insert a table',
    group:       'Media & Code',
    icon:        <Table2 size={15} />,
    blockType:   'table',
    command:     deleteSlashTrigger,
  },

  // ── Advanced ──────────────────────────────────────────────────────────────
  {
    id:          'callout',
    label:       'Callout',
    description: 'Highlighted callout box',
    group:       'Advanced',
    icon:        <Lightbulb size={15} />,
    blockType:   'callout',
    command:     deleteSlashTrigger,
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
                const isSelected   = globalIndex === selectedIndex;
                const currentIndex = globalIndex;
                globalIndex++;

                return (
                  <button
                    key={item.id}
                    ref={isSelected ? selectedRef : undefined}
                    onClick={() => command(item)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    className={`slash-menu-item${isSelected ? ' selected' : ''}`}
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
