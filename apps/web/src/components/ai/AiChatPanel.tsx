'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, X, Send, User, BookOpen, Loader2, AlertCircle, CheckCircle2, XCircle, Maximize2 } from 'lucide-react';
import { agentApi, adminApi, type AgentActionPlan } from '@/lib/api';
import { AssistantLinkedText, flattenStudiosFromMarkets } from '@/components/ai/assistant-linked-text';
import { cn } from '@/lib/utils';
import { infoExplainerInnerFrameStyle, infoExplainerTitleRuleStyle } from '@/components/ui/InfoExplainer';
import { TOOLTIP_PORTAL_Z_INDEX } from '@/lib/tooltip-layer';
import { getZoomedRect, getZoomedViewport } from '@/lib/zoom';

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

const ROVI_WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm Rovi. I have access to all tickets, knowledge base, and reporting. Ask me anything or ask me to do something — like create a ticket, update status, or assign work.",
};

/** Web Access UI stays visible but is non-interactive until backend + client API key wiring is ready. */
const WEB_ACCESS_UI_DISABLED = true;

const WEB_ACCESS_DISABLED_TOOLTIP =
  "Upon system implementation, the client's chosen API key will connect, allowing 'Web Access' functionality.";

/** Blue→purple gradient border + surface fill; width comes from Tailwind (`border-2` on composer, `border` on assistant bubble) */
const roviComposerSurfaceBorder: CSSProperties = {
  background:
    'linear-gradient(var(--color-bg-surface), var(--color-bg-surface)) padding-box, linear-gradient(118deg, var(--color-accent) 0%, #6366f1 48%, #8b5cf6 100%) border-box',
  backgroundRepeat: 'no-repeat',
};

export interface AiChatPanelProps {
  onClose?: () => void;
  fullScreen?: boolean;
  className?: string;
  /** Called with the first user message text when the chat first starts */
  onFirstMessage?: (text: string) => void;
  /** When set without `initialConversationId`, this text is sent automatically once on mount (welcome screen handoff). */
  initialMessage?: string;
  /** Resume an existing server thread (loads history via GET /agent/conversations/:id/messages) */
  initialConversationId?: string | null;
  /** Initial Web Access toggle when resuming from URL or widget handoff */
  initialAllowWebSearch?: boolean;
  /**
   * Floating panel only: navigate to full /assistant with the same thread.
   * Not shown when `fullScreen` is true.
   */
  onExpandToAssistant?: (opts: { conversationId: string | null; allowWebSearch: boolean }) => void;
}

