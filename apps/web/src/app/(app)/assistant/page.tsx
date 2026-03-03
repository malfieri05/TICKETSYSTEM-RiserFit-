'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { Bot, Send, User, BookOpen, Loader2, AlertCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { aiApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Source {
  documentId: string;
  title: string;
  excerpt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  usedContext?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! I'm your internal support assistant. I can answer questions based on the company's knowledge base — things like procedures, policies, and common troubleshooting steps.\n\nIf I can't find the answer, I'll let you know and you can always submit a support ticket.",
};

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: message };
    const loadingMessage: Message = { id: `loading-${Date.now()}`, role: 'assistant', content: '', isLoading: true };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      const res = await aiApi.chat(message);
      const { answer, sources, usedContext } = res.data;
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading ? { id: Date.now().toString(), role: 'assistant', content: answer, sources, usedContext } : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? { id: Date.now().toString(), role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', isError: true }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as FormEvent); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="AI Assistant" />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-3 max-w-3xl', message.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
          >
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-sm', message.role === 'assistant' ? 'bg-teal-600' : 'bg-neutral-700')}>
              {message.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </div>

            <div className={cn('flex flex-col gap-2 max-w-xl', message.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={cn('rounded-2xl px-4 py-3 text-sm leading-relaxed', message.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm')}
                style={
                  message.role === 'user'
                    ? { background: '#14b8a6', color: '#ffffff' }
                    : message.isError
                    ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }
                    : { background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#e5e5e5' }
                }
              >
                {message.isLoading ? (
                  <div className="flex items-center gap-2" style={{ color: '#666666' }}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Thinking…</span>
                  </div>
                ) : message.isError ? (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {message.content}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
              </div>

              {message.sources && message.sources.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {message.sources.map((src) => (
                    <div
                      key={src.documentId}
                      title={src.excerpt}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-teal-300"
                      style={{ background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)' }}
                    >
                      <BookOpen className="h-3 w-3 shrink-0" />
                      {src.title}
                    </div>
                  ))}
                </div>
              )}

              {message.role === 'assistant' && !message.isLoading && !message.isError && message.usedContext === false && message.id !== 'welcome' && (
                <p className="text-xs italic" style={{ color: '#555555' }}>No matching docs found — general answer provided</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="p-4" style={{ background: '#111111', borderTop: '1px solid #2a2a2a' }}>
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-3xl mx-auto items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 overflow-hidden"
            style={{ minHeight: '42px', background: '#1a1a1a', border: '1px solid #2a2a2a' }}
            disabled={isLoading}
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="md">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="text-center text-xs mt-2" style={{ color: '#444444' }}>
          AI responses may not always be accurate. Always verify important information.
        </p>
      </div>
    </div>
  );
}
