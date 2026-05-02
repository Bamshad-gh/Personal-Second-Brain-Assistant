'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Linkedin, Unlink, Loader2, RefreshCw } from 'lucide-react';
import { linkedinApi } from '@/lib/api';
import type { LinkedInStatus } from '@/types';
import { PostComposer } from '@/components/integrations/PostComposer';
import { PostList } from '@/components/integrations/PostList';
import toast from 'react-hot-toast';

export function LinkedInPanel() {
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery<LinkedInStatus>({
    queryKey: ['linkedin-status'],
    queryFn: linkedinApi.getStatus,
    retry: false,
  });

  const disconnect = useMutation({
    mutationFn: linkedinApi.disconnect,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['linkedin-status'] });
      toast.success('LinkedIn disconnected');
    },
  });

  const connectLinkedIn = async () => {
    try {
      const { url } = await linkedinApi.getOAuthUrl();
      window.location.href = url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'LinkedIn not configured — add LINKEDIN_CLIENT_ID to .env');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-600">
        <Loader2 size={12} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          Connect your LinkedIn account to post updates directly from your workspace.
        </p>
        <button
          onClick={connectLinkedIn}
          className="flex items-center gap-2 rounded-md bg-[#0A66C2] px-4 py-2 text-sm
                     text-white hover:bg-[#0958a8] transition-colors"
        >
          <Linkedin size={16} /> Connect LinkedIn
        </button>
      </div>
    );
  }

  const expiryDate = status.token_expiry ? new Date(status.token_expiry) : null;
  const daysLeft = expiryDate
    ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A66C2]">
          <Linkedin size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-200">{status.display_name || 'LinkedIn account'}</p>
          {daysLeft !== null && (
            <p className={`text-xs ${daysLeft < 7 ? 'text-amber-400' : 'text-neutral-600'}`}>
              Token expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
          className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1
                     text-xs text-neutral-500 hover:border-red-800 hover:text-red-400 transition-colors"
        >
          {disconnect.isPending ? <Loader2 size={10} className="animate-spin" /> : <Unlink size={10} />}
          Disconnect
        </button>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
          New Post
        </h3>
        <PostComposer />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">Posts</h3>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['scheduled-posts'] })}
            className="text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        <PostList />
      </div>
    </div>
  );
}
