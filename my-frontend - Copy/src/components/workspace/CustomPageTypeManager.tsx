/**
 * components/workspace/CustomPageTypeManager.tsx
 *
 * What:    Popover panel for managing user-defined page types and groups.
 *          - Groups: named, coloured buckets with a colored left border accent.
 *            Double-click the group name to rename. Click the color swatch to
 *            cycle through preset colors. "+" adds a type in that group.
 *          - Types: per-group or ungrouped rows with pin toggle, property editor,
 *            and a "..." menu for rename / move-to-group / delete.
 *          - Footer: "New type" form (with optional group selector) +
 *            "New group" form (name + color swatch cycler).
 *
 * Props:
 *   workspaceId — used for all API calls
 *   onClose     — called when the panel should be dismissed
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Plus, MoreHorizontal, Pencil, Trash2, ChevronDown, Pin, PinOff } from 'lucide-react';
import {
  useCustomPageTypes,
  useCreateCustomPageType,
  useUpdateCustomPageType,
  useDeleteCustomPageType,
  customPageTypeKeys,
} from '@/hooks/useCustomPageTypes';
import {
  usePageTypeGroups,
  useCreatePageTypeGroup,
  useUpdatePageTypeGroup,
  useDeletePageTypeGroup,
  pageTypeGroupKeys,
} from '@/hooks/usePageTypeGroups';
import {
  usePropertyDefinitions,
  useCreateDefinition,
  useDeleteDefinition,
} from '@/hooks/useProperties';
import toast from 'react-hot-toast';
import { workspaceApi } from '@/lib/api';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import {
  PROP_TYPE_OPTIONS,
  OptionsBuilder,
} from '@/components/properties/PropertyBar';
import type { CustomPageType, PropType, SelectOption } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  '#60a5fa', // blue
  '#34d399', // green
  '#a78bfa', // violet
  '#f87171', // red
  '#fbbf24', // amber
  '#fb923c', // orange
  '#38bdf8', // sky
  '#f472b6', // pink
] as const;

type GroupColor = typeof GROUP_COLORS[number];

const SHORT_EMOJI_LIST = [
  '📄','📝','📋','📁','📂','🗂️','📌','📍','🏷️','🔖',
  '💼','🤝','📊','📈','💰','🧾','🎯','🚀','⭐','💡',
  '🔧','🔨','⚙️','🛠️','📦','🗓️','⏰','✅','❤️','🌟',
] as const;

const TYPE_COLOR_SWATCHES = [
  '#7c3aed','#60a5fa','#34d399','#f59e0b','#f87171','#94a3b8',
] as const;

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

function nextColor(current: string): GroupColor {
  const idx = GROUP_COLORS.indexOf(current as GroupColor);
  return GROUP_COLORS[(idx + 1) % GROUP_COLORS.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CustomPageTypeManager({ workspaceId, onClose }: CustomPageTypeManagerProps) {

  // ── Query client (for refetch after seeding) ──────────────────────────────
  const queryClient = useQueryClient();

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: types  = [], isLoading } = useCustomPageTypes(workspaceId);
  const { data: groups = [] }            = usePageTypeGroups(workspaceId);
  const { data: allDefs = [] }           = usePropertyDefinitions(workspaceId);

  const createType = useCreateCustomPageType(workspaceId);
  const updateType = useUpdateCustomPageType(workspaceId);
  const deleteType = useDeleteCustomPageType(workspaceId);
  const createDef  = useCreateDefinition(workspaceId);
  const deleteDef  = useDeleteDefinition(workspaceId);

  const createGroup = useCreatePageTypeGroup(workspaceId);
  const updateGroup = useUpdatePageTypeGroup(workspaceId);
  const deleteGroup = useDeletePageTypeGroup(workspaceId);

  // ── Starter templates seeding ─────────────────────────────────────────────
  const TEMPLATE_NAMES = ['Client', 'Project', 'Invoice'] as const;
  const hasTemplates = types.some((t) => (TEMPLATE_NAMES as readonly string[]).includes(t.name));
  const [seeding, setSeeding] = useState(false);

  async function handleSeedTemplates() {
    setSeeding(true);
    try {
      await workspaceApi.seedTemplates(workspaceId);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: customPageTypeKeys.all(workspaceId) }),
        queryClient.refetchQueries({ queryKey: pageTypeGroupKeys.all(workspaceId) }),
      ]);
    } catch {
      toast.error('Could not add templates. Please try again.');
    } finally {
      setSeeding(false);
    }
  }

  // ── Create type form state ─────────────────────────────────────────────────
  const [addOpen,        setAddOpen]        = useState(false);
  const [newTypeIcon,    setNewTypeIcon]    = useState('📄');
  const [newTypeColor,   setNewTypeColor]   = useState('#7c3aed');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [newName,        setNewName]        = useState('');
  const [newTypeGroupId, setNewTypeGroupId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addOpen) nameInputRef.current?.focus();
  }, [addOpen]);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createType.mutate(
      {
        workspace:     workspaceId,
        name,
        icon:          newTypeIcon,
        description:   '',
        group:         newTypeGroupId,
        group_detail:  null,
        is_pinned:     true,
        default_color: newTypeColor,
        default_icon:  newTypeIcon,
      },
      {
        onSuccess: () => {
          setNewTypeIcon('📄');
          setNewTypeColor('#7c3aed');
          setShowIconPicker(false);
          setNewName('');
          setNewTypeGroupId(null);
          setAddOpen(false);
        },
      },
    );
  }

  function cancelAddType() {
    setAddOpen(false);
    setNewName('');
    setNewTypeIcon('📄');
    setNewTypeColor('#7c3aed');
    setShowIconPicker(false);
    setNewTypeGroupId(null);
  }

  // ── Rename type state ──────────────────────────────────────────────────────
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

  // ── Rename group state ─────────────────────────────────────────────────────
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupVal,  setRenameGroupVal]  = useState('');
  const renameGroupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingGroupId) renameGroupRef.current?.focus();
  }, [renamingGroupId]);

  function commitRenameGroup() {
    if (!renamingGroupId) return;
    const trimmed = renameGroupVal.trim();
    if (trimmed) updateGroup.mutate({ id: renamingGroupId, payload: { name: trimmed } });
    setRenamingGroupId(null);
  }

  // ── Create group form state ────────────────────────────────────────────────
  const [addGroupOpen,  setAddGroupOpen]  = useState(false);
  const [newGroupName,  setNewGroupName]  = useState('');
  const [newGroupColor, setNewGroupColor] = useState<GroupColor>(GROUP_COLORS[0]);
  const groupNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addGroupOpen) groupNameInputRef.current?.focus();
  }, [addGroupOpen]);

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    createGroup.mutate(
      { workspace: workspaceId, name, color: newGroupColor },
      {
        onSuccess: () => {
          setNewGroupName('');
          setNewGroupColor(GROUP_COLORS[0]);
          setAddGroupOpen(false);
        },
        onError: () => toast.error('Could not create group.'),
      },
    );
  }

  // ── Edit panel state ───────────────────────────────────────────────────────
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  // ── Add-property state ─────────────────────────────────────────────────────
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

  // ── Type row renderer ──────────────────────────────────────────────────────
  function renderTypeRow(type: CustomPageType) {
    const isEditing = editingTypeId === type.id;
    const typeProps = allDefs.filter((d) => d.custom_page_type === type.id);

    const menuItems = [
      {
        label:   'Rename',
        icon:    <Pencil size={13} />,
        onClick: () => { setRenameVal(type.name); setRenamingId(type.id); },
      },
      // Move-to-group items (exclude current group)
      ...groups
        .filter((g) => g.id !== type.group)
        .map((g) => ({
          label:   `Move to ${g.name}`,
          icon:    <span style={{ color: g.color }} className="text-xs leading-none">●</span>,
          onClick: () => updateType.mutate({ id: type.id, payload: { group: g.id } }),
        })),
      // Remove from group (only when type is in a group)
      ...(type.group ? [{
        label:   'Remove from group',
        icon:    <span className="text-neutral-500 text-xs leading-none">○</span>,
        onClick: () => updateType.mutate({ id: type.id, payload: { group: null } }),
      }] : []),
      {
        label:   'Delete',
        icon:    <Trash2 size={13} />,
        variant: 'danger' as const,
        onClick: () => deleteType.mutate(type.id),
      },
    ];

    return (
      <div key={type.id}>
        {/* ── Type row ──────────────────────────────────────────────────── */}
        <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          {/* Icon */}
          <span className="shrink-0 w-5 text-center text-sm leading-none select-none">
            {type.icon || '📄'}
          </span>

          {/* Name / rename input */}
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
              className="flex-1 bg-transparent text-xs text-neutral-900 dark:text-neutral-100 outline-none border-b border-violet-500 py-0.5"
            />
          ) : (
            <span className="flex-1 truncate text-xs text-neutral-700 dark:text-neutral-200">{type.name}</span>
          )}

          {/* Pin toggle — violet when pinned (visible in sidebar), grey when not */}
          <button
            onClick={() => updateType.mutate({ id: type.id, payload: { is_pinned: !type.is_pinned } })}
            className={[
              'flex h-5 w-5 items-center justify-center rounded transition-colors',
              type.is_pinned
                ? 'text-violet-500 dark:text-violet-400'
                : 'opacity-0 group-hover:opacity-100 text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400',
            ].join(' ')}
            title={type.is_pinned ? 'Pinned — visible in sidebar picker' : 'Unpinned — hidden from sidebar picker'}
          >
            {type.is_pinned ? <Pin size={11} /> : <PinOff size={11} />}
          </button>

          {/* Expand/collapse edit panel */}
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
                : 'text-neutral-400 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300',
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
                className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                title="Type options"
              >
                <MoreHorizontal size={12} />
              </button>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Edit panel ────────────────────────────────────────────────── */}
        {isEditing && (
          <div className="bg-neutral-50 dark:bg-neutral-950/50 border-t border-b border-neutral-200 dark:border-neutral-800 px-3 py-2 flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Properties</p>

            {typeProps.length === 0 ? (
              <p className="text-xs text-neutral-400 dark:text-neutral-600">No properties yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {typeProps.map((def) => (
                  <div key={def.id} className="flex items-center gap-1.5">
                    <span className="shrink-0 w-4 text-center text-xs text-neutral-500">
                      {propTypeIcon(def.prop_type)}
                    </span>
                    <span className="flex-1 truncate text-xs text-neutral-700 dark:text-neutral-300">{def.name}</span>
                    <button
                      onClick={() => deleteDef.mutate(def.id)}
                      className="shrink-0 text-neutral-400 dark:text-neutral-600 hover:text-red-600 dark:hover:text-red-400 transition-colors text-xs"
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
                className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400 transition-colors"
              >
                <Plus size={11} /> Add property
              </button>
            ) : !pickedPropType ? (
              <div className="rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                {PROP_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => setPickedPropType(opt.type)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <span className="w-4 text-center text-neutral-500">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
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
                  className="w-full rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 outline-none border border-neutral-300 dark:border-neutral-700 focus:border-violet-500 transition-colors"
                />
                {isSelectType(pickedPropType) && (
                  <>
                    <p className="text-xs text-neutral-500">Options</p>
                    <OptionsBuilder options={propOptions} onChange={setPropOptions} />
                  </>
                )}
                <div className="flex justify-between gap-2">
                  <button
                    onClick={() => setPickedPropType(null)}
                    className="text-xs text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400 transition-colors"
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
  }

  // ── Compute groupings ──────────────────────────────────────────────────────
  const groupedSections = groups.map((g) => ({
    group: g,
    types: types.filter((t) => t.group === g.id),
  }));
  const ungroupedTypes = types.filter((t) => !t.group);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-72 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-300">Page types</p>
        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto max-h-120">
        {isLoading ? (
          <div className="space-y-1 px-2 py-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            ))}
          </div>
        ) : (
          <>
            {/* ── Group sections ──────────────────────────────────────────── */}
            {groupedSections.map(({ group, types: groupTypes }) => (
              <div
                key={group.id}
                className="border-b border-neutral-200/50 dark:border-neutral-800/50"
                style={{ borderLeft: `3px solid ${group.color}` }}
              >
                {/* Group header */}
                <div className="group/gh flex items-center gap-2 px-3 py-1.5 bg-neutral-100/50 dark:bg-neutral-950/30">
                  {/* Color swatch — click to cycle through GROUP_COLORS */}
                  <button
                    onClick={() =>
                      updateGroup.mutate({ id: group.id, payload: { color: nextColor(group.color) } })
                    }
                    style={{ backgroundColor: group.color }}
                    className="shrink-0 h-2.5 w-2.5 rounded-full transition-transform hover:scale-125"
                    title="Click to change group color"
                  />

                  {/* Group name / rename input */}
                  {renamingGroupId === group.id ? (
                    <input
                      ref={renameGroupRef}
                      value={renameGroupVal}
                      onChange={(e) => setRenameGroupVal(e.target.value)}
                      onBlur={commitRenameGroup}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')  { e.preventDefault(); commitRenameGroup(); }
                        if (e.key === 'Escape') { setRenamingGroupId(null); }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent text-xs text-neutral-900 dark:text-neutral-100 outline-none border-b border-violet-500 py-0.5"
                    />
                  ) : (
                    <span
                      className="flex-1 truncate text-[10px] font-medium text-neutral-500 uppercase tracking-wide cursor-default hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors"
                      onDoubleClick={() => {
                        setRenameGroupVal(group.name);
                        setRenamingGroupId(group.id);
                      }}
                      title="Double-click to rename"
                    >
                      {group.name}
                    </span>
                  )}

                  {/* "+" — add a type directly in this group */}
                  <button
                    onClick={() => { setNewTypeGroupId(group.id); setAddOpen(true); }}
                    className="opacity-0 group-hover/gh:opacity-100 flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
                    title={`New ${group.name} type`}
                  >
                    <Plus size={11} />
                  </button>

                  {/* Delete group */}
                  <button
                    onClick={() => deleteGroup.mutate(group.id)}
                    className="opacity-0 group-hover/gh:opacity-100 flex h-5 w-5 items-center justify-center rounded text-neutral-400 dark:text-neutral-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
                    title="Delete group"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Types inside this group */}
                {groupTypes.length === 0 ? (
                  <p className="px-5 py-1.5 text-xs text-neutral-400 dark:text-neutral-700">No types in this group.</p>
                ) : (
                  groupTypes.map(renderTypeRow)
                )}
              </div>
            ))}

            {/* ── Ungrouped section ────────────────────────────────────────── */}
            {ungroupedTypes.length > 0 && (
              <div>
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-600 uppercase tracking-wide">
                    Ungrouped
                  </span>
                </div>
                {ungroupedTypes.map(renderTypeRow)}
              </div>
            )}

            {/* Empty state */}
            {types.length === 0 && groups.length === 0 && (
              <p className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-600">
                No types yet. Create a type or group below.
              </p>
            )}

            {/* ── Starter templates nudge — hidden once any template exists ── */}
            {!isLoading && !hasTemplates && (
              <div className="mx-2 my-2 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-2.5">
                <p className="text-xs text-neutral-500 mb-2">
                  Get started with built-in templates
                </p>
                <button
                  onClick={handleSeedTemplates}
                  disabled={seeding}
                  className="w-full rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1.5 text-left text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-200 disabled:opacity-40 transition-colors"
                >
                  {seeding ? 'Adding…' : '+ Add Client, Project & Invoice templates'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-2 flex flex-col gap-1">

        {/* ── New type form ──────────────────────────────────────────────── */}
        {!addOpen ? (
          <button
            onClick={() => setAddOpen(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-400 transition-colors"
          >
            <Plus size={12} />
            New type
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5">
              {/* Icon picker button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowIconPicker(v => !v); }}
                  className="w-9 h-7.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-sm flex items-center justify-center hover:border-violet-500 transition-colors"
                  title="Pick icon"
                >
                  {newTypeIcon}
                </button>
                {/* BUG 1 FIX: picker opens downward (top-full mt-1), not upward */}
                {showIconPicker && (
                  <div
                    className="absolute top-full left-0 mt-1 z-10 grid grid-cols-5 gap-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1.5 shadow-xl max-h-40 overflow-y-auto w-48"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {SHORT_EMOJI_LIST.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNewTypeIcon(em); setShowIconPicker(false); }}
                        className={['flex h-7 w-7 items-center justify-center rounded text-base hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors', newTypeIcon === em ? 'bg-neutral-200 dark:bg-neutral-700' : ''].join(' ')}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={nameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { e.preventDefault(); handleCreate(); }
                  if (e.key === 'Escape') cancelAddType();
                  e.stopPropagation();
                }}
                placeholder="Type name"
                className="flex-1 rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 outline-none border border-neutral-300 dark:border-neutral-700 focus:border-violet-500 transition-colors"
              />
            </div>

            {/* Color swatches */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-500 dark:text-neutral-600">Color:</span>
              {TYPE_COLOR_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNewTypeColor(hex); }}
                  style={{ backgroundColor: hex }}
                  className={['h-4 w-4 rounded-full border-2 transition-transform hover:scale-110', newTypeColor === hex ? 'border-neutral-900 dark:border-white scale-110' : 'border-transparent'].join(' ')}
                />
              ))}
            </div>

            {/* Group selector — only shown when groups exist */}
            {groups.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-neutral-500 dark:text-neutral-600">Group:</span>
                <button
                  onClick={() => setNewTypeGroupId(null)}
                  className={[
                    'rounded px-1.5 py-0.5 text-xs transition-colors',
                    newTypeGroupId === null
                      ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200'
                      : 'text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400',
                  ].join(' ')}
                >
                  None
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setNewTypeGroupId(g.id)}
                    className={[
                      'rounded px-1.5 py-0.5 text-xs transition-colors',
                      newTypeGroupId === g.id
                        ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200'
                        : 'text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400',
                    ].join(' ')}
                    style={newTypeGroupId === g.id ? { color: g.color } : undefined}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-between gap-2">
              <button
                onClick={cancelAddType}
                className="text-xs text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400 transition-colors"
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

        {/* ── New group form ─────────────────────────────────────────────── */}
        {!addGroupOpen ? (
          <button
            onClick={() => setAddGroupOpen(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600 dark:hover:text-neutral-500 transition-colors"
          >
            <Plus size={12} />
            New group
          </button>
        ) : (
          <div className="flex flex-col gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-2">
            <div className="flex gap-1.5 items-center">
              {/* Color cycler swatch */}
              <button
                onClick={() => setNewGroupColor(nextColor(newGroupColor))}
                style={{ backgroundColor: newGroupColor }}
                className="shrink-0 h-5 w-5 rounded-full border-2 border-neutral-300 dark:border-neutral-700 transition-transform hover:scale-110"
                title="Click to change color"
              />
              <input
                ref={groupNameInputRef}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { e.preventDefault(); handleCreateGroup(); }
                  if (e.key === 'Escape') { setAddGroupOpen(false); setNewGroupName(''); }
                  e.stopPropagation();
                }}
                placeholder="Group name"
                className="flex-1 rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 outline-none border border-neutral-300 dark:border-neutral-700 focus:border-violet-500 transition-colors"
              />
            </div>
            <div className="flex justify-between gap-2">
              <button
                onClick={() => { setAddGroupOpen(false); setNewGroupName(''); }}
                className="text-xs text-neutral-500 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || createGroup.isPending}
                className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
