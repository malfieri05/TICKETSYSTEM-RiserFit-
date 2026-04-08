'use client';

import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { BarChart2, MapPin, Package, Zap } from 'lucide-react';
import { reportingApi, adminApi, dispatchApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { DispatchWorkspacePanel } from '@/components/dispatch/DispatchWorkspacePanel';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { DateFilterInput } from '@/components/ui/DateFilterInput';
import { ComboBox } from '@/components/ui/ComboBox';
import { StatusBadge } from '@/components/ui/Badge';
import { DISPATCH_TRADE_TYPE_LABELS, DISPATCH_READINESS_LABELS } from '@ticketing/types';
import { LocationLink } from '@/components/ui/LocationLink';
import { POLISH_THEME } from '@/lib/polish';
import {
  MaintenanceCountWithTooltip,
  type OpenMaintenanceTicketLine,
} from '@/components/ui/MaintenanceCountWithTooltip';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TICKETS_PANEL_QUERY_PARAM } from '@/lib/tickets-deep-link';

const LocationsMap = dynamic(
  () => import('@/components/admin/LocationsMap').then((m) => m.LocationsMap),
  { ssr: false },
);

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
  className = '',
  headerDivider = false,
  icon: Icon = BarChart2,
}: {
  title: ReactNode;
  children: React.ReactNode;
  className?: string;
  headerDivider?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <div
      className={`dashboard-card rounded-xl p-5 ${className}`.trim()}
      style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}
    >
      <div
        className={
          headerDivider ? 'flex items-center gap-2 pb-4 mb-4' : 'flex items-center gap-2 mb-4'
        }
        style={
          headerDivider
            ? { borderBottom: '1px solid var(--color-border-default)' }
            : undefined
        }
      >
        <Icon className="h-4 w-4 text-[var(--color-text-secondary)] shrink-0" />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function DispatchRow({
  name,
  marketName,
  count,
  categoryNames,
  ticketsWithLinks,
  isSelected,
  onClick,
  onViewTicket,
  highlightedTicketId,
}: {
  name: string;
  marketName?: string;
  count: number;
  categoryNames: string[];
  ticketsWithLinks: OpenMaintenanceTicketLine[];
  isSelected?: boolean;
  onClick: () => void;
  onViewTicket?: (ticketId: string) => void;
  highlightedTicketId?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dispatch-feed-item w-full flex items-center justify-between gap-2 py-2.5 px-3 rounded-lg text-left transition-colors hover:bg-[var(--color-bg-surface-raised)]"
      style={{
        background: isSelected ? POLISH_THEME.adminStudioListSelectedBg : undefined,
        borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
      }}
    >
      <div className="text-left">
        <span className="text-[var(--color-text-primary)] font-medium block">{name}</span>
        {marketName != null && marketName !== '' && (
          <span className="text-xs text-[var(--color-text-muted)] block">{marketName}</span>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold">
        <MaintenanceCountWithTooltip
          count={count}
          categoryNames={categoryNames}
          ticketsWithLinks={ticketsWithLinks}
          onViewTicket={onViewTicket}
          highlightedTicketId={highlightedTicketId}
          countStyle="accent"
          showParens={false}
        />
      </span>
    </button>
  );
}

type DispatchTab = 'overview' | 'intelligence' | 'groups';

export default function DispatchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DispatchTab>('overview');
  const [filters, setFilters] = useState<DispatchFilters>(emptyFilters);
  const [tradeFilter, setTradeFilter] = useState('');
  const [workspaceAnchorTicketId, setWorkspaceAnchorTicketId] = useState<string | null>(null);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const [overviewSelectedStudioId, setOverviewSelectedStudioId] = useState<string | null>(null);
  const [dispatchMapResetNonce, setDispatchMapResetNonce] = useState(0);

  const panelParam = searchParams.get(TICKETS_PANEL_QUERY_PARAM);
  const ticketPanelId =
    panelParam && panelParam.length > 0 ? panelParam : null;

  const closeTicketPanel = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(TICKETS_PANEL_QUERY_PARAM);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const openTicketPanel = useCallback(
    (id: string) => {
      if (ticketPanelId === id) {
        closeTicketPanel();
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.set(TICKETS_PANEL_QUERY_PARAM, id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [ticketPanelId, closeTicketPanel, pathname, router, searchParams],
  );

  const params = useMemo(() => toParams(filters), [filters]);

  const { data: taxonomyRes } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyRes?.data;

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

  const byStudio = byStudioRes?.data ?? [];

  const mapLocations = useMemo(() => {
    const byId = new Map(studios.map((s) => [s.id, s]));
    return byStudio
      .map((r) => {
        if (!r.studioId) return null;
        const s = byId.get(r.studioId);
        if (!s) return null;
        return {
          id: s.id,
          name: s.name,
          formattedAddress: (s as { formattedAddress?: string | null }).formattedAddress ?? null,
          latitude: (s as { latitude?: number | null }).latitude ?? null,
          longitude: (s as { longitude?: number | null }).longitude ?? null,
          openTickets: (r.openTickets ?? []).map((t) => ({
            id: t.id,
            maintenanceCategoryName: t.maintenanceCategoryName,
          })),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [byStudio, studios]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      setOverviewSelectedStudioId(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!overviewSelectedStudioId) return;
    const stillInList = byStudio.some((r) => r.studioId === overviewSelectedStudioId);
    if (!stillInList) {
      setOverviewSelectedStudioId(null);
    }
  }, [byStudio, overviewSelectedStudioId]);

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
        <div className="dashboard-card rounded-xl p-4 flex flex-wrap gap-3 items-end" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
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
            <DateFilterInput
              variant="filter"
              value={filters.createdAfter ?? ''}
              onChange={(v) => setFilter('createdAfter', v)}
              className="w-[7.25rem] min-w-0 shrink-0"
              style={{ color: 'var(--color-text-muted)' }}
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">To</span>
            <DateFilterInput
              variant="filter"
              value={filters.createdBefore ?? ''}
              onChange={(v) => setFilter('createdBefore', v)}
              className="w-[7.25rem] min-w-0 shrink-0"
              style={{ color: 'var(--color-text-muted)' }}
            />
          </div>
          {(filters.studioId || filters.marketId || filters.maintenanceCategoryId || filters.createdAfter || filters.createdBefore) && (
            <Button variant="outlineAccent" size="sm" onClick={() => setFilters(emptyFilters)}>
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

      {activeTab === 'overview' && (
        <div className="flex flex-col xl:flex-row gap-6 items-start w-full">
          <SectionCard title="Open Issues by Location" className="w-fit max-w-full shrink-0" headerDivider>
            {loadingStudio ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : byStudio.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] py-4">No open maintenance tickets</p>
            ) : (
              <>
                <div
                  className="border-b border-[var(--color-border-default)] pb-4 mb-4"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setOverviewSelectedStudioId(null);
                      setDispatchMapResetNonce((n) => n + 1);
                    }}
                  >
                    Default View
                  </Button>
                </div>
                <div className="space-y-0.5">
                {byStudio.map((r) => (
                  <DispatchRow
                    key={r.studioId ?? 'none'}
                    name={r.studioName}
                    marketName={r.marketName}
                    count={r.count}
                    categoryNames={r.categoryNames ?? []}
                    ticketsWithLinks={(r.openTickets ?? []).map((t) => ({
                      id: t.id,
                      maintenanceCategoryName: t.maintenanceCategoryName,
                    }))}
                    isSelected={
                      r.studioId != null && r.studioId === overviewSelectedStudioId
                    }
                    onClick={() => {
                      if (r.studioId) {
                        setOverviewSelectedStudioId(r.studioId);
                      } else {
                        setOverviewSelectedStudioId(null);
                      }
                    }}
                    onViewTicket={
                      r.studioId
                        ? (ticketId) => {
                            setOverviewSelectedStudioId(r.studioId!);
                            openTicketPanel(ticketId);
                          }
                        : openTicketPanel
                    }
                    highlightedTicketId={ticketPanelId}
                  />
                ))}
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard
            title={
              <>
                Map
                <span
                  className="text-[var(--color-text-muted)] font-normal shrink-0"
                  aria-hidden
                >
                  |
                </span>
                <span className="text-xs font-normal text-[var(--color-text-muted)]">
                  Locations with active maintenance tickets:
                </span>
              </>
            }
            icon={MapPin}
            className="flex-1 min-w-0 w-full"
          >
            {loadingStudio ? (
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border py-16 h-[min(520px,55vh)] xl:h-[580px]"
                style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)' }}
              >
                <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                <span className="text-xs text-[var(--color-text-muted)]">Loading map…</span>
              </div>
            ) : (
              <LocationsMap
                locations={mapLocations}
                className="h-[min(520px,55vh)] xl:h-[580px] border-0 rounded-lg"
                selectedLocationId={overviewSelectedStudioId}
                onLocationClick={(id) => setOverviewSelectedStudioId(id)}
                onViewTicket={openTicketPanel}
                ticketDrawerOpen={!!ticketPanelId}
                highlightedTicketId={ticketPanelId}
                resetCameraNonce={dispatchMapResetNonce}
              />
            )}
          </SectionCard>
        </div>
      )}

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
                  className="dashboard-card w-full rounded-xl p-4 text-left hover:opacity-90 transition-opacity"
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

      <TicketDrawer
        ticketId={ticketPanelId}
        onClose={closeTicketPanel}
        noBackdrop
        closeOnOutsideClick
      />
    </div>
  );
}

