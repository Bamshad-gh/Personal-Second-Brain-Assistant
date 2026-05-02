'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Hash, Calendar, CheckSquare, ChevronDown, Link, Mail, Phone,
  DollarSign, Type, Tags, Trash2, Database, Filter, ArrowUpDown, Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { EmailComposeDrawer } from './EmailComposeDrawer';
import {
  useDatabaseView,
  useDatabaseRows,
  useCreateRow,
  useDeleteRow,
  useUpdateCell,
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
  useUpdateView,
} from '@/hooks/useDatabase';
import { useCustomPageTypes } from '@/hooks/useCustomPageTypes';
import { useAppStore } from '@/lib/store';
import type { Block, PropType, DatabaseCell } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DatabaseBlockProps {
  block:       Block;
  onDelete:    () => void;
  readOnly?:   boolean;
  isSelected:  boolean;
  isCanvas?:   boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const COL_TYPE_ICONS: Partial<Record<PropType, React.ReactNode>> = {
  text:     <Type size={12} />,
  number:   <Hash size={12} />,
  date:     <Calendar size={12} />,
  checkbox: <CheckSquare size={12} />,
  select:   <ChevronDown size={12} />,
  multi:    <Tags size={12} />,
  url:      <Link size={12} />,
  email:    <Mail size={12} />,
  phone:    <Phone size={12} />,
  currency: <DollarSign size={12} />,
};

const COLUMN_TYPES: PropType[] = [
  'text', 'number', 'date', 'checkbox', 'select', 'email', 'url', 'phone', 'currency',
];

function getCellDisplay(cell: DatabaseCell | undefined, propType: PropType): string {
  if (!cell) return '';
  if (propType === 'number' || propType === 'currency') return cell.value_number?.toString() ?? '';
  if (propType === 'date') return cell.value_date ? new Date(cell.value_date).toLocaleDateString() : '';
  return cell.value_text ?? '';
}

function getCellDraft(cell: DatabaseCell | undefined, propType: PropType): string {
  if (!cell) return '';
  if (propType === 'number' || propType === 'currency') return cell.value_number?.toString() ?? '';
  if (propType === 'checkbox') return cell.value_bool ? 'true' : 'false';
  if (propType === 'date') return cell.value_date?.slice(0, 10) ?? '';
  return cell.value_text ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DatabaseBlock({ block, onDelete, readOnly = false, isSelected, isCanvas = false }: DatabaseBlockProps) {
  const workspaceId = useAppStore(s => s.activeWorkspace?.id ?? '');

  const { data: view, isLoading: viewLoading } = useDatabaseView(block.id);
  const { data: rows = [], isLoading: rowsLoading } = useDatabaseRows(block.id);
  const { data: pageTypes = [] } = useCustomPageTypes(workspaceId);

  const createRow    = useCreateRow(block.id);
  const deleteRow    = useDeleteRow(block.id);
  const updateCell   = useUpdateCell(block.id);
  const createColumn = useCreateColumn(block.id);
  const updateColumn = useUpdateColumn(block.id);
  const deleteColumn = useDeleteColumn(block.id);
  const updateView   = useUpdateView(block.id);

  // ── All state before early returns ──────────────────────────────────────────
  const [canvasExpanded, setCanvasExpanded]   = useState(false);
  const [showQueryPicker, setShowQueryPicker] = useState(false);
  const [selectedRows, setSelectedRows]       = useState<Set<string>>(new Set());
  const [emailDrawerOpen, setEmailDrawerOpen] = useState(false);
  const [editingCell, setEditingCell]         = useState<{ rowId: string; defId: string } | null>(null);
  const [cellDraft, setCellDraft]           = useState('');
  const [columnMenuId, setColumnMenuId]     = useState<string | null>(null);
  const [colMenuPos, setColMenuPos]         = useState<{ x: number; y: number } | null>(null);
  const [editingColId, setEditingColId]     = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');
  const [addingCol, setAddingCol]           = useState(false);
  const [newColName, setNewColName]         = useState('');
  const [newColType, setNewColType]         = useState<PropType>('text');

  const colMenuRef    = useRef<HTMLDivElement>(null);
  const newColInputRef = useRef<HTMLInputElement>(null);

  // Close column menu on outside click
  useEffect(() => {
    if (!columnMenuId) return;
    function handle(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColumnMenuId(null);
        setColMenuPos(null);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [columnMenuId]);

  // Focus new column input when it appears
  useEffect(() => {
    if (addingCol) newColInputRef.current?.focus();
  }, [addingCol]);

  const handleColMenuOpen = useCallback((colId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setColumnMenuId(colId);
    setColMenuPos({ x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleCellClick = useCallback((rowId: string, defId: string, propType: PropType) => {
    if (readOnly) return;
    const row  = rows.find(r => r.id === rowId);
    const cell = row?.cells.find(c => c.definition === defId);
    setCellDraft(getCellDraft(cell, propType));
    setEditingCell({ rowId, defId });
  }, [readOnly, rows]);

  const handleCellSave = useCallback((rowId: string, defId: string, propType: PropType, draft: string) => {
    let payload: Record<string, unknown> = {};
    if (propType === 'number' || propType === 'currency') {
      payload = { value_number: draft === '' ? null : parseFloat(draft) };
    } else if (propType === 'checkbox') {
      payload = { value_bool: draft === 'true' };
    } else if (propType === 'date') {
      payload = { value_date: draft || null };
    } else {
      payload = { value_text: draft };
    }
    updateCell.mutate({ rowId, defId, payload });
    setEditingCell(null);
  }, [updateCell]);

  const handleColRename = useCallback((colId: string, name: string) => {
    if (name.trim()) updateColumn.mutate({ colId, payload: { name: name.trim() } });
    setEditingColId(null);
  }, [updateColumn]);

  const handleAddColumn = useCallback(() => {
    const name = newColName.trim();
    if (!name) { setAddingCol(false); return; }
    createColumn.mutate({ name, prop_type: newColType });
    setNewColName('');
    setNewColType('text');
    setAddingCol(false);
  }, [createColumn, newColName, newColType]);

  const isLoading = viewLoading || rowsLoading;
  const columns   = view?.columns ?? [];

  // Collect email addresses from selected rows (across all email-type columns)
  const emailColumns = columns.filter(c => c.definition.prop_type === 'email');
  const selectedEmails = (() => {
    const emails: string[] = [];
    rows.forEach(row => {
      if (!selectedRows.has(row.id)) return;
      emailColumns.forEach(col => {
        const cell = row.cells.find(c => c.definition === col.definition.id);
        const addr = cell?.value_text?.trim();
        if (addr) emails.push(addr);
      });
    });
    return [...new Set(emails)];
  })();

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={`my-2 overflow-hidden rounded-lg border border-neutral-800 ${isSelected ? 'ring-1 ring-violet-500/40' : ''}`}>
        <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <Database size={13} className="text-neutral-600" />
          <span className="text-xs text-neutral-600">Loading…</span>
        </div>
        <div className="space-y-2 p-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 animate-pulse rounded bg-neutral-800/60" />
          ))}
        </div>
      </div>
    );
  }

  // ── Canvas compact card ─────────────────────────────────────────────────────
  if (isCanvas && !canvasExpanded) {
    return (
      <div
        className="cursor-pointer select-none p-3"
        style={{ minWidth: 180 }}
        onDoubleClick={(e) => { e.stopPropagation(); setCanvasExpanded(true); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Database size={12} className="shrink-0 text-violet-400" />
          <span className="text-xs font-medium text-neutral-300">Database</span>
          <span className="ml-auto text-[10px] text-neutral-600">
            {isLoading ? '…' : `${rows.length} row${rows.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {columns.length === 0 ? (
          <p className="text-[10px] text-neutral-600 italic">No columns yet</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {columns.slice(0, 6).map(col => (
              <span
                key={col.id}
                className="inline-flex items-center gap-0.5 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
              >
                <span className="text-neutral-600">{COL_TYPE_ICONS[col.definition.prop_type] ?? <Type size={10} />}</span>
                {col.definition.name}
              </span>
            ))}
            {columns.length > 6 && (
              <span className="text-[10px] text-neutral-600">+{columns.length - 6} more</span>
            )}
          </div>
        )}
        <p className="mt-2 text-[10px] text-neutral-700">Double-click to expand</p>
      </div>
    );
  }

  // ── Empty (no columns) ──────────────────────────────────────────────────────
  if (columns.length === 0) {
    return (
      <div className={`my-2 overflow-hidden rounded-lg border border-neutral-800 ${isSelected ? 'ring-1 ring-violet-500/40' : ''}`}>
        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <Database size={13} className="text-violet-400" />
            <span className="text-xs font-medium text-neutral-400">Database</span>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAddingCol(true)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
              >
                <Plus size={11} /> Add column
              </button>
              <button
                onClick={onDelete}
                className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-800 hover:text-red-400"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>

        {addingCol ? (
          <div className="flex items-center gap-2 p-3">
            <input
              ref={newColInputRef}
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddColumn();
                if (e.key === 'Escape') { setAddingCol(false); setNewColName(''); }
              }}
              placeholder="Column name"
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-violet-500"
            />
            <select
              value={newColType}
              onChange={e => setNewColType(e.target.value as PropType)}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-300 outline-none"
            >
              {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={handleAddColumn}
              className="rounded bg-violet-600 px-2 py-1.5 text-xs text-white hover:bg-violet-500"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingCol(false); setNewColName(''); }}
              className="rounded px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Database size={28} className="mb-3 text-neutral-700" />
            <p className="text-sm text-neutral-500">No columns yet</p>
            <p className="mt-1 text-xs text-neutral-600">Add a column to start building your database</p>
          </div>
        )}
      </div>
    );
  }

  // ── Full table ──────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className={`${isCanvas ? '' : 'my-2'} overflow-hidden rounded-lg border border-neutral-800 ${isSelected ? 'ring-1 ring-violet-500/40' : ''}`}
        onPointerDown={isCanvas ? (e) => e.stopPropagation() : undefined}
        onClick={isCanvas ? (e) => e.stopPropagation() : undefined}
      >
        {/* Toolbar */}
        <div className="flex flex-col border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Database size={13} className="text-violet-400" />
              <span className="text-xs font-medium text-neutral-400">Database</span>
              <span className="text-xs text-neutral-700">· {rows.length} row{rows.length !== 1 ? 's' : ''}</span>
              {view?.custom_page_type && (
                <span className="rounded bg-violet-900/30 px-1.5 py-0.5 text-[10px] text-violet-400">
                  {pageTypes.find(t => t.id === view.custom_page_type)?.name ?? 'Query mode'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isCanvas && (
                <button
                  onClick={() => setCanvasExpanded(false)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
                >
                  Collapse
                </button>
              )}
              {!readOnly && (
                <>
                  {/* Delete selected rows — appears in toolbar instead of a per-row button */}
                  {selectedRows.size > 0 && (
                    <button
                      onClick={() => {
                        selectedRows.forEach(id => deleteRow.mutate(id));
                        setSelectedRows(new Set());
                      }}
                      className="flex items-center gap-1 rounded bg-red-900/30 px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-900/50 transition-colors"
                    >
                      <Trash2 size={10} /> Delete ({selectedRows.size})
                    </button>
                  )}
                  <button
                    onClick={() => setShowQueryPicker(v => !v)}
                    className={[
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors',
                      view?.custom_page_type
                        ? 'bg-violet-900/30 text-violet-400 hover:bg-violet-900/50'
                        : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300',
                    ].join(' ')}
                    title="Query pages by type"
                  >
                    <Database size={10} /> Query
                  </button>
                  {selectedEmails.length > 0 && (
                    <button
                      onClick={() => setEmailDrawerOpen(true)}
                      className="flex items-center gap-1 rounded bg-violet-900/30 px-1.5 py-0.5 text-xs text-violet-400 hover:bg-violet-900/50 transition-colors"
                    >
                      <Send size={10} /> Email ({selectedEmails.length})
                    </button>
                  )}
                  <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors">
                    <Filter size={10} /> Filter
                  </button>
                  <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors">
                    <ArrowUpDown size={10} /> Sort
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Query mode picker */}
          {showQueryPicker && !readOnly && (
            <div className="flex items-center gap-2 border-t border-neutral-800/60 px-3 py-2">
              <span className="text-[10px] text-neutral-500 shrink-0">Query pages of type:</span>
              <select
                value={view?.custom_page_type ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  updateView.mutate({ custom_page_type: val || null });
                  setShowQueryPicker(false);
                }}
                className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-violet-500"
              >
                <option value="">— Manual rows (no query) —</option>
                {pageTypes.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.icon ? `${t.icon} ` : ''}{t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${columns.length * 140 + 80}px` }}>
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/40">
                {/* Select-all checkbox */}
                <th className="w-7 border-r border-neutral-800/60 px-2 text-center">
                  {rows.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selectedRows.size > 0 && selectedRows.size === rows.length}
                      onChange={e => {
                        setSelectedRows(e.target.checked ? new Set(rows.map(r => r.id)) : new Set());
                      }}
                      className="accent-violet-500"
                    />
                  )}
                </th>

                {/* Column headers */}
                {columns.map(col => (
                  <th
                    key={col.id}
                    className="border-r border-neutral-800/60 text-left font-normal"
                  >
                    {editingColId === col.id ? (
                      <input
                        autoFocus
                        value={editingColName}
                        onChange={e => setEditingColName(e.target.value)}
                        onBlur={() => handleColRename(col.id, editingColName)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleColRename(col.id, editingColName);
                          if (e.key === 'Escape') setEditingColId(null);
                        }}
                        className="w-full bg-neutral-800 px-3 py-2 text-xs text-neutral-200 outline-none"
                      />
                    ) : (
                      <button
                        onClick={e => handleColMenuOpen(col.id, e)}
                        onDoubleClick={() => { setEditingColId(col.id); setEditingColName(col.definition.name); }}
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-neutral-400 hover:bg-neutral-800/40 transition-colors"
                      >
                        <span className="shrink-0 text-neutral-600">
                          {COL_TYPE_ICONS[col.definition.prop_type] ?? <Type size={12} />}
                        </span>
                        <span className="truncate">{col.definition.name}</span>
                      </button>
                    )}
                  </th>
                ))}

                {/* Add column — hidden in query mode (columns defined by page type) */}
                {!readOnly && !view?.custom_page_type && (
                  <th className="w-10 text-center">
                    {addingCol ? (
                      <div className="flex min-w-50 items-center gap-1 px-2 py-1">
                        <input
                          ref={newColInputRef}
                          value={newColName}
                          onChange={e => setNewColName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddColumn();
                            if (e.key === 'Escape') { setAddingCol(false); setNewColName(''); }
                          }}
                          placeholder="Name"
                          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-200 outline-none focus:border-violet-500"
                        />
                        <select
                          value={newColType}
                          onChange={e => setNewColType(e.target.value as PropType)}
                          className="rounded border border-neutral-700 bg-neutral-900 px-1 py-1 text-xs text-neutral-300 outline-none"
                        >
                          {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button onClick={handleAddColumn} className="rounded bg-violet-600 px-1.5 py-1 text-xs text-white hover:bg-violet-500">✓</button>
                        <button onClick={() => { setAddingCol(false); setNewColName(''); }} className="text-neutral-600 hover:text-neutral-400">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingCol(true)}
                        className="rounded p-1 text-neutral-700 hover:bg-neutral-800 hover:text-neutral-400 transition-colors"
                        title="Add column"
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="group border-b border-neutral-800/40 hover:bg-neutral-900/20"
                >
                  {/* Row checkbox — always visible, no collision with delete */}
                  <td className="w-7 border-r border-neutral-800/40 px-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.id)}
                      onChange={e => {
                        const next = new Set(selectedRows);
                        e.target.checked ? next.add(row.id) : next.delete(row.id);
                        setSelectedRows(next);
                      }}
                      className="accent-violet-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={selectedRows.has(row.id) ? { opacity: 1 } : undefined}
                    />
                  </td>

                  {/* Cells */}
                  {columns.map((col, ci) => {
                    const cell     = row.cells.find(c => c.definition === col.definition.id);
                    const propType = col.definition.prop_type;
                    const isEditing = editingCell?.rowId === row.id && editingCell?.defId === col.definition.id;

                    return (
                      <td
                        key={col.id}
                        className={`border-r border-neutral-800/40 ${ci === 0 ? 'text-neutral-200' : 'text-neutral-400'}`}
                        onClick={() => { if (!isEditing) handleCellClick(row.id, col.definition.id, propType); }}
                      >
                        {isEditing ? (
                          propType === 'checkbox' ? (
                            <div className="flex items-center px-3 py-2">
                              <input
                                type="checkbox"
                                checked={cellDraft === 'true'}
                                onChange={e => {
                                  const val = e.target.checked ? 'true' : 'false';
                                  handleCellSave(row.id, col.definition.id, propType, val);
                                }}
                                className="accent-violet-500"
                              />
                            </div>
                          ) : (
                            <input
                              autoFocus
                              type={
                                propType === 'number' || propType === 'currency' ? 'number' :
                                propType === 'date' ? 'date' : 'text'
                              }
                              value={cellDraft}
                              onChange={e => setCellDraft(e.target.value)}
                              onBlur={() => handleCellSave(row.id, col.definition.id, propType, cellDraft)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleCellSave(row.id, col.definition.id, propType, cellDraft);
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              className="w-full bg-neutral-800 px-3 py-2 text-xs text-neutral-100 outline-none ring-1 ring-inset ring-violet-500/60"
                            />
                          )
                        ) : (
                          <div className="group/cell relative min-h-8.5 cursor-pointer px-3 py-2 hover:bg-neutral-800/20">
                            {propType === 'checkbox' ? (
                              <input
                                type="checkbox"
                                checked={cell?.value_bool ?? false}
                                readOnly
                                className="pointer-events-none accent-violet-500"
                              />
                            ) : (
                              <>
                                <span className={!cell || getCellDisplay(cell, propType) === '' ? 'text-neutral-700' : ''}>
                                  {getCellDisplay(cell, propType)}
                                </span>
                                {propType === 'email' && cell?.value_text && (
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(cell.value_text);
                                      toast.success('Copied to clipboard');
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 transition-opacity text-neutral-500 hover:text-violet-400"
                                    title="Copy email address"
                                  >
                                    <Mail size={11} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}

                </tr>
              ))}

              {/* Add row */}
              {!readOnly && (
                <tr>
                  <td colSpan={columns.length + (view?.custom_page_type ? 1 : 2)}>
                    <button
                      onClick={() => createRow.mutate()}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-900/30 hover:text-neutral-400 transition-colors"
                    >
                      <Plus size={11} /> New row
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Column dropdown — rendered outside the table to avoid overflow clipping */}
      {columnMenuId && colMenuPos && (
        <div
          ref={colMenuRef}
          style={{ position: 'fixed', top: colMenuPos.y, left: colMenuPos.x, zIndex: 1000 }}
          className="min-w-35 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
        >
          <button
            onClick={() => {
              const col = columns.find(c => c.id === columnMenuId);
              if (col) { setEditingColId(col.id); setEditingColName(col.definition.name); }
              setColumnMenuId(null);
              setColMenuPos(null);
            }}
            className="flex w-full items-center px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Rename
          </button>
          <button
            onClick={() => {
              if (columnMenuId) deleteColumn.mutate(columnMenuId);
              setColumnMenuId(null);
              setColMenuPos(null);
            }}
            className="flex w-full items-center px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-800"
          >
            Delete column
          </button>
        </div>
      )}

      {/* Email compose drawer */}
      {emailDrawerOpen && (
        <EmailComposeDrawer
          blockId={block.id}
          to={selectedEmails}
          onClose={() => setEmailDrawerOpen(false)}
        />
      )}
    </>
  );
}