export function AiChatPanel({
  onClose,
  fullScreen,
  className,
  onFirstMessage,
  initialMessage,
  initialConversationId = null,
  initialAllowWebSearch,
  onExpandToAssistant,
}: AiChatPanelProps) {
  const qc = useQueryClient();
  const { data: marketsData } = useQuery({
    queryKey: ['markets', 'assistant-chat'],
    queryFn: async () => (await adminApi.listMarkets()).data,
    staleTime: 5 * 60 * 1000,
  });
  const studioLinkTargets = useMemo(() => flattenStudiosFromMarkets(marketsData), [marketsData]);

  const [messages, setMessages] = useState<Message[]>(() =>
    initialConversationId ? [] : [ROVI_WELCOME],
  );
  const [historyLoading, setHistoryLoading] = useState(!!initialConversationId);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [allowWebSearch, setAllowWebSearch] = useState(initialAllowWebSearch ?? false);
  const [webAccessHint, setWebAccessHint] = useState(false);
  const [webHintPlacement, setWebHintPlacement] = useState<{ bottom: number; right: number } | null>(null);
  const webHintAnchorRef = useRef<HTMLDivElement>(null);
  const webHintPopoverRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasSentRef = useRef(!!initialConversationId);
  /** Prevents duplicate auto-send (e.g. React dev StrictMode double effect). */
  const initialAutoSendConsumedRef = useRef(false);
  const submitUserMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  const updateWebHintPlacement = useCallback(() => {
    const anchor = webHintAnchorRef.current;
    if (!anchor) return;
    const r = getZoomedRect(anchor);
    const vp = getZoomedViewport();
    const gap = 8;
    setWebHintPlacement({
      bottom: vp.height - r.top + gap,
      right: Math.max(8, vp.width - r.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!webAccessHint) {
      setWebHintPlacement(null);
      return;
    }
    updateWebHintPlacement();
    window.addEventListener('resize', updateWebHintPlacement);
    window.addEventListener('scroll', updateWebHintPlacement, true);
    return () => {
      window.removeEventListener('resize', updateWebHintPlacement);
      window.removeEventListener('scroll', updateWebHintPlacement, true);
    };
  }, [webAccessHint, updateWebHintPlacement]);

  useEffect(() => {
    if (!webAccessHint) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (webHintAnchorRef.current?.contains(t)) return;
      if (webHintPopoverRef.current?.contains(t)) return;
      setWebAccessHint(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [webAccessHint]);

  useEffect(() => {
    if (!webAccessHint) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWebAccessHint(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [webAccessHint]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (WEB_ACCESS_UI_DISABLED) {
      setAllowWebSearch(false);
      return;
    }
    if (initialAllowWebSearch != null) setAllowWebSearch(initialAllowWebSearch);
  }, [initialAllowWebSearch]);

  useEffect(() => {
    if (!initialConversationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await agentApi.getMessages(initialConversationId);
        const rows = res.data;
        if (cancelled) return;
        const mapped: Message[] = rows
          .filter((r) => r.role === 'user' || r.role === 'assistant')
          .map((r) => {
            const toolResultsRaw = r.toolResults;
            const toolResults = Array.isArray(toolResultsRaw)
              ? (toolResultsRaw as Message['toolResults'])
              : undefined;
            return {
              id: r.id,
              role: r.role as 'user' | 'assistant',
              content: r.content ?? '',
              mode: (r.mode === 'ASK' || r.mode === 'DO' ? r.mode : undefined) as Message['mode'] | undefined,
              actionPlan: r.actionPlan ?? undefined,
              toolResults,
              messageId: r.id,
              conversationId: initialConversationId,
            };
          });
        setMessages(mapped.length > 0 ? mapped : [ROVI_WELCOME]);
        setConversationId(initialConversationId);
        hasSentRef.current = mapped.some((m) => m.role === 'user');
      } catch {
        if (!cancelled) {
          setMessages([ROVI_WELCOME]);
          setConversationId(null);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialConversationId]);

  const submitUserMessage = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || isLoading || historyLoading) return;

      if (!hasSentRef.current) {
        hasSentRef.current = true;
        onFirstMessage?.(message);
      }

      const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: message };
      const loadingId = `l-${Date.now()}`;
      const loadingMsg: Message = { id: loadingId, role: 'assistant', content: '', isLoading: true };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setIsLoading(true);

      // Track whether we've started streaming yet so we can flip the bubble
      // out of "Thinking…" mode on the very first delta.
      let receivedAnyDelta = false;
      // Buffer the streamed text locally so each delta updates the same
      // message bubble in place (instead of replacing it).
      let streamedContent = '';

      try {
        await agentApi.chatStream(
          message,
          (event) => {
            switch (event.type) {
              case 'start': {
                if (!conversationId) setConversationId(event.conversationId);
                break;
              }
              case 'thinking': {
                // Optional: could surface "Searching docs…" etc. For now we
                // just keep the existing "Thinking…" loader running.
                break;
              }
              case 'delta': {
                if (!receivedAnyDelta) {
                  receivedAnyDelta = true;
                }
                streamedContent += event.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === loadingId
                      ? { ...m, content: streamedContent, isLoading: false }
                      : m,
                  ),
                );
                break;
              }
              case 'done': {
                const data = event.payload;
                if (!conversationId) setConversationId(data.conversationId);
                const assistantMsg: Message = {
                  id: data.messageId,
                  role: 'assistant',
                  // Prefer the server's authoritative final content (it has
                  // already been resolveModelReply'd) over our locally
                  // accumulated stream — they should match, but if the
                  // backend post-processed anything we want that version.
                  content: data.content,
                  mode: data.mode,
                  sources: data.sources,
                  actionPlan: data.actionPlan,
                  toolResults: data.toolResults,
                  conversationId: data.conversationId,
                  messageId: data.messageId,
                };
                setMessages((prev) =>
                  prev.map((m) => (m.id === loadingId ? assistantMsg : m)),
                );
                break;
              }
              case 'error': {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === loadingId
                      ? {
                          id: `err-${Date.now()}`,
                          role: 'assistant',
                          content: event.message || 'Something went wrong. Please try again.',
                          isError: true,
                        }
                      : m,
                  ),
                );
                break;
              }
            }
          },
          {
            conversationId: conversationId ?? undefined,
            allowWebSearch: WEB_ACCESS_UI_DISABLED ? false : allowWebSearch,
          },
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? { id: `err-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.', isError: true }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [allowWebSearch, conversationId, historyLoading, isLoading, onFirstMessage],
  );

  submitUserMessageRef.current = submitUserMessage;

  useEffect(() => {
    if (!initialMessage?.trim() || initialConversationId || initialAutoSendConsumedRef.current) return;
    initialAutoSendConsumedRef.current = true;
    const text = initialMessage.trim();
    void submitUserMessageRef.current(text);
  }, [initialMessage, initialConversationId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submitUserMessage(input);
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
      void submitUserMessage(input);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([ROVI_WELCOME]);
    hasSentRef.current = false;
    initialAutoSendConsumedRef.current = false;
  };

  const expandToAssistant = () => {
    onExpandToAssistant?.({
      conversationId,
      allowWebSearch: WEB_ACCESS_UI_DISABLED ? false : allowWebSearch,
    });
  };

  const webAccessHintPortal =
    typeof document !== 'undefined' &&
    webAccessHint &&
    webHintPlacement != null &&
    createPortal(
      <div
        ref={webHintPopoverRef}
        id="web-access-hint"
        role="dialog"
        aria-label="Web access"
        className="fixed flex w-[min(22rem,calc(100vw-2.5rem))] flex-col pointer-events-auto box-border break-words"
        style={{
          bottom: webHintPlacement.bottom,
          right: webHintPlacement.right,
          zIndex: TOOLTIP_PORTAL_Z_INDEX,
        }}
      >
        <div
          className="rounded-xl p-2 shadow-xl"
          style={{
            background: 'var(--color-bg-surface-raised)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <div className="relative px-3 pb-9 pt-3" style={infoExplainerInnerFrameStyle}>
            <div className="pb-2" style={infoExplainerTitleRuleStyle}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
                Web Access
              </p>
            </div>
            <div className="space-y-2 pt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              <p>
                Turn on &apos;web access&apos; when you want Rovi to have the ability to pull from the internet in its
                responses.
              </p>
              <p className="pt-1 text-[10px] font-medium leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                NOTE: Enabling &apos;Web Access&apos; increases API usage.
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Rovi.png"
              alt=""
              width={24}
              height={24}
              className="pointer-events-none absolute bottom-2 right-2 h-6 w-6 object-contain opacity-90"
              aria-hidden
            />
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
    <div
      className={cn(
        'flex flex-col',
        /* fullScreen: no overflow-hidden — it clips header/footer hover shadows into hard rectangular edges */
        fullScreen ? 'min-h-0 flex-1 gap-3 overflow-visible bg-transparent' : 'h-full overflow-hidden rovi-chatbox-bg',
        className,
      )}
      style={{ border: fullScreen ? 'none' : '1px solid var(--color-border-default)' }}
    >
      {/* Header — floating card on full-page assistant; chrome strip in floating widget */}
      <div
        className={cn(
          'flex shrink-0 items-center justify-between px-4 py-3',
          fullScreen ? 'rovi-chatbox-floating-card-header' : 'rovi-chatbox-header',
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)]">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Rovi</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Chat · has access to your system</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={startNewConversation}
            className="text-[10px] px-2 py-1 rounded-lg transition-colors font-medium hover:text-[var(--color-text-primary)]"
            style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}
            title="New conversation"
            type="button"
          >
            New
          </button>
          {!fullScreen && onExpandToAssistant && (
            <button
              type="button"
              onClick={expandToAssistant}
              className="p-1 rounded-lg transition-colors hover:text-[var(--color-text-primary)]"
              style={{ color: 'var(--color-text-muted)' }}
              title="Open full assistant"
              aria-label="Open full assistant"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg transition-colors hover:text-[var(--color-text-primary)]"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="rovi-chatbox-messages flex-1 min-h-0 space-y-4 overflow-y-auto bg-transparent p-4">
        {historyLoading ? (
          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading conversation…</span>
          </div>
        ) : null}
        {!historyLoading && messages.map((msg) => (
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
                  msg.role === 'user'
                    ? cn(
                        'bg-[var(--color-accent)] text-white rounded-tr-sm',
                        !msg.isLoading && !msg.isError && 'rovi-chat-bubble-user-elevated',
                      )
                    : cn(
                        'rounded-tl-sm',
                        !msg.isError && 'border border-transparent',
                        !msg.isLoading && !msg.isError && 'rovi-chat-bubble-assistant-elevated',
                      ),
                )}
                style={
                  msg.role !== 'user'
                    ? msg.isError
                      ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }
                      : { ...roviComposerSurfaceBorder, color: 'var(--color-text-primary)' }
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

      {/* Input area — floating card on full-page assistant */}
      <div
        className={cn(
          'shrink-0 space-y-2.5 p-3.5',
          fullScreen ? 'rovi-chatbox-floating-card-footer' : 'rovi-chatbox-footer',
        )}
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'group relative flex shrink-0 items-center gap-2',
                WEB_ACCESS_UI_DISABLED && 'cursor-not-allowed',
              )}
            >
              {WEB_ACCESS_UI_DISABLED ? (
                <div
                  className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border px-3 py-2 text-left text-[10px] leading-snug opacity-0 shadow-md transition-opacity duration-200 motion-reduce:transition-none group-hover:opacity-100"
                  style={{
                    background: 'var(--color-bg-surface-raised)',
                    borderColor: 'var(--color-border-default)',
                    color: 'var(--color-text-primary)',
                  }}
                  role="tooltip"
                >
                  {WEB_ACCESS_DISABLED_TOOLTIP}
                </div>
              ) : null}
              <button
                type="button"
                disabled={WEB_ACCESS_UI_DISABLED}
                onClick={() => {
                  if (WEB_ACCESS_UI_DISABLED) return;
                  setAllowWebSearch((v) => !v);
                }}
                className={cn(
                  'focus-ring shrink-0 rounded-full p-0.5 transition-opacity',
                  WEB_ACCESS_UI_DISABLED
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:opacity-90',
                )}
                aria-pressed={WEB_ACCESS_UI_DISABLED ? false : allowWebSearch}
                aria-label="Toggle web access"
                aria-disabled={WEB_ACCESS_UI_DISABLED}
              >
                <div
                  className={cn(
                    'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-150',
                    !WEB_ACCESS_UI_DISABLED && allowWebSearch
                      ? 'bg-[var(--color-accent)]'
                      : 'border border-[var(--color-border-default)] bg-[var(--color-bg-surface-inset)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-[2px] left-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-150',
                      !WEB_ACCESS_UI_DISABLED && allowWebSearch
                        ? 'translate-x-[11px]'
                        : 'translate-x-0',
                    )}
                    style={{
                      boxShadow:
                        '0 0 0 1px color-mix(in srgb, var(--color-text-primary) 14%, transparent)',
                    }}
                  />
                </div>
              </button>
              <span
                className="inline-flex h-4 select-none items-center text-[10px] font-medium leading-none"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Web Access
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div ref={webHintAnchorRef} className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => setWebAccessHint((v) => !v)}
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold leading-none transition-colors',
                    webAccessHint
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'border-[var(--color-text-primary)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-btn-ghost-hover-bg)]',
                  )}
                  aria-label="What is web access?"
                  aria-expanded={webAccessHint}
                  aria-controls="web-access-hint"
                >
                  i
                </button>
              </div>
            </div>
          </div>
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
            placeholder="Ask Rovi anything…"
            rows={1}
            className="flex-1 resize-none rounded-xl border-2 border-transparent px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] overflow-hidden placeholder-[var(--color-text-muted)]"
            style={{
              minHeight: '42px',
              color: 'var(--color-text-primary)',
              ...roviComposerSurfaceBorder,
            }}
            disabled={isLoading || historyLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || historyLoading}
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
    {webAccessHintPortal}
    </>
  );
}
