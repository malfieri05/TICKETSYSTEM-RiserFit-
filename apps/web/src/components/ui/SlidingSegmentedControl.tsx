'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { POLISH_THEME } from '@/lib/polish';
import { getDocumentZoom } from '@/lib/zoom';

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
  const [bubble, setBubble] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const selectedIndex =
    value == null ? -1 : options.findIndex((o) => o.value === value);

  const updateBubble = useCallback(() => {
    const nav = navRef.current;
    if (!nav || selectedIndex < 0) {
      setBubble({ left: 0, top: 0, width: 0, height: 0 });
      return;
    }
    const btn = btnRefs.current[selectedIndex];
    if (!btn) return;
    const zoom = getDocumentZoom();
    const n = nav.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    // getBoundingClientRect() returns viewport px; divide by zoom to get zoomed CSS px
    // which is what position:absolute inside the zoomed html actually uses.
    setBubble({
      left: (b.left - n.left) / zoom + nav.scrollLeft,
      top:  (b.top  - n.top)  / zoom + nav.scrollTop,
      width:  b.width  / zoom,
      height: b.height / zoom,
    });
  }, [selectedIndex]);

  useLayoutEffect(() => {
    updateBubble();
  }, [updateBubble, value, options]);

  useEffect(() => {
    const nav = navRef.current;
    if (nav && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        requestAnimationFrame(() => updateBubble());
      });
      ro.observe(nav);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateBubble);
    return () => window.removeEventListener('resize', updateBubble);
  }, [updateBubble]);

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
            className={`focus-ring relative z-10 ${pad} rounded-[var(--radius-md)] ${textClass} font-medium transition-colors duration-150 whitespace-nowrap ${
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
