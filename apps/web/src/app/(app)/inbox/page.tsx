'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Inbox as InboxIcon } from 'lucide-react';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { ticketsApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import type { TicketFilters } from '@/types';
import { Header } from '@/components/layout/Header';
import { TicketTableRow } from '@/components/tickets/TicketRow';
import { InboxLayout } from '@/components/inbox/InboxLayout';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { Button } from '@/components/ui/Button';

const PAGE_SIZE = 20;

const CANONICAL_HEADERS = [
  { label: 'ID', key: 'id' },
  { label: 'Title', key: 'title' },
  { label: 'Status', key: 'status' },
  { label: 'Priority', key: 'priority' },
  { label: 'Created', key: 'created' },
  { label: 'Progress', key: 'progress' },
  { label: 'Requester', key: 'requester' },
] as const;

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
    statusGroup: 'active',
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
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: `1px solid ${POLISH_THEME.listBorder}` }}
      >
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Page {page} of {totalPages} ({total} total)
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
          >
            Next
          </Button>
        </div>
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
        When there are incomplete subtasks assigned to you (or your departments) on open tickets, they will appear in this queue.
      </p>
    </div>
  );

  const ticketList = (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
          {CANONICAL_HEADERS.map((h) => (
            <th key={h.key} className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tickets.map((ticket) => {
          const totalSubtasks = (ticket as { totalSubtasks?: number }).totalSubtasks ?? ticket._count?.subtasks ?? 0;
          const completedSubtasks = (ticket as { completedSubtasks?: number }).completedSubtasks ?? 0;
          return (
            <TicketTableRow
              key={ticket.id}
              id={ticket.id}
              title={ticket.title}
              status={ticket.status}
              priority={ticket.priority}
              createdAt={ticket.createdAt}
              updatedAt={ticket.updatedAt}
              commentCount={ticket._count?.comments ?? 0}
              completedSubtasks={completedSubtasks}
              totalSubtasks={totalSubtasks}
              requesterDisplayName={ticket.requester.displayName}
              isSelected={false}
              onSelect={() => router.push(`/tickets/${ticket.id}`)}
            />
          );
        })}
      </tbody>
    </table>
  );

  const initialSkeleton = (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
          {CANONICAL_HEADERS.map((h) => (
            <th key={h.key} className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <TicketsTableSkeletonRows count={6} />
    </table>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Actionable" />
      <InboxLayout
        title="Actionable tickets"
        description="Tickets with incomplete subtasks assigned to you or your departments."
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
