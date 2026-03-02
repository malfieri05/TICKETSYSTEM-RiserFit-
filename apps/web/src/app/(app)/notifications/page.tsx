'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { notificationsApi } from '@/lib/api';
import { useNotifications } from '@/hooks/useNotifications';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications({ limit: 50 });
  const notifications = data?.data.data ?? [];

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Notifications"
        action={
          notifications.some((n) => !n.isRead) ? (
            <Button variant="secondary" size="sm" onClick={() => markAllMut.mutate()} loading={markAllMut.isPending}>
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 p-6 max-w-2xl">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Bell className="h-10 w-10 mb-3 text-gray-300" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => {
                  if (!notif.isRead) markReadMut.mutate(notif.id);
                  if (notif.ticketId) router.push(`/tickets/${notif.ticketId}`);
                }}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 transition-colors',
                  notif.ticketId && 'cursor-pointer hover:bg-gray-50',
                  !notif.isRead && 'bg-indigo-50/40',
                )}
              >
                <div className={cn('mt-1 h-2 w-2 rounded-full shrink-0', !notif.isRead ? 'bg-indigo-500' : 'bg-transparent')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', !notif.isRead ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                    {notif.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.body}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
