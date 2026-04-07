'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { measureThumbInsideContainer } from '@/lib/measure-thumb-in-container';
import { POLISH_THEME } from '@/lib/polish';

export type SlidingSegmentOption = { value: string; label: string };

type Props = {
  options: SlidingSegmentOption[];
  /** When null or not matching any option, the sliding bubble is hidden. */
  value: string | null;
  onChange: (value: string) => void;
  'aria-label': string;
  className?: string;
  /** `sm` = compact (e.g. 1d / 1w), `md` = default (e.g. ingest modes). */
  size?: 'sm' | 'md';
};

const BUBBLE_TRANSITION =
  'left 280ms cubic-bezier(0.4, 0, 0.2, 1), top 280ms cubic-bezier(0.4, 0, 0.2, 1), width 280ms cubic-bezier(0.4, 0, 0.2, 1), height 280ms cubic-bezier(0.4, 0, 0.2, 1)';

const EMPTY_BUBBLE = { left: 0, top: 0, width: 0, height: 0 };

const RAF_RETRY_MAX = 24;

export function SlidingSegmentedControl({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
  size = 'md',
}: Props) {
  const navRef = useRef<HTMLElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rafAttempt = useRef(0);
  const [bubble, setBubble] = useState(EMPTY_BUBBLE);

  const selectedIndex =
    value == null ? -1 : options.findIndex((o) => o.value === value);

  const updateBubble = useCallback(() => {
    const nav = navRef.current;
    if (!nav || selectedIndex < 0) {
      rafAttempt.current = 0;
      setBubble(EMPTY_BUBBLE);
      return;
    }
    const btn = btnRefs.current[selectedIndex];
    if (!btn) {
      if (rafAttempt.current < RAF_RETRY_MAX) {
        rafAttempt.current += 1;
        requestAnimationFrame(() => updateBubble());
      } else {
        rafAttempt.current = 0;
        setBubble(EMPTY_BUBBLE);
      }
      return;
    }
    rafAttempt.current = 0;
    const m = measureThumbInsideContainer(nav, btn);
    if (!m || m.width <= 0 || m.height <= 0) {
      setBubble(EMPTY_BUBBLE);
      return;
    }
    setBubble(m);
  }, [selectedIndex]);

  /** Primitive: effect skips when values unchanged even if `options` is a new array reference. */
  const optionValuesKey = options.map((o) => o.value).join('|');

  useLayoutEffect(() => {
    updateBubble();

    const nav = navRef.current;
    const onWinResize = () => requestAnimationFrame(updateBubble);

    if (!nav) {
      window.addEventListener('resize', onWinResize);
      return () => window.removeEventListener('resize', onWinResize);
    }

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', onWinResize);
      return () => window.removeEventListener('resize', onWinResize);
    }

    const ro = new ResizeObserver(() => requestAnimationFrame(updateBubble));
    ro.observe(nav);
    for (const el of btnRefs.current) {
      if (el) ro.observe(el);
    }
    window.addEventListener('resize', onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, [updateBubble, value, optionValuesKey]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) requestAnimationFrame(() => updateBubble());
    });
    return () => {
      cancelled = true;
    };
  }, [updateBubble, optionValuesKey]);

  const pad = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';
  const textClass =
    size === 'sm' ? 'text-xs sm:text-sm' : 'text-sm';

  return (
    <nav
      ref={navRef}
      className={`relative flex flex-wrap gap-1 rounded-lg py-1 px-1 ${className ?? ''}`}
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-default)',
      }}
      role="group"
      aria-label={ariaLabel}
    >
      {bubble.width > 0 && selectedIndex >= 0 && (
        <div
          aria-hidden
          className="absolute z-0 rounded-[var(--radius-md)] pointer-events-none"
          style={{
            left: bubble.left,
            top: bubble.top,
            width: bubble.width,
            height: bubble.height,
            border: '2px solid var(--color-accent)',
            background: 'var(--color-bg-surface)',
            boxShadow: POLISH_THEME.shadowCard,
            transition: BUBBLE_TRANSITION,
          }}
        />
      )}
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            onClick={() => onChange(opt.value)}
            className={`focus-ring relative z-10 shrink-0 ${pad} rounded-[var(--radius-md)] ${textClass} font-medium transition-colors duration-150 whitespace-nowrap ${
              active
                ? ''
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-raised)]'
            }`}
            style={{
              color: active ? POLISH_THEME.accent : undefined,
              background: 'transparent',
              border: '2px solid transparent',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </nav>
  );
}
