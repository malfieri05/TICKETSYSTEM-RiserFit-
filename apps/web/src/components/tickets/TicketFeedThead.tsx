'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { POLISH_THEME, FEED_COL_WIDTHS, FEED_COL_WIDTHS_ID_COLLAPSED } from '@/lib/polish';
import { CANONICAL_FEED_HEADERS, getFeedTheadThStyle, getThClass } from '@/components/tickets/TicketRow';

/** Smooth width change for ID + Title columns when toggling ID visibility. */
const COL_WIDTH_TRANSITION = 'width 0.32s cubic-bezier(0.4, 0, 0.2, 1)';

/** Arrow toggle: no white hover fill — subtle accent tint + stronger icon color. */
export const ticketFeedIdToggleButtonClass = cn(
  'focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
  'text-[var(--color-text-muted)]',
  'transition-[color,background-color,box-shadow] duration-200 ease-out',
  'hover:text-[var(--color-accent)]',
  'hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]',
  'dark:hover:bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]',
  'active:scale-[0.97]',
);

export type TicketFeedTheadProps = {
  showIdColumn: boolean;
  onToggleIdColumn: () => void;
};

export type TicketFeedColgroupProps = {
  showIdColumn: boolean;
};

export function TicketFeedColgroup({ showIdColumn }: TicketFeedColgroupProps) {
  const widths = showIdColumn ? FEED_COL_WIDTHS : FEED_COL_WIDTHS_ID_COLLAPSED;
  return (
    <colgroup>
      {widths.map((width, idx) => (
        <col
          key={idx}
          style={{
            width,
            transition: idx <= 1 ? COL_WIDTH_TRANSITION : undefined,
          }}
        />
      ))}
    </colgroup>
  );
}

/**
 * Canonical ticket feed `<thead>`: ID column toggle (default collapsed in parent state).
 * First column is always present; “ID” label fades with column width for a smooth expand/collapse.
 */
export function TicketFeedThead({ showIdColumn, onToggleIdColumn }: TicketFeedTheadProps) {
  return (
    <thead>
      <tr>
        {CANONICAL_FEED_HEADERS.map((h, idx) => {
          const thStyle = {
            color: POLISH_THEME.theadText,
            ...getFeedTheadThStyle(idx, CANONICAL_FEED_HEADERS.length),
          };

          if (h.key === 'id') {
            return (
              <th key="id" className={getThClass('id')} style={thStyle}>
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className="overflow-hidden text-[11px] font-semibold uppercase tracking-[0.08em] transition-[max-width,opacity] duration-300 ease-out"
                    style={{
                      maxWidth: showIdColumn ? '3.5rem' : 0,
                      opacity: showIdColumn ? 1 : 0,
                    }}
                    aria-hidden={!showIdColumn}
                  >
                    ID
                  </span>
                  <button
                    type="button"
                    className={ticketFeedIdToggleButtonClass}
                    aria-expanded={showIdColumn}
                    aria-label={showIdColumn ? 'Hide ticket ID column' : 'Show ticket ID column'}
                    onClick={onToggleIdColumn}
                  >
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      <ChevronRight
                        className={cn(
                          'absolute h-4 w-4 transition-[opacity,transform] duration-300 ease-out',
                          showIdColumn ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
                        )}
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      <ChevronDown
                        className={cn(
                          'absolute h-4 w-4 transition-[opacity,transform] duration-300 ease-out',
                          showIdColumn ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
                        )}
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    </span>
                  </button>
                </div>
              </th>
            );
          }

          return (
            <th key={h.key} className={getThClass(h.key)} style={thStyle}>
              {h.label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
