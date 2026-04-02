'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, X } from 'lucide-react';
import { notificationsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/Button';
import { POLISH_THEME } from '@/lib/polish';

const listParams = { limit: 50 };

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'unread' | 'read'>('unread');

  const { data, isLoading } = useNotifications(listParams, { enabled: open });
  const notifications = data?.data?.data ?? [];
  const unread = notifications.filter((n) => !n.isRead);
  const read = notifications.filter((n) => n.isRead);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

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
      onClose();
      router.push(href);
    }
  }

  const list = tab === 'unread' ? unread : read;

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed top-0 right-0 bottom-0 left-[260px] z-[39]"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={onClose}
          aria-label="Close notifications panel"
        />
      )}
      <div
        className="fixed top-0 left-[260px] z-40 h-full flex flex-col"
      style={{
        width: 'min(400px, 90vw)',
        background: 'var(--color-bg-surface-raised)',
        borderRight: `1px solid ${POLISH_THEME.listBorder}`,
        boxShadow: open ? '4px 0 24px rgba(0,0,0,0.18), var(--shadow-raised)' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        visibility: open ? 'visible' : 'hidden',
        pointerEvents: open ? 'auto' : 'none',
        transition: open
          ? 'transform 300ms ease-out, visibility 0s linear 0s'
          : 'transform 300ms ease-out, visibility 0s linear 300ms',
      }}
      aria-hidden={!open}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-14 shrink-0"
        style={{ background: 'var(--color-bg-surface)', borderBottom: `1px solid ${POLISH_THEME.innerBorder}` }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Notifications
        </h2>
        <div className="flex items-center gap-1">
          {unread.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAllMut.mutate()}
              loading={markAllMut.isPending}
              className="!py-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--color-bg-surface-raised)] hover:text-[var(--color-text-primary)]"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b shrink-0"
        style={{ borderColor: POLISH_THEME.listBorder }}
      >
        <button
          type="button"
          onClick={() => setTab('unread')}
          className="flex-1 py-3 text-sm font-medium transition-colors"
          style={{
            color: tab === 'unread' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            borderBottom: tab === 'unread' ? `2px solid var(--color-accent)` : '2px solid transparent',
          }}
        >
          Unread
        </button>
        <button
          type="button"
          onClick={() => setTab('read')}
          className="flex-1 py-3 text-sm font-medium transition-colors"
          style={{
            color: tab === 'read' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            borderBottom: tab === 'read' ? `2px solid var(--color-accent)` : '2px solid transparent',
          }}
        >
          Read
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
          </div>
        ) : tab === 'unread' && unread.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-3" style={{ color: 'var(--color-text-muted)' }}>
            <div
              className="rounded-xl flex items-center justify-center w-20 h-20 mb-1"
              style={{ background: 'rgba(52,120,196,0.1)' }}
            >
              <Bell className="h-10 w-10" style={{ color: 'var(--color-accent)' }} />
            </div>
            <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Woohoo!</p>
            <p className="text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>You're all up to date!</p>
          </div>
        ) : tab === 'read' && read.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--color-text-muted)' }}>
            <p className="text-sm">No read notifications</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {list.map((notif, i) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 transition-colors',
                  notif.ticketId && 'hover:bg-[var(--color-bg-surface)]',
                )}
                style={{
                  background: !notif.isRead ? 'rgba(52,120,196,0.06)' : 'transparent',
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
    </>
  );
}
