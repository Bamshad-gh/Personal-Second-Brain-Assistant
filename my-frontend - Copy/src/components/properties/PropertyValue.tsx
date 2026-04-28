/**
 * components/properties/PropertyValue.tsx
 *
 * What:    Renders and edits a single property's value inline.
 *          Switches on definition.prop_type to show the right display + editor.
 *
 * Props:
 *   definition     — the PropertyDefinition (type, name, options)
 *   value          — the current PropertyValue (may be undefined if not set yet)
 *   pageId         — page UUID (needed to build the upsert payload)
 *   existingValues — full list of values for this page (needed by useUpsertValue)
 *   readOnly       — when true (locked page), disable all editing
 *
 * Portal strategy:
 *   Select and multi-select types open a dropdown list of options. These are
 *   rendered via createPortal to document.body so they escape overflow:hidden
 *   ancestors (canvas-mode container) and sit above TipTap stacking contexts.
 *   Other types (text, number, date, etc.) render inline inputs that don't
 *   create overflow issues and are left unchanged.
 *   Mount guard: useState+useEffect only — never typeof document !== 'undefined'.
 *
 * Select / Multi value_json shape:
 *   Select: value_json = { label: string; color: string } | null
 *   Multi:  value_json = Array<{ label: string; color: string }> | null
 *   Colors displayed via inline styles (not dynamic Tailwind — purged at build time).
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal }                from 'react-dom';
import { Check }                       from 'lucide-react';
import { useUpsertValue }              from '@/hooks/useProperties';
import type { PropertyDefinition, PropertyValue as PV, SelectOption } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PropertyValueProps {
  definition:     PropertyDefinition;
  value?:         PV;
  pageId:         string;
  existingValues: PV[];
  readOnly?:      boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// OptionValue — the shape stored in value_json for select / multi
// ─────────────────────────────────────────────────────────────────────────────

interface OptionValue { label: string; color: string }

function isOptionValue(v: unknown): v is OptionValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    'label' in v &&
    'color' in v
  );
}

function isOptionValueArray(v: unknown): v is OptionValue[] {
  return Array.isArray(v) && (v.length === 0 || isOptionValue(v[0]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertyValueDisplay — read-only chip shown inside the pill
// ─────────────────────────────────────────────────────────────────────────────

function PropertyValueDisplay({ definition, value }: { definition: PropertyDefinition; value?: PV }) {
  const empty = <span className="text-neutral-600">—</span>;

  switch (definition.prop_type) {

    case 'checkbox':
      return (
        <span className={[
          'flex h-3.5 w-3.5 items-center justify-center rounded border',
          value?.value_bool
            ? 'border-violet-500 bg-violet-500 text-white'
            : 'border-neutral-600',
        ].join(' ')}>
          {value?.value_bool && <Check size={9} strokeWidth={3} />}
        </span>
      );

    case 'date':
      return value?.value_date
        ? <span>{formatDate(value.value_date)}</span>
        : empty;

    case 'number':
      return value?.value_number != null
        ? <span>{value.value_number}</span>
        : empty;

    case 'currency':
      return value?.value_number != null
        ? <span>${value.value_number.toFixed(2)}</span>
        : empty;

    case 'select': {
      const opt = value?.value_json;
      if (!isOptionValue(opt)) return empty;
      return (
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: opt.color + '33', color: opt.color }}
        >
          {opt.label}
        </span>
      );
    }

    case 'multi': {
      const opts = value?.value_json;
      if (!isOptionValueArray(opts) || opts.length === 0) return empty;
      return (
        <span className="flex flex-wrap gap-1">
          {opts.map((o) => (
            <span
              key={o.label}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: o.color + '33', color: o.color }}
            >
              {o.label}
            </span>
          ))}
        </span>
      );
    }

    case 'url':
      return value?.value_text
        ? <span className="truncate max-w-30 text-violet-400">{value.value_text}</span>
        : empty;

    case 'relation':
    case 'file':
    case 'object':
      return empty;

    // text / email / phone
    default:
      return value?.value_text
        ? <span className="truncate max-w-30">{value.value_text}</span>
        : empty;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PropertyValue — main component
// ─────────────────────────────────────────────────────────────────────────────

export function PropertyValue({
  definition,
  value,
  pageId,
  existingValues,
  readOnly = false,
}: PropertyValueProps) {

  const [editing, setEditing] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);

  const upsert = useUpsertValue(pageId, existingValues);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PORTAL STATE — select + multi only
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Mount guard: useState+useEffect only — never typeof document !== 'undefined'
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // triggerRef — the display button that opens the dropdown
  // portalRef  — the portal div, used for click-outside exclusion
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef  = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });

  // Click-outside — only active for select / multi dropdowns
  useEffect(() => {
    if (!editing) return;
    if (definition.prop_type !== 'select' && definition.prop_type !== 'multi') return;

    function onMouseDown(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (portalRef.current?.contains(e.target as Node)) return;
      setEditing(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [editing, definition.prop_type]);

  // Escape key — closes any open select / multi dropdown
  useEffect(() => {
    if (!editing) return;
    if (definition.prop_type !== 'select' && definition.prop_type !== 'multi') return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setEditing(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing, definition.prop_type]);

  // Focus inline inputs when they appear
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function buildPayload(partial: Partial<PV>): Partial<PV> {
    return { page: pageId, definition: definition.id, ...partial };
  }

  function save(partial: Partial<PV>) {
    upsert.mutate(buildPayload(partial));
    setEditing(false);
  }

  // Compute portal position from the trigger button's bounding rect
  function openDropdown() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left });
    }
    setEditing(true);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER — switch on prop_type
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── Checkbox ──────────────────────────────────────────────────────────────
  if (definition.prop_type === 'checkbox') {
    return (
      <button
        disabled={readOnly}
        onClick={() => {
          if (readOnly) return;
          upsert.mutate(buildPayload({ value_bool: !(value?.value_bool ?? false) }));
        }}
        className="flex items-center gap-1.5 disabled:cursor-not-allowed"
      >
        <PropertyValueDisplay definition={definition} value={value} />
      </button>
    );
  }

  // ── Date ──────────────────────────────────────────────────────────────────
  if (definition.prop_type === 'date') {
    if (editing && !readOnly) {
      return (
        <input
          ref={inputRef}
          type="date"
          defaultValue={toDateInputValue(value?.value_date ?? null)}
          onChange={(e) => {
            if (e.target.value) {
              save({ value_date: new Date(e.target.value).toISOString() });
            }
          }}
          onBlur={() => setEditing(false)}
          className="bg-neutral-800 text-neutral-200 text-xs rounded px-1 py-0.5 outline-none border border-violet-500"
        />
      );
    }
    return (
      <button disabled={readOnly} onClick={() => setEditing(true)} className="text-left disabled:cursor-not-allowed">
        <PropertyValueDisplay definition={definition} value={value} />
      </button>
    );
  }

  // ── Select — portal dropdown ───────────────────────────────────────────────
  if (definition.prop_type === 'select') {
    return (
      <>
        {/* Display button — triggers portal dropdown */}
        <button
          ref={triggerRef}
          disabled={readOnly}
          onClick={() => { if (!readOnly) openDropdown(); }}
          className="text-left disabled:cursor-not-allowed"
        >
          <PropertyValueDisplay definition={definition} value={value} />
        </button>

        {/* Portal dropdown — rendered at document.body to escape overflow:hidden */}
        {editing && !readOnly && mounted && createPortal(
          <div
            ref={portalRef}
            style={{
              position: 'fixed',
              top:      dropPos.top,
              left:     dropPos.left,
              zIndex:   'var(--z-popup)' as unknown as number,
            }}
            className="flex flex-col gap-0.5 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-lg min-w-35 animate-fade-in"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {definition.options.map((opt: SelectOption) => {
              const c = opt.color ?? '#a855f7';
              return (
                <button
                  key={opt.label}
                  onClick={() => save({ value_json: { label: opt.label, color: c } })}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-neutral-800 transition-colors"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c }} />
                  <span style={{ color: c }}>{opt.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => save({ value_json: null })}
              className="px-3 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-800 transition-colors"
            >
              Clear
            </button>
          </div>,
          document.body,
        )}
      </>
    );
  }

  // ── Multi-select — portal dropdown ────────────────────────────────────────
  if (definition.prop_type === 'multi') {
    const selected: OptionValue[] = isOptionValueArray(value?.value_json) ? value!.value_json : [];

    return (
      <>
        {/* Display button — triggers portal dropdown */}
        <button
          ref={triggerRef}
          disabled={readOnly}
          onClick={() => { if (!readOnly) openDropdown(); }}
          className="text-left disabled:cursor-not-allowed"
        >
          <PropertyValueDisplay definition={definition} value={value} />
        </button>

        {/* Portal dropdown — rendered at document.body to escape overflow:hidden */}
        {editing && !readOnly && mounted && createPortal(
          <div
            ref={portalRef}
            style={{
              position: 'fixed',
              top:      dropPos.top,
              left:     dropPos.left,
              zIndex:   'var(--z-popup)' as unknown as number,
            }}
            className="flex flex-col gap-0.5 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-lg min-w-40 animate-fade-in"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {definition.options.map((opt: SelectOption) => {
              const isSelected = selected.some((s) => s.label === opt.label);
              const c = opt.color ?? '#a855f7';
              return (
                <button
                  key={opt.label}
                  onClick={() => {
                    const next = isSelected
                      ? selected.filter((s) => s.label !== opt.label)
                      : [...selected, { label: opt.label, color: c }];
                    upsert.mutate(buildPayload({ value_json: next }));
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-neutral-800 transition-colors"
                >
                  <span
                    className="flex h-3 w-3 shrink-0 items-center justify-center rounded border border-neutral-600"
                    style={isSelected ? { backgroundColor: c, borderColor: c } : {}}
                  >
                    {isSelected && <Check size={8} strokeWidth={3} className="text-white" />}
                  </span>
                  <span style={{ color: c }}>{opt.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-800 transition-colors"
            >
              Done
            </button>
          </div>,
          document.body,
        )}
      </>
    );
  }

  // ── Number / currency ─────────────────────────────────────────────────────
  if (definition.prop_type === 'number' || definition.prop_type === 'currency') {
    if (editing && !readOnly) {
      return (
        <input
          ref={inputRef}
          type="number"
          defaultValue={value?.value_number ?? ''}
          onBlur={(e) => {
            const n = parseFloat(e.target.value);
            save({ value_number: isNaN(n) ? null : n });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-24 bg-neutral-800 text-neutral-200 text-xs rounded px-1 py-0.5 outline-none border border-violet-500"
        />
      );
    }
    return (
      <button disabled={readOnly} onClick={() => setEditing(true)} className="text-left disabled:cursor-not-allowed">
        <PropertyValueDisplay definition={definition} value={value} />
      </button>
    );
  }

  // ── Relation / file / object — read-only ──────────────────────────────────
  if (['relation', 'file', 'object'].includes(definition.prop_type)) {
    return <PropertyValueDisplay definition={definition} value={value} />;
  }

  // ── Text / url / email / phone (default) ─────────────────────────────────
  if (editing && !readOnly) {
    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue={value?.value_text ?? ''}
        onBlur={(e) => save({ value_text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-36 bg-neutral-800 text-neutral-200 text-xs rounded px-1 py-0.5 outline-none border border-violet-500"
      />
    );
  }
  return (
    <button disabled={readOnly} onClick={() => setEditing(true)} className="text-left disabled:cursor-not-allowed">
      <PropertyValueDisplay definition={definition} value={value} />
    </button>
  );
}
