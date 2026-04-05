'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const POPOVER_WIDTH = 288; // w-72
const GAP = 8; // px gap between button and popover

export interface InfoPopoverProps {
  /** Content rendered inside the popover. */
  children: ReactNode;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** Extra class names on the trigger button. */
  className?: string;
  /** Preferred opening direction. Defaults to 'up'. */
  direction?: 'up' | 'down';
}

/**
 * Click-triggered popover portaled to document.body so it is never clipped
 * by overflow:hidden parents or low z-index stacking contexts.
 */
export function InfoPopover({
  children,
  ariaLabel = 'More information',
  className,
  direction = 'up',
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Recalculate position whenever the popover opens or the window scrolls/resizes.
  useEffect(() => {
    if (!open || !btnRef.current) return;

    const reposition = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 200;

      // Prefer the requested direction, but flip if it would go off-screen.
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const goUp =
        direction === 'up' ? spaceAbove >= panelHeight + GAP || spaceAbove > spaceBelow
          : spaceBelow < panelHeight + GAP && spaceAbove > spaceBelow;

      const top = goUp
        ? rect.top + window.scrollY - panelHeight - GAP
        : rect.bottom + window.scrollY + GAP;

      // Center horizontally on the button, clamped to viewport edges.
      const idealLeft = rect.left + window.scrollX + rect.width / 2 - POPOVER_WIDTH / 2;
      const left = Math.max(8, Math.min(idealLeft, window.innerWidth - POPOVER_WIDTH - 8));

      setCoords({ top, left });
    };

    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, direction]);

  // Close on Escape or outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  const panel = open && coords
    ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          style={{
            position: 'absolute',
            top: coords.top,
            left: coords.left,
            width: POPOVER_WIDTH,
            zIndex: 9999,
            background: 'var(--color-bg-surface-raised)',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-primary)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            fontSize: '12px',
            lineHeight: '1.55',
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="absolute top-2 right-2 rounded p-0.5 transition-colors hover:bg-[var(--color-bg-surface)]"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
          {children}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={cn(
          'focus-ring inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors',
          'hover:bg-[var(--color-bg-surface-raised)]',
          open && 'bg-[var(--color-bg-surface-raised)]',
          className,
        )}
        style={{ color: 'var(--color-text-muted)' }}
      >
        <Info className="h-3 w-3" strokeWidth={2.2} aria-hidden />
      </button>
      {panel}
    </>
  );
}
