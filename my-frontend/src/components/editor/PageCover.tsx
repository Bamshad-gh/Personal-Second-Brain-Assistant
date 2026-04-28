/**
 * components/editor/PageCover.tsx
 *
 * What:  Full-width cover banner displayed above the page title.
 *        Supports three cover sources: gallery images, file upload, or a URL.
 *        Vertical position (objectPosition Y%) is persisted in localStorage
 *        and adjustable by dragging the banner.
 *
 * Props:
 *   pageId        — UUID of the page being edited
 *   workspaceId   — needed for useUpdatePage (optimistic updates)
 *   coverUrl      — resolved cover URL (header_pic_url || media header_pic path)
 *   readOnly      — hides all edit controls when true
 *   onCoverChange — called with the new full URL (or null on remove) so the
 *                   parent can update local state without waiting for a refetch
 *
 * Cover source priority (resolved by parent page.tsx):
 *   1. page.header_pic_url  (gallery pick / pasted URL)
 *   2. NEXT_PUBLIC_API_URL + page.header_pic  (uploaded file)
 *   3. null → "Add cover" affordance shown; no banner
 *
 * Portal picker tabs:
 *   Gallery  — GET /api/pages/gallery/ (curated images from media/gallery/)
 *   Upload   — POST /api/pages/:id/cover/ (multipart)
 *   URL      — PATCH /api/pages/:id/ with { header_pic_url }
 */

'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal }                          from 'react-dom';
import { X, GripHorizontal, Image as ImageIcon, Upload, Link2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pageApi }                               from '@/lib/api';
import { pageKeys, useUpdatePage }               from '@/hooks/usePages';
import type { GalleryImage }                     from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PageCoverProps {
  pageId:           string;
  workspaceId:      string;
  coverUrl:         string | null;
  readOnly?:        boolean;
  onCoverChange:    (url: string | null) => void;
  collapsed?:       boolean;
  onExpandRequest?: () => void;
}

type CoverTab = 'gallery' | 'upload' | 'url';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function storageKey(pageId: string): string {
  return `cover-pos-${pageId}`;
}

