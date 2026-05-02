'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calendarApi } from '@/lib/api';
import type { InAppNotification } from '@/types';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: notifications = [] } = useQuery<InAppNotification[]>({
    queryKey: ['notifications-unread'],
    queryFn: calendarApi.listUnreadNotifications,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: calendarApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });

  const markAll = useMutation({
    mutationFn: calendarApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-unread'] }),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-7 w-7 items-center justify-center rounded-md
                   text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300
                   transition-colors"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center
                           rounded-full bg-violet-500 text-[9px] font-bold text-white leading-none">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-lg border border-neutral-800
                        bg-neutral-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <span className="text-xs font-medium text-neutral-300">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-neutral-600">No new notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 border-b border-neutral-800/50 px-3 py-2.5
                             last:border-b-0 hover:bg-neutral-800/40 transition-colors"
                >
                  <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-neutral-200 truncate">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-neutral-500 line-clamp-2">{n.body}</p>
                    )}
                    <p className="mt-1 text-[10px] text-neutral-600">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    className="shrink-0 text-neutral-600 hover:text-neutral-400 transition-colors"
                    aria-label="Mark as read"
                  >
                    <Check size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
