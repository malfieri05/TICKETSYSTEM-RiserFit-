'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { AiChatWidget } from '@/components/ai/AiChatWidget';
import { useNotificationStream } from '@/hooks/useNotifications';

function NotificationStreamInit() {
  useNotificationStream();
  return null;
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
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <NotificationStreamInit />
      <Sidebar />
      <main className="ml-60 flex-1 overflow-y-auto" style={{ background: '#000000' }}>{children}</main>
      <AiChatWidget />
    </div>
  );
}
