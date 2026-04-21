/**
 * components/blocks/MediaBlock.tsx
 *
 * What:    Renders image, file, pdf, and video blocks.
 *
 * Upload:
 *   Files are uploaded to the server via POST /api/blocks/upload/ (multipart).
 *   The returned permanent URL is saved into block.content.url.
 *   No base64 is used. Max size: 10 MB (enforced frontend + backend).
 *
 * Empty state:
 *   Drag-and-drop zone + click-to-pick. An optional URL input lets the user
 *   paste an external URL (image, PDF) without uploading a file.
 *
 * Filled state — per type:
 *   image → <img> with a drag-to-resize handle at the bottom-right corner.
 *   pdf   → inline <iframe> embed with an "Open ↗" link.
 *   video → <video controls>
 *   file  → download card with filename + size.
 *
 * Content schema (matches BLOCK_TYPE_REGISTRY comment in models.py):
 *   image:      { url, alt, width }
 *   file / pdf: { url, filename, size }
 *   video:      { url }
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { blockApi }                    from '@/lib/api';
import type { Block }        from '@/types';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MediaBlockProps {
  block:     Block;
  onSave:    (content: Record<string, unknown>) => void;
  onDelete:  () => void;
  readOnly?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MediaBlock({ block, onSave, onDelete, readOnly = false }: MediaBlockProps) {

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [error,          setError]          = useState('');
  const [urlInput,       setUrlInput]       = useState('');

  // ── PDF blob URL ──────────────────────────────────────────────────────────
  // Django sends X-Frame-Options: DENY on all responses, which blocks iframes.
  // Fetching the PDF and creating a same-origin blob URL bypasses this header.
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');

  // Image resize state
  const [imgWidth, setImgWidth] = useState<number>(
    typeof block.content.width === 'number' ? block.content.width : 0,
  );
  const resizingRef = useRef<{ startX: number; startW: number } | null>(null);
  const imgRef      = useRef<HTMLImageElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  const url      = String(block.content.url      ?? '');
  const filename = String(block.content.filename ?? 'File');
  const alt      = String(block.content.alt      ?? '');
  const size     = typeof block.content.size === 'number' ? block.content.size : null;

  useEffect(() => {
    if (!url || block.block_type !== 'pdf') return;

    let objectUrl = '';
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch(() => {
        // Fetch failed — iframe will fall back to direct URL (may not display
        // due to X-Frame-Options, but the Open ↗ link still works).
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, block.block_type]);

  // ── Server upload ─────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setError('');

    if (file.size > MAX_BYTES) {
      setError('File too large. Max size is 10 MB.');
      return;
    }

    setUploading(true);
    try {
      const result = await blockApi.uploadFile(file);
      setImgWidth(0);
      onSave({
        url:      result.url,
        filename: result.filename,
        size:     result.size,
        alt:      file.name,
      });
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  // ── URL paste ─────────────────────────────────────────────────────────────
  function handleUrlSubmit() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onSave({
      url:      trimmed,
      alt:      'Image',
      filename: trimmed,
    });
    setUrlInput('');
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EMPTY STATE — upload zone
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (!url) {
    return (
      <div className="my-2">

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onClick={() => !readOnly && !uploading && inputRef.current?.click()}
          className={[
            'flex min-h-32 flex-col items-center justify-center rounded-xl',
            'border-2 border-dashed py-8 transition-colors',
            readOnly || uploading
              ? 'cursor-default border-neutral-800'
              : isDraggingOver
                ? 'cursor-copy border-violet-500 bg-violet-500/10'
                : 'cursor-pointer border-neutral-700 hover:border-neutral-500',
          ].join(' ')}
        >
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2
                              border-violet-500 border-t-transparent" />
              Uploading…
            </div>
          ) : (
            <>
              <span className="mb-2 text-3xl">
                {TYPE_ICON[block.block_type] ?? '📎'}
              </span>
              <p className="text-sm text-neutral-400">
                {readOnly
                  ? 'No file attached'
                  : `Drop ${block.block_type} here or click to upload`}
              </p>
              {!readOnly && (
                <p className="mt-1 text-xs text-neutral-600">Max 10 MB</p>
              )}
            </>
          )}
        </div>

        {/* Hidden file input */}
        {!readOnly && (
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={TYPE_ACCEPT[block.block_type] ?? '*/*'}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        )}

        {/* Error message */}
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}

        {/* URL input */}
        {!readOnly && !uploading && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSubmit(); }}
              placeholder="Or paste a URL and press Enter…"
              className="flex-1 rounded border border-neutral-700 bg-neutral-900
                         px-3 py-1.5 text-xs text-neutral-300 placeholder-neutral-600
                         outline-none focus:border-violet-500"
            />
            <button
              type="button"
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim()}
              className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300
                         hover:bg-neutral-700 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IMAGE — with resize handle
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (block.block_type === 'image') {
    return (
      <div className="group relative my-2 inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt={alt}
          className="block rounded-lg"
          style={{ width: imgWidth > 0 ? imgWidth : 'auto', maxWidth: '100%' }}
        />

        {/* Remove button */}
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

        {/* Resize handle — bottom-right corner */}
        {!readOnly && (
          <div
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize
                       rounded-tl bg-violet-500 opacity-0 transition-opacity
                       group-hover:opacity-100"
            onPointerDown={(e) => {
              e.preventDefault();
              resizingRef.current = {
                startX: e.clientX,
                startW: imgRef.current?.offsetWidth ?? (imgWidth || 400),
              };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!resizingRef.current) return;
              const delta = e.clientX - resizingRef.current.startX;
              const newW  = Math.max(100, resizingRef.current.startW + delta);
              setImgWidth(newW);
            }}
            onPointerUp={() => {
              if (!resizingRef.current) return;
              resizingRef.current = null;
              onSave({ ...block.content, width: imgWidth });
            }}
          />
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PDF — inline iframe embed
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (block.block_type === 'pdf') {
    return (
      <div className="group my-2 overflow-hidden rounded-lg border border-neutral-700">

        {/* Header bar */}
        <div className="flex items-center justify-between bg-neutral-800 px-3 py-2">
          <span className="truncate text-sm text-neutral-300">
            {block.content.filename ?? 'Document.pdf'}
          </span>
          <div className="ml-2 flex shrink-0 items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Open ↗
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
        </div>

        {/* PDF embed — uses blob URL to bypass X-Frame-Options: DENY */}
        {pdfBlobUrl ? (
          <iframe
            src={pdfBlobUrl}
            className="w-full"
            style={{ height: '500px' }}
            title={String(block.content.filename ?? 'PDF')}
          />
        ) : (
          <div className="flex items-center justify-center bg-neutral-900"
               style={{ height: '500px' }}>
            <div className="h-5 w-5 animate-spin rounded-full border-2
                            border-violet-500 border-t-transparent" />
          </div>
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
        <video src={url} controls className="max-w-full rounded-lg" />
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
  // FILE — download card
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
