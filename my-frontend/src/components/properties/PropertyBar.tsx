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
 * Color palette for options (auto-cycled by index):
 *   #3b82f6 blue | #22c55e green | #f59e0b yellow
 *   #ef4444 red  | #a855f7 purple | #06b6d4 cyan
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal, Trash2, Pencil, Settings } from 'lucide-react';
import {
  usePropertyDefinitions,
  usePropertyValues,
  useCreateDefinition,
  useUpdateDefinition,
  useDeleteDefinition,
} from '@/hooks/useProperties';
import { PropertyValue } from './PropertyValue';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import type { PropType, SelectOption } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

interface PropertyBarProps {
  workspaceId: string;
  pageId:      string;
  readOnly?:   boolean;
}

const PROP_TYPE_OPTIONS: Array<{ type: PropType; label: string; icon: string }> = [
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
const OPTION_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];

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

function OptionsBuilder({ options, onChange }: OptionsBuilderProps) {
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

export function PropertyBar({ workspaceId, pageId, readOnly = false }: PropertyBarProps) {
  // ── Data ────────────────────────────────────────────────────────────────
  const { data: definitions = [] } = usePropertyDefinitions(workspaceId);
  const { data: values = [] }      = usePropertyValues(pageId);

  const createDef = useCreateDefinition(workspaceId);
  const updateDef = useUpdateDefinition(workspaceId);
  const deleteDef = useDeleteDefinition(workspaceId);

  // ── "Add property" popover state ────────────────────────────────────────
  const [addOpen,    setAddOpen]    = useState(false);
  const [pickedType, setPickedType] = useState<PropType | null>(null);
  const [newName,    setNewName]    = useState('');
  const [newOptions, setNewOptions] = useState<SelectOption[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);

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
        workspace: workspaceId,
        name:      trimmed,
        prop_type: pickedType,
        options:   newOptions,          // ← includes options built by OptionsBuilder
        order:     definitions.length,
      },
      { onSuccess: closeAddPopover },
    );
  }

  // ── Rename state (inline on pill) ────────────────────────────────────────
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

  // ── "Edit options" popover state ─────────────────────────────────────────
  const [editingOptionsId, setEditingOptionsId] = useState<string | null>(null);
  const [editOptions,      setEditOptions]      = useState<SelectOption[]>([]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (definitions.length === 0 && readOnly) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">

      {/* ── One pill per definition ─────────────────────────────────────── */}
      {definitions.map((def) => {
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
          // relative — anchors the "Edit options" popover
          <div
            key={def.id}
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

            {/* "..." menu */}
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

            {/* "Edit options" popover — anchored to this pill */}
            {editingOptionsId === def.id && (
              <div
                className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl p-3 min-w-52"
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
                      updateDef.mutate({ id: def.id, payload: { options: editOptions } });
                      setEditingOptionsId(null);
                    }}
                    disabled={editOptions.length === 0 || updateDef.isPending}
                    className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── "Add property" button + popover ────────────────────────────── */}
      {!readOnly && (
        <div className="relative">
          <button
            onClick={() => {
              if (addOpen) {
                closeAddPopover();
              } else {
                setAddOpen(true);
              }
            }}
            className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            <Plus size={12} />
            Add property
          </button>

          {addOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl min-w-52">
              {!pickedType ? (
                // ── Step 1: pick type ─────────────────────────────────────
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
                // ── Step 2: name (+ options for select/multi) ─────────────
                <div className="p-3 flex flex-col gap-2">
                  <p className="text-xs text-neutral-500">
                    Name your {PROP_TYPE_OPTIONS.find((o) => o.type === pickedType)?.label} property
                  </p>

                  <input
                    ref={nameInputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter only submits for non-select types (select needs options first)
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
