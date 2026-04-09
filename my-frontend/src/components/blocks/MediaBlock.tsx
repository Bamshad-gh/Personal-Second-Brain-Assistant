/**
 * components/blocks/MediaBlock.tsx
 *
 * What:    Renders image, file, pdf, and video blocks.
 *
 * Empty state (no URL yet):
 *   Shows a drag-and-drop upload zone. Clicking the zone opens a file picker.
 *   The file is read as a DataURL and saved immediately via onSave.
 *   (In Phase 3, this will be replaced with a proper server upload endpoint.)
 *
 * Filled state:
 *   image → renders <img> inline with an optional Remove button on hover
 *   file  → renders a download card with filename + size
 *   pdf   → same as file but with a PDF icon
 *   video → renders <video> with controls
 *
 * Content schema (matches BLOCK_TYPE_REGISTRY comment in models.py):
 *   image:      { url, alt, width }
 *   file / pdf: { url, filename, size }
 *   video:      { url }
 */

'use client';

import { useState, useRef } from 'react';
import type { Block }       from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MediaBlockProps {
  block:     Block;
  onSave:    (content: Record<string, unknown>) => void;
  onDelete:  () => void;
  readOnly?: boolean;
}

// ── Icon per block type ───────────────────────────────────────────────────────
const TYPE_ICON: Record<string, string> = {
  image: '🖼',
  pdf:   '📄',
  video: '🎥',
  file:  '📎',
};

const TYPE_ACCEPT: Record<string, string> = {
  image: 'image/*',
  pdf:   'application/pdf',
  video: 'video/*',
  file:  '*/*',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MediaBlock({ block, onSave, onDelete, readOnly = false }: MediaBlockProps) {

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const url      = String(block.content.url      ?? '');
  const filename = String(block.content.filename ?? 'File');
  const alt      = String(block.content.alt      ?? '');
  const size     = typeof block.content.size === 'number' ? block.content.size : null;
  const width    = typeof block.content.width === 'number' ? block.content.width : undefined;

  // ── File reading ──────────────────────────────────────────────────────────
  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      onSave({
        url:      e.target?.result as string,
        alt:      file.name,
        filename: file.name,
        size:     file.size,
      });
    };
    reader.readAsDataURL(file);
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(true);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EMPTY STATE — upload zone
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (!url) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDraggingOver(false)}
        onClick={() => !readOnly && inputRef.current?.click()}
        className={[
          'my-2 flex flex-col items-center justify-center rounded-xl',
          'border-2 border-dashed py-8 transition-colors',
          readOnly
            ? 'border-neutral-800 cursor-default'
            : isDraggingOver
              ? 'border-violet-500 bg-violet-500/10 cursor-copy'
              : 'border-neutral-700 hover:border-neutral-500 cursor-pointer',
        ].join(' ')}
      >
        <span className="mb-2 text-2xl">
          {TYPE_ICON[block.block_type] ?? '📎'}
        </span>
        <p className="text-sm text-neutral-400">
          {readOnly
            ? 'No file attached'
            : `Drop ${block.block_type} here or click to upload`}
        </p>

        {!readOnly && (
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={TYPE_ACCEPT[block.block_type] ?? '*/*'}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IMAGE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (block.block_type === 'image') {
    return (
      <div className="group relative my-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="max-w-full rounded-lg"
          style={{ width: width ?? 'auto' }}
        />
        {!readOnly && (
          <button
            type="button"
            onClick={onDelete}
            className="absolute right-2 top-2 rounded bg-neutral-900/80 px-2 py-0.5
                       text-xs text-red-400 opacity-0 transition-opacity group-hover:opacity-100"
          >
            Remove
          </button>
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIDEO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (block.block_type === 'video') {
    return (
      <div className="group relative my-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={url}
          controls
          className="max-w-full rounded-lg"
        />
        {!readOnly && (
          <button
            type="button"
            onClick={onDelete}
            className="absolute right-2 top-2 rounded bg-neutral-900/80 px-2 py-0.5
                       text-xs text-red-400 opacity-0 transition-opacity group-hover:opacity-100"
          >
            Remove
          </button>
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FILE / PDF — download card
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div className="group my-2 flex items-center gap-3 rounded-lg border
                    border-neutral-700 bg-neutral-800/50 px-4 py-3">
      <span className="text-xl">
        {TYPE_ICON[block.block_type] ?? '📎'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-200">{filename}</p>
        {size !== null && (
          <p className="text-xs text-neutral-500">
            {(size / 1024).toFixed(1)} KB
          </p>
        )}
      </div>

      <a
        href={url}
        download={filename}
        className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        Download
      </a>

      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-400 opacity-0 transition-opacity group-hover:opacity-100"
        >
          Remove
        </button>
      )}
    </div>
  );
}
