/**
 * components/properties/PropertyBar.tsx
 *
 * What:    Horizontal pill row of typed metadata fields shown below the page title.
 *          Each pill shows [icon] [name]: [value].
 *          Clicking the value opens an inline editor.
 *          "+ Add property" lets the user create a new typed field.
 *
 * Props:
 *   workspaceId — for loading PropertyDefinitions + creating new ones
 *   pageId      — for loading + saving PropertyValues
 *   readOnly    — when true (locked page), all pills are non-interactive
 *
 * "Add property" flow:
 *   1. Click "+ Add property" → type picker popover
 *   2. Click a type → name input appears
 *      For select/multi: also shows OptionsBuilder to add options before saving
 *   3. Click "Add" / "Create property" → definition created, popover closes
 *
 * Pill "..." menu:
 *   - Rename         — inline name edit
 *   - Edit options   — (select/multi only) opens OptionsBuilder to add/remove options
 *   - Delete         — removes the definition (and all its values via CASCADE)
 *
 * Portal strategy:
 *   Both the "Add property" popover and the "Edit options" popover are rendered
 *   via createPortal to document.body so they escape overflow:hidden ancestors
 *   (e.g. the canvas-mode flex container) and sit above TipTap stacking contexts.
 *   Position is anchored via getBoundingClientRect() on the trigger element.
 *   Mount guard uses useState+useEffect — never typeof document !== 'undefined'.
 *
 * Color palette for options (auto-cycled by index):
 *   #3b82f6 blue | #22c55e green | #f59e0b yellow
 *   #ef4444 red  | #a855f7 purple | #06b6d4 cyan
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal }                from 'react-dom';
import { Plus, MoreHorizontal, Trash2, Pencil, Settings } from 'lucide-react';
import {
  usePropertyDefinitions,
  usePropertyValues,
  useCreateDefinition,
  useUpdateDefinition,
  useDeleteDefinition,
} from '@/hooks/useProperties';
import { PropertyValue } from './PropertyValue';
import { DropdownMenu }  from '@/components/ui/DropdownMenu';
import type { PropType, SelectOption } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

interface PropertyBarProps {
  workspaceId:       string;
  pageId:            string;
  readOnly?:         boolean;
  customPageTypeId?: string | null;
}

export const PROP_TYPE_OPTIONS: Array<{ type: PropType; label: string; icon: string }> = [
  { type: 'text',     label: 'Text',         icon: 'T'  },
  { type: 'number',   label: 'Number',       icon: '#'  },
  { type: 'date',     label: 'Date',         icon: '📅' },
  { type: 'checkbox', label: 'Checkbox',     icon: '☑'  },
  { type: 'select',   label: 'Select',       icon: '▾'  },
  { type: 'multi',    label: 'Multi-select', icon: '▾▾' },
  { type: 'url',      label: 'URL',          icon: '🔗' },
  { type: 'email',    label: 'Email',        icon: '@'  },
  { type: 'phone',    label: 'Phone',        icon: '📞' },
  { type: 'currency', label: 'Currency',     icon: '$'  },
];

// Cycles automatically as options are added: index % 6
export const OPTION_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];

function propTypeIcon(type: PropType): string {
  return PROP_TYPE_OPTIONS.find((o) => o.type === type)?.icon ?? '·';
}

function isSelectType(type: PropType): boolean {
  return type === 'select' || type === 'multi';
}

// ─────────────────────────────────────────────────────────────────────────────
// OptionsBuilder — shared sub-component for building option lists
// ─────────────────────────────────────────────────────────────────────────────

interface OptionsBuilderProps {
  options:  SelectOption[];
  onChange: (opts: SelectOption[]) => void;
}

export function OptionsBuilder({ options, onChange }: OptionsBuilderProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addOption() {
    const label = input.trim();
    if (!label) return;
    const color = OPTION_COLORS[options.length % OPTION_COLORS.length];
    onChange([...options, { label, color }]);
    setInput('');
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Existing options */}
      {options.length > 0 && (
        <div className="flex flex-col gap-1">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
              <span className="flex-1 truncate text-xs text-neutral-300">{opt.label}</span>
              <button
                type="button"
                onClick={() => onChange(options.filter((_, j) => j !== i))}
                className="text-neutral-600 hover:text-neutral-400 transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add option row */}
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addOption(); }
            e.stopPropagation();
          }}
          placeholder="Add option…"
          className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none border border-neutral-700 focus:border-violet-500 transition-colors"
        />
        <button
          type="button"
          onClick={addOption}
          disabled={!input.trim()}
          className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600 disabled:opacity-40 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertyBar
// ─────────────────────────────────────────────────────────────────────────────

