'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';

interface NotificationsPanelContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const NotificationsPanelContext = createContext<NotificationsPanelContextValue | null>(null);

export function useNotificationsPanel() {
  const ctx = useContext(NotificationsPanelContext);
  if (!ctx) {
    throw new Error('useNotificationsPanel must be used within NotificationsPanelProvider');
  }
  return ctx;
}

export function NotificationsPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <NotificationsPanelContext.Provider value={{ isOpen, open, close }}>
      {children}
      <NotificationsPanel open={isOpen} onClose={close} />
    </NotificationsPanelContext.Provider>
  );
}
