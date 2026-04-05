'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  Suspense,
  type ReactNode,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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

/** Closes the panel when the in-app URL changes (incl. search e.g. ?tab=) or the user switches browser tabs. */
function NotificationsPanelAutoCloseInner({
  isOpen,
  close,
}: {
  isOpen: boolean;
  close: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevUrlKey = useRef<string | null>(null);
  const q = searchParams.toString();
  const urlKey = q ? `${pathname}?${q}` : pathname;

  useEffect(() => {
    if (prevUrlKey.current === null) {
      prevUrlKey.current = urlKey;
      return;
    }
    if (prevUrlKey.current !== urlKey) {
      prevUrlKey.current = urlKey;
      if (isOpen) close();
    }
  }, [urlKey, isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') close();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isOpen, close]);

  return null;
}

export function NotificationsPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <NotificationsPanelContext.Provider value={{ isOpen, open, close }}>
      <Suspense fallback={null}>
        <NotificationsPanelAutoCloseInner isOpen={isOpen} close={close} />
      </Suspense>
      {children}
      <NotificationsPanel open={isOpen} onClose={close} />
    </NotificationsPanelContext.Provider>
  );
}
