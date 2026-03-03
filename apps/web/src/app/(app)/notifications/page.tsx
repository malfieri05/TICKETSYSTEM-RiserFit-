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

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
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
            <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: '#555555' }}>
            <Bell className="h-10 w-10 mb-3" style={{ color: '#333333' }} />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            {notifications.map((notif, i) => (
              <div
                key={notif.id}
                onClick={() => {
                  if (!notif.isRead) markReadMut.mutate(notif.id);
                  if (notif.ticketId) router.push(`/tickets/${notif.ticketId}`);
                }}
                className="flex items-start gap-3 px-4 py-3 transition-colors"
                style={{
                  background: !notif.isRead ? 'rgba(20,184,166,0.06)' : 'transparent',
                  borderTop: i > 0 ? '1px solid #222222' : undefined,
                  cursor: notif.ticketId ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (notif.ticketId) e.currentTarget.style.background = '#222222'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = !notif.isRead ? 'rgba(20,184,166,0.06)' : 'transparent'; }}
              >
                <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: !notif.isRead ? '#14b8a6' : 'transparent' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ fontWeight: !notif.isRead ? 600 : 400, color: !notif.isRead ? '#e5e5e5' : '#888888' }}>
                    {notif.title}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#555555' }}>{notif.body}</p>
                </div>
                <span className="text-xs shrink-0 mt-0.5" style={{ color: '#555555' }}>
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
