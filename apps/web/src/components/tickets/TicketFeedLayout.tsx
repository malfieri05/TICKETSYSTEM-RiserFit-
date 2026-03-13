'use client';

import type { ReactNode } from 'react';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

/**
 * Canonical layout for ticket feeds. Same dimensions and chrome everywhere
 * (admin, portal, inbox) — no max-width; full-width list container.
 */
export interface TicketFeedLayoutProps {
  /** Optional page title above the list. */
  title?: string;
  /** Optional description below title. */
  description?: string;
  /** Optional filter bar (search, selects) above the list. */
  filters?: ReactNode;
  /** Optional left sidebar (e.g. Inbox topic folders). When set, main area is full-width. */
  leftSidebar?: ReactNode;
  isInitialLoading: boolean;
  isFetching?: boolean;
  hasTickets: boolean;
  ticketList: ReactNode;
  emptyState: ReactNode;
  pagination?: ReactNode;
  initialSkeleton?: ReactNode;
}

export function TicketFeedLayout({
  title,
  description,
  filters,
  leftSidebar,
  isInitialLoading,
  isFetching = false,
  hasTickets,
  ticketList,
  emptyState,
  pagination,
  initialSkeleton,
}: TicketFeedLayoutProps) {
  const mainContent = (
    <div
      className="flex-1 overflow-y-auto p-6 space-y-4"
      style={{ background: 'var(--color-bg-page)' }}
    >
      {title != null && (
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h2>
          {description != null && (
            <p className="text-xs mt-1" style={{ color: POLISH_THEME.metaMuted }}>
              {description}
            </p>
          )}
        </div>
      )}

      {filters != null && <div>{filters}</div>}

      <div
        className="rounded-xl overflow-hidden relative"
        style={{
          background: POLISH_THEME.listBg,
          border: `1px solid ${POLISH_THEME.listBorder}`,
          boxShadow: POLISH_THEME.listContainerShadow,
        }}
      >
        {isFetching && hasTickets && !isInitialLoading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              zIndex: 5,
              background: `linear-gradient(90deg, transparent, var(--color-accent), transparent)`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s ease-in-out infinite',
            }}
          />
        )}
        {isInitialLoading ? (
          initialSkeleton ?? (
            <div
              className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-2`}
              style={{ color: POLISH_THEME.theadText }}
            >
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-xs" style={{ color: POLISH_THEME.metaMuted }}>
                Loading…
              </span>
            </div>
          )
        ) : !hasTickets ? (
          emptyState
        ) : (
          <>
            {ticketList}
            {pagination}
          </>
        )}
      </div>
    </div>
  );

  if (leftSidebar != null) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {leftSidebar}
        {mainContent}
      </div>
    );
  }

  return <div className="flex-1 flex flex-col overflow-hidden">{mainContent}</div>;
}
