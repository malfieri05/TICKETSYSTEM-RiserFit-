'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { useAuth } from '@/hooks/useAuth';

const QUICK_PROMPTS = [
  { label: 'Check ticket status', text: 'Show me the status of my recent tickets' },
  { label: 'Create a ticket', text: 'Help me create a new support ticket' },
  { label: 'Find overdue work', text: 'Show me tickets that are overdue or breached SLA' },
  { label: 'Summarize my queue', text: 'Summarize the tickets currently assigned to me' },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

/** Zia-style “Ask …” capsule icon: outlined bubble + three dots (typing indicator) */
function RoviAskCapsuleIcon() {
  const dot = 'var(--color-rovi-ask-pill-icon-stroke)';
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <path
        fill="none"
        stroke="var(--color-rovi-ask-pill-icon-stroke)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        d="M4.25 4.25h9.75a2.25 2.25 0 0 1 2.25 2.25v4.15a2.25 2.25 0 0 1-2.25 2.25h-4.05l-1.35 2.55-1.35-2.55h-1.35a2.25 2.25 0 0 1-2.25-2.25V6.5a2.25 2.25 0 0 1 2.25-2.25z"
      />
      <circle cx="8.55" cy="8.58" r="0.6" fill={dot} />
      <circle cx="10.25" cy="8.58" r="0.6" fill={dot} />
      <circle cx="11.95" cy="8.58" r="0.6" fill={dot} />
    </svg>
  );
}

function AssistantPageInner() {
  const searchParams = useSearchParams();
  const convoId = searchParams.get('c');
  const webPref = searchParams.get('web') === '1';

  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

  /** Jump straight to chat when resuming a thread (?c=) or handoff with Web Access (?web=1). */
  const [hasChatStarted, setHasChatStarted] = useState(() => !!convoId || webPref);
  const [welcomeInput, setWelcomeInput] = useState('');
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleWelcomeSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setInitialMessage(trimmed);
      setHasChatStarted(true);
    },
    [],
  );

  const handleWelcomeFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleWelcomeSubmit(welcomeInput);
  };

  const handleCapsuleClick = (text: string) => {
    handleWelcomeSubmit(text);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleWelcomeSubmit(welcomeInput);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setWelcomeInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const onFirstMessage = useCallback(() => {
    setInitialMessage(undefined);
  }, []);

  if (hasChatStarted) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Header title="AI Assistant" />
        {/* Full-bleed Rovi gradient; narrow column is only for floating cards inside AiChatPanel */}
        <div className="assistant-conversation-fullpage-bg flex min-h-0 flex-1 flex-col pb-[10vh]">
          {/* ~8% wider on each side vs 52rem → 52 × 1.16 ≈ 60.25rem; cap on small viewports */}
          <div className="assistant-chat-column-mount mx-auto flex h-full min-h-0 w-full max-w-[min(96vw,60.25rem)] flex-1 flex-col px-4 pt-3 sm:px-6 sm:pt-4">
            <AiChatPanel
              fullScreen
              onFirstMessage={onFirstMessage}
              initialMessage={convoId ? undefined : initialMessage}
              initialConversationId={convoId}
              initialAllowWebSearch={webPref}
            />
            <p
              className="mt-3 shrink-0 pb-1 text-center text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Rovi can make mistakes. Review important responses.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="assistant-welcome-bg flex h-full min-h-0 flex-col">
      <Header title="AI Assistant" />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-4">
        {/* Nudge cluster up: flex centers the whole block, but the textarea sits in the lower half — offset so the input sits near the vertical middle of the viewport (below header). */}
        <div className="flex w-full max-w-[52rem] flex-col items-center -translate-y-[clamp(5.5rem,12vmin,9rem)]">
        {/* Greeting: bot mark inline before title */}
        <div className="flex flex-col items-center gap-2 mb-8 w-full max-w-[52rem]">
          <div className="flex flex-row flex-wrap items-center justify-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element -- static Rovi mascot */}
              <img
                src="/Rovi.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                draggable={false}
              />
            </div>
            <h1 className="text-2xl font-semibold text-center" style={{ color: 'var(--color-text-primary)' }}>
              Good {getGreeting()}, {firstName}
            </h1>
          </div>
          <p className="text-base text-center" style={{ color: 'var(--color-text-muted)' }}>
            How may I help you today?
          </p>
        </div>

        {/* Quick-prompt capsules — single row; scroll on very narrow viewports.
            No overflow-y-hidden: it clips focus rings to the row height (only left/right curves visible).
            py-2 keeps ring-2 inside the scrollport without a vertical scrollbar. */}
        <div
          className="mb-8 w-full max-w-[44rem] overflow-x-auto py-2"
          style={{ scrollbarWidth: 'thin' }}
        >
          <div className="mx-auto flex min-w-min flex-nowrap items-center justify-center gap-2 px-1">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handleCapsuleClick(p.text)}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                style={{
                  border: '1px solid var(--color-border-default)',
                  background: 'var(--color-bg-surface)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input box — wider than capsule strip */}
        <form onSubmit={handleWelcomeFormSubmit} className="w-full max-w-[52rem]">
        <div
          className="rounded-xl overflow-hidden flex flex-col border-2 border-transparent focus-within:ring-2 focus-within:ring-[var(--color-accent)] transition-[box-shadow] duration-200"
          style={{
            background:
              'linear-gradient(var(--color-bg-surface), var(--color-bg-surface)) padding-box, linear-gradient(118deg, var(--color-accent) 0%, #6366f1 48%, #8b5cf6 100%) border-box',
            backgroundRepeat: 'no-repeat',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={welcomeInput}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Ask Rovi anything…"
            rows={2}
            className="w-full resize-none px-4 pt-3.5 pb-1 text-sm focus:outline-none placeholder-[var(--color-text-muted)] bg-transparent"
            style={{
              minHeight: '64px',
              color: 'var(--color-text-primary)',
            }}
          />
          {/* Footer bar inside input */}
          <div className="flex items-center justify-between px-3 py-2">
            <span
              className="inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3.5 text-[13px] font-medium leading-none select-none"
              style={{
                background: 'var(--color-rovi-ask-pill-bg)',
                border: '1px solid var(--color-rovi-ask-pill-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              <RoviAskCapsuleIcon />
              Ask Rovi
            </span>
            <button
              type="submit"
              disabled={!welcomeInput.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </form>

        {/* Disclaimer */}
        <p className="mt-3 text-xs text-center max-w-[52rem] w-full" style={{ color: 'var(--color-text-muted)' }}>
          Rovi can make mistakes. Review important responses.
        </p>
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex h-full min-h-[50vh] items-center justify-center"
          style={{ background: 'var(--color-bg-page)' }}
        >
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Loading…
          </span>
        </div>
      }
    >
      <AssistantPageInner />
    </Suspense>
  );
}
