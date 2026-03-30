'use client';

import { useState, useRef, useEffect, useMemo, FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, X, Send, User, BookOpen, Loader2, AlertCircle, CheckCircle2, XCircle, Globe } from 'lucide-react';
import { agentApi, adminApi, type AgentActionPlan } from '@/lib/api';
import { AssistantLinkedText, flattenStudiosFromMarkets } from '@/components/ai/assistant-linked-text';
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

/** Chat renders plain text; strip markdown the model may still emit so ** does not show literally. */
function stripAssistantMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let s = text;
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/`([^`]+)`/g, '$1');
  return s;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: 'ASK' | 'DO';
  sources?: Array<{
    documentId: string;
    title: string;
    text: string;
    pagesLabel?: string;
  }>;
  actionPlan?: AgentActionPlan;
  toolResults?: Array<{ tool: string; result: unknown }>;
  isLoading?: boolean;
  isError?: boolean;
  conversationId?: string;
  messageId?: string;
  confirmed?: boolean;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I have access to all tickets, knowledge base, and reporting. Ask me anything or ask me to do something — like create a ticket, update status, or assign work.",
};

export interface AiChatPanelProps {
  onClose?: () => void;
  fullScreen?: boolean;
  className?: string;
}

export function AiChatPanel({ onClose, fullScreen, className }: AiChatPanelProps) {
  const qc = useQueryClient();
  const { data: marketsData } = useQuery({
    queryKey: ['markets', 'assistant-chat'],
    queryFn: async () => (await adminApi.listMarkets()).data,
    staleTime: 5 * 60 * 1000,
  });
  const studioLinkTargets = useMemo(() => flattenStudiosFromMarkets(marketsData), [marketsData]);

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
    <div
      className={cn(
        'flex flex-col overflow-hidden',
        fullScreen ? 'flex-1 min-h-0' : 'h-full',
        className,
      )}
      style={{ background: 'var(--color-bg-surface-raised)', border: fullScreen ? 'none' : '1px solid var(--color-border-default)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)]">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Assistant</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Chat · has access to your system</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={startNewConversation}
            className="text-[10px] px-2 py-1 rounded-lg transition-colors font-medium hover:text-[var(--color-text-primary)]"
            style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}
            title="New conversation"
          >
            New
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg transition-colors hover:text-[var(--color-text-primary)]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: 'var(--color-bg-surface)' }}>
        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : '')}>
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
                msg.role === 'assistant' ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-bg-surface-raised)] text-[var(--color-text-primary)]',
              )}
            >
              {msg.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            </div>

            <div className={cn('flex flex-col gap-1.5 max-w-[80%]', msg.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user' ? 'bg-[var(--color-accent)] text-white rounded-tr-sm' : 'rounded-tl-sm',
                )}
                style={
                  msg.role !== 'user'
                    ? msg.isError
                      ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }
                      : { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }
                    : undefined
                }
              >
                {msg.isLoading ? (
                  <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Thinking…</span>
                  </div>
                ) : msg.isError ? (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {msg.content}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">
                    {msg.role === 'assistant' ? (
                      <AssistantLinkedText
                        text={stripAssistantMarkdown(stripConfirmCancelPhrase(msg.content))}
                        studios={studioLinkTargets}
                        toolResults={msg.toolResults}
                      />
                    ) : (
                      stripAssistantMarkdown(stripConfirmCancelPhrase(msg.content))
                    )}
                  </div>
                )}
              </div>

              {msg.actionPlan?.requires_confirmation && (
                <div className="flex items-center gap-2 flex-wrap">
                  {msg.confirmed ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-default opacity-60"
                      style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-raised)' }}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Confirmed
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleConfirm(msg)}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(msg.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-raised)' }}
                      >
                        <XCircle className="h-3 w-3" /> Cancel
                      </button>
                    </>
                  )}
                </div>
              )}

              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.sources.map((src) => (
                    <div
                      key={src.documentId}
                      title={src.text}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs max-w-full"
                      style={{ background: 'rgba(52,120,196,0.15)', border: '1px solid rgba(52,120,196,0.3)', color: 'var(--color-text-primary)' }}
                    >
                      <BookOpen className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">
                        {src.title}
                        {src.pagesLabel ? (
                          <span className="opacity-85 font-normal"> · {src.pagesLabel}</span>
                        ) : null}
                      </span>
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
      <div className="p-3.5 shrink-0 space-y-2.5" style={{ background: 'var(--color-bg-surface-raised)', borderTop: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setAllowWebSearch((v) => !v)}
            className="flex items-center gap-2 text-[10px] select-none"
            style={{ color: 'var(--color-text-muted)' }}
            aria-pressed={allowWebSearch}
          >
            <div
              className={cn(
                'relative h-4 w-7 rounded-full transition-colors duration-150',
                allowWebSearch ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-surface-raised)]',
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
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
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
            className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] overflow-hidden placeholder-[var(--color-text-muted)]"
            style={{ minHeight: '42px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
