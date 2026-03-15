'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Ticket, CheckCircle2, Clock, BarChart2,
  CheckCheck, MapPin,
} from 'lucide-react';
import { dashboardApi, type DashboardSummaryResponse } from '@/lib/api';
import { Header } from '@/components/layout/Header';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

function StatCard({
  label, value, sub, icon: Icon, iconStyle,
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
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
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

function formatHoursLabel(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardApi.summary(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const summary = data?.data as DashboardSummaryResponse | undefined;

  const maxSupportType = Math.max(...(summary?.supportByType?.map((s) => s.count) ?? [1]), 1);
  const maxMaintenanceLoc = Math.max(...(summary?.maintenanceByLocation?.map((m) => m.count) ?? [1]), 1);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Dashboard" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading dashboard…</span>
          </div>
        ) : !summary ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3" style={{ color: 'var(--color-text-muted)' }}>
            <Ticket className="h-12 w-12" />
            <p className="text-base font-medium" style={{ color: 'var(--color-text-secondary)' }}>No data available</p>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="New Tickets"
                value={summary.newTickets}
                sub="Awaiting triage"
                icon={Ticket}
                iconStyle={{ background: 'rgba(52,120,196,0.15)', color: '#3478c4' }}
              />
              <StatCard
                label="In Progress"
                value={summary.inProgressTickets}
                sub="Active work"
                icon={Clock}
                iconStyle={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}
              />
              <StatCard
                label="Resolved"
                value={summary.resolvedTickets}
                sub="Completed tickets"
                icon={CheckCircle2}
                iconStyle={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}
              />
              <StatCard
                label="Avg Completion"
                value={formatHoursLabel(summary.avgCompletionHours)}
                sub="Last 30 days"
                icon={CheckCheck}
                iconStyle={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
              />
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Support by Type */}
              <div className="rounded-xl p-5" style={panel}>
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Support Tickets by Type
                  </h3>
                </div>
                {summary.supportByType.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>No data.</p>
                ) : (
                  <div className="space-y-3">
                    {summary.supportByType.map((row) => (
                      <BreakdownBar
                        key={row.typeId}
                        label={row.typeName}
                        count={row.count}
                        max={maxSupportType}
                        color="#6366f1"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Maintenance by Location */}
              <div className="rounded-xl p-5" style={panel}>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Maintenance Tickets by Location
                  </h3>
                </div>
                {summary.maintenanceByLocation.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>No data.</p>
                ) : (
                  <div className="space-y-3">
                    {summary.maintenanceByLocation.map((row) => (
                      <BreakdownBar
                        key={row.locationId}
                        label={row.locationName}
                        count={row.count}
                        max={maxMaintenanceLoc}
                        color="#0ea5e9"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
