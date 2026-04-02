'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { notificationsApi } from '@/lib/api';
import { useNotifications } from '@/hooks/useNotifications';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications({ limit: 50 });
  const notifications = data?.data.data ?? [];

  const listParams = { limit: 50 };
  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'count'] });
    },
  });

  /** Optimistic read: update UI immediately, then call API in background. */
  function handleNotificationClick(notif: (typeof notifications)[0]) {
    if (notif.ticketId) {
      const subtaskId = notif.metadata?.subtaskId;
      const href = subtaskId ? `/tickets/${notif.ticketId}#subtask-${subtaskId}` : `/tickets/${notif.ticketId}`;
      if (!notif.isRead) {
        qc.setQueryData(
          ['notifications', listParams],
          (prev: Awaited<ReturnType<typeof notificationsApi.list>>['data'] | undefined) => {
            if (!prev?.data) return prev;
            return {
              ...prev,
              data: prev.data.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
            };
          },
        );
        markReadMut.mutate(notif.id);
      }
      router.push(href);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
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
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--color-text-muted)' }}>
            <Bell className="h-10 w-10 mb-1" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>No notifications yet</p>
            <p className="text-xs text-center max-w-sm" style={{ color: 'var(--color-text-secondary)' }}>When ticket and subtask updates happen, they'll appear here.</p>
          </div>
        ) : (
          <div className="dashboard-card rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            {notifications.map((notif, i) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                data-clickable={notif.ticketId ? 'true' : undefined}
                className="flex items-start gap-3 px-4 py-3 transition-colors [&[data-clickable='true']]:hover:bg-[var(--color-bg-surface)]"
                style={{
                  background: !notif.isRead ? 'rgba(52,120,196,0.06)' : 'transparent',
                  borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : undefined,
                  cursor: notif.ticketId ? 'pointer' : 'default',
                }}
              >
                <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: !notif.isRead ? 'var(--color-accent)' : 'transparent' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ fontWeight: !notif.isRead ? 600 : 400, color: !notif.isRead ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    {notif.title}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{notif.body}</p>
                </div>
                <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
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
