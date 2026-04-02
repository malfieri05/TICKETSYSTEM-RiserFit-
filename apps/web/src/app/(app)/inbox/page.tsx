'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox as InboxIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { POLISH_THEME, POLISH_CLASS, FEED_COL_WIDTHS } from '@/lib/polish';
import { ticketsApi, invalidateTicketLists } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import type { TicketFilters } from '@/types';
import { Header } from '@/components/layout/Header';
import { TicketTableRow, CANONICAL_FEED_HEADERS, getThClass } from '@/components/tickets/TicketRow';
import { TicketFeedLayout } from '@/components/tickets/TicketFeedLayout';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { Button } from '@/components/ui/Button';

const STORAGE_KEY = 'inbox-topics-collapsed';
const PAGE_SIZE = 20;

export default function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicsPanelCollapsed, setTopicsPanelCollapsed] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
    setTopicsPanelCollapsed(!!stored);
  }, []);

  const toggleTopicsPanel = () => {
    setTopicsPanelCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);
  const handleClose = useCallback(() => setSelectedId(null), []);

  const canAddTag = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const addTagMut = useMutation({
    mutationFn: ({ ticketId, label }: { ticketId: string; label: string }) =>
      ticketsApi.addTag(ticketId, { label }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      invalidateTicketLists(qc);
    },
  });
  const handleAddTag = useCallback(
    async (ticketId: string, label: string) => {
      await addTagMut.mutateAsync({ ticketId, label });
    },
    [addTagMut],
  );

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
    <table className="w-full text-sm table-fixed">
      <colgroup>
        {FEED_COL_WIDTHS.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.tableHeaderBg }}>
          {CANONICAL_FEED_HEADERS.map((h) => (
            <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
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
              dueDate={ticket.dueDate}
              createdAt={ticket.createdAt}
              tags={ticket.tags ?? []}
              canAddTag={canAddTag}
              onAddTag={canAddTag ? handleAddTag : undefined}
              isAddingTag={
                addTagMut.isPending && addTagMut.variables?.ticketId === ticket.id
              }
              commentCount={ticket._count?.comments ?? 0}
              completedSubtasks={completedSubtasks}
              totalSubtasks={totalSubtasks}
              requesterDisplayName={ticket.requester.displayName || ticket.requester.email || '—'}
              isSelected={selectedId === ticket.id}
              onSelect={handleSelect}
            />
          );
        })}
      </tbody>
    </table>
  );

  const initialSkeleton = (
    <table className="w-full text-sm table-fixed">
      <colgroup>
        {FEED_COL_WIDTHS.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.tableHeaderBg }}>
          {CANONICAL_FEED_HEADERS.map((h) => (
            <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <TicketsTableSkeletonRows count={6} />
    </table>
  );

  const feedTitle =
    selectedFolderId === 'all'
      ? 'Actionable tickets'
      : (() => {
          const folder = folders.find((f) => f.id === selectedFolderId);
          return folder ? `${folder.label} Tickets` : 'Actionable tickets';
        })();

  const topicFolders = folders.filter((f) => f.id !== 'all');
  const allCount = folders.find((f) => f.id === 'all')?.activeCount;

  const TOGGLE_CIRCLE_SIZE = 28;
  const DIVIDER_WIDTH = 2;
  /** When expanded, reserve space for the right-edge handle (line + circle). */
  const EXPANDED_HANDLE_WIDTH = 32;
  const EXPANDED_CONTENT_WIDTH = 208 - EXPANDED_HANDLE_WIDTH;

  const leftSidebar =
    canSeeFolders && (topicFolders.length > 0 || allCount != null) ? (
      <aside
        className={`shrink-0 relative ${topicsPanelCollapsed ? 'flex flex-col' : 'flex flex-row'}`}
        style={{
          width: topicsPanelCollapsed ? DIVIDER_WIDTH : 208,
          transition: 'width 0.25s ease-out',
          overflow: topicsPanelCollapsed ? 'visible' : 'hidden',
        }}
      >
        {/* Collapsed: thin divider line + circle with chevron-right centered on line */}
        {topicsPanelCollapsed && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px shrink-0"
              style={{
                left: DIVIDER_WIDTH / 2 - 1,
                background: 'var(--color-border-default)',
              }}
            />
            <button
              type="button"
              onClick={toggleTopicsPanel}
              className="absolute rounded-full flex items-center justify-center transition-all duration-200 ease-out cursor-pointer border hover:bg-[var(--color-bg-surface)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              style={{
                width: TOGGLE_CIRCLE_SIZE,
                height: TOGGLE_CIRCLE_SIZE,
                left: DIVIDER_WIDTH / 2 - TOGGLE_CIRCLE_SIZE / 2,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'var(--color-bg-page)',
                borderColor: 'var(--color-border-default)',
                color: 'var(--color-text-primary)',
                boxShadow: 'var(--shadow-card)',
              }}
              aria-label="Expand topics"
            >
              <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            </button>
          </>
        )}

        {/* Expanded: panel content + right-edge divider with circle (chevron-left) */}
        {!topicsPanelCollapsed && (
          <>
            <div className="flex flex-col shrink-0 border-r" style={{ width: EXPANDED_CONTENT_WIDTH, borderColor: POLISH_THEME.listBorder, background: 'var(--color-bg-surface)' }}>
              <div className="shrink-0 p-3 border-b" style={{ borderColor: POLISH_THEME.listBorder, minHeight: 44 }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: POLISH_THEME.metaMuted }}>
                  Topics
                </span>
              </div>
              <nav className="p-2 space-y-0.5 overflow-y-auto flex-1 min-w-0">
            <button
              type="button"
              onClick={() => {
                setSelectedFolderId('all');
                setPage(1);
              }}
              data-active={selectedFolderId === 'all'}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2 [&:not([data-active])]:hover:bg-[rgba(52,120,196,0.08)] [&:not([data-active])]:hover:border-[rgba(52,120,196,0.25)] [&:not([data-active])]:hover:text-[var(--color-text-primary)]"
              style={{
                background: selectedFolderId === 'all' ? 'rgba(52,120,196,0.15)' : 'transparent',
                color: selectedFolderId === 'all' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                border: selectedFolderId === 'all' ? '1px solid rgba(52,120,196,0.4)' : '1px solid transparent',
              }}
            >
              <span className="truncate">All</span>
              {allCount != null && (
                <span
                  className="shrink-0 text-xs tabular-nums"
                  style={{ color: selectedFolderId === 'all' ? POLISH_THEME.accent : POLISH_THEME.metaDim }}
                >
                  {allCount}
                </span>
              )}
            </button>
            {topicFolders.map((folder) => {
              const isActive = folder.id === selectedFolderId;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setPage(1);
                  }}
                  data-active={isActive}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2 [&:not([data-active])]:hover:bg-[rgba(52,120,196,0.08)] [&:not([data-active])]:hover:border-[rgba(52,120,196,0.25)] [&:not([data-active])]:hover:text-[var(--color-text-primary)]"
                  style={{
                    background: isActive ? 'rgba(52,120,196,0.15)' : 'transparent',
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    border: isActive ? '1px solid rgba(52,120,196,0.4)' : '1px solid transparent',
                  }}
                >
                  <span className="truncate">{folder.label}</span>
                  {folder.activeCount != null && (
                    <span
                      className="shrink-0 text-xs tabular-nums"
                      style={{ color: isActive ? POLISH_THEME.accent : POLISH_THEME.metaDim }}
                    >
                      {folder.activeCount}
                    </span>
                  )}
                </button>
              );
            })}
              </nav>
            </div>
            {/* Right-edge divider line + collapse circle (chevron-left) */}
            <div
              className="flex flex-col items-center shrink-0 relative"
              style={{ width: EXPANDED_HANDLE_WIDTH }}
            >
              <div
                className="absolute top-0 bottom-0 w-px"
                style={{ left: 0, background: 'var(--color-border-default)' }}
              />
              <button
                type="button"
                onClick={toggleTopicsPanel}
                className="absolute rounded-full flex items-center justify-center transition-all duration-200 ease-out cursor-pointer border hover:bg-[var(--color-bg-surface)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                style={{
                  width: TOGGLE_CIRCLE_SIZE,
                  height: TOGGLE_CIRCLE_SIZE,
                  top: 12,
                  left: EXPANDED_HANDLE_WIDTH / 2 - TOGGLE_CIRCLE_SIZE / 2,
                  background: 'var(--color-bg-page)',
                  borderColor: 'var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                  boxShadow: 'var(--shadow-card)',
                }}
                aria-label="Collapse topics"
              >
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              </button>
            </div>
          </>
        )}
      </aside>
    ) : undefined;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Actionable" />
      <TicketFeedLayout
        title={feedTitle}
        description="Tickets with incomplete subtasks assigned to you or your departments."
        leftSidebar={leftSidebar}
        isInitialLoading={isInitialLoading}
        isFetching={isFetching}
        hasTickets={hasTickets}
        ticketList={ticketList}
        emptyState={emptyState}
        pagination={pagination}
        initialSkeleton={initialSkeleton}
      />
      <TicketDrawer ticketId={selectedId} onClose={handleClose} />
    </div>
  );
}
