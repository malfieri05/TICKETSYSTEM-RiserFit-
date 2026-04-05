'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, ticketsApi, updateTicketRowInListCaches } from '@/lib/api';
import type { TicketFilters } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { DateFilterInput } from '@/components/ui/DateFilterInput';
import { ComboBox } from '@/components/ui/ComboBox';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import {
  TicketTableRow,
  ticketRequesterEmail,
  ticketRequesterPrimaryLine,
} from '@/components/tickets/TicketRow';
import { TicketFeedColgroup, TicketFeedThead } from '@/components/tickets/TicketFeedThead';
import { TicketFeedLayout } from '@/components/tickets/TicketFeedLayout';
import { TicketFeedSearchField } from '@/components/tickets/TicketFeedSearchField';
import { FeedPaginationBar } from '@/components/tickets/FeedPaginationBar';
import { TicketFeedSelectionRail } from '@/components/tickets/TicketFeedSelectionRail';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/hooks/useAuth';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { useTicketFeedIdColumnVisible } from '@/hooks/useTicketFeedIdColumnVisible';

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
  const [showTicketIdColumn, toggleTicketIdColumn] = useTicketFeedIdColumnVisible();
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
    mutationFn: ({ ticketId, label, color }: { ticketId: string; label: string; color: string }) =>
      ticketsApi.addTag(ticketId, { label, color }),
    onSuccess: (res, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      const body = res.data;
      updateTicketRowInListCaches(qc, variables.ticketId, (t) => ({
        ...t,
        tags: [
          ...(t.tags ?? []),
          {
            id: body.tag.id,
            name: body.tag.name,
            color: body.tag.color ?? variables.color,
            createdAt: body.createdAt,
            createdBy: body.createdBy,
          },
        ],
      }));
    },
  });

  const handleAddTag = useCallback(
    async (ticketId: string, label: string, color: string) => {
      await addTagMut.mutateAsync({ ticketId, label, color });
    },
    [addTagMut],
  );

  const removeTagMut = useMutation({
    mutationFn: ({ ticketId, tagId }: { ticketId: string; tagId: string }) =>
      ticketsApi.removeTag(ticketId, tagId),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      updateTicketRowInListCaches(qc, variables.ticketId, (t) => ({
        ...t,
        tags: (t.tags ?? []).filter((x) => x.id !== variables.tagId),
      }));
    },
  });

  const handleRemoveTag = useCallback(
    async (ticketId: string, tagId: string) => {
      await removeTagMut.mutateAsync({ ticketId, tagId });
    },
    [removeTagMut],
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

  const feedTicketIds = useMemo(() => tickets.map((t) => t.id), [tickets]);

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
            <h1 className="text-base font-semibold" style={{ color: 'var(--color-text-app-header)' }}>Tickets</h1>
            <div
              className="relative inline-flex items-center rounded-[var(--radius-md)] p-1"
              style={{
                background: 'var(--color-bg-header-embed)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)',
              }}
            >
              <div
                className="absolute top-1 bottom-1 w-[136px] rounded-[calc(var(--radius-md)-2px)] transition-transform duration-[var(--duration-base)] ease-out"
                style={{
                  transform: viewTab === 'active' ? 'translateX(0)' : 'translateX(136px)',
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
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
                    style={{ color: active ? 'var(--color-text-app-header)' : 'var(--color-text-app-header-muted)' }}
                  >
                    <span>{label}:</span>
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: active ? '#86efac' : 'var(--color-text-app-header-muted)' }}
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
              <TicketFeedSearchField
                id="tickets-feed-search"
                value={search}
                onChange={setSearch}
                placeholder="Search tickets or paste ID..."
                elevated
                className="w-64"
              />
              <ComboBox
                placeholder="All departments"
                options={(taxonomy?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
                value={filters.departmentId ?? ''}
                onChange={(v) => updateFilter('departmentId', v)}
                elevated
                className="w-48"
              />
              <ComboBox
                placeholder="All"
                options={supportVsMaintenanceOptions}
                value={filters.ticketClass ?? ''}
                onChange={(v) => updateFilter('ticketClass', v)}
                elevated
                className="w-48"
              />
              <ComboBox
                placeholder="All types"
                options={typeOptionsForClass.map((o) => ({ value: o.value, label: o.label }))}
                value={currentTypeValue}
                onChange={handleTypeChange}
                elevated
                className="w-52"
              />
              <ComboBox
                placeholder="All locations"
                options={locationOptions.map((o) => ({ value: `${o.key === 'state' ? 'state' : 'studio'}-${o.value}`, label: o.label }))}
                value={currentLocationValue}
                onChange={handleLocationChange}
                elevated
                className="w-48"
              />
              <div className="flex items-center gap-2">
                <DateFilterInput
                  variant="filter"
                  elevated
                  value={filters.createdAfter ? filters.createdAfter.slice(0, 10) : ''}
                  onChange={(v) => setDateFilter('createdAfter', v)}
                  style={{ color: 'var(--color-text-muted)' }}
                  title="From date"
                />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>–</span>
                <DateFilterInput
                  variant="filter"
                  elevated
                  value={filters.createdBefore ? filters.createdBefore.slice(0, 10) : ''}
                  onChange={(v) => setDateFilter('createdBefore', v)}
                  style={{ color: 'var(--color-text-muted)' }}
                  title="To date"
                />
              </div>
              {hasActiveFilters && (
                <Button variant="outlineAccent" size="md" onClick={clearAllFilters}>
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
              <table className={POLISH_CLASS.feedTable}>
                <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
                <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
              </table>
              <TicketFeedSelectionRail
                selectedId={selectedId}
                scrollContainerClassName="ticket-feed-body-scroll flex-1 min-h-0 overflow-y-auto"
              >
                <table className={POLISH_CLASS.feedTable}>
                  <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
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
                          onRemoveTag={canAddTag ? handleRemoveTag : undefined}
                          removingTagId={
                            removeTagMut.isPending &&
                            removeTagMut.variables?.ticketId === ticket.id
                              ? removeTagMut.variables.tagId
                              : null
                          }
                          isAddingTag={
                            addTagMut.isPending && addTagMut.variables?.ticketId === ticket.id
                          }
                          commentCount={ticket._count?.comments ?? 0}
                          completedSubtasks={completedSubtasks}
                          totalSubtasks={totalSubtasks}
                          requesterDisplayName={ticketRequesterPrimaryLine(ticket.requester)}
                          requesterEmail={ticketRequesterEmail(ticket.requester)}
                          isSelected={selectedId === ticket.id}
                          showIdColumn={showTicketIdColumn}
                          onSelect={handleSelect}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </TicketFeedSelectionRail>
            </div>
          }
          emptyState={
            <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-3`} style={{ color: POLISH_THEME.theadText }}>
              {hasActiveFilters ? (
                <>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets match your current filters</p>
                  <p className="text-xs text-center">Try adjusting your filters or search.</p>
                  <Button variant="outlineAccent" size="sm" onClick={clearAllFilters}>
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
              <FeedPaginationBar
                className="pr-24"
                page={filters.page ?? 1}
                pageSize={PAGE_SIZE}
                total={total}
                isBusy={isFetching}
                onPrev={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                onNext={() => setFilters((f) => ({ ...f, page: Math.min(totalPages, (f.page ?? 1) + 1) }))}
              />
            ) : null
          }
          initialSkeleton={
            <table className={POLISH_CLASS.feedTable}>
              <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
              <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
              <TicketsTableSkeletonRows count={8} showIdColumn={showTicketIdColumn} />
            </table>
          }
        />
      </div>

      <TicketDrawer
        ticketId={selectedId}
        onClose={handleClose}
        feedTicketIds={feedTicketIds}
        onNavigateTicket={setSelectedId}
      />
    </div>
  );
}
