'use client';

import { useEffect, type ReactNode, type MouseEvent } from 'react';
import { Info, X } from 'lucide-react';
import { useAiChatWidget } from '@/components/ai/AiChatWidget';

/** Info (ⓘ) control in the app header — muted vs title, hover uses header chrome tokens. */
export function HeaderInfoButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 leading-none transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-app-header-info-hover-bg)] hover:text-[var(--color-app-header-info-hover-fg)]"
      style={{ color: 'var(--color-text-app-header-muted)' }}
      aria-label={ariaLabel}
    >
      <Info className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
    </button>
  );
}

/** Shared with hover explainers (e.g. Web Access) — matches modal inset frame. */
export const infoExplainerInnerFrameStyle: React.CSSProperties = {
  border: '2px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
  borderRadius: 'var(--radius-md)',
};

export const infoExplainerTitleRuleStyle: React.CSSProperties = {
  borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
};

export type InfoExplainerModalProps = {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: ReactNode;
  children: ReactNode;
};

/**
 * Uniform “what is this?” explainer dialog: accent title, faint blue rule, inset accent frame, Rovi mascot.
 */
export function InfoExplainerModal({ open, onClose, titleId, title, children }: InfoExplainerModalProps) {
  const { openAgentChat } = useAiChatWidget();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleOpenRovi = (e: MouseEvent) => {
    e.stopPropagation();
    onClose();
    openAgentChat();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-4 shadow-xl"
        style={{
          background: 'var(--color-bg-surface-raised)',
          border: '1px solid var(--color-border-default)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative p-5 pb-24" style={infoExplainerInnerFrameStyle}>
          <div className="flex items-start justify-between gap-3 pb-3" style={infoExplainerTitleRuleStyle}>
            <h2 id={titleId} className="pr-2 text-base font-semibold" style={{ color: 'var(--color-accent)' }}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-surface)]"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div
            className="space-y-3 pt-4 pb-10 text-sm leading-relaxed"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {children}
          </div>
          <div className="absolute bottom-4 right-4 flex max-w-[calc(100%-2rem)] items-center justify-end gap-2.5">
            <p
              className="max-w-[11rem] text-right text-[11px] leading-snug"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Need help? Ask Rovi!
            </p>
            <button
              type="button"
              onClick={handleOpenRovi}
              className="focus-ring shrink-0 cursor-pointer rounded-full p-0.5 transition-transform hover:scale-105 active:scale-95"
              aria-label="Open Rovi chat assistant"
            >
              {/* Static mascot from public/ — same pattern as external avatars in ProfileMenu */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Rovi.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                draggable={false}
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
