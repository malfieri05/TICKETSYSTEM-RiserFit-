'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, X, Send, User, BookOpen, Loader2, AlertCircle, CheckCircle2, XCircle, Globe } from 'lucide-react';
import { agentApi, type AgentResponse, type AgentActionPlan } from '@/lib/api';
import { cn } from '@/lib/utils';

function stripConfirmCancelPhrase(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\n*\nClick \*\*Confirm\*\* to proceed or \*\*Cancel\*\* to stop\.?/gi, '')
    .replace(/\n*Click \*\*Confirm\*\* to proceed or \*\*Cancel\*\* to stop\.?/gi, '')
    .replace(/\n*Click Confirm to proceed or Cancel to stop\.?/gi, '')
    .replace(/\n*Confirm to proceed or Cancel to stop\.?/gi, '')
    .trimEnd();
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: 'ASK' | 'DO';
  sources?: Array<{ title: string; text: string }>;
  actionPlan?: AgentActionPlan;
  toolResults?: Array<{ tool: string; result: unknown }>;
  isLoading?: boolean;
  isError?: boolean;
  // for confirmation tracking
  conversationId?: string;
  messageId?: string;
  confirmed?: boolean; // true after user clicked Confirm and action completed
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I have access to all tickets, knowledge base, and reporting. Ask me anything or ask me to do something — like create a ticket, update status, or assign work.",
};

export function AiChatWidget() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [allowWebSearch, setAllowWebSearch] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: message };
    const loadingMsg: Message = { id: `l-${Date.now()}`, role: 'assistant', content: '', isLoading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      const res = await agentApi.chat(message, conversationId ?? undefined, allowWebSearch);
      const data = res.data;
      if (!conversationId) setConversationId(data.conversationId);

      const assistantMsg: Message = {
        id: data.messageId,
        role: 'assistant',
        content: data.content,
        mode: data.mode,
        sources: data.sources,
        actionPlan: data.actionPlan,
        toolResults: data.toolResults,
        conversationId: data.conversationId,
        messageId: data.messageId,
      };

      setMessages((prev) => prev.map((m) => (m.isLoading ? assistantMsg : m)));
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? { id: `err-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.', isError: true }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (msg: Message) => {
    if (!msg.conversationId || !msg.messageId) return;
    setIsLoading(true);

    const loadingMsg: Message = { id: `cl-${Date.now()}`, role: 'assistant', content: '', isLoading: true };
    setMessages((prev) => [...prev, loadingMsg]);

    try {
      const res = await agentApi.confirm(msg.conversationId, msg.messageId);
      const data = res.data;
      const confirmMsg: Message = {
        id: data.messageId,
        role: 'assistant',
        content: data.content,
        mode: 'DO',
        toolResults: data.toolResults,
      };
      const confirmedMessageId = msg.id;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.isLoading) return confirmMsg;
          if (m.id === confirmedMessageId) return { ...m, confirmed: true };
          return m;
        }),
      );
      // Refresh tickets list and dashboard so the new ticket appears without manual refresh
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['my-summary'] });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? { id: `err-${Date.now()}`, role: 'assistant', content: 'Failed to execute the action plan.', isError: true }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, actionPlan: undefined, content: m.content + '\n\n*Action cancelled.*' }
          : m,
      ),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([WELCOME]);
  };

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col w-[462px] h-[640px] rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: '#141414', border: '1px solid #2a2a2a' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: '#111111', borderBottom: '1px solid #2a2a2a' }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Assistant</p>
                <p className="text-[10px]" style={{ color: '#666666' }}>Chat · has access to your system</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={startNewConversation}
                className="text-[10px] px-2 py-1 rounded-lg transition-colors font-medium"
                style={{ color: '#888888', background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#888888')}
                title="New conversation"
              >
                New
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg transition-colors"
                style={{ color: '#666666' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#666666')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: '#111111' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs',
                  msg.role === 'assistant' ? 'bg-teal-600' : 'bg-neutral-700',
                )}>
                  {msg.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </div>

                <div className={cn('flex flex-col gap-1.5 max-w-[80%]', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  {/* Message bubble */}
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      msg.role === 'user' ? 'bg-teal-600 text-white rounded-tr-sm' : 'rounded-tl-sm',
                    )}
                    style={msg.role !== 'user'
                      ? msg.isError
                        ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }
                        : { background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#e5e5e5' }
                      : undefined}
                  >
                    {msg.isLoading ? (
                      <div className="flex items-center gap-2" style={{ color: '#888888' }}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Thinking…</span>
                      </div>
                    ) : msg.isError ? (
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {msg.content}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{stripConfirmCancelPhrase(msg.content)}</div>
                    )}
                  </div>

                  {/* Simple confirm/cancel when assistant wants to run an action */}
                  {msg.actionPlan?.requires_confirmation && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {msg.confirmed ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-default opacity-60"
                          style={{ color: '#9ca3af', background: '#252525' }}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Confirmed
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleConfirm(msg)}
                            disabled={isLoading}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Confirm
                          </button>
                          <button
                            onClick={() => handleCancel(msg.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                            style={{ color: '#888888', background: '#252525' }}
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.map((src, i) => (
                        <div
                          key={i}
                          title={src.text}
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-teal-300"
                          style={{ background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)' }}
                        >
                          <BookOpen className="h-2.5 w-2.5 shrink-0" />
                          {src.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="p-3.5 shrink-0 space-y-2.5" style={{ background: '#141414', borderTop: '1px solid #2a2a2a' }}>
            {/* Web search toggle */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setAllowWebSearch((v) => !v)}
                className="flex items-center gap-2 text-[10px] select-none"
                style={{ color: '#666666' }}
                aria-pressed={allowWebSearch}
              >
                <div
                  className={cn(
                    'relative h-4 w-7 rounded-full transition-colors duration-150',
                    allowWebSearch ? 'bg-teal-500' : 'bg-neutral-700',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-[2px] left-[2px] h-3 w-3 rounded-full bg-white transition-transform duration-150',
                      allowWebSearch ? 'translate-x-[11px]' : 'translate-x-0',
                    )}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  <span>Web Access</span>
                </div>
              </button>
              {conversationId && (
                <span className="text-[10px]" style={{ color: '#444444' }}>
                  Thread active
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything or request an action…"
                rows={1}
                className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 overflow-hidden"
                style={{ minHeight: '42px', background: '#111111', border: '1px solid #2a2a2a' }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-lg transition-all duration-200',
          open
            ? 'bg-neutral-800 hover:bg-neutral-700 rotate-0'
            : 'bg-teal-600 hover:bg-teal-700 hover:scale-110',
        )}
        aria-label={open ? 'Close AI Agent' : 'Open AI Agent'}
      >
        {open ? <X className="h-7 w-7 text-white" /> : <Bot className="h-8 w-8 text-white" />}
      </button>
    </>
  );
}