function loadYOffset(pageId: string): number {
  if (typeof window === 'undefined') return 30;
  const raw = localStorage.getItem(storageKey(pageId));
  const n   = raw !== null ? Number(raw) : NaN;
  return isNaN(n) ? 30 : Math.min(100, Math.max(0, n));
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function PageCover({
  pageId,
  workspaceId,
  coverUrl,
  readOnly,
  onCoverChange,
  collapsed,
  onExpandRequest,
}: PageCoverProps) {
  const queryClient = useQueryClient();
  const updatePage  = useUpdatePage(workspaceId);

  // ── Portal guard ───────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Cover position ─────────────────────────────────────────────────────────
  const [yOffset,    setYOffset]    = useState<number>(30);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startOffset: number } | null>(null);

  useEffect(() => {
    setYOffset(loadYOffset(pageId));
  }, [pageId]);

  // ── Picker portal ──────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTab,  setActiveTab]  = useState<CoverTab>('gallery');
  const [urlInput,   setUrlInput]   = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Gallery query — only runs when gallery tab is visible
  const galleryQuery = useQuery<GalleryImage[]>({
    queryKey:  ['page-gallery'],
    queryFn:   pageApi.getGallery,
    enabled:   pickerOpen && activeTab === 'gallery',
    staleTime: 5 * 60_000,
  });

  // ── Invalidate the page detail query so coverUrl re-derives after change ───
  function refreshPage() {
    queryClient.invalidateQueries({ queryKey: ['page', pageId] });
    queryClient.invalidateQueries({ queryKey: pageKeys.all(workspaceId) });
  }

  // Upload mutation
  const uploadCover = useMutation({
    mutationFn: (file: File) => pageApi.uploadCover(pageId, file),
  });

  // Remove mutation
  const removeCover = useMutation({
    mutationFn: () => pageApi.removeCover(pageId),
    onSuccess:  () => {
      onCoverChange(null);
      refreshPage();
    },
  });

  // ── Click-outside closes picker ────────────────────────────────────────────
  useEffect(() => {
    if (!pickerOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (pickerRef.current?.contains(e.target as Node)) return;
      setPickerOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown',   onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown',   onKeyDown);
    };
  }, [pickerOpen]);

  // ── Drag-to-reposition ─────────────────────────────────────────────────────
  // FIX 1: Guard against button targets — do NOT start a drag if the pointer
  // down originated from an interactive child element (buttons, links).
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = { startY: e.clientY, startOffset: yOffset };
  }, [yOffset]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaPercent = ((e.clientY - dragRef.current.startY) / 192) * 100;
    setYOffset(Math.min(100, Math.max(0, dragRef.current.startOffset + deltaPercent)));
  }, []);

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
    if (!dragRef.current) return;
    dragRef.current = null;
    localStorage.setItem(storageKey(pageId), String(Math.round(yOffset)));
  }, [pageId, yOffset]);

  // ── Gallery pick handler ───────────────────────────────────────────────────
  function pickGalleryImage(url: string) {
    updatePage.mutate(
      { id: pageId, payload: { header_pic_url: url } },
      { onSuccess: () => { onCoverChange(url); refreshPage(); } },
    );
    setPickerOpen(false);
  }

  // ── URL apply handler ──────────────────────────────────────────────────────
  function applyUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    updatePage.mutate(
      { id: pageId, payload: { header_pic_url: trimmed } },
      { onSuccess: () => { onCoverChange(trimmed); refreshPage(); } },
    );
    setUrlInput('');
    setPickerOpen(false);
  }

  // ── File input handler ─────────────────────────────────────────────────────
  // FIX 2: Build a full URL from the relative path the backend returns, then
  // call onCoverChange immediately — no waiting for a refetch.
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    uploadCover.mutate(file, {
      onSuccess: (data) => {
        const raw     = data.header_pic;
        const fullUrl = raw.startsWith('http')
          ? raw
          : `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}${raw}`;
        onCoverChange(fullUrl);
        refreshPage();
        setPickerOpen(false);
      },
    });
  }

  // ── Derived: is there a real (non-blank) cover to display? ────────────────
  const hasRealCover = !!coverUrl && coverUrl.trim().length > 0;

  // readOnly + no cover = nothing to show at all
  if (!hasRealCover && readOnly) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {hasRealCover ? (
        collapsed ? (
          /* ── Collapsed strip (canvas mode) ───────────────────────────────── */
          <div
            className="relative w-full h-10 overflow-hidden cursor-pointer group select-none"
            onClick={onExpandRequest}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl!}
              alt="Page cover"
              draggable={false}
              className="w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: `center ${yOffset}%` }}
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs text-white/90 font-medium">▲ Expand cover</span>
            </div>
          </div>
        ) : (
        /* ── Banner (real cover exists) ──────────────────────────────────── */
        <div
          className={[
            'relative w-full h-48 overflow-hidden group select-none',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          ].join(' ')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Cover image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl!}
            alt="Page cover"
            draggable={false}
            className="w-full h-full object-cover pointer-events-none"
            style={{ objectPosition: `center ${yOffset}%` }}
          />

          {/* Gradient overlay — always pointer-events-none so it never
              intercepts clicks destined for the control buttons above it */}
          <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent pointer-events-none" />

          {/* Controls — shown on hover; hidden while dragging */}
          {!readOnly && !isDragging && (
            <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex items-center gap-1 rounded-md bg-black/50 px-2.5 py-1 text-xs text-neutral-300 backdrop-blur-sm pointer-events-none">
                <GripHorizontal size={12} />
                Drag to reposition
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveTab('gallery'); setPickerOpen(true); }}
                className="flex items-center gap-1.5 rounded-md bg-black/50 px-2.5 py-1 text-xs text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
              >
                <ImageIcon size={12} />
                Change cover
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeCover.mutate(); }}
                disabled={removeCover.isPending}
                className="flex items-center gap-1.5 rounded-md bg-black/50 px-2.5 py-1 text-xs text-white hover:bg-red-600/70 transition-colors backdrop-blur-sm"
              >
                <X size={12} />
                Remove
              </button>
            </div>
          )}
        </div>
        )
      ) : (
        /* ── No cover yet — show "Add cover" affordance ──────────────────── */
        <div className="w-full px-6 pt-2">
          <button
            type="button"
            onClick={() => { setActiveTab('gallery'); setPickerOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 transition-colors text-xs text-neutral-400"
            title="Add a cover image"
          >
            <ImageIcon size={11} />
            Add cover
          </button>
        </div>
      )}

      {/* ── Picker portal — always renderable (not gated on hasRealCover) ─── */}
      {pickerOpen && mounted && createPortal(
        <div
          ref={pickerRef}
          style={{ zIndex: 'var(--z-popup)' as unknown as number }}
          className="fixed top-[8%] left-1/2 -translate-x-1/2 w-135 max-h-110 flex flex-col rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl animate-fade-in overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 shrink-0">
            <span className="text-sm font-medium text-neutral-200">Page cover</span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded p-0.5 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-neutral-800 px-4 shrink-0">
            {(['gallery', 'upload', 'url'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={[
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors',
                  activeTab === tab
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300',
                ].join(' ')}
              >
                {tab === 'gallery' && <ImageIcon size={12} />}
                {tab === 'upload'  && <Upload    size={12} />}
                {tab === 'url'     && <Link2     size={12} />}
                {tab === 'gallery' ? 'Gallery' : tab === 'upload' ? 'Upload' : 'Link'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">

            {/* ── Gallery ── */}
            {activeTab === 'gallery' && (
              <>
                {galleryQuery.isLoading && (
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-24 rounded-lg bg-neutral-800 animate-pulse" />
                    ))}
                  </div>
                )}
                {galleryQuery.isError && (
                  <p className="text-xs text-red-400 text-center py-8">
                    Could not load gallery images.
                  </p>
                )}
                {galleryQuery.data && galleryQuery.data.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-neutral-500">
                    <ImageIcon size={32} className="opacity-30" />
                    <p className="text-xs text-center">
                      No gallery images yet.<br />
                      Place images in <code className="text-neutral-400">media/gallery/</code>.
                    </p>
                  </div>
                )}
                {galleryQuery.data && galleryQuery.data.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {galleryQuery.data.map((img: GalleryImage) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => pickGalleryImage(img.url)}
                        className="group/img relative h-24 overflow-hidden rounded-lg ring-2 ring-transparent hover:ring-violet-500 transition-all"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.id}
                          className="h-full w-full object-cover group-hover/img:scale-105 transition-transform duration-200"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Upload ── */}
            {activeTab === 'upload' && (
              <label className="flex flex-col items-center justify-center gap-3 h-40 rounded-xl border-2 border-dashed border-neutral-700 hover:border-violet-500 cursor-pointer transition-colors">
                <Upload size={28} className="text-neutral-500" />
                <div className="text-center">
                  <p className="text-sm text-neutral-300">Click to upload</p>
                  <p className="text-xs text-neutral-600 mt-0.5">PNG, JPG, WEBP — max 10 MB</p>
                </div>
                {uploadCover.isPending && (
                  <p className="text-xs text-violet-400 animate-pulse">Uploading…</p>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onFileChange}
                  disabled={uploadCover.isPending}
                />
              </label>
            )}

            {/* ── URL ── */}
            {activeTab === 'url' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-neutral-500">
                  Paste an image URL (HTTPS recommended).
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyUrl(); }}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={applyUrl}
                    disabled={!urlInput.trim()}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
