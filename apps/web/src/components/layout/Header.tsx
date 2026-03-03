'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useNotificationCount } from '@/hooks/useNotifications';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const { unreadCount } = useNotificationCount();

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between px-6"
      style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}
    >
      <h1 className="text-base font-semibold text-gray-100">{title}</h1>
      <div className="flex items-center gap-2">
        {action}
        <Link
          href="/notifications"
          className="relative p-2 text-gray-500 hover:text-gray-200 rounded-lg transition-colors"
          style={{ ['&:hover' as string]: { background: '#2a2a2a' } }}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
