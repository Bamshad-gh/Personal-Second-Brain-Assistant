/**
 * components/workspace/CustomPageTypeManager.tsx
 *
 * What:    Popover panel for managing user-defined page types.
 *          Lists existing CustomPageTypes; lets the user create, rename,
 *          delete them, and — via the Edit panel — define which properties
 *          belong to each type.
 *
 * Props:
 *   workspaceId — used for all API calls
 *   onClose     — called when the panel should be dismissed
 *
 * Edit panel (per type):
 *   - Rename type inline
 *   - List properties scoped to this type with delete button
 *   - Add property: type picker → name input (+OptionsBuilder for select/multi)
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Plus, MoreHorizontal, Pencil, Trash2, ChevronDown } from 'lucide-react';
import {
  useCustomPageTypes,
  useCreateCustomPageType,
  useUpdateCustomPageType,
  useDeleteCustomPageType,
} from '@/hooks/useCustomPageTypes';
import {
  usePropertyDefinitions,
  useCreateDefinition,
  useDeleteDefinition,
} from '@/hooks/useProperties';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import {
  PROP_TYPE_OPTIONS,
  OPTION_COLORS,
  OptionsBuilder,
} from '@/components/properties/PropertyBar';
import type { PropType, SelectOption } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CustomPageTypeManagerProps {
  workspaceId: string;
  onClose:     () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function propTypeIcon(type: PropType): string {
  return PROP_TYPE_OPTIONS.find((o) => o.type === type)?.icon ?? '·';
}

function isSelectType(type: PropType): boolean {
  return type === 'select' || type === 'multi';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CustomPageTypeManager({ workspaceId, onClose }: CustomPageTypeManagerProps) {
  // ── Data ────────────────────────────────────────────────────────────────
  const { data: types = [], isLoading } = useCustomPageTypes(workspaceId);
  const { data: allDefs = [] }          = usePropertyDefinitions(workspaceId);
  const createType = useCreateCustomPageType(workspaceId);
  const updateType = useUpdateCustomPageType(workspaceId);
  const deleteType = useDeleteCustomPageType(workspaceId);
  const createDef  = useCreateDefinition(workspaceId);
  const deleteDef  = useDeleteDefinition(workspaceId);

  // ── Create type form state ───────────────────────────────────────────────
  const [addOpen,  setAddOpen]  = useState(false);
  const [newIcon,  setNewIcon]  = useState('');
  const [newName,  setNewName]  = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addOpen) nameInputRef.current?.focus();
  }, [addOpen]);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createType.mutate(
      { workspace: workspaceId, name, icon: newIcon.trim(), description: '' },
      {
        onSuccess: () => {
          setNewIcon('');
          setNewName('');
          setAddOpen(false);
        },
      },
    );
  }

  // ── Rename state ─────────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal,  setRenameVal]  = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameVal.trim();
    if (trimmed) updateType.mutate({ id: renamingId, payload: { name: trimmed } });
    setRenamingId(null);
  }

  // ── Edit panel state (expanded property builder per type) ─────────────────
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  // ── Add-property-to-type state ────────────────────────────────────────────
  const [addPropOpen,    setAddPropOpen]    = useState(false);
  const [pickedPropType, setPickedPropType] = useState<PropType | null>(null);
  const [propName,       setPropName]       = useState('');
  const [propOptions,    setPropOptions]    = useState<SelectOption[]>([]);
  const propNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickedPropType) propNameRef.current?.focus();
  }, [pickedPropType]);

  function closeAddProp() {
    setAddPropOpen(false);
    setPickedPropType(null);
    setPropName('');
    setPropOptions([]);
  }

  function handleAddProp() {
    if (!editingTypeId || !pickedPropType || !propName.trim()) return;
    const defsForType = allDefs.filter((d) => d.custom_page_type === editingTypeId);
    createDef.mutate(
      {
        workspace:        workspaceId,
        name:             propName.trim(),
        prop_type:        pickedPropType,
        options:          propOptions,
        order:            defsForType.length,
        custom_page_type: editingTypeId,
      },
      { onSuccess: closeAddProp },
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-72 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <p className="text-xs font-semibold text-neutral-300">Page types</p>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── Type list ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-1 max-h-96">
        {isLoading ? (
          <div className="space-y-1 px-2 py-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-neutral-800" />
            ))}
          </div>
        ) : types.length === 0 ? (
          <p className="px-3 py-3 text-xs text-neutral-600">
            No types yet. Create one below.
          </p>
        ) : (
          types.map((type) => {
            const menuItems = [
              {
                label:   'Rename',
                icon:    <Pencil size={13} />,
                onClick: () => { setRenameVal(type.name); setRenamingId(type.id); },
              },
              {
                label:   'Delete',
                icon:    <Trash2 size={13} />,
                variant: 'danger' as const,
                onClick: () => deleteType.mutate(type.id),
              },
            ];

            const isEditing  = editingTypeId === type.id;
            const typeProps  = allDefs.filter((d) => d.custom_page_type === type.id);

            return (
              <div key={type.id}>
                {/* ── Type row ────────────────────────────────────────── */}
                <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-800 transition-colors">
                  {/* Icon */}
                  <span className="shrink-0 w-5 text-center text-sm leading-none select-none">
                    {type.icon || '📄'}
                  </span>

                  {/* Name */}
                  {renamingId === type.id ? (
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
                      className="flex-1 bg-transparent text-xs text-neutral-100 outline-none border-b border-violet-500 py-0.5"
                    />
                  ) : (
                    <span className="flex-1 truncate text-xs text-neutral-200">
                      {type.name}
                    </span>
                  )}

                  {/* Edit (expand) toggle */}
                  <button
                    onClick={() => {
                      setEditingTypeId(isEditing ? null : type.id);
                      closeAddProp();
                    }}
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded transition-colors',
                      'opacity-0 group-hover:opacity-100',
                      isEditing
                        ? 'bg-violet-700 text-white opacity-100'
                        : 'text-neutral-600 hover:bg-neutral-700 hover:text-neutral-300',
                    ].join(' ')}
                    title="Edit properties"
                  >
                    <ChevronDown size={12} className={isEditing ? 'rotate-180' : ''} />
                  </button>

                  {/* "..." menu */}
                  <div
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu items={menuItems}>
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded text-neutral-600 hover:bg-neutral-700 hover:text-neutral-300 transition-colors"
                        title="Type options"
                      >
                        <MoreHorizontal size={12} />
                      </button>
                    </DropdownMenu>
                  </div>
                </div>

                {/* ── Edit panel ──────────────────────────────────────── */}
                {isEditing && (
                  <div className="bg-neutral-950/50 border-t border-b border-neutral-800 px-3 py-2 flex flex-col gap-2">
                    <p className="text-xs font-medium text-neutral-400">Properties</p>

                    {/* Properties list */}
                    {typeProps.length === 0 ? (
                      <p className="text-xs text-neutral-600">No properties yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {typeProps.map((def) => (
                          <div key={def.id} className="flex items-center gap-1.5">
                            <span className="shrink-0 w-4 text-center text-xs text-neutral-500">
                              {propTypeIcon(def.prop_type)}
                            </span>
                            <span className="flex-1 truncate text-xs text-neutral-300">
                              {def.name}
                            </span>
                            <button
                              onClick={() => deleteDef.mutate(def.id)}
                              className="shrink-0 text-neutral-600 hover:text-red-400 transition-colors text-xs"
                              title="Delete property"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add property */}
                    {!addPropOpen ? (
                      <button
                        onClick={() => setAddPropOpen(true)}
                        className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                      >
                        <Plus size={11} /> Add property
                      </button>
                    ) : !pickedPropType ? (
                      // Step 1: type picker
                      <div className="rounded border border-neutral-800 overflow-hidden">
                        {PROP_TYPE_OPTIONS.map((opt) => (
                          <button
                            key={opt.type}
                            onClick={() => setPickedPropType(opt.type)}
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                          >
                            <span className="w-4 text-center text-neutral-500">{opt.icon}</span>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      // Step 2: name + options
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-neutral-500">
                          Name your {PROP_TYPE_OPTIONS.find((o) => o.type === pickedPropType)?.label} property
                        </p>
                        <input
                          ref={propNameRef}
                          value={propName}
                          onChange={(e) => setPropName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isSelectType(pickedPropType)) handleAddProp();
                            if (e.key === 'Escape') closeAddProp();
                          }}
                          placeholder="Property name"
                          className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none border border-neutral-700 focus:border-violet-500 transition-colors"
                        />
                        {isSelectType(pickedPropType) && (
                          <>
                            <p className="text-xs text-neutral-500">Options</p>
                            <OptionsBuilder
                              options={propOptions}
                              onChange={setPropOptions}
                            />
                          </>
                        )}
                        <div className="flex justify-between gap-2">
                          <button
                            onClick={() => setPickedPropType(null)}
                            className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                          >
                            ← Back
                          </button>
                          <button
                            onClick={handleAddProp}
                            disabled={
                              !propName.trim() ||
                              createDef.isPending ||
                              (isSelectType(pickedPropType) && propOptions.length === 0)
                            }
                            className="rounded bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                          >
                            {isSelectType(pickedPropType) ? 'Create' : 'Add'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Create type form ───────────────────────────────────────────────── */}
      <div className="border-t border-neutral-800 p-2">
        {!addOpen ? (
          <button
            onClick={() => setAddOpen(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-800 hover:text-neutral-400 transition-colors"
          >
            <Plus size={12} />
            New type
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5">
              <input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                placeholder="📄"
                maxLength={2}
                className="w-9 rounded bg-neutral-800 px-1.5 py-1 text-center text-sm outline-none border border-neutral-700 focus:border-violet-500 transition-colors"
                title="Icon (emoji)"
              />
              <input
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
                  if (e.key === 'Escape') { setAddOpen(false); setNewName(''); setNewIcon(''); }
                  e.stopPropagation();
                }}
                placeholder="Type name"
                className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none border border-neutral-700 focus:border-violet-500 transition-colors"
              />
            </div>
            <div className="flex justify-between gap-2">
              <button
                onClick={() => { setAddOpen(false); setNewName(''); setNewIcon(''); }}
                className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createType.isPending}
                className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
