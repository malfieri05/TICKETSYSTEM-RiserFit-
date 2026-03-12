'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Ticket, CheckCircle2, Clock, ChevronRight, Search } from 'lucide-react';
import { ticketsApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import type { ScopeSummaryRecentTicket, TicketListItem } from '@/types';
import { InboxLayout } from '@/components/inbox/InboxLayout';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { TicketTableRow } from '@/components/tickets/TicketRow';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

const panel = { background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.listBorder}` };
const PAGE_SIZE = 20;

type TabId = 'my' | 'studio' | 'dashboard';

function StatCard({
  label,
  value,
  icon: Icon,
  iconStyle,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  iconStyle: React.CSSProperties;
}) {
  return (
    <div className="rounded-xl p-5 flex items-start gap-4" style={panel}>
      <div className="rounded-lg p-2.5 shrink-0" style={iconStyle}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: POLISH_THEME.theadText }}
        >
          {label}
        </p>
        <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function RecentRow({ ticket, onClick }: { ticket: ScopeSummaryRecentTicket; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors duration-150"
      style={{ background: 'var(--color-bg-surface)', border: `1px solid ${POLISH_THEME.listBorder}` }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-surface-raised)';
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-surface)';
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
      }}
    >
      <span className="text-xs font-mono shrink-0" style={{ color: POLISH_THEME.metaDim }}>{ticket.id.slice(0, 8)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{ticket.title}</p>
        <p className="text-xs mt-0.5" style={{ color: POLISH_THEME.theadText }}>
          {ticket.studio?.name ?? 'No studio'} ·{' '}
          {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
        </p>
      </div>
      <StatusBadge status={ticket.status} />
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
    </button>
  );
}

const DASHBOARD_RECENT_LIMIT = 5;

export default function PortalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const activeTab = (searchParams.get('tab') as TabId) ?? 'my';

  // Scope summary (dashboard metrics + allowed studios)
  const { data: scopeData, isLoading: scopeLoading } = useQuery({
    queryKey: ['scope-summary'],
    queryFn: () => ticketsApi.scopeSummary(),
  });
  const scope = scopeData?.data;
  const allowedStudios = scope?.allowedStudios ?? [];

  // ─── My Tickets tab state ───────────────────────────────────────────────────
  const [myPage, setMyPage] = useState(1);
  const [mySearch, setMySearch] = useState('');
  const myDebouncedSearch = useDebouncedValue(mySearch, 300);

  useEffect(() => {
    setMyPage(1);
  }, [myDebouncedSearch]);

  const {
    tickets: myTickets,
    total: myTotal,
    totalPages: myTotalPages,
    isInitialLoading: myInitialLoading,
    isFetching: myFetching,
  } = useTicketListQuery(
    'portal-my',
    {
      page: myPage,
      limit: PAGE_SIZE,
      search: myDebouncedSearch || undefined,
      requesterId: user?.id ?? undefined,
    },
    { enabled: !!user && activeTab === 'my' },
  );

  const myHasTickets = myTickets.length > 0;
  const myHasFilters = !!myDebouncedSearch;

  const myPagination =
    myTotalPages > 1 ? (
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid var(--color-border-default)' }}
      >
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Showing {(myPage - 1) * PAGE_SIZE + 1}–
          {Math.min(myPage * PAGE_SIZE, myTotal)} of {myTotal}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={myPage <= 1 || myFetching}
            onClick={() => setMyPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={myPage >= myTotalPages || myFetching}
            onClick={() => setMyPage((p) => Math.min(myTotalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    ) : null;

  const myFiltersBar = (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          style={{ color: 'var(--color-text-muted)' }}
        />
        <Input
          placeholder="Search tickets..."
          value={mySearch}
          onChange={(e) => setMySearch(e.target.value)}
          className="w-56 pl-9"
        />
      </div>
    </div>
  );

  const myEmptyState = (
    <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-3`} style={{ color: POLISH_THEME.theadText }}>
      {myHasFilters ? (
        <>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets match your current search</p>
          <p className="text-xs text-center max-w-sm" style={{ color: POLISH_THEME.metaMuted }}>
            Try clearing your search or using different keywords.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets yet</p>
          <p className="text-xs text-center max-w-sm" style={{ color: POLISH_THEME.metaMuted }}>
            Tickets you have requested across all locations will appear here.
          </p>
        </>
      )}
    </div>
  );

  // Canonical feed headers — same order as all other ticket list surfaces
  const portalHeaders = ['ID', 'Title', 'Created', 'Status', 'Priority', 'Progress', 'Requester', 'Comments'];

  const myTicketList = (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
          {portalHeaders.map((h) => (
            <th key={h} className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {myTickets.map((ticket) => {
          const topicLabel = ticket.supportTopic?.name ?? ticket.maintenanceCategory?.name ?? '';
          const studioName = ticket.studio?.name ?? '';
          const subLabel = [topicLabel, studioName].filter(Boolean).join(' · ') || undefined;
          const requesterDisplayName = (ticket.requester as { displayName?: string; name?: string }).displayName ?? (ticket.requester as { displayName?: string; name?: string }).name ?? '—';
          const totalSubtasks = (ticket as { totalSubtasks?: number }).totalSubtasks ?? ticket._count?.subtasks ?? 0;
          const completedSubtasks = (ticket as { completedSubtasks?: number }).completedSubtasks ?? 0;
          return (
            <TicketTableRow
              key={ticket.id}
              id={ticket.id}
              title={ticket.title}
              subLabel={subLabel}
              status={ticket.status}
              priority={ticket.priority}
              createdAt={ticket.createdAt}
              commentCount={ticket._count?.comments ?? 0}
              completedSubtasks={completedSubtasks}
              totalSubtasks={totalSubtasks}
              requesterDisplayName={requesterDisplayName}
              onSelect={() => router.push(`/tickets/${ticket.id}`)}
            />
          );
        })}
      </tbody>
    </table>
  );

  const myTableSkeleton = (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
          {portalHeaders.map((h) => (
            <th key={h} className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>{h}</th>
          ))}
        </tr>
      </thead>
      <TicketsTableSkeletonRows count={6} />
    </table>
  );

  // ─── By Studio(s) tab state ────────────────────────────────────────────────
  const [studioPage, setStudioPage] = useState(1);
  const [studioFilter, setStudioFilter] = useState<string>('');
  const [studioSearch, setStudioSearch] = useState('');
  const studioDebouncedSearch = useDebouncedValue(studioSearch, 300);

  useEffect(() => {
    setStudioPage(1);
  }, [studioDebouncedSearch, studioFilter]);

  const {
    tickets: studioTickets,
    total: studioTotal,
    totalPages: studioTotalPages,
    isInitialLoading: studioInitialLoading,
    isFetching: studioFetching,
  } = useTicketListQuery(
    'portal-studio',
    {
      page: studioPage,
      limit: PAGE_SIZE,
      search: studioDebouncedSearch || undefined,
      requesterId: user?.id ?? undefined,
      ...(studioFilter && { studioId: studioFilter }),
    },
    { enabled: !!user && activeTab === 'studio' },
  );

  const studioHasTickets = studioTickets.length > 0;
  const studioHasFilters = !!studioFilter || !!studioDebouncedSearch;

  const studioPagination =
    studioTotalPages > 1 ? (
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid var(--color-border-default)' }}
      >
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Showing {(studioPage - 1) * PAGE_SIZE + 1}–
          {Math.min(studioPage * PAGE_SIZE, studioTotal)} of {studioTotal}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={studioPage <= 1 || studioFetching}
            onClick={() => setStudioPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={studioPage >= studioTotalPages || studioFetching}
            onClick={() => setStudioPage((p) => Math.min(studioTotalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    ) : null;

  const studioFiltersBar = (
    <div className="flex flex-wrap gap-3 items-end">
      <Select
        value={studioFilter}
        onChange={(e) => {
          setStudioFilter(e.target.value);
          setStudioPage(1);
        }}
        className="w-56"
      >
        <option value="">All my studios</option>
        {allowedStudios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          style={{ color: 'var(--color-text-muted)' }}
        />
        <Input
          placeholder="Search tickets..."
          value={studioSearch}
          onChange={(e) => setStudioSearch(e.target.value)}
          className="w-56 pl-9"
        />
      </div>
    </div>
  );

  const studioEmptyState = (
    <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-3`} style={{ color: POLISH_THEME.theadText }}>
      {studioHasFilters ? (
        <>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets match your current filters</p>
          <p className="text-xs text-center max-w-sm" style={{ color: POLISH_THEME.metaMuted }}>
            Try clearing the studio or search filters to see more tickets you have requested.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets for your locations yet</p>
          <p className="text-xs text-center max-w-sm" style={{ color: POLISH_THEME.metaMuted }}>
            Tickets you have requested for your allowed studios will appear here.
          </p>
        </>
      )}
    </div>
  );

  const studioTicketList = (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
          {portalHeaders.map((h) => (
            <th key={h} className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {studioTickets.map((ticket) => {
          const topicLabel = ticket.supportTopic?.name ?? ticket.maintenanceCategory?.name ?? '';
          const studioName = ticket.studio?.name ?? '';
          const subLabel = [topicLabel, studioName].filter(Boolean).join(' · ') || undefined;
          const requesterDisplayName = (ticket.requester as { displayName?: string; name?: string }).displayName ?? (ticket.requester as { displayName?: string; name?: string }).name ?? '—';
          const totalSubtasks = (ticket as { totalSubtasks?: number }).totalSubtasks ?? ticket._count?.subtasks ?? 0;
          const completedSubtasks = (ticket as { completedSubtasks?: number }).completedSubtasks ?? 0;
          return (
            <TicketTableRow
              key={ticket.id}
              id={ticket.id}
              title={ticket.title}
              subLabel={subLabel}
              status={ticket.status}
              priority={ticket.priority}
              createdAt={ticket.createdAt}
              commentCount={ticket._count?.comments ?? 0}
              completedSubtasks={completedSubtasks}
              totalSubtasks={totalSubtasks}
              requesterDisplayName={requesterDisplayName}
              onSelect={() => router.push(`/tickets/${ticket.id}`)}
            />
          );
        })}
      </tbody>
    </table>
  );

  const studioTableSkeleton = (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
          {portalHeaders.map((h) => (
            <th key={h} className={POLISH_CLASS.tableHeader} style={{ color: POLISH_THEME.theadText }}>{h}</th>
          ))}
        </tr>
      </thead>
      <TicketsTableSkeletonRows count={6} />
    </table>
  );

  // ─── Dashboard tab content (reuses existing scope summary) ──────────────────
  const openCount = scope?.openCount ?? 0;
  const completedCount = scope?.completedCount ?? 0;
  const recentTickets = scope?.recentTickets ?? [];
  const [locationFilter, setLocationFilter] = useState<string>('');

  const filteredRecentTickets = useMemo(() => {
    if (!locationFilter) return recentTickets;
    return recentTickets.filter((t) => t.studio?.id === locationFilter);
  }, [recentTickets, locationFilter]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="My Tickets" />
      {/* Tab bodies controlled by ?tab=… from sidebar navigation */}
      {activeTab === 'my' && (
        <InboxLayout
          title="My tickets"
          description="Tickets you have requested, across all locations."
          isInitialLoading={myInitialLoading}
          isFetching={myFetching}
          hasTickets={myHasTickets}
          filters={myFiltersBar}
          ticketList={myTicketList}
          emptyState={myEmptyState}
          pagination={myPagination}
          initialSkeleton={myTableSkeleton}
        />
      )}

      {activeTab === 'studio' && (
        <InboxLayout
          title="Tickets by studio"
          description="Tickets you have requested, grouped by your allowed locations."
          isInitialLoading={studioInitialLoading}
          isFetching={studioFetching}
          hasTickets={studioHasTickets}
          filters={studioFiltersBar}
          ticketList={studioTicketList}
          emptyState={studioEmptyState}
          pagination={studioPagination}
          initialSkeleton={studioTableSkeleton}
        />
      )}

      {activeTab === 'dashboard' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className={`max-w-5xl mx-auto ${POLISH_CLASS.sectionGap}`}>
            {/* Stats — aligned with InboxLayout card rhythm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {scopeLoading ? (
                <div className="col-span-2 flex justify-center py-12">
                  <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                </div>
              ) : (
                <>
                  <StatCard
                    label="Open tickets"
                    value={openCount}
                    icon={Clock}
                    iconStyle={{
                      background: 'rgba(251,191,36,0.15)',
                      color: '#d97706',
                    }}
                  />
                  <StatCard
                    label="Completed tickets"
                    value={completedCount}
                    icon={CheckCircle2}
                    iconStyle={{
                      background: 'rgba(34,197,94,0.15)',
                      color: '#16a34a',
                    }}
                  />
                </>
              )}
            </div>

            {/* Location filter when multiple allowed studios */}
            {allowedStudios.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: POLISH_THEME.metaMuted }}
                >
                  Location:
                </span>
                <button
                  type="button"
                  onClick={() => setLocationFilter('')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: !locationFilter ? 'var(--color-accent)' : 'transparent',
                    color: !locationFilter ? '#ffffff' : 'var(--color-text-muted)',
                    border: `1px solid ${
                      !locationFilter ? 'var(--color-accent)' : 'var(--color-border-default)'
                    }`,
                  }}
                >
                  All
                </button>
                {allowedStudios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setLocationFilter(s.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: locationFilter === s.id ? 'var(--color-accent)' : 'transparent',
                      color: locationFilter === s.id ? '#ffffff' : 'var(--color-text-muted)',
                      border: `1px solid ${
                        locationFilter === s.id ? 'var(--color-accent)' : 'var(--color-border-default)'
                      }`,
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {/* Recent activity — capped preview with link to full feed */}
            <div className="rounded-xl p-5 space-y-4" style={panel}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                  <Ticket className="h-4 w-4" style={{ color: POLISH_THEME.accent }} />
                  Recent activity
                </h2>
                <button
                  type="button"
                  onClick={() => router.push('/portal?tab=my')}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--color-accent)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  View all tickets →
                </button>
              </div>
              {scopeLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                </div>
              ) : filteredRecentTickets.length === 0 ? (
                <p
                  className="text-sm text-center py-8"
                  style={{ color: POLISH_THEME.theadText }}
                >
                  No recent tickets.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredRecentTickets.slice(0, DASHBOARD_RECENT_LIMIT).map((t) => (
                    <RecentRow
                      key={t.id}
                      ticket={t}
                      onClick={() => router.push(`/tickets/${t.id}`)}
                    />
                  ))}
                  {filteredRecentTickets.length > DASHBOARD_RECENT_LIMIT && (
                    <p className="text-xs text-center pt-1" style={{ color: POLISH_THEME.metaMuted }}>
                      Showing {DASHBOARD_RECENT_LIMIT} of {filteredRecentTickets.length} recent tickets
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

