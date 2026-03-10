'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { ticketsApi, usersApi } from '@/lib/api';
import type { TicketFilters, TicketStatus } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TicketTableRow } from '@/components/tickets/TicketRow';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

const PAGE_SIZE = 20;

type ViewTab = 'active' | 'completed';

const ACTIVE_STATUSES: TicketStatus[] = ['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR'];
const COMPLETED_STATUSES: TicketStatus[] = ['RESOLVED', 'CLOSED'];

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [filters, setFilters] = useState<TicketFilters>({ page: 1, limit: PAGE_SIZE });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasInitializedFromUrl = useRef(false);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Sync filters from URL once on mount (e.g. when coming from dispatch dashboard)
  useEffect(() => {
    if (hasInitializedFromUrl.current) return;
    hasInitializedFromUrl.current = true;
    const ticketClassId = searchParams.get('ticketClassId');
    const studioId = searchParams.get('studioId');
    const marketId = searchParams.get('marketId');
    const maintenanceCategoryId = searchParams.get('maintenanceCategoryId');
    if (ticketClassId || studioId || marketId || maintenanceCategoryId) {
      setFilters((f) => ({
        ...f,
        ...(ticketClassId && { ticketClassId }),
        ...(studioId && { studioId }),
        ...(marketId && { marketId }),
        ...(maintenanceCategoryId && { maintenanceCategoryId }),
        page: 1,
      }));
    }
  }, [searchParams]);

  // Reset to page 1 when debounced search changes (so next fetch uses page 1)
  useEffect(() => {
    setFilters((f) => ({ ...f, page: 1 }));
  }, [debouncedSearch]);

  const listParams = {
    page: filters.page ?? 1,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    teamId: filters.teamId,
    status: filters.status,
    ticketClassId: filters.ticketClassId,
    studioId: filters.studioId,
    marketId: filters.marketId,
    maintenanceCategoryId: filters.maintenanceCategoryId,
  };

  const {
    tickets: allTickets,
    total,
    totalPages,
    isInitialLoading,
    isFetching,
  } = useTicketListQuery('list', listParams);

  // Departments (teams) derived from users list
  const { data: usersRes } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });
  const users = usersRes?.data ?? [];
  const departments = Array.from(
    new Map(
      users
        .filter((u) => u.teamId && u.teamName)
        .map((u) => [u.teamId as string, u.teamName as string]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const usersById = new Map(users.map((u) => [u.id, u]));

  const matchesDepartment = (ticket: (typeof allTickets)[number]) => {
    if (!filters.teamId) return true;
    const requester = usersById.get(ticket.requester.id);
    const owner = ticket.owner ? usersById.get(ticket.owner.id) : undefined;
    return (
      (requester?.teamId && requester.teamId === filters.teamId) ||
      (owner?.teamId && owner.teamId === filters.teamId)
    );
  };

  const ticketsByDept = allTickets.filter(matchesDepartment);
  const activeCount = ticketsByDept.filter((t) => ACTIVE_STATUSES.includes(t.status as TicketStatus)).length;
  const completedCount = ticketsByDept.filter((t) => COMPLETED_STATUSES.includes(t.status as TicketStatus)).length;

  const tickets = ticketsByDept.filter((t) =>
    filters.status
      ? true
      : viewTab === 'active'
        ? ACTIVE_STATUSES.includes(t.status as TicketStatus)
        : COMPLETED_STATUSES.includes(t.status as TicketStatus),
  );

  const setFilter = (key: keyof TicketFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  };

  // Scroll list area to top when page changes (predictable UX)
  const currentPage = filters.page ?? 1;
  useEffect(() => {
    listContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Tickets" />

      {/* View purpose copy */}
      <div
        className="px-6 py-3 text-sm space-y-1"
        style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
      >
        <p>Global list of all tickets you are allowed to see across departments and locations.</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Use the Active / Completed tabs to switch between open work and historical tickets. Filters and search further narrow this list.
        </p>
      </div>

      {/* Sub-category tabs */}
      <div className="flex items-center gap-1 px-6 py-2.5" style={{ background: 'var(--color-bg-page)', borderBottom: '1px solid var(--color-border-default)' }}>
        {([
          { key: 'active' as ViewTab, label: 'Active', count: activeCount },
          { key: 'completed' as ViewTab, label: 'Completed', count: completedCount },
        ]).map(({ key, label, count }) => {
          const active = viewTab === key;
          return (
            <button
              key={key}
              onClick={() => { setViewTab(key); setFilters((f) => ({ ...f, status: undefined, page: 1 })); setSelectedId(null); }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? 'var(--color-bg-surface)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                border: active ? '1px solid var(--color-border-default)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            >
              {label}
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: active ? 'var(--color-bg-surface-raised)' : 'var(--color-bg-surface)',
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={listContainerRef} className="flex-1 p-6 space-y-4 overflow-y-auto" style={{ background: 'var(--color-bg-page)' }}>
        {/* Filters bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9"
            />
          </div>

          <Select
            value={filters.teamId ?? ''}
            onChange={(e) => setFilter('teamId', e.target.value)}
            className="w-48"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>

          {(filters.teamId || filters.ticketClassId || filters.studioId || filters.marketId || filters.maintenanceCategoryId || search) && (
            <Button variant="ghost" size="md" onClick={() => { setFilters({ page: 1, limit: PAGE_SIZE }); setSearch(''); }}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-hidden" style={{ background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.listBorder}`, boxShadow: POLISH_THEME.listContainerShadow }}>
          {isFetching && tickets.length > 0 && (
            <div
              className="px-4 py-1.5 flex items-center gap-2 border-b"
              style={{ borderColor: POLISH_THEME.listBorder, background: POLISH_THEME.listBgHeader }}
            >
              <div className="animate-spin h-3 w-3 rounded-full border-2 border-teal-500 border-t-transparent" />
              <span className="text-xs" style={{ color: POLISH_THEME.metaMuted }}>
                Fetching…
              </span>
            </div>
          )}
          {isInitialLoading ? (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Title</th>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Created</th>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Progress</th>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Requester</th>
                </tr>
              </thead>
              <TicketsTableSkeletonRows count={8} />
            </table>
          ) : tickets.length === 0 ? (
            <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-3`} style={{ color: POLISH_THEME.theadText }}>
              {Object.keys(filters).some((k) => k !== 'page' && k !== 'limit' && filters[k as keyof TicketFilters]) || debouncedSearch ? (
                <>
                  <p className="text-sm font-medium text-gray-300">No tickets match your current filters</p>
                  <p className="text-xs text-center">Try adjusting your filters or search.</p>
                  <Button variant="ghost" size="sm" onClick={() => { setFilters({ page: 1, limit: PAGE_SIZE }); setSearch(''); }}>
                    Clear filters
                  </Button>
                </>
              ) : viewTab === 'completed' ? (
                <>
                  <p className="text-sm font-medium text-gray-300">No completed tickets yet</p>
                  <p className="text-xs text-center max-w-sm">
                    Tickets move here after they are resolved or closed. Check the Active tab for work in progress.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-300">No active tickets yet</p>
                  <p className="text-xs text-center max-w-sm">Create your first ticket to start tracking requests.</p>
                  <Button size="sm" onClick={() => router.push('/tickets/new')}>
                    New Ticket
                  </Button>
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Title</th>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Created</th>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Progress</th>
                  <th className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>Requester</th>
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
                      createdAt={ticket.createdAt}
                      commentCount={ticket._count?.comments ?? 0}
                      completedSubtasks={completedSubtasks}
                      totalSubtasks={totalSubtasks}
                      requesterDisplayName={ticket.requester.displayName}
                      isSelected={selectedId === ticket.id}
                      onSelect={() => setSelectedId(ticket.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Showing {((filters.page ?? 1) - 1) * PAGE_SIZE + 1}–{Math.min((filters.page ?? 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={(filters.page ?? 1) <= 1 || isFetching}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={(filters.page ?? 1) >= totalPages || isFetching}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <TicketDrawer ticketId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
