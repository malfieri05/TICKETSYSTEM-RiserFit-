'use client';

import {
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { POLISH_THEME } from '@/lib/polish';

const pill = POLISH_THEME.ticketTagCapsule;

const TOOLTIP_GAP = 6;
const TOOLTIP_Z = 200;

/** Exported for panel tooltip line spacing; base 11px × 1.75 × 0.9 */
export const TICKET_TAG_TOOLTIP_FONT_PX = 11 * 1.75 * 0.9;

type InstantTooltipProps = {
  content: ReactNode;
  children: ReactNode;
  /** Wrapper classes for the hover target */
  className?: string;
  /**
   * Short hints (e.g. control labels): smaller type and padding; same theme + above placement.
   */
  compact?: boolean;
};

/**
 * Hover label with no delay, portaled to `document.body` so it is not clipped
 * by ticket feed `overflow` regions. Rounded panel, centered text, always above target.
 */
export function InstantTooltip({ content, children, className, compact }: InstantTooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.top - TOOLTIP_GAP,
      left: r.left + r.width / 2,
    });
  }, []);

  const show = useCallback(() => {
    updatePos();
    setOpen(true);
  }, [updatePos]);

  const hide = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos, content]);

  const tooltip =
    open && typeof document !== 'undefined'
      ? createPortal(
          <span
            role="tooltip"
            className={
              compact
                ? 'pointer-events-none fixed whitespace-nowrap rounded-lg px-2.5 py-1.5 text-center text-xs font-medium leading-tight shadow-[var(--shadow-panel)]'
                : 'pointer-events-none fixed whitespace-pre-line rounded-2xl px-3 py-2 text-center font-medium leading-snug shadow-[var(--shadow-panel)]'
            }
            style={{
              top: pos.top,
              left: pos.left,
              transform: 'translate(-50%, -100%)',
              zIndex: TOOLTIP_Z,
              maxWidth: compact ? undefined : 'min(360px, calc(100vw - 1rem))',
              wordBreak: compact ? undefined : 'break-word',
              fontSize: compact ? undefined : `${TICKET_TAG_TOOLTIP_FONT_PX}px`,
              background: 'var(--color-bg-surface-raised)',
              color: 'var(--color-text-primary)',
              border: `1px solid ${POLISH_THEME.listBorder}`,
            }}
          >
            {content}
          </span>,
          document.body,
        )
      : null;

  return (
    <span
      ref={wrapRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {tooltip}
    </span>
  );
}

type CapsuleProps = {
  name: string;
  /**
   * When set (e.g. panel view), hover tooltip shows this instead of the tag name
   * (string or rich content).
   */
  hoverText?: ReactNode;
};

/**
 * Orange operational tag pill (same inset-ring pattern as StatusBadge).
 * Hover: immediate portaled tooltip — tag name by default, or `hoverText` when provided.
 */
/** Matches `ThemeBadge`: same height/typography as Status and Priority capsules */
const TAG_CAPSULE_BADGE_CLASS =
  'inline-flex max-w-full min-w-0 items-center truncate rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]';

export function TicketTagCapsule({ name, hoverText }: CapsuleProps) {
  const tooltipContent = hoverText ?? name;
  return (
    <InstantTooltip content={tooltipContent} className="inline-flex max-w-full items-center align-middle">
      <span
        className={TAG_CAPSULE_BADGE_CLASS}
        style={{
          background: pill.background,
          color: pill.color,
          boxShadow: pill.boxShadow,
        }}
      >
        {name}
      </span>
    </InstantTooltip>
  );
}
