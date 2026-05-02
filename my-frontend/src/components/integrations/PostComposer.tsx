'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Clock, Send } from 'lucide-react';
import { postsApi } from '@/lib/api';
import type { CreatePostPayload } from '@/types';
import toast from 'react-hot-toast';

interface PostComposerProps {
  initialTemplate?: string;
  sourceRowId?: string;
  onDone?: () => void;
}

const MAX_CHARS = 3000;

export function PostComposer({ initialTemplate = '', sourceRowId, onDone }: PostComposerProps) {
  const qc = useQueryClient();
  const [content, setContent] = useState(initialTemplate);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const create = useMutation({
    mutationFn: (payload: CreatePostPayload) => postsApi.create(payload),
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: ['scheduled-posts'] });
      if (post.status === 'sent') {
        toast.success('Posted to LinkedIn');
      } else {
        toast.success('Post scheduled');
      }
      setContent('');
      setScheduledAt('');
      onDone?.();
    },
    onError: () => toast.error('Failed to create post'),
  });

  const handleSubmit = () => {
    if (!content.trim()) {
      toast.error('Post content is required');
      return;
    }
    const payload: CreatePostPayload = {
      platform: 'linkedin',
      content: content.trim(),
      scheduled_at: scheduleMode && scheduledAt ? scheduledAt : null,
    };
    if (sourceRowId) payload.source_row = sourceRowId;
    create.mutate(payload);
  };

  const remaining = MAX_CHARS - content.length;

  return (
    <div className="space-y-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
        placeholder="What do you want to share on LinkedIn?"
        rows={5}
        className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5
                   text-sm text-neutral-200 placeholder-neutral-600 focus:border-violet-500
                   focus:outline-none"
      />

      <div className="flex items-center justify-between">
        <span className={`text-xs ${remaining < 100 ? 'text-amber-400' : 'text-neutral-600'}`}>
          {remaining} chars remaining
        </span>

        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={scheduleMode}
            onChange={(e) => setScheduleMode(e.target.checked)}
            className="accent-violet-500"
          />
          Schedule
        </label>
      </div>

      {scheduleMode && (
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Post at</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5
                       text-sm text-neutral-200 focus:border-violet-500 focus:outline-none"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={create.isPending || !content.trim()}
        className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm text-white
                   hover:bg-violet-500 disabled:opacity-50 transition-colors"
      >
        {create.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : scheduleMode ? (
          <Clock size={14} />
        ) : (
          <Send size={14} />
        )}
        {scheduleMode ? 'Schedule post' : 'Post now'}
      </button>
    </div>
  );
}
