'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { BarChart2 } from 'lucide-react';
import { reportingApi, adminApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

type DispatchFilters = {
  studioId?: string;
  marketId?: string;
  maintenanceCategoryId?: string;
  createdAfter?: string;
  createdBefore?: string;
  priority?: string;
};

const emptyFilters: DispatchFilters = {};

function toParams(f: DispatchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.studioId) out.studioId = f.studioId;
  if (f.marketId) out.marketId = f.marketId;
  if (f.maintenanceCategoryId) out.maintenanceCategoryId = f.maintenanceCategoryId;
  if (f.createdAfter) out.createdAfter = f.createdAfter;
  if (f.createdBefore) out.createdBefore = f.createdBefore;
  if (f.priority) out.priority = f.priority;
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
    <div className="rounded-xl p-5" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
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
      className="w-full flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg text-left hover:bg-white/5 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <span className="text-gray-200 font-medium truncate block">{name}</span>
        {marketName != null && marketName !== '' && (
          <span className="text-xs text-gray-500 truncate block">{marketName}</span>
        )}
      </div>
      <span className="text-sm font-semibold text-teal-400 shrink-0">{count}</span>
    </button>
  );
}

export default function DispatchPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<DispatchFilters>(emptyFilters);

  const params = useMemo(() => toParams(filters), [filters]);

  const { data: taxonomyRes } = useQuery({
    queryKey: ['admin', 'ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyRes?.data;
  const maintenanceClassId = useMemo(
    () => taxonomy?.ticketClasses?.find((c) => c.code === 'MAINTENANCE')?.id ?? null,
    [taxonomy],
  );

  const { data: marketsRes } = useQuery({
    queryKey: ['admin', 'markets'],
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
    if (maintenanceClassId) search.set('ticketClassId', maintenanceClassId);
    if (extra.studioId) search.set('studioId', extra.studioId);
    if (extra.marketId) search.set('marketId', extra.marketId);
    if (extra.maintenanceCategoryId) search.set('maintenanceCategoryId', extra.maintenanceCategoryId);
    return `/tickets?${search.toString()}`;
  };

  const setFilter = (key: keyof DispatchFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  };

  const maintenanceCategories = taxonomy?.maintenanceCategories ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="Vendor Dispatch" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl">
        {/* Filters */}
        <div className="rounded-xl p-4 flex flex-wrap gap-3 items-end" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          <Select value={filters.studioId ?? ''} onChange={(e) => setFilter('studioId', e.target.value)} className="w-48">
            <option value="">All Studios</option>
            {studios.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Select value={filters.marketId ?? ''} onChange={(e) => setFilter('marketId', e.target.value)} className="w-48">
            <option value="">All Markets</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
          <Select value={filters.maintenanceCategoryId ?? ''} onChange={(e) => setFilter('maintenanceCategoryId', e.target.value)} className="w-52">
            <option value="">All Maintenance Categories</option>
            {maintenanceCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">From</span>
            <Input
              type="date"
              value={filters.createdAfter ?? ''}
              onChange={(e) => setFilter('createdAfter', e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">To</span>
            <Input
              type="date"
              value={filters.createdBefore ?? ''}
              onChange={(e) => setFilter('createdBefore', e.target.value)}
              className="w-40"
            />
          </div>
          <Select value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)} className="w-36">
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          {(filters.studioId || filters.marketId || filters.maintenanceCategoryId || filters.createdAfter || filters.createdBefore || filters.priority) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Open Issues by Studio */}
        <SectionCard title="Open Issues by Studio">
          {loadingStudio ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : byStudio.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No open maintenance tickets</p>
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
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : byCategory.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No open maintenance tickets</p>
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
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : byMarket.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No open maintenance tickets</p>
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
        <SectionCard title="Studios With Multiple Open Issues">
          {loadingMultiple ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : studiosWithMultiple.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No studios with 2+ open issues</p>
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
      </div>
    </div>
  );
}
