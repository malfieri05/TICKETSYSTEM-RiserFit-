'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Inbox as InboxIcon, MessageCircle } from 'lucide-react';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { formatDistanceToNow } from 'date-fns';
import { ticketsApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import type { TicketFilters } from '@/types';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { InboxLayout } from '@/components/inbox/InboxLayout';
import { InboxListSkeletonRows } from '@/components/inbox/ListSkeletons';

const PAGE_SIZE = 20;

export default function InboxPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');

  const canSeeFolders = user?.role === 'DEPARTMENT_USER' || user?.role === 'ADMIN';
  const { data: foldersData } = useQuery({
    queryKey: ['inbox-folders'],
    queryFn: () => ticketsApi.inboxFolders(),
    enabled: canSeeFolders,
  });
  const folders = foldersData?.data?.folders ?? [];

  const listParams: TicketFilters & { search?: string } = {
    actionableForMe: true,
    page,
    limit: PAGE_SIZE,
    ...(selectedFolderId !== 'all' && { supportTopicId: selectedFolderId }),
  };

  const {
    tickets,
    total,
    totalPages,
    isInitialLoading,
    isFetching,
  } = useTicketListQuery('actionable', listParams);

  const hasTickets = tickets.length > 0;

  const pagination =
    totalPages > 1 ? (
      <div
        className="flex items-center justify-center gap-2 px-4 py-3"
        style={{ borderTop: `1px solid ${POLISH_THEME.listBorder}` }}
      >
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || isFetching}
          className="text-sm font-medium px-3 py-1 rounded disabled:opacity-50"
          style={{ color: 'var(--color-accent)' }}
        >
          Previous
        </button>
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || isFetching}
          className="text-sm font-medium px-3 py-1 rounded disabled:opacity-50"
          style={{ color: 'var(--color-accent)' }}
        >
          Next
        </button>
      </div>
    ) : null;

  const emptyState = (
    <div
      className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding}`}
      style={{ color: POLISH_THEME.theadText }}
    >
      <InboxIcon className={`${POLISH_CLASS.emptyStateIcon} mb-3`} style={{ color: 'var(--color-text-muted)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>No actionable tickets</p>
      <p className="text-xs mt-1 text-center max-w-sm" style={{ color: POLISH_THEME.metaMuted }}>
        When there are READY subtasks assigned to you (or your departments) on open tickets, they will appear in this queue.
      </p>
    </div>
  );

  const ticketList = (
    <>
      {tickets.map((ticket, i) => (
        <button
          key={ticket.id}
          type="button"
          onClick={() => router.push(`/tickets/${ticket.id}`)}
          className="w-full text-left flex flex-col gap-2 px-4 py-3 transition-colors"
          style={{
            borderTop: i > 0 ? `1px solid ${POLISH_THEME.rowBorder}` : undefined,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = POLISH_THEME.rowHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: 'var(--color-text-primary)' }}>
              {ticket.title}
            </span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          {(ticket._count?.comments ?? 0) > 0 || (ticket.readySubtasksSummary && ticket.readySubtasksSummary.length > 0) ? (
            <div className="flex flex-wrap items-center gap-2">
              {(ticket._count?.comments ?? 0) > 0 && (
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  <MessageCircle className="h-3 w-3" />
                  <span className="tabular-nums">{ticket._count?.comments ?? 0}</span>
                </div>
              )}
              {ticket.readySubtasksSummary && ticket.readySubtasksSummary.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    Ready:
                  </span>
                  {ticket.readySubtasksSummary.map((s) => (
                    <span
                      key={s.id}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'rgba(20,184,166,0.15)', color: 'var(--color-accent)' }}
                    >
                      {s.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <div className="flex items-center gap-3 text-xs" style={{ color: POLISH_THEME.theadText }}>
            {ticket.owner && (
              <span>
                Owner:{' '}
                {ticket.owner.displayName ??
                  ticket.owner.name ??
                  ticket.owner.email}
              </span>
            )}
            <span>
              {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
            </span>
          </div>
        </button>
      ))}
    </>
  );

  const initialSkeleton = <InboxListSkeletonRows count={6} />;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Actionable" />
      <InboxLayout
        title="Actionable tickets"
        description="Tickets with READY subtasks assigned to you or your departments."
        folders={canSeeFolders ? folders : undefined}
        selectedFolderId={selectedFolderId}
        onFolderChange={(id) => {
          setSelectedFolderId(id);
          setPage(1);
        }}
        folderOrientation={canSeeFolders ? 'vertical' : 'horizontal'}
        isInitialLoading={isInitialLoading}
        isFetching={isFetching}
        hasTickets={hasTickets}
        ticketList={ticketList}
        emptyState={emptyState}
        pagination={pagination}
        initialSkeleton={initialSkeleton}
      />
    </div>
  );
}
