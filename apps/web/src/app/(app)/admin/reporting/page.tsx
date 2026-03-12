'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, Clock, Ticket, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { reportingApi, api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';

// ── Helpers ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'indigo',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: 'indigo' | 'green' | 'amber' | 'red';
}) {
  const iconStyle = {
    indigo: { background: 'rgba(52,120,196,0.15)', color: '#3478c4' },
    green:  { background: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
    amber:  { background: 'rgba(245,158,11,0.12)', color: '#d97706' },
    red:    { background: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
  }[color];

  return (
    <div className="rounded-xl p-5 flex items-start gap-4" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
      <div className="rounded-lg p-2.5" style={iconStyle}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-[var(--color-text-primary)] mt-0.5">{value}</p>
        {sub && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function HorizontalBar({
  label,
  count,
  max,
  color = '#6366f1',
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 text-[var(--color-text-secondary)] truncate shrink-0">{label}</span>
      <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-[var(--color-text-muted)] font-medium">{count}</span>
    </div>
  );
}

function VolumeChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 80;

  return (
    <div className="flex items-end gap-0.5 h-20 w-full">
      {data.map((d) => {
        const barH = Math.max(2, Math.round((d.count / max) * chartHeight));
        return (
          <div
            key={d.date}
            className="flex-1 rounded-t transition-colors cursor-default group relative"
            style={{ height: `${barH}px`, background: 'var(--color-accent)' }}
            title={`${d.date}: ${d.count} tickets`}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
              {d.date}: {d.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  NEW: '#8b5cf6',
  TRIAGED: '#3b82f6',
  IN_PROGRESS: '#10b981',
  WAITING_ON_REQUESTER: '#d97706',
  WAITING_ON_VENDOR: '#ea580c',
  RESOLVED: '#059669',
  CLOSED: '#6b7280',
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function ReportingPage() {
  const [volumeRange, setVolumeRange] = useState<'1d' | '7d' | '30d' | 'all'>('30d');

  const volumeDays = volumeRange === '1d' ? 1 : volumeRange === '7d' ? 7 : volumeRange === '30d' ? 30 : 365;

  const { data: summaryRes, isLoading: summaryLoading } = useQuery({
    queryKey: ['reporting', 'summary'],
    queryFn: () => reportingApi.summary(),
  });

  const { data: volumeRes } = useQuery({
    queryKey: ['reporting', 'volume', volumeDays],
    queryFn: () => reportingApi.volumeByDay(volumeDays),
  });

  const { data: statusRes } = useQuery({
    queryKey: ['reporting', 'by-status'],
    queryFn: () => reportingApi.byStatus(),
  });

  const { data: priorityRes } = useQuery({
    queryKey: ['reporting', 'by-priority'],
    queryFn: () => reportingApi.byPriority(),
  });

  const { data: categoryRes } = useQuery({
    queryKey: ['reporting', 'by-category'],
    queryFn: () => reportingApi.byCategory(),
  });

  const { data: marketRes } = useQuery({
    queryKey: ['reporting', 'by-market'],
    queryFn: () => reportingApi.byMarket(),
  });

  const { data: resolutionRes } = useQuery({
    queryKey: ['reporting', 'resolution-time'],
    queryFn: () => reportingApi.resolutionTime(),
  });

  const { data: completionOwnerRes } = useQuery({
    queryKey: ['reporting', 'completion-time', 'owners'],
    queryFn: () => reportingApi.completionByOwner(),
  });

  const summary = summaryRes?.data;
  const volume = volumeRes?.data ?? [];
  const byStatus = statusRes?.data ?? [];
  const byPriority = priorityRes?.data ?? [];
  const byCategory = categoryRes?.data ?? [];
  const byMarket = marketRes?.data ?? [];
  const resolutionTime = resolutionRes?.data ?? [];
  const completionByOwner = completionOwnerRes?.data ?? [];

  const maxStatus = Math.max(...byStatus.map((r) => r.count), 1);
  const maxPriority = Math.max(...byPriority.map((r) => r.count), 1);
  const maxCategory = Math.max(...byCategory.map((r) => r.count), 1);
  const maxMarket = Math.max(...byMarket.map((r) => r.count), 1);
  const maxResolution = Math.max(...resolutionTime.map((r) => r.avgHours), 1);

  const formatHours = (h: number | null) => {
    if (h === null) return '—';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.get('/reporting/export', {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // no-op: user sees nothing change on failure
    }
  };

  if (summaryLoading) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
        <Header title="Reporting" />
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
          <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        title="Reporting"
        action={
          <Button size="sm" variant="secondary" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl">
        {/* ── KPI cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Tickets"
            value={summary?.total ?? 0}
            icon={Ticket}
            color="indigo"
          />
          <StatCard
            label="Open"
            value={summary?.open ?? 0}
            sub="Active tickets"
            icon={AlertCircle}
            color="amber"
          />
          <StatCard
            label="Resolved"
            value={summary?.resolved ?? 0}
            sub="Completed tickets"
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            label="Avg Resolution"
            value={formatHours(summary?.avgResolutionHours ?? null)}
            sub="From open to resolved"
            icon={Clock}
            color="indigo"
          />
        </div>

        {/* ── Volume chart ───────────────────────────────────────────────────── */}
        <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-[var(--color-text-secondary)]" />
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Ticket Volume —{' '}
                {volumeRange === '1d' && 'Last 24 Hours'}
                {volumeRange === '7d' && 'Last 7 Days'}
                {volumeRange === '30d' && 'Last 30 Days'}
                {volumeRange === 'all' && 'All Time'}
              </h3>
            </div>
            <div className="inline-flex rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-page)] text-xs">
              {[
                { key: '1d', label: '1d' },
                { key: '7d', label: '1w' },
                { key: '30d', label: '1m' },
                { key: 'all', label: 'All' },
              ].map((opt) => {
                const active = volumeRange === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setVolumeRange(opt.key as typeof volumeRange)}
                    className="px-2.5 py-0.5 rounded-full transition-colors"
                    style={{
                      background: active ? 'var(--color-accent)' : 'transparent',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {volume.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] py-6 text-center">No data yet.</p>
          ) : (
            <>
              <VolumeChart data={volume} />
              <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mt-1">
                <span>{volume[0]?.date}</span>
                <span>{volume[volume.length - 1]?.date}</span>
              </div>
            </>
          )}
        </div>

        {/* ── Two-column breakdowns ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Status */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">By Status</h3>
            <div className="space-y-2.5">
              {byStatus.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No data.</p>
              ) : (
                byStatus.map((row) => (
                  <HorizontalBar
                    key={row.status}
                    label={row.status.replace(/_/g, ' ')}
                    count={row.count}
                    max={maxStatus}
                    color={STATUS_COLORS[row.status] ?? '#6366f1'}
                  />
                ))
              )}
            </div>
          </div>

          {/* By Priority */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">By Priority</h3>
            <div className="space-y-2.5">
              {byPriority.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No data.</p>
              ) : (
                byPriority.map((row) => (
                  <HorizontalBar
                    key={row.priority}
                    label={row.priority}
                    count={row.count}
                    max={maxPriority}
                    color={PRIORITY_COLORS[row.priority] ?? '#6366f1'}
                  />
                ))
              )}
            </div>
          </div>

          {/* By Category */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">By Category</h3>
            <div className="space-y-2.5">
              {byCategory.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No data.</p>
              ) : (
                byCategory.map((row) => (
                  <HorizontalBar
                    key={row.categoryId ?? 'none'}
                    label={row.categoryName}
                    count={row.count}
                    max={maxCategory}
                  />
                ))
              )}
            </div>
          </div>

          {/* By Market */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">By Market</h3>
            <div className="space-y-2.5">
              {byMarket.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No data.</p>
              ) : (
                byMarket.map((row) => (
                  <HorizontalBar
                    key={row.marketId ?? 'none'}
                    label={row.marketName}
                    count={row.count}
                    max={maxMarket}
                    color="#0ea5e9"
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Resolution time by category ────────────────────────────────────── */}
        <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            Avg Resolution Time by Category
          </h3>
          {resolutionTime.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-4">
              No resolved tickets yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {resolutionTime.map((row) => (
                <div key={row.categoryName} className="flex items-center gap-3 text-sm">
                  <span className="w-36 text-[var(--color-text-secondary)] truncate shrink-0">{row.categoryName}</span>
                  <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{
                        width: `${Math.max(2, Math.round((row.avgHours / maxResolution) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="w-14 text-right text-[var(--color-text-muted)] font-medium">
                    {formatHours(row.avgHours)}
                  </span>
                  <span className="w-16 text-right text-[var(--color-text-secondary)] text-xs">
                    {row.ticketCount} tickets
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Completion time by owner ───────────────────────────────────────── */}
        <div className="rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            Avg Completion Time by Owner
          </h3>
          {completionByOwner.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] text-center py-4">
              No completed tickets with owners yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)] text-xs uppercase tracking-wide">
                    <th className="text-left py-2 pr-4">Owner</th>
                    <th className="text-right py-2 pr-4">Avg Completion</th>
                    <th className="text-right py-2 pr-2">Closed Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {completionByOwner.map((row) => (
                    <tr key={row.userId} className="border-b border-[var(--color-border-default)]">
                      <td className="py-1.5 pr-4 text-[var(--color-text-primary)]">{row.userName}</td>
                      <td className="py-1.5 pr-4 text-right text-[var(--color-text-primary)]">
                        {row.avgHours == null ? '—' : formatHours(row.avgHours)}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-[var(--color-text-secondary)]">{row.closedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
