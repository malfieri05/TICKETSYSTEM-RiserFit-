'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { POLISH_THEME } from '@/lib/polish';

export type FeedPaginationBarProps = {
  /** 1-based current page */
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  /** e.g. while list query is fetching */
  isBusy?: boolean;
  /** Rendered on the right side of the bar (e.g. admin Export). */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Compact feed footer: chevrons then `1–20 of 30` (bare icons, no button chrome).
 * Background matches the feed column header (`feedTheadBg`).
 */
export function FeedPaginationBar({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
  isBusy = false,
  trailing,
  className,
}: FeedPaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const disabledPrev = safePage <= 1 || isBusy || total === 0;
  const disabledNext = safePage >= totalPages || isBusy || total === 0;

  return (
    <div
      className={cn('flex w-full min-w-0 items-center justify-between gap-4 px-4 py-3', className)}
      style={{
        borderTop: `1px solid ${POLISH_THEME.listBorder}`,
        background: POLISH_THEME.feedTheadBg,
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-6">
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Pagination">
          <button
            type="button"
            aria-label="Previous page"
            disabled={disabledPrev}
            onClick={onPrev}
            className={cn(
              'focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md transition-[color,opacity,background-color] duration-[var(--duration-fast)]',
              disabledPrev
                ? 'cursor-default opacity-40'
                : 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]',
            )}
            style={{
              color: disabledPrev ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            }}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={disabledNext}
            onClick={onNext}
            className={cn(
              'focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md transition-[color,opacity,background-color] duration-[var(--duration-fast)]',
              disabledNext
                ? 'cursor-default opacity-40'
                : 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]',
            )}
            style={{
              color: disabledNext ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            }}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <p
          className="text-sm tabular-nums select-none"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-live="polite"
        >
          {total === 0
            ? `0\u20130 of ${total.toLocaleString()}`
            : `${start}\u2013${end} of ${total.toLocaleString()}`}
        </p>
      </div>
      {trailing != null ? (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      ) : null}
    </div>
  );
}
