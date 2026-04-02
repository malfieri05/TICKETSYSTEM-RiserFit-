'use client';

import { Bell } from 'lucide-react';
import { useNotificationCount } from '@/hooks/useNotifications';
import { useNotificationsPanel } from '@/contexts/NotificationsPanelContext';
import { ProfileMenu } from '@/components/layout/ProfileMenu';

interface HeaderProps {
  title: React.ReactNode;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const { unreadCount } = useNotificationCount();
  const { open: openNotificationsPanel } = useNotificationsPanel();

  return (
    <header
      className="sticky top-0 z-30 flex h-14 min-h-14 shrink-0 items-center justify-between px-6 box-border"
      style={{
        background: 'var(--color-bg-app-header)',
        boxShadow: 'var(--shadow-app-header)',
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {typeof title === 'string' ? (
          <h1
            className="min-w-0 truncate text-base font-semibold"
            style={{ color: 'var(--color-text-app-header)' }}
          >
            {title}
          </h1>
        ) : (
          title
        )}
      </div>
      <div className="flex items-center gap-2">
        {action}
        <div className="flex items-center gap-4 pl-1">
          <button
            type="button"
            onClick={openNotificationsPanel}
            className="header-nav-link focus-ring relative overflow-visible rounded-[var(--radius-md)] p-2 transition-colors"
            style={{ color: 'var(--color-text-app-header-muted)' }}
            aria-label={
              unreadCount > 0
                ? `Open notifications, ${unreadCount > 99 ? '99+' : unreadCount} unread`
                : 'Open notifications'
            }
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 box-border flex size-5 items-center justify-center rounded-full bg-red-500 font-bold leading-none text-white tabular-nums">
                <span
                  className={
                    unreadCount > 9 ? 'text-[9px] leading-none' : 'text-[10px] leading-none'
                  }
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </span>
            )}
          </button>
          <span
            className="h-5 w-px shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            aria-hidden
          />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
