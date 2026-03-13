'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Ticket, CheckCircle2, Clock, Search, MapPin } from 'lucide-react';
import { ticketsApi, dashboardApi, adminApi, type StudioDashboardSummaryResponse } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { TicketFeedLayout } from '@/components/tickets/TicketFeedLayout';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { useAuth } from '@/hooks/useAuth';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { TicketTableRow, CANONICAL_FEED_HEADERS, getThClass } from '@/components/tickets/TicketRow';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

const panel = { background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.listBorder}` };
const PAGE_SIZE = 20;

type TabId = 'my' | 'studio' | 'dashboard';

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconStyle,
}: {
  label: string;
  value: number | string;
  sub?: string;
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
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

function formatHoursLabel(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function BreakdownBar({ label, count, max, color }: { label: string; count: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 truncate shrink-0" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color ?? 'var(--color-accent)' }} />
      </div>
      <span className="w-8 text-right text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{count}</span>
    </div>
  );
}

export default function PortalPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const activeTab = (searchParams.get('tab') as TabId) ?? 'my';
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Scope summary (dashboard metrics + allowed studios)
  const { data: scopeData, isLoading: scopeLoading } = useQuery({
    queryKey: ['scope-summary'],
    queryFn: () => ticketsApi.scopeSummary(),
  });
  const scope = scopeData?.data;
  const allowedStudios = scope?.allowedStudios ?? [];

  const { data: taxonomyData } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyData?.data;

  // ─── My Tickets tab state ───────────────────────────────────────────────────
  const [myPage, setMyPage] = useState(1);
  const [mySearch, setMySearch] = useState('');
  const myDebouncedSearch = useDebouncedValue(mySearch, 300);
  const [myTicketClass, setMyTicketClass] = useState<string>('');
  const [mySupportTopicId, setMySupportTopicId] = useState<string>('');
  const [myMaintenanceCategoryId, setMyMaintenanceCategoryId] = useState<string>('');
  const [myStudioId, setMyStudioId] = useState<string>('');
  const [myCreatedAfter, setMyCreatedAfter] = useState<string>('');
  const [myCreatedBefore, setMyCreatedBefore] = useState<string>('');

  const mySupportClass = taxonomy?.ticketClasses?.find((c) => c.code === 'SUPPORT');
  const myMaintenanceClass = taxonomy?.ticketClasses?.find((c) => c.code === 'MAINTENANCE');
  const mySupportVsMaintenanceOptions = [
    { value: '', label: 'All' },
    ...(mySupportClass ? [{ value: mySupportClass.id, label: 'Support only' }] : []),
    ...(myMaintenanceClass ? [{ value: myMaintenanceClass.id, label: 'Maintenance only' }] : []),
  ];
  const myTypeOptions = (() => {
    if (!taxonomy) return [];
    const opts: { value: string; label: string; supportTopicId?: string; maintenanceCategoryId?: string }[] = [];
    for (const dept of taxonomy.supportTopicsByDepartment ?? []) {
      for (const topic of dept.topics ?? []) {
        opts.push({ value: `st-${topic.id}`, label: `Support – ${topic.name}`, supportTopicId: topic.id });
      }
    }
    for (const cat of taxonomy.maintenanceCategories ?? []) {
      opts.push({ value: `mc-${cat.id}`, label: `Maintenance – ${cat.name}`, maintenanceCategoryId: cat.id });
    }
    return opts;
  })();
  const myCurrentTypeValue = mySupportTopicId ? `st-${mySupportTopicId}` : myMaintenanceCategoryId ? `mc-${myMaintenanceCategoryId}` : '';
  const myLocationOptions = [
    { value: '', label: 'All' },
    ...allowedStudios.map((s) => ({ value: s.id, label: s.name })),
  ];

  useEffect(() => {
    setMyPage(1);
  }, [myDebouncedSearch, myTicketClass, mySupportTopicId, myMaintenanceCategoryId, myStudioId, myCreatedAfter, myCreatedBefore]);

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
      ticketClass: myTicketClass || undefined,
      supportTopicId: mySupportTopicId || undefined,
      maintenanceCategoryId: myMaintenanceCategoryId || undefined,
      studioId: myStudioId || undefined,
      createdAfter: myCreatedAfter ? `${myCreatedAfter}T00:00:00.000Z` : undefined,
      createdBefore: myCreatedBefore ? `${myCreatedBefore}T23:59:59.999Z` : undefined,
    },
    { enabled: !!user && activeTab === 'my' },
  );

  const myHasTickets = myTickets.length > 0;
  const myHasFilters = !!myDebouncedSearch || !!myTicketClass || !!mySupportTopicId || !!myMaintenanceCategoryId || !!myStudioId || !!myCreatedAfter || !!myCreatedBefore;

  const clearMyFilters = () => {
    setMyTicketClass('');
    setMySupportTopicId('');
    setMyMaintenanceCategoryId('');
    setMyStudioId('');
    setMyCreatedAfter('');
    setMyCreatedBefore('');
    setMyPage(1);
  };

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
      <ComboBox
        placeholder="Support vs. Maintenance"
        options={mySupportVsMaintenanceOptions}
        value={myTicketClass}
        onChange={setMyTicketClass}
        className="w-48"
      />
      <ComboBox
        placeholder="All types"
        options={myTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
        value={myCurrentTypeValue}
        onChange={(val) => {
          const opt = myTypeOptions.find((o) => o.value === val);
          setMySupportTopicId(opt?.supportTopicId ?? '');
          setMyMaintenanceCategoryId(opt?.maintenanceCategoryId ?? '');
        }}
        className="w-52"
      />
      <ComboBox
        placeholder="All locations"
        options={myLocationOptions}
        value={myStudioId}
        onChange={setMyStudioId}
        className="w-48"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={myCreatedAfter}
          onChange={(e) => setMyCreatedAfter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
          title="From date"
        />
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>–</span>
        <input
          type="date"
          value={myCreatedBefore}
          onChange={(e) => setMyCreatedBefore(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
          title="To date"
        />
      </div>
      {myHasFilters && (
        <Button variant="ghost" size="md" onClick={clearMyFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );

  const myEmptyState = (
    <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-3`} style={{ color: POLISH_THEME.theadText }}>
      {myHasFilters ? (
        <>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets match your current filters</p>
          <p className="text-xs text-center max-w-sm" style={{ color: POLISH_THEME.metaMuted }}>
            Try adjusting your filters or search.
          </p>
          <Button variant="ghost" size="sm" onClick={clearMyFilters}>
            Clear filters
          </Button>
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

  const myTicketList = (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
          {CANONICAL_FEED_HEADERS.map((h) => (
            <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
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
              isSelected={selectedId === ticket.id}
              onSelect={() => setSelectedId(ticket.id)}
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
          {CANONICAL_FEED_HEADERS.map((h) => (
            <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
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
          {CANONICAL_FEED_HEADERS.map((h) => (
            <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
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
              isSelected={selectedId === ticket.id}
              onSelect={() => setSelectedId(ticket.id)}
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
          {CANONICAL_FEED_HEADERS.map((h) => (
            <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <TicketsTableSkeletonRows count={6} />
    </table>
  );

  // ─── Dashboard tab content (Stage 5: summary-only via /api/dashboard/summary)
  const [dashboardStudioFilter, setDashboardStudioFilter] = useState<string>('');

  const { data: dashSummaryData, isLoading: dashSummaryLoading } = useQuery({
    queryKey: ['dashboard-summary', dashboardStudioFilter],
    queryFn: () => dashboardApi.summary(dashboardStudioFilter || undefined),
    enabled: activeTab === 'dashboard',
  });

  const dashSummary = dashSummaryData?.data as StudioDashboardSummaryResponse | undefined;

  const selectedStudioName = useMemo(() => {
    if (!dashboardStudioFilter) {
      return allowedStudios.length === 1 ? allowedStudios[0]?.name : 'All locations';
    }
    return allowedStudios.find((s) => s.id === dashboardStudioFilter)?.name ?? 'Location';
  }, [dashboardStudioFilter, allowedStudios]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="My Tickets" />
      {/* Tab bodies controlled by ?tab=… from sidebar navigation */}
      {activeTab === 'my' && (
        <TicketFeedLayout
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
        <TicketFeedLayout
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
            {/* Location header */}
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {selectedStudioName}
            </h2>

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
                  onClick={() => setDashboardStudioFilter('')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: !dashboardStudioFilter ? 'var(--color-accent)' : 'transparent',
                    color: !dashboardStudioFilter ? '#ffffff' : 'var(--color-text-muted)',
                    border: `1px solid ${
                      !dashboardStudioFilter ? 'var(--color-accent)' : 'var(--color-border-default)'
                    }`,
                  }}
                >
                  All
                </button>
                {allowedStudios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDashboardStudioFilter(s.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: dashboardStudioFilter === s.id ? 'var(--color-accent)' : 'transparent',
                      color: dashboardStudioFilter === s.id ? '#ffffff' : 'var(--color-text-muted)',
                      border: `1px solid ${
                        dashboardStudioFilter === s.id ? 'var(--color-accent)' : 'var(--color-border-default)'
                      }`,
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {/* Summary cards */}
            {dashSummaryLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
              </div>
            ) : !dashSummary ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--color-text-muted)' }}>
                <Ticket className="h-10 w-10" />
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No data available</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard
                    label="Open Tickets"
                    value={dashSummary.openTickets}
                    icon={Clock}
                    iconStyle={{ background: 'rgba(251,191,36,0.15)', color: '#d97706' }}
                  />
                  <StatCard
                    label="Completed"
                    value={dashSummary.completedTickets}
                    icon={CheckCircle2}
                    iconStyle={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}
                  />
                  <StatCard
                    label="Avg Completion"
                    value={formatHoursLabel(dashSummary.avgCompletionHours)}
                    sub="Last 30 days"
                    icon={Clock}
                    iconStyle={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
                  />
                </div>

                {/* By Location breakdown */}
                {dashSummary.byLocation.length > 0 && (
                  <div className="rounded-xl p-5" style={panel}>
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Tickets by Location
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {dashSummary.byLocation.map((row) => (
                        <BreakdownBar
                          key={row.locationId}
                          label={row.locationName}
                          count={row.count}
                          max={Math.max(...dashSummary.byLocation.map((r) => r.count), 1)}
                          color="#0ea5e9"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <TicketDrawer ticketId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

