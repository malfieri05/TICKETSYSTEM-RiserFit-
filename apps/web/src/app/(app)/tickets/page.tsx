'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { adminApi, ticketsApi, invalidateTicketLists } from '@/lib/api';
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
import { useAuth } from '@/hooks/useAuth';
import { POLISH_THEME, POLISH_CLASS, FEED_COL_WIDTHS } from '@/lib/polish';

const PAGE_SIZE = 20;

type ViewTab = 'active' | 'completed';

const FILTER_KEYS: (keyof TicketFilters)[] = [
  'departmentId', 'ticketClass', 'supportTopicId', 'maintenanceCategoryId', 'studioId', 'state',
  'createdAfter', 'createdBefore',
];

export default function TicketsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
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
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
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
  }, [filters, debouncedSearch, syncUrl]);

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
    ...(supportClass ? [{ value: supportClass.id, label: 'Support only' }] : []),
    ...(maintenanceClass ? [{ value: maintenanceClass.id, label: 'Maintenance only' }] : []),
  ];

  const typeOptions = useMemo(() => {
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
  }, [taxonomy]);

  const typeOptionsForClass = useMemo(() => {
    if (!filters.ticketClass || !supportClass || !maintenanceClass) return typeOptions;
    if (filters.ticketClass === supportClass.id) return typeOptions.filter((o) => o.value.startsWith('st-'));
    if (filters.ticketClass === maintenanceClass.id) return typeOptions.filter((o) => o.value.startsWith('mc-'));
    return typeOptions;
  }, [typeOptions, filters.ticketClass, supportClass?.id, maintenanceClass?.id]);

  useEffect(() => {
    const typeValue = filters.supportTopicId ? `st-${filters.supportTopicId}` : filters.maintenanceCategoryId ? `mc-${filters.maintenanceCategoryId}` : '';
    if (typeValue && !typeOptionsForClass.some((o) => o.value === typeValue)) {
      setFilters((f) => ({ ...f, supportTopicId: undefined, maintenanceCategoryId: undefined, page: 1 }));
    }
  }, [typeOptionsForClass, filters.supportTopicId, filters.maintenanceCategoryId]);

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
      return next;
    });
  };

  const locationOptions = useMemo(() => {
    const opts: { value: string; label: string; key: 'studioId' | 'state' }[] = [];
    for (const m of markets) {
      opts.push({ value: m.id, label: m.name, key: 'state' });
      for (const s of m.studios ?? []) {
        opts.push({ value: s.id, label: `  ${s.name}`, key: 'studioId' });
      }
    }
    return opts;
  }, [markets]);

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
      return next;
    });
  };

  const setDateFilter = (kind: 'createdAfter' | 'createdBefore', dateStr: string) => {
    const value = dateStr
      ? kind === 'createdAfter'
        ? `${dateStr}T00:00:00.000Z`
        : `${dateStr}T23:59:59.999Z`
      : undefined;
    setFilters((f) => ({ ...f, [kind]: value, page: 1 }));
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

  const countParamsBase = {
    page: 1,
    limit: 1,
    search: debouncedSearch || undefined,
    departmentId: filters.departmentId,
    status: filters.status,
    ticketClass: filters.ticketClass,
    supportTopicId: filters.supportTopicId,
    maintenanceCategoryId: filters.maintenanceCategoryId,
    studioId: filters.studioId,
    state: filters.state,
    createdAfter: filters.createdAfter,
    createdBefore: filters.createdBefore,
  };

  const { total: activeTotal } = useTicketListQuery('list', {
    ...countParamsBase,
    statusGroup: 'active',
  });
  const { total: completedTotal } = useTicketListQuery('list', {
    ...countParamsBase,
    statusGroup: 'completed',
  });

  const currentPage = filters.page ?? 1;
  useEffect(() => {
    listContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        title={
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Tickets</h1>
            <div
              className="relative inline-flex items-center rounded-[var(--radius-md)] border p-1"
              style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-chrome)' }}
            >
              <div
                className="absolute top-1 bottom-1 w-[136px] rounded-[calc(var(--radius-md)-2px)] border transition-transform duration-[var(--duration-base)] ease-out"
                style={{
                  transform: viewTab === 'active' ? 'translateX(0)' : 'translateX(136px)',
                  background: 'var(--color-bg-surface)',
                  borderColor: 'var(--color-border-default)',
                }}
              />
              {([
                { key: 'active' as ViewTab, label: 'Active', count: activeTotal },
                { key: 'completed' as ViewTab, label: 'Completed', count: completedTotal },
              ]).map(({ key, label, count }) => {
                const active = viewTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => { setViewTab(key); setFilters((f) => ({ ...f, status: undefined, page: 1 })); setSelectedId(null); }}
                    data-active={active}
                    className="focus-ring relative z-10 inline-flex w-[136px] items-center justify-center gap-1.5 px-3 py-1 text-sm font-medium transition-colors"
                    style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
                  >
                    <span>{label}:</span>
                    <span
                      className="text-sm font-medium tabular-nums"
                      style={{ color: active ? POLISH_THEME.success : 'var(--color-text-primary)' }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        }
      />

      <div ref={listContainerRef} className="flex-1 flex flex-col overflow-hidden">
        <TicketFeedLayout
          fixedChrome
          filters={
            <div className="flex flex-wrap gap-3 items-end">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                <Input
                  placeholder="Search tickets or paste ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 pl-9 shadow-[var(--shadow-panel)]"
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
                placeholder="All"
                options={supportVsMaintenanceOptions}
                value={filters.ticketClass ?? ''}
                onChange={(v) => updateFilter('ticketClass', v)}
                className="w-48"
              />
              <ComboBox
                placeholder="All types"
                options={typeOptionsForClass.map((o) => ({ value: o.value, label: o.label }))}
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
                  style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}
                  title="From date"
                />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>–</span>
                <input
                  type="date"
                  value={filters.createdBefore ? filters.createdBefore.slice(0, 10) : ''}
                  onChange={(e) => setDateFilter('createdBefore', e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}
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
            <div className="flex-1 min-h-0 flex flex-col">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  {FEED_COL_WIDTHS.map((w, idx) => (
                    <col key={`thead-col-${idx}`} style={{ width: w }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.tableHeaderBg }}>
                    {CANONICAL_FEED_HEADERS.map((h) => (
                      <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
              </table>
              <div className="ticket-feed-body-scroll flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    {FEED_COL_WIDTHS.map((w, idx) => (
                      <col key={`tbody-col-${idx}`} style={{ width: w }} />
                    ))}
                  </colgroup>
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
              </div>
            </div>
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
                className="flex items-center justify-between px-4 py-3 pr-24"
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
                <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.tableHeaderBg }}>
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

      <TicketDrawer ticketId={selectedId} onClose={handleClose} />
    </div>
  );
}
