'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, X } from 'lucide-react';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { cn } from '@/lib/utils';

export type AiChatWidgetContextValue = {
  openAgentChat: () => void;
  closeAgentChat: () => void;
};

const AiChatWidgetContext = createContext<AiChatWidgetContextValue | null>(null);

export function useAiChatWidget(): AiChatWidgetContextValue {
  const ctx = useContext(AiChatWidgetContext);
  if (!ctx) {
    throw new Error('useAiChatWidget must be used within AiChatWidgetProvider');
  }
  return ctx;
}

/**
 * Owns floating Rovi panel + FAB state; exposes openAgentChat for explainer modals and similar entry points.
 */
export function AiChatWidgetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/assistant') setOpen(false);
  }, [pathname]);

  const openAgentChat = useCallback(() => setOpen(true), []);
  const closeAgentChat = useCallback(() => setOpen(false), []);

  const expandToAssistant = useCallback(
    (opts: { conversationId: string | null; allowWebSearch: boolean }) => {
      const q = new URLSearchParams();
      if (opts.conversationId) q.set('c', opts.conversationId);
      if (opts.allowWebSearch) q.set('web', '1');
      const qs = q.toString();
      router.push(qs ? `/assistant?${qs}` : '/assistant');
      setOpen(false);
    },
    [router],
  );

  const value = useMemo(
    () => ({ openAgentChat, closeAgentChat }),
    [openAgentChat, closeAgentChat],
  );

  return (
    <AiChatWidgetContext.Provider value={value}>
      {children}
      {pathname !== '/assistant' && (
        <>
          {open && (
            <div className="fixed bottom-24 right-6 z-50 flex h-[640px] w-[462px] flex-col overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-transparent shadow-2xl">
              <AiChatPanel onClose={() => setOpen(false)} onExpandToAssistant={expandToAssistant} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className={cn(
              'fixed z-50 flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-lg transition-all duration-200',
              /* Closed: default corner. Open: sit lower + slightly left so the circle clears the panel (bottom-24) with a small gap */
              open ? 'bottom-2 right-7' : 'bottom-6 right-6',
              open
                ? 'rotate-0 bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-surface-raised)]'
                : 'bg-[var(--color-accent)] hover:scale-110 hover:opacity-90',
            )}
            aria-label={open ? 'Close AI Agent' : 'Open AI Agent'}
          >
            {open ? (
              <X className="h-7 w-7 text-[var(--color-text-primary)]" />
            ) : (
              <Bot className="h-8 w-8 text-white" />
            )}
          </button>
        </>
      )}
    </AiChatWidgetContext.Provider>
  );
}
