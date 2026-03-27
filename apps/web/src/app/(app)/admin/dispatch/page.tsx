'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { BarChart2, Package, Zap } from 'lucide-react';
import { reportingApi, adminApi, dispatchApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { DispatchWorkspacePanel } from '@/components/dispatch/DispatchWorkspacePanel';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { StatusBadge } from '@/components/ui/Badge';
import { DISPATCH_TRADE_TYPE_LABELS, DISPATCH_READINESS_LABELS } from '@ticketing/types';
import { LocationLink } from '@/components/ui/LocationLink';

type DispatchFilters = {
  studioId?: string;
  marketId?: string;
  maintenanceCategoryId?: string;
  createdAfter?: string;
  createdBefore?: string;
};

const emptyFilters: DispatchFilters = {};

function toParams(f: DispatchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.studioId) out.studioId = f.studioId;
  if (f.marketId) out.marketId = f.marketId;
  if (f.maintenanceCategoryId) out.maintenanceCategoryId = f.maintenanceCategoryId;
  if (f.createdAfter) out.createdAfter = f.createdAfter;
  if (f.createdBefore) out.createdBefore = f.createdBefore;
  return out;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="h-4 w-4 text-[var(--color-text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function DispatchRow({
  name,
  marketName,
  count,
  onClick,
}: {
  name: string;
  marketName?: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dispatch-feed-item w-full flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg text-left transition-colors"
    >
      <div className="min-w-0 flex-1">
        <span className="text-[var(--color-text-primary)] font-medium truncate block">{name}</span>
        {marketName != null && marketName !== '' && (
          <span className="text-xs text-[var(--color-text-muted)] truncate block">{marketName}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-[var(--color-accent)] shrink-0">{count}</span>
    </button>
  );
}

type DispatchTab = 'overview' | 'intelligence' | 'groups';

export default function DispatchPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DispatchTab>('overview');
  const [filters, setFilters] = useState<DispatchFilters>(emptyFilters);
  const [tradeFilter, setTradeFilter] = useState('');
  const [workspaceAnchorTicketId, setWorkspaceAnchorTicketId] = useState<string | null>(null);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);

  const params = useMemo(() => toParams(filters), [filters]);

  const { data: taxonomyRes } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyRes?.data;
  const maintenanceClassId = useMemo(
    () => taxonomy?.ticketClasses?.find((c) => c.code === 'MAINTENANCE')?.id ?? null,
    [taxonomy],
  );

  const { data: marketsRes } = useQuery({
    queryKey: ['markets'],
    queryFn: () => adminApi.listMarkets(),
  });
  const markets = marketsRes?.data ?? [];
  const studios = useMemo(
    () => markets.flatMap((m) => (m.studios ?? []).map((s) => ({ ...s, marketId: m.id, marketName: m.name }))),
    [markets],
  );

  const { data: byStudioRes, isLoading: loadingStudio } = useQuery({
    queryKey: ['reporting', 'dispatch', 'by-studio', params],
    queryFn: () => reportingApi.dispatchByStudio(params),
  });
  const { data: byCategoryRes, isLoading: loadingCategory } = useQuery({
    queryKey: ['reporting', 'dispatch', 'by-category', params],
    queryFn: () => reportingApi.dispatchByCategory(params),
  });
  const { data: byMarketRes, isLoading: loadingMarket } = useQuery({
    queryKey: ['reporting', 'dispatch', 'by-market', params],
    queryFn: () => reportingApi.dispatchByMarket(params),
  });
  const { data: multipleRes, isLoading: loadingMultiple } = useQuery({
    queryKey: ['reporting', 'dispatch', 'studios-with-multiple', params],
    queryFn: () => reportingApi.dispatchStudiosWithMultiple(params),
  });

  const byStudio = byStudioRes?.data ?? [];
  const byCategory = byCategoryRes?.data ?? [];
  const byMarket = byMarketRes?.data ?? [];
  const studiosWithMultiple = multipleRes?.data ?? [];

  const buildTicketsUrl = (extra: { studioId?: string; marketId?: string; maintenanceCategoryId?: string }) => {
    const search = new URLSearchParams();
    if (maintenanceClassId) search.set('ticketClass', maintenanceClassId);
    if (extra.studioId) search.set('studioId', extra.studioId);
    if (extra.marketId) search.set('state', extra.marketId);
    if (extra.maintenanceCategoryId) search.set('maintenanceCategoryId', extra.maintenanceCategoryId);
    return `/tickets?${search.toString()}`;
  };

  const setFilter = (key: keyof DispatchFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  };

  const maintenanceCategories = taxonomy?.maintenanceCategories ?? [];

  const { data: readyRes, isLoading: loadingReady } = useQuery({
    queryKey: ['dispatch', 'ready', tradeFilter],
    queryFn: () => dispatchApi.getReadyTickets({ tradeType: tradeFilter || undefined, limit: 100 }),
    enabled: activeTab === 'intelligence',
  });
  const readyTickets = readyRes?.data?.data ?? [];
  const groupedByTrade = useMemo(() => {
    const map: Record<string, typeof readyTickets> = {};
    for (const t of readyTickets) {
      const key = t.dispatchTradeType ?? 'UNSET';
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [readyTickets]);

  const { data: groupsRes, isLoading: loadingGroups } = useQuery({
    queryKey: ['dispatch', 'groups'],
    queryFn: () => dispatchApi.listGroups({ limit: 50 }),
    enabled: activeTab === 'groups',
  });
  const groups = groupsRes?.data?.data ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Vendor Dispatch" />

      {/* Tab bar */}
      <div className="shrink-0 px-6 pt-3 pb-0" style={{ background: 'var(--color-bg-page)' }}>
        <nav className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border-default)' }}>
          {([
            { key: 'overview' as const, label: 'Overview', icon: BarChart2 },
            { key: 'intelligence' as const, label: 'Ready to Dispatch', icon: Zap },
            { key: 'groups' as const, label: 'Dispatch Groups', icon: Package },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                if (key !== 'intelligence') {
                  setWorkspacePanelOpen(false);
                  setWorkspaceAnchorTicketId(null);
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filters — sticky bar outside scroll container so dropdowns overlay content and stay visible */}
      {activeTab === 'overview' && (
      <div
        className="sticky top-0 z-10 shrink-0 px-6 py-4"
        style={{ background: 'var(--color-bg-page)', borderBottom: '1px solid var(--color-border-default)' }}
      >
        <div className="rounded-xl p-4 flex flex-wrap gap-3 items-end" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
          <ComboBox
            placeholder="All Studios"
            options={studios.map((s) => ({ value: s.id, label: s.name }))}
            value={filters.studioId ?? ''}
            onChange={(v) => setFilter('studioId', v)}
            className="w-44 shrink-0"
          />
          <ComboBox
            placeholder="All States"
            options={markets.map((m) => ({ value: m.id, label: m.name }))}
            value={filters.marketId ?? ''}
            onChange={(v) => setFilter('marketId', v)}
            className="w-44 shrink-0"
          />
          <ComboBox
            placeholder="All Maintenance Categories"
            options={maintenanceCategories.map((c) => ({ value: c.id, label: c.name }))}
            value={filters.maintenanceCategoryId ?? ''}
            onChange={(v) => setFilter('maintenanceCategoryId', v)}
            className="w-48 shrink-0"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">From</span>
            <Input
              type="date"
              value={filters.createdAfter ?? ''}
              onChange={(e) => setFilter('createdAfter', e.target.value)}
              className="w-[7.25rem] min-w-0 shrink-0"
              style={{ color: 'var(--color-text-muted)' }}
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">To</span>
            <Input
              type="date"
              value={filters.createdBefore ?? ''}
              onChange={(e) => setFilter('createdBefore', e.target.value)}
              className="w-[7.25rem] min-w-0 shrink-0"
              style={{ color: 'var(--color-text-muted)' }}
            />
          </div>
          {(filters.studioId || filters.marketId || filters.maintenanceCategoryId || filters.createdAfter || filters.createdBefore) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
              Clear filters
            </Button>
          )}
        </div>
      </div>
      )}

      {/* Scrollable content: when workspace panel open, 50/50 split with grouping workspace */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div
          className={`flex-1 min-w-0 min-h-0 overflow-y-auto px-6 pt-4 pb-6 space-y-6 ${activeTab === 'intelligence' ? 'max-w-[50%]' : ''}`}
        >

      {activeTab === 'overview' && (<>
      {/* Overview tab content */}
        {/* Open Issues by Studio */}
        <SectionCard title="Open Issues by Location">
          {loadingStudio ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : byStudio.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-4">No open maintenance tickets</p>
          ) : (
            <div className="space-y-0.5">
              {byStudio.map((r) => (
                <DispatchRow
                  key={r.studioId ?? 'none'}
                  name={r.studioName}
                  marketName={r.marketName}
                  count={r.count}
                  onClick={() => router.push(buildTicketsUrl({ studioId: r.studioId ?? undefined }))}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Open Issues by Category */}
        <SectionCard title="Open Issues by Category">
          {loadingCategory ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : byCategory.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-4">No open maintenance tickets</p>
          ) : (
            <div className="space-y-0.5">
              {byCategory.map((r) => (
                <DispatchRow
                  key={r.maintenanceCategoryId ?? 'none'}
                  name={r.categoryName}
                  count={r.count}
                  onClick={() => router.push(buildTicketsUrl({ maintenanceCategoryId: r.maintenanceCategoryId ?? undefined }))}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Open Issues by Market */}
        <SectionCard title="Open Issues by Market">
          {loadingMarket ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : byMarket.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-4">No open maintenance tickets</p>
          ) : (
            <div className="space-y-0.5">
              {byMarket.map((r) => (
                <DispatchRow
                  key={r.marketId ?? 'none'}
                  name={r.marketName}
                  count={r.count}
                  onClick={() => router.push(buildTicketsUrl({ marketId: r.marketId ?? undefined }))}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Studios With Multiple Open Issues */}
        <SectionCard title="Locations With Multiple Open Issues">
          {loadingMultiple ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : studiosWithMultiple.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-4">No locations with 2+ open issues</p>
          ) : (
            <div className="space-y-0.5">
              {studiosWithMultiple.map((r) => (
                <DispatchRow
                  key={r.studioId ?? 'none'}
                  name={r.studioName}
                  marketName={r.marketName}
                  count={r.count}
                  onClick={() => router.push(buildTicketsUrl({ studioId: r.studioId ?? undefined }))}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </>)}

      {/* Intelligence tab: Ready to Dispatch tickets grouped by trade */}
      {activeTab === 'intelligence' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="w-48"
            >
              <option value="">All Trade Types</option>
              {Object.entries(DISPATCH_TRADE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <span className="text-xs text-[var(--color-text-muted)]">
              {readyTickets.length} ready ticket{readyTickets.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loadingReady ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : readyTickets.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-8">
              No maintenance tickets are marked Ready for Dispatch.
            </p>
          ) : (
            groupedByTrade.map(([trade, tickets]) => (
              <SectionCard key={trade} title={`${(DISPATCH_TRADE_TYPE_LABELS as any)[trade] ?? trade} (${tickets.length})`}>
                <div className="space-y-0.5">
                  {tickets.map((t: any) => {
                    const isAnchor = t.id === workspaceAnchorTicketId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setWorkspaceAnchorTicketId(t.id);
                          setWorkspacePanelOpen(true);
                        }}
                        className="dispatch-feed-item w-full flex items-center justify-between gap-3 py-2 px-3 rounded-lg text-left transition-colors"
                        style={{
                          background: isAnchor ? 'rgba(var(--color-accent-rgb, 52, 120, 196), 0.12)' : undefined,
                          borderLeft: isAnchor ? '3px solid var(--color-accent)' : undefined,
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-[var(--color-text-primary)] font-medium truncate block text-sm">{t.title}</span>
                          <span className="text-xs text-[var(--color-text-muted)] truncate block">
                            {t.studio?.id ? (
                              <LocationLink studioId={t.studio.id} studioName={t.studio.name} className="text-xs" />
                            ) : (
                              'No location'
                            )}
                            {t.market ? ` · ${t.market.name}` : ''}
                          </span>
                          <a
                            href={`/tickets/${t.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-[var(--color-accent)] hover:underline mt-0.5 inline-block"
                          >
                            Open ticket →
                          </a>
                        </div>
                        <StatusBadge status={t.status} />
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            ))
          )}
        </div>
      )}

      {/* Dispatch Groups tab */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          {loadingGroups ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-8">
              No dispatch groups yet. Create one from a maintenance ticket&apos;s Dispatch panel.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((g: any) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => router.push(`/admin/dispatch/groups/${g.id}`)}
                  className="w-full rounded-xl p-4 text-left hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {(DISPATCH_TRADE_TYPE_LABELS as any)[g.tradeType] ?? g.tradeType}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] ml-2">
                        {g.items?.length ?? 0} ticket{(g.items?.length ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          g.status === 'DRAFT' ? 'rgba(234,179,8,0.15)' :
                          g.status === 'READY_TO_SEND' ? 'rgba(52,120,196,0.15)' :
                          'rgba(148,163,184,0.2)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {g.status === 'READY_TO_SEND' ? 'Ready to Send' : g.status}
                    </span>
                  </div>
                  {g.notes && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">{g.notes}</p>
                  )}
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    by {g.creator?.name ?? 'Unknown'}
                    {g.targetDate ? ` · Target: ${new Date(g.targetDate).toLocaleDateString()}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

        </div>

        {workspacePanelOpen && workspaceAnchorTicketId && (
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <DispatchWorkspacePanel
              anchorTicketId={workspaceAnchorTicketId}
              onClose={() => {
                setWorkspacePanelOpen(false);
                setWorkspaceAnchorTicketId(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

