'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BookMarked, Send, User, Bot, Loader2 } from 'lucide-react';
import { aiApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    documentId: string;
    title: string;
    excerpt: string;
    pageNumber?: number | null;
    pagesLabel?: string;
  }>;
  usedContext?: boolean;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Ask a question about the company handbook. I’ll answer using only handbook content.',
};

export default function HandbookPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user && user.studioId == null) {
      router.replace('/tickets');
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await aiApi.handbookChat(text);
      const { answer, sources, usedContext } = res.data;
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: answer,
        sources: sources?.length ? sources : undefined,
        usedContext,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || (user && user.studioId == null)) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg-page)' }}>
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Handbook" />

      <div className="flex-1 flex flex-col p-6 max-w-3xl mx-auto w-full">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}
            >
              {m.role === 'assistant' && (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <BookMarked className="h-4 w-4 text-white" />
                </div>
              )}
              <div
                className="rounded-xl px-4 py-3 max-w-[85%]"
                style={{
                  background: m.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg-surface-raised)',
                  border: m.role === 'assistant' ? '1px solid var(--color-border-default)' : 'none',
                  color: m.role === 'user' ? '#ffffff' : 'var(--color-text-primary)',
                }}
              >
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                {m.role === 'assistant' && m.usedContext === false && m.id !== 'welcome' && (
                  <p className="text-xs mt-2 italic" style={{ color: 'var(--color-text-muted)' }}>
                    I couldn’t find this in the handbook. You may need to contact your manager or team.
                  </p>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border-default)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Sources:</p>
                    <ul className="text-xs space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {m.sources.map((s) => (
                        <li key={s.documentId}>
                          {s.title}
                          {s.pagesLabel ? (
                            <> — {s.pagesLabel}</>
                          ) : s.pageNumber != null ? (
                            <> — Page {s.pageNumber}</>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {m.role === 'user' && (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-sm font-semibold"
                >
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--color-accent)' }}
              >
                <BookMarked className="h-4 w-4 text-white" />
              </div>
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: 'var(--color-bg-surface-raised)', border: '1px solid var(--color-border-default)' }}
              >
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-accent)' }} />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the handbook..."
            className="flex-1 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            style={{
              background: 'var(--color-bg-surface-raised)',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)',
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex items-center justify-center rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--color-accent)', color: '#ffffff' }}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
