'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNotificationCount } from '@/hooks/useNotifications';
import { useNotificationsPanel } from '@/contexts/NotificationsPanelContext';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const { unreadCount } = useNotificationCount();
  const { open: openNotificationsPanel } = useNotificationsPanel();

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between px-6"
      style={{ background: 'var(--color-bg-surface-raised)', borderBottom: '1px solid var(--color-border-default)' }}
    >
      <h1 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h1>
      <div className="flex items-center gap-2">
        {action}
        <button
          type="button"
          onClick={openNotificationsPanel}
          className="header-nav-link relative p-2 rounded-lg transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Open notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
