'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, X } from 'lucide-react';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { cn } from '@/lib/utils';

export function AiChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/assistant') setOpen(false);
  }, [pathname]);

  if (pathname === '/assistant') return null;

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col w-[462px] h-[640px] rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--color-bg-surface-raised)', border: '1px solid var(--color-border-default)' }}
        >
          <AiChatPanel onClose={() => setOpen(false)} />
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-lg transition-all duration-200',
          open
            ? 'bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-surface-raised)] rotate-0'
            : 'bg-[var(--color-accent)] hover:opacity-90 hover:scale-110',
        )}
        aria-label={open ? 'Close AI Agent' : 'Open AI Agent'}
      >
        {open ? <X className="h-7 w-7 text-[var(--color-text-primary)]" /> : <Bot className="h-8 w-8 text-white" />}
      </button>
    </>
  );
}
