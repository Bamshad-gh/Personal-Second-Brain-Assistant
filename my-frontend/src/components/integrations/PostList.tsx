'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { postsApi } from '@/lib/api';
import type { ScheduledPost, PostStatus } from '@/types';
import toast from 'react-hot-toast';

const STATUS_STYLES: Record<PostStatus, string> = {
  draft:     'bg-neutral-800 text-neutral-400',
  scheduled: 'bg-yellow-900/30 text-yellow-400',
  sent:      'bg-green-900/30 text-green-400',
  failed:    'bg-red-900/30 text-red-400',
};

export function PostList() {
  const qc = useQueryClient();

  const { data: posts = [], isLoading } = useQuery<ScheduledPost[]>({
    queryKey: ['scheduled-posts'],
    queryFn: postsApi.list,
  });

  const postNow = useMutation({
    mutationFn: postsApi.postNow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-posts'] });
      toast.success('Posted to LinkedIn');
    },
    onError: () => toast.error('Failed to post'),
  });

  const remove = useMutation({
    mutationFn: postsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-posts'] });
      toast.success('Post deleted');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-600">
        <Loader2 size={12} className="animate-spin" /> Loading posts…
      </div>
    );
  }

  if (posts.length === 0) {
    return <p className="text-sm text-neutral-600">No posts yet.</p>;
  }

  return (
    <div className="space-y-2">
      {posts.map((post) => (
        <div
          key={post.id}
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-3"
        >
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[post.status]}`}>
              {post.status}
            </span>
            <p className="flex-1 text-sm text-neutral-300 line-clamp-3 min-w-0">{post.content}</p>
            <div className="flex shrink-0 items-center gap-1">
              {post.status !== 'sent' && (
                <button
                  onClick={() => postNow.mutate(post.id)}
                  title="Post now"
                  className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-violet-400 transition-colors"
                >
                  <Send size={12} />
                </button>
              )}
              <button
                onClick={() => remove.mutate(post.id)}
                title="Delete"
                className="rounded p-1 text-neutral-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {post.scheduled_at && post.status === 'scheduled' && (
            <p className="mt-1.5 text-[10px] text-neutral-600">
              Scheduled: {new Date(post.scheduled_at).toLocaleString()}
            </p>
          )}
          {post.sent_at && (
            <p className="mt-1.5 text-[10px] text-neutral-600">
              Sent: {new Date(post.sent_at).toLocaleString()}
            </p>
          )}
          {post.error_log && (
            <p className="mt-1.5 text-[10px] text-red-500 line-clamp-2">{post.error_log}</p>
          )}
        </div>
      ))}
    </div>
  );
}
