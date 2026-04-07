'use client';

import Link from 'next/link';
import { InstantTooltip } from '@/components/tickets/TicketTagCapsule';
import { ticketsPanelUrl } from '@/lib/tickets-deep-link';
import { POLISH_THEME } from '@/lib/polish';
import { cn } from '@/lib/utils';

export type OpenMaintenanceTicketLine = {
  id: string;
  maintenanceCategoryName: string;
};

/** Shared list body for Lease IQ hover, Vendor Dispatch hover, and map popups. */
export function ActiveMaintenanceTicketsListBody({
  count,
  categoryNames = [],
  ticketsWithLinks,
  onViewTicket,
  highlightedTicketId,
}: {
  count: number;
  categoryNames?: string[];
  /** When set (e.g. Vendor Dispatch), one row per ticket with link to `/tickets/[id]`. */
  ticketsWithLinks?: OpenMaintenanceTicketLine[];
  /** When set, "View Ticket" stays on the current page (e.g. dispatch in-panel drawer). */
  onViewTicket?: (ticketId: string) => void;
  /** Row styling when this ticket’s panel is open (dispatch / map). */
  highlightedTicketId?: string | null;
}) {
  if (count === 0) {
    return (
      <>
        <p className="whitespace-normal font-semibold">Active Maintenance Tickets:</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          No active tickets
        </p>
      </>
    );
  }
  if (ticketsWithLinks != null && ticketsWithLinks.length > 0) {
    return (
      <>
        <p className="whitespace-normal font-semibold">Active Maintenance Tickets:</p>
        <ul className="mt-1 list-none space-y-1 p-0 text-xs min-w-0">
          {ticketsWithLinks.map((t) => {
            const isHighlighted = highlightedTicketId != null && highlightedTicketId === t.id;
            return (
              <li
                key={t.id}
                className={cn(
                  'flex items-baseline justify-between gap-3 rounded-md border-l-[3px] border-l-transparent px-2 py-1.5 transition-colors',
                  isHighlighted && 'border-l-[var(--color-accent)]',
                )}
                style={
                  isHighlighted ? { background: POLISH_THEME.adminStudioListSelectedBg } : undefined
                }
              >
                <span
                  className={cn(
                    'min-w-0 break-words text-[var(--color-text-primary)]',
                    isHighlighted && 'font-semibold',
                  )}
                >
                  • {t.maintenanceCategoryName}
                </span>
                {onViewTicket ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onViewTicket(t.id);
                    }}
                    className={cn(
                      'shrink-0 text-[var(--color-accent)] underline underline-offset-2 hover:opacity-90 bg-transparent border-0 cursor-pointer p-0',
                      isHighlighted ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    View Ticket
                  </button>
                ) : (
                  <Link
                    href={ticketsPanelUrl(t.id)}
                    className={cn(
                      'shrink-0 text-[var(--color-accent)] underline underline-offset-2 hover:opacity-90',
                      isHighlighted ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    View Ticket
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  if (!categoryNames.length) {
    return (
      <>
        <p className="whitespace-normal font-semibold">Active Maintenance Tickets:</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {count} open ticket{count !== 1 ? 's' : ''}
        </p>
      </>
    );
  }
  return (
    <>
      <p className="whitespace-normal font-semibold">Active Maintenance Tickets:</p>
      <ul
        className="mt-1 list-disc space-y-0.5 pl-5 text-xs"
        style={{ listStylePosition: 'outside' }}
      >
        {categoryNames.map((name, i) => (
          <li key={`${name}-${i}`} className="break-words">
            {name}
          </li>
        ))}
      </ul>
    </>
  );
}

interface MaintenanceCountWithTooltipProps {
  count: number;
  categoryNames?: string[];
  ticketsWithLinks?: OpenMaintenanceTicketLine[];
  onViewTicket?: (ticketId: string) => void;
  highlightedTicketId?: string | null;
  /** Lease IQ: red / green. Dispatch: accent blue for open counts. */
  countStyle?: 'maintenance' | 'accent';
  /** Default true — Lease IQ shows (n). Dispatch uses plain n. */
  showParens?: boolean;
}

export function MaintenanceCountWithTooltip({
  count,
  categoryNames = [],
  ticketsWithLinks,
  onViewTicket,
  highlightedTicketId,
  countStyle = 'maintenance',
  showParens = true,
}: MaintenanceCountWithTooltipProps) {
  const countColor =
    countStyle === 'accent'
      ? count === 0
        ? 'var(--color-text-muted)'
        : 'var(--color-accent)'
      : count === 0
        ? '#22c55e'
        : 'var(--color-danger)';

  const content = (
    <ActiveMaintenanceTicketsListBody
      count={count}
      categoryNames={categoryNames}
      ticketsWithLinks={ticketsWithLinks}
      onViewTicket={onViewTicket}
      highlightedTicketId={highlightedTicketId}
    />
  );

  const label = showParens ? `(${count})` : String(count);

  return (
    <InstantTooltip
      placement="below"
      align="left"
      content={content}
      className="relative inline-block"
    >
      <span style={{ color: countColor }}>{label}</span>
    </InstantTooltip>
  );
}
