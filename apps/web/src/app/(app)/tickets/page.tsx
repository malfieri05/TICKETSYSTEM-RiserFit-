'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminApi } from '@/lib/api';
import type { TicketFilters } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TicketTableRow, CANONICAL_FEED_HEADERS, getThClass } from '@/components/tickets/TicketRow';
import { TicketFeedLayout } from '@/components/tickets/TicketFeedLayout';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

const PAGE_SIZE = 20;

type ViewTab = 'active' | 'completed';

const FILTER_KEYS: (keyof TicketFilters)[] = [
  'departmentId', 'ticketClass', 'supportTopicId', 'maintenanceCategoryId', 'studioId', 'state',
  'createdAfter', 'createdBefore',
];

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [filters, setFilters] = useState<TicketFilters>({ page: 1, limit: PAGE_SIZE });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasInitializedFromUrl = useRef(false);
  const listContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasInitializedFromUrl.current) return;
    hasInitializedFromUrl.current = true;
    const init: Partial<TicketFilters> = {};
    for (const key of FILTER_KEYS) {
      const v = searchParams.get(key);
      if (v) (init as Record<string, string>)[key] = v;
    }
    const s = searchParams.get('search');
    if (s) setSearch(s);
    if (Object.keys(init).length > 0) {
      setFilters((f) => ({ ...f, ...init, page: 1 }));
    }
  }, [searchParams]);

  const syncUrl = useCallback((nextFilters: TicketFilters, nextSearch: string) => {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = nextFilters[key];
      if (v) params.set(key, v as string);
    }
    if (nextSearch) params.set('search', nextSearch);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  }, [pathname, router]);

  const updateFilter = (key: keyof TicketFilters, value: string) => {
    setFilters((f) => {
      const next = { ...f, [key]: value || undefined, page: 1 };
      syncUrl(next, search);
      return next;
    });
  };

  const clearAllFilters = () => {
    setFilters({ page: 1, limit: PAGE_SIZE });
    setSearch('');
    syncUrl({ page: 1, limit: PAGE_SIZE }, '');
  };

  useEffect(() => {
    setFilters((f) => ({ ...f, page: 1 }));
  }, [debouncedSearch]);

  useEffect(() => {
    if (hasInitializedFromUrl.current) {
      syncUrl(filters, debouncedSearch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data: taxonomyData } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyData?.data;

  const { data: marketsData } = useQuery({
    queryKey: ['markets'],
    queryFn: () => adminApi.listMarkets(),
  });
  const markets = marketsData?.data ?? [];

  const supportClass = taxonomy?.ticketClasses?.find((c) => c.code === 'SUPPORT');
  const maintenanceClass = taxonomy?.ticketClasses?.find((c) => c.code === 'MAINTENANCE');
  const supportVsMaintenanceOptions = [
    { value: '', label: 'All' },
    ...(supportClass ? [{ value: supportClass.id, label: 'Support only' }] : []),
    ...(maintenanceClass ? [{ value: maintenanceClass.id, label: 'Maintenance only' }] : []),
  ];

  const typeOptions = (() => {
    if (!taxonomy) return [];
    const opts: { value: string; label: string; params: Partial<TicketFilters> }[] = [];
    for (const dept of taxonomy.supportTopicsByDepartment ?? []) {
      for (const topic of dept.topics ?? []) {
        opts.push({ value: `st-${topic.id}`, label: `Support – ${topic.name}`, params: { supportTopicId: topic.id } });
      }
    }
    for (const cat of taxonomy.maintenanceCategories ?? []) {
      opts.push({ value: `mc-${cat.id}`, label: `Maintenance – ${cat.name}`, params: { maintenanceCategoryId: cat.id } });
    }
    return opts;
  })();

  const currentTypeValue = filters.supportTopicId
    ? `st-${filters.supportTopicId}`
    : filters.maintenanceCategoryId
      ? `mc-${filters.maintenanceCategoryId}`
      : '';

  const handleTypeChange = (val: string) => {
    const match = typeOptions.find((o) => o.value === val);
    setFilters((f) => {
      const next: TicketFilters = { ...f, supportTopicId: undefined, maintenanceCategoryId: undefined, ticketClass: undefined, page: 1 };
      if (match) Object.assign(next, match.params);
      syncUrl(next, search);
      return next;
    });
  };

  const locationOptions = (() => {
    const opts: { value: string; label: string; key: 'studioId' | 'state' }[] = [];
    for (const m of markets) {
      opts.push({ value: m.id, label: m.name, key: 'state' });
      for (const s of m.studios ?? []) {
        opts.push({ value: s.id, label: `  ${s.name}`, key: 'studioId' });
      }
    }
    return opts;
  })();

  const currentLocationValue = filters.studioId
    ? `studio-${filters.studioId}`
    : filters.state
      ? `state-${filters.state}`
      : '';

  const handleLocationChange = (val: string) => {
    setFilters((f) => {
      const next: TicketFilters = { ...f, studioId: undefined, state: undefined, page: 1 };
      if (val.startsWith('studio-')) {
        next.studioId = val.replace('studio-', '');
      } else if (val.startsWith('state-')) {
        next.state = val.replace('state-', '');
      }
      syncUrl(next, search);
      return next;
    });
  };

  const setDateFilter = (kind: 'createdAfter' | 'createdBefore', dateStr: string) => {
    const value = dateStr
      ? kind === 'createdAfter'
        ? `${dateStr}T00:00:00.000Z`
        : `${dateStr}T23:59:59.999Z`
      : undefined;
    setFilters((f) => {
      const next = { ...f, [kind]: value, page: 1 };
      syncUrl(next, search);
      return next;
    });
  };

  const hasActiveFilters = FILTER_KEYS.some((k) => filters[k]) || search;

  const listParams = {
    page: filters.page ?? 1,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    departmentId: filters.departmentId,
    status: filters.status,
    statusGroup: viewTab as 'active' | 'completed',
    ticketClass: filters.ticketClass,
    supportTopicId: filters.supportTopicId,
    maintenanceCategoryId: filters.maintenanceCategoryId,
    studioId: filters.studioId,
    state: filters.state,
    createdAfter: filters.createdAfter,
    createdBefore: filters.createdBefore,
  };

  const {
    tickets,
    total,
    totalPages,
    isInitialLoading,
    isFetching,
  } = useTicketListQuery('list', listParams);

  const currentPage = filters.page ?? 1;
  useEffect(() => {
    listContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Tickets" />

      <div
        className="px-6 py-3 text-sm space-y-1"
        style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
      >
        <p>Global list of all tickets you are allowed to see across departments and locations.</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Use the Active / Completed tabs to switch between open work and historical tickets. Filters and search further narrow this list.
        </p>
      </div>

      <div className="flex items-center gap-1 px-6 py-2.5" style={{ background: 'var(--color-bg-page)', borderBottom: '1px solid var(--color-border-default)' }}>
        {([
          { key: 'active' as ViewTab, label: 'Active' },
          { key: 'completed' as ViewTab, label: 'Completed' },
        ]).map(({ key, label }) => {
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
              {total > 0 && active && (
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--color-bg-surface-raised)', color: 'var(--color-text-primary)' }}
                >
                  {total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div ref={listContainerRef} className="flex-1 flex flex-col overflow-hidden">
        <TicketFeedLayout
          filters={
            <div className="flex flex-wrap gap-3 items-end">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                <Input
                  placeholder="Search tickets or paste ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>
              <ComboBox
                placeholder="All departments"
                options={(taxonomy?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
                value={filters.departmentId ?? ''}
                onChange={(v) => updateFilter('departmentId', v)}
                className="w-48"
              />
              <ComboBox
                placeholder="Support vs. Maintenance"
                options={supportVsMaintenanceOptions}
                value={filters.ticketClass ?? ''}
                onChange={(v) => updateFilter('ticketClass', v)}
                className="w-48"
              />
              <ComboBox
                placeholder="All types"
                options={typeOptions.map((o) => ({ value: o.value, label: o.label }))}
                value={currentTypeValue}
                onChange={handleTypeChange}
                className="w-52"
              />
              <ComboBox
                placeholder="All locations"
                options={locationOptions.map((o) => ({ value: `${o.key === 'state' ? 'state' : 'studio'}-${o.value}`, label: o.label }))}
                value={currentLocationValue}
                onChange={handleLocationChange}
                className="w-48"
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.createdAfter ? filters.createdAfter.slice(0, 10) : ''}
                  onChange={(e) => setDateFilter('createdAfter', e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
                  title="From date"
                />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>–</span>
                <input
                  type="date"
                  value={filters.createdBefore ? filters.createdBefore.slice(0, 10) : ''}
                  onChange={(e) => setDateFilter('createdBefore', e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
                  title="To date"
                />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="md" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          }
          isInitialLoading={isInitialLoading}
          isFetching={isFetching}
          hasTickets={tickets.length > 0}
          ticketList={
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
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
                      priority={ticket.priority}
                      createdAt={ticket.createdAt}
                      commentCount={ticket._count?.comments ?? 0}
                      completedSubtasks={completedSubtasks}
                      totalSubtasks={totalSubtasks}
                      requesterDisplayName={ticket.requester.displayName ?? ticket.requester.name ?? '—'}
                      isSelected={selectedId === ticket.id}
                      onSelect={() => setSelectedId(ticket.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          }
          emptyState={
            <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-3`} style={{ color: POLISH_THEME.theadText }}>
              {hasActiveFilters ? (
                <>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets match your current filters</p>
                  <p className="text-xs text-center">Try adjusting your filters or search.</p>
                  <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                    Clear filters
                  </Button>
                </>
              ) : viewTab === 'completed' ? (
                <>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No completed tickets yet</p>
                  <p className="text-xs text-center max-w-sm">
                    Tickets move here after they are resolved or closed. Check the Active tab for work in progress.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No active tickets yet</p>
                  <p className="text-xs text-center max-w-sm">Create your first ticket to start tracking requests.</p>
                  <Button size="sm" onClick={() => router.push('/tickets/new')}>
                    New Ticket
                  </Button>
                </>
              )}
            </div>
          }
          pagination={
            totalPages > 1 ? (
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: '1px solid var(--color-border-default)' }}
              >
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
            ) : null
          }
          initialSkeleton={
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.listBgHeader }}>
                  {CANONICAL_FEED_HEADERS.map((h) => (
                    <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <TicketsTableSkeletonRows count={8} />
            </table>
          }
        />
      </div>

      <TicketDrawer ticketId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
