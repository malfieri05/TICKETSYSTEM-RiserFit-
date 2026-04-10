'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi, adminApi, updateTicketRowInListCaches } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { TicketFeedLayout } from '@/components/tickets/TicketFeedLayout';
import { TicketFeedSearchField } from '@/components/tickets/TicketFeedSearchField';
import { FeedPaginationBar } from '@/components/tickets/FeedPaginationBar';
import { TicketFeedSelectionRail } from '@/components/tickets/TicketFeedSelectionRail';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { Button } from '@/components/ui/Button';
import { DateFilterInput } from '@/components/ui/DateFilterInput';
import { Input, Select } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { useAuth } from '@/hooks/useAuth';
import { useTicketListQuery } from '@/hooks/useTicketListQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  TicketTableRow,
  ticketRequesterEmail,
  ticketRequesterPrimaryLine,
} from '@/components/tickets/TicketRow';
import { TicketFeedColgroup, TicketFeedThead } from '@/components/tickets/TicketFeedThead';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { useTicketFeedIdColumnVisible } from '@/hooks/useTicketFeedIdColumnVisible';

const PAGE_SIZE = 20;

type TabId = 'my' | 'studio' | 'dashboard';

export default function PortalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const activeTab = (searchParams.get('tab') as TabId) ?? 'my';

  useEffect(() => {
    if (activeTab === 'dashboard') {
      router.replace('/dashboard');
    }
  }, [activeTab, router]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTicketIdColumn, toggleTicketIdColumn] = useTicketFeedIdColumnVisible();
  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);
  const handleClose = useCallback(() => setSelectedId(null), []);

  const canAddTag = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const addTagMut = useMutation({
    mutationFn: ({ ticketId, label }: { ticketId: string; label: string }) =>
      ticketsApi.addTag(ticketId, { label }),
    onSuccess: (res, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-filter-tags'] });
      const body = res.data;
      updateTicketRowInListCaches(qc, variables.ticketId, (t) => ({
        ...t,
        tags: [
          ...(t.tags ?? []),
          {
            id: body.tag.id,
            name: body.tag.name,
            color: body.tag.color ?? null,
            createdAt: body.createdAt,
            createdBy: body.createdBy,
          },
        ],
      }));
    },
  });
  const handleAddTag = useCallback(
    async (ticketId: string, label: string) => {
      await addTagMut.mutateAsync({ ticketId, label });
    },
    [addTagMut],
  );

  const removeTagMut = useMutation({
    mutationFn: ({ ticketId, tagId }: { ticketId: string; tagId: string }) =>
      ticketsApi.removeTag(ticketId, tagId),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-filter-tags'] });
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

  const { data: filterTagsData } = useQuery({
    queryKey: ['ticket-filter-tags'],
    queryFn: () => ticketsApi.listFilterTags(),
  });
  const filterTagOptions = filterTagsData?.data ?? [];

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
  const [myTagId, setMyTagId] = useState<string>('');

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
  }, [myDebouncedSearch, myTicketClass, mySupportTopicId, myMaintenanceCategoryId, myStudioId, myTagId, myCreatedAfter, myCreatedBefore]);

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
      tagId: myTagId || undefined,
      createdAfter: myCreatedAfter ? `${myCreatedAfter}T00:00:00.000Z` : undefined,
      createdBefore: myCreatedBefore ? `${myCreatedBefore}T23:59:59.999Z` : undefined,
    },
    { enabled: !!user && activeTab === 'my' },
  );

  const myHasTickets = myTickets.length > 0;
  const myHasFilters = !!myDebouncedSearch || !!myTicketClass || !!mySupportTopicId || !!myMaintenanceCategoryId || !!myStudioId || !!myTagId || !!myCreatedAfter || !!myCreatedBefore;

  const clearMyFilters = () => {
    setMyTicketClass('');
    setMySupportTopicId('');
    setMyMaintenanceCategoryId('');
    setMyStudioId('');
    setMyTagId('');
    setMyCreatedAfter('');
    setMyCreatedBefore('');
    setMyPage(1);
  };

  const myPagination =
    myTotalPages > 1 ? (
      <FeedPaginationBar
        page={myPage}
        pageSize={PAGE_SIZE}
        total={myTotal}
        isBusy={myFetching}
        onPrev={() => setMyPage((p) => Math.max(1, p - 1))}
        onNext={() => setMyPage((p) => Math.min(myTotalPages, p + 1))}
      />
    ) : null;

  const myFiltersBar = (
    <div className="flex flex-wrap gap-3 items-end">
      <TicketFeedSearchField
        id="portal-my-search"
        value={mySearch}
        onChange={setMySearch}
        elevated
        className="w-56"
      />
      <ComboBox
        placeholder="Support vs. Maintenance"
        options={mySupportVsMaintenanceOptions}
        value={myTicketClass}
        onChange={setMyTicketClass}
        elevated
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
        elevated
        className="w-52"
      />
      <ComboBox
        placeholder="All locations"
        options={myLocationOptions}
        value={myStudioId}
        onChange={setMyStudioId}
        elevated
        className="w-48"
      />
      <ComboBox
        placeholder="All tags"
        options={filterTagOptions.map((t) => ({ value: t.id, label: t.name }))}
        value={myTagId}
        onChange={setMyTagId}
        elevated
        className="w-44"
      />
      <div className="flex items-center gap-2">
        <DateFilterInput
          variant="filter"
          elevated
          value={myCreatedAfter}
          onChange={setMyCreatedAfter}
          style={{ color: 'var(--color-text-muted)' }}
          title="From date"
        />
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>–</span>
        <DateFilterInput
          variant="filter"
          elevated
          value={myCreatedBefore}
          onChange={setMyCreatedBefore}
          style={{ color: 'var(--color-text-muted)' }}
          title="To date"
        />
      </div>
      {myHasFilters && (
        <Button variant="outlineAccent" size="md" onClick={clearMyFilters}>
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
          <Button variant="outlineAccent" size="sm" onClick={clearMyFilters}>
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
    <TicketFeedSelectionRail selectedId={selectedId}>
      <table className={POLISH_CLASS.feedTable}>
        <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
        <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
        <tbody>
          {myTickets.map((ticket) => {
            const topicLabel = ticket.supportTopic?.name ?? ticket.maintenanceCategory?.name ?? '';
            const studioName = ticket.studio?.name ?? '';
            const subLabel = [topicLabel, studioName].filter(Boolean).join(' · ') || undefined;
            const totalSubtasks = (ticket as { totalSubtasks?: number }).totalSubtasks ?? ticket._count?.subtasks ?? 0;
            const completedSubtasks = (ticket as { completedSubtasks?: number }).completedSubtasks ?? 0;
            return (
              <TicketTableRow
                key={ticket.id}
                id={ticket.id}
                title={ticket.title}
                subLabel={subLabel}
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
  );

  const myTableSkeleton = (
    <table className={POLISH_CLASS.feedTable}>
      <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
      <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
      <TicketsTableSkeletonRows count={6} showIdColumn={showTicketIdColumn} />
    </table>
  );

  // ─── By Studio(s) tab state ────────────────────────────────────────────────
  const [studioPage, setStudioPage] = useState(1);
  const [studioFilter, setStudioFilter] = useState<string>('');
  const [studioTagId, setStudioTagId] = useState<string>('');
  const [studioSearch, setStudioSearch] = useState('');
  const studioDebouncedSearch = useDebouncedValue(studioSearch, 300);

  useEffect(() => {
    setStudioPage(1);
  }, [studioDebouncedSearch, studioFilter, studioTagId]);

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
      ...(studioTagId && { tagId: studioTagId }),
    },
    { enabled: !!user && activeTab === 'studio' },
  );

  const studioHasTickets = studioTickets.length > 0;
  const studioHasFilters = !!studioFilter || !!studioTagId || !!studioDebouncedSearch;

  const studioPagination =
    studioTotalPages > 1 ? (
      <FeedPaginationBar
        page={studioPage}
        pageSize={PAGE_SIZE}
        total={studioTotal}
        isBusy={studioFetching}
        onPrev={() => setStudioPage((p) => Math.max(1, p - 1))}
        onNext={() => setStudioPage((p) => Math.min(studioTotalPages, p + 1))}
      />
    ) : null;

  const studioFiltersBar = (
    <div className="flex flex-wrap gap-3 items-end">
      <Select
        value={studioFilter}
        onChange={(e) => {
          setStudioFilter(e.target.value);
          setStudioPage(1);
        }}
        elevated
        className="w-56"
      >
        <option value="">All my studios</option>
        {allowedStudios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <TicketFeedSearchField
        id="portal-studio-search"
        value={studioSearch}
        onChange={setStudioSearch}
        elevated
        className="w-56"
      />
      <ComboBox
        placeholder="All tags"
        options={filterTagOptions.map((t) => ({ value: t.id, label: t.name }))}
        value={studioTagId}
        onChange={setStudioTagId}
        elevated
        className="w-44"
      />
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
    <TicketFeedSelectionRail selectedId={selectedId}>
      <table className={POLISH_CLASS.feedTable}>
        <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
        <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
        <tbody>
          {studioTickets.map((ticket) => {
            const topicLabel = ticket.supportTopic?.name ?? ticket.maintenanceCategory?.name ?? '';
            const studioName = ticket.studio?.name ?? '';
            const subLabel = [topicLabel, studioName].filter(Boolean).join(' · ') || undefined;
            const totalSubtasks = (ticket as { totalSubtasks?: number }).totalSubtasks ?? ticket._count?.subtasks ?? 0;
            const completedSubtasks = (ticket as { completedSubtasks?: number }).completedSubtasks ?? 0;
            return (
              <TicketTableRow
                key={ticket.id}
                id={ticket.id}
                title={ticket.title}
                subLabel={subLabel}
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
  );

  const studioTableSkeleton = (
    <table className={POLISH_CLASS.feedTable}>
      <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
      <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
      <TicketsTableSkeletonRows count={6} showIdColumn={showTicketIdColumn} />
    </table>
  );

  const portalFeedTicketIds = useMemo(() => {
    if (activeTab === 'my') return myTickets.map((t) => t.id);
    if (activeTab === 'studio') return studioTickets.map((t) => t.id);
    return [];
  }, [activeTab, myTickets, studioTickets]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="My Tickets" />
      {activeTab === 'dashboard' ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--color-text-muted)]">
          Opening dashboard…
        </div>
      ) : (
        <>
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
        </>
      )}

      <TicketDrawer
        ticketId={selectedId}
        onClose={handleClose}
        feedTicketIds={portalFeedTicketIds}
        onNavigateTicket={setSelectedId}
      />
    </div>
  );
}

