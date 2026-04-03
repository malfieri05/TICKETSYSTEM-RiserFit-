'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { AiChatWidgetProvider } from '@/components/ai/AiChatWidget';
import { NotificationsPanelProvider } from '@/contexts/NotificationsPanelContext';
import {
  SidebarCollapseProvider,
  useSidebarCollapse,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_EXPANDED_WIDTH_PX,
} from '@/contexts/SidebarCollapseContext';
import { useNotificationStream } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

function NotificationStreamInit() {
  useNotificationStream();
  return null;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarCollapse();
  return (
    <div className="flex h-screen overflow-hidden">
      <NotificationStreamInit />
      <Sidebar />
      <main
        className={cn(
          'min-w-0 flex-1 overflow-y-auto',
          /* duration/easing match SIDEBAR_RAIL_TRANSITION_* in SidebarCollapseContext */
          'transition-[margin-left] duration-[700ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
        )}
        style={{
          marginLeft: collapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : SIDEBAR_EXPANDED_WIDTH_PX,
          background: 'var(--color-bg-page)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarCollapseProvider>
      <NotificationsPanelProvider>
        <AiChatWidgetProvider>
          <AppShell>{children}</AppShell>
        </AiChatWidgetProvider>
      </NotificationsPanelProvider>
    </SidebarCollapseProvider>
  );
}