export function PropertyBar({ workspaceId, pageId, readOnly = false, customPageTypeId }: PropertyBarProps) {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DATA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const { data: definitions = [] } = usePropertyDefinitions(workspaceId);
  const { data: values = [] }      = usePropertyValues(pageId);

  const createDef = useCreateDefinition(workspaceId);
  const updateDef = useUpdateDefinition(workspaceId);
  const deleteDef = useDeleteDefinition(workspaceId);

  // Filter definitions to those relevant to this page's type.
  // Show a definition when:
  //   - it is marked global (appears on every page regardless of type), OR
  //   - a custom type is set and the definition is scoped to that type, OR
  //   - no custom type is set and the definition is not scoped to any type
  const visibleDefinitions = definitions.filter(
    (def) =>
      def.is_global ||
      (customPageTypeId
        ? def.custom_page_type === customPageTypeId
        : !def.custom_page_type),
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PORTAL MOUNT GUARD
  // useState+useEffect only — never typeof document !== 'undefined'
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // "ADD PROPERTY" POPOVER STATE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const [addOpen,    setAddOpen]    = useState(false);
  const [pickedType, setPickedType] = useState<PropType | null>(null);
  const [newName,    setNewName]    = useState('');
  const [newOptions, setNewOptions] = useState<SelectOption[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Portal anchor + container refs
  const addBtnRef    = useRef<HTMLButtonElement>(null);
  const addPortalRef = useRef<HTMLDivElement>(null);
  const [addPos, setAddPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (pickedType) nameInputRef.current?.focus();
  }, [pickedType]);

  function closeAddPopover() {
    setAddOpen(false);
    setPickedType(null);
    setNewName('');
    setNewOptions([]);
  }

  function handleAddProperty() {
    const trimmed = newName.trim();
    if (!trimmed || !pickedType) return;
    createDef.mutate(
      {
        workspace:        workspaceId,
        name:             trimmed,
        prop_type:        pickedType,
        options:          newOptions,
        order:            visibleDefinitions.length,
        custom_page_type: customPageTypeId ?? null,
      },
      { onSuccess: closeAddPopover },
    );
  }

  // Click-outside — closes "Add property" popover when clicking outside both
  // the trigger button and the portal div.
  useEffect(() => {
    if (!addOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (addBtnRef.current?.contains(e.target as Node)) return;
      if (addPortalRef.current?.contains(e.target as Node)) return;
      closeAddPopover();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [addOpen]);

  // Escape key — closes "Add property" popover
  useEffect(() => {
    if (!addOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAddPopover();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [addOpen]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENAME STATE (inline on pill)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal,  setRenameVal]  = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameVal.trim();
    if (trimmed) updateDef.mutate({ id: renamingId, payload: { name: trimmed } });
    setRenamingId(null);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // "EDIT OPTIONS" POPOVER STATE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const [editingOptionsId, setEditingOptionsId] = useState<string | null>(null);
  const [editOptions,      setEditOptions]      = useState<SelectOption[]>([]);

  // pillRefs — Map<defId, HTMLElement> so we can anchor the "Edit options"
  // portal to the pill that triggered it, even though the trigger fires from
  // inside the DropdownMenu callback (which closes the dropdown first).
  const pillRefs    = useRef<Map<string, HTMLElement>>(new Map());
  const editPortalRef = useRef<HTMLDivElement>(null);
  const [editPos, setEditPos] = useState({ top: 0, left: 0 });

  // Click-outside — closes "Edit options" portal
  useEffect(() => {
    if (!editingOptionsId) return;
    function onMouseDown(e: MouseEvent) {
      if (editPortalRef.current?.contains(e.target as Node)) return;
      setEditingOptionsId(null);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [editingOptionsId]);

  // Escape key — closes "Edit options" portal
  useEffect(() => {
    if (!editingOptionsId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setEditingOptionsId(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editingOptionsId]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (visibleDefinitions.length === 0 && readOnly) return null;

  // Resolve the definition being edited (for the portal content)
  const editingDef = editingOptionsId
    ? definitions.find((d) => d.id === editingOptionsId)
    : null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">

      {/* ── One pill per definition ──────────────────────────────────────── */}
      {visibleDefinitions.map((def) => {
        const val = values.find((v) => v.definition === def.id);

        const menuItems = [
          {
            label:   'Rename',
            icon:    <Pencil size={13} />,
            onClick: () => { setRenameVal(def.name); setRenamingId(def.id); },
          },
          // "Edit options" only for select / multi
          ...(isSelectType(def.prop_type) ? [{
            label:   'Edit options',
            icon:    <Settings size={13} />,
            onClick: () => {
              setEditingOptionsId(def.id);
              setEditOptions([...def.options]);
              // Anchor the portal to the pill element
              const pillEl = pillRefs.current.get(def.id);
              if (pillEl) {
                const r = pillEl.getBoundingClientRect();
                setEditPos({ top: r.bottom + 4, left: r.left });
              }
            },
          }] : []),
          {
            label:   'Delete property',
            icon:    <Trash2 size={13} />,
            variant: 'danger' as const,
            onClick: () => deleteDef.mutate(def.id),
          },
        ];

        return (
          <div
            key={def.id}
            ref={(el) => {
              if (el) pillRefs.current.set(def.id, el);
              else    pillRefs.current.delete(def.id);
            }}
            className="relative group flex items-center gap-1.5 rounded-full bg-neutral-800 pl-3 pr-1.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            {/* Type icon */}
            <span className="shrink-0 text-neutral-500" aria-hidden="true">
              {propTypeIcon(def.prop_type)}
            </span>

            {/* Name — inline rename input or static label */}
            {renamingId === def.id ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') { setRenamingId(null); }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-20 bg-transparent text-xs text-neutral-100 outline-none border-b border-violet-500 py-0.5"
              />
            ) : (
              <span className="text-neutral-500 shrink-0">{def.name}:</span>
            )}

            {/* Value inline editor */}
            <PropertyValue
              definition={def}
              value={val}
              pageId={pageId}
              existingValues={values}
              readOnly={readOnly}
            />

            {/* "..." menu — already portaled by DropdownMenu */}
            {!readOnly && (
              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu items={menuItems}>
                  <button
                    className="opacity-0 group-hover:opacity-100 flex h-4 w-4 items-center justify-center rounded text-neutral-600 hover:bg-neutral-600 hover:text-neutral-300 transition-all"
                    title="Property options"
                  >
                    <MoreHorizontal size={11} />
                  </button>
                </DropdownMenu>
              </div>
            )}
          </div>
        );
      })}

      {/* ── "Add property" button ────────────────────────────────────────── */}
      {!readOnly && (
        <button
          ref={addBtnRef}
          onClick={() => {
            if (addOpen) { closeAddPopover(); return; }
            if (addBtnRef.current) {
              const r = addBtnRef.current.getBoundingClientRect();
              setAddPos({ top: r.bottom + 4, left: r.left });
            }
            setAddOpen(true);
          }}
          className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          <Plus size={12} />
          Add property
        </button>
      )}

      {/* ── "Add property" portal ────────────────────────────────────────── */}
      {addOpen && mounted && createPortal(
        <div
          ref={addPortalRef}
          style={{
            position: 'fixed',
            top:      addPos.top,
            left:     addPos.left,
            zIndex:   'var(--z-popup)' as unknown as number,
          }}
          className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl min-w-52 animate-fade-in"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!pickedType ? (
            // ── Step 1: pick type ─────────────────────────────────────────
            <div className="py-1">
              {PROP_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => setPickedType(opt.type)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  <span className="w-4 text-center text-neutral-500">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            // ── Step 2: name (+ options for select/multi) ──────────────────
            <div className="p-3 flex flex-col gap-2">
              <p className="text-xs text-neutral-500">
                Name your {PROP_TYPE_OPTIONS.find((o) => o.type === pickedType)?.label} property
              </p>

              <input
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSelectType(pickedType)) handleAddProperty();
                  if (e.key === 'Escape') closeAddPopover();
                }}
                placeholder="Property name"
                className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none border border-neutral-700 focus:border-violet-500 transition-colors"
              />

              {/* Options builder — only for select / multi */}
              {isSelectType(pickedType) && (
                <>
                  <p className="text-xs text-neutral-500 mt-1">Options</p>
                  <OptionsBuilder options={newOptions} onChange={setNewOptions} />
                </>
              )}

              <div className="flex justify-between gap-2 mt-1">
                <button
                  onClick={() => { setPickedType(null); setNewOptions([]); }}
                  className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleAddProperty}
                  disabled={
                    !newName.trim() ||
                    createDef.isPending ||
                    (isSelectType(pickedType) && newOptions.length === 0)
                  }
                  className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                >
                  {isSelectType(pickedType) ? 'Create property' : 'Add'}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}

      {/* ── "Edit options" portal ─────────────────────────────────────────── */}
      {editingOptionsId && editingDef && mounted && createPortal(
        <div
          ref={editPortalRef}
          style={{
            position: 'fixed',
            top:      editPos.top,
            left:     editPos.left,
            zIndex:   'var(--z-popup)' as unknown as number,
          }}
          className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl p-3 min-w-52 animate-fade-in"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-neutral-500 mb-2">Edit options</p>
          <OptionsBuilder options={editOptions} onChange={setEditOptions} />
          <div className="flex justify-between mt-3">
            <button
              onClick={() => setEditingOptionsId(null)}
              className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                updateDef.mutate({ id: editingOptionsId, payload: { options: editOptions } });
                setEditingOptionsId(null);
              }}
              disabled={editOptions.length === 0 || updateDef.isPending}
              className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}
