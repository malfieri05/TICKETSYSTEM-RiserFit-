'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  Ticket, CheckCircle2, Clock, BarChart2,
  CheckCheck, ChevronRight,
} from 'lucide-react';
import { ticketsApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { formatTicketId } from '@/components/tickets/TicketRow';
import { POLISH_THEME } from '@/lib/polish';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };
const RECENT_PREVIEW_LIMIT = 5;
const DONE_STATUSES = new Set(['RESOLVED', 'CLOSED']);

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

function CategoryBar({ label, count, max, color }: { label: string; count: number; max: number; color?: string | null }) {
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 truncate shrink-0" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color ?? 'var(--color-accent)' }} />
      </div>
      <span className="w-6 text-right text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{count}</span>
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  NEW: '#3b82f6',
  TRIAGED: '#8b5cf6',
  IN_PROGRESS: '#10b981',
  WAITING_ON_REQUESTER: '#d97706',
  WAITING_ON_VENDOR: '#ea580c',
  RESOLVED: '#0d9488',
  CLOSED: 'var(--color-text-muted)',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['my-summary'],
    queryFn: () => ticketsApi.mySummary(),
    refetchInterval: 30_000,
  });

  const summary = data?.data;
  const allTickets = summary?.tickets ?? [];
  const maxCat = Math.max(...(summary?.byCategory.map((c) => c.count) ?? [1]), 1);

  const doneTickets = allTickets.filter((t) => DONE_STATUSES.has(t.status));
  const completionDurationsHours = (doneTickets as any[])
    .filter((t) => t.resolvedAt)
    .map((t) => {
      const created = new Date(t.createdAt).getTime();
      const resolved = new Date(t.resolvedAt).getTime();
      return Math.max(0, (resolved - created) / 3_600_000);
    });
  const avgCompletionHours =
    completionDurationsHours.length > 0
      ? completionDurationsHours.reduce((sum, h) => sum + h, 0) / completionDurationsHours.length
      : null;
  const avgCompletionLabel =
    avgCompletionHours == null
      ? '—'
      : avgCompletionHours < 1
        ? `${Math.round(avgCompletionHours * 60)} min`
        : `${avgCompletionHours.toFixed(1)} h`;

  const recentTickets = allTickets.slice(0, RECENT_PREVIEW_LIMIT);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title={`Dashboard${user?.displayName ? ` — ${user.displayName}` : ''}`} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        {/* KPI cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="My Tickets"
            value={summary?.total ?? 0}
            icon={Ticket}
            iconStyle={{ background: 'rgba(52,120,196,0.15)', color: '#3478c4' }}
          />
          <StatCard
            label="Open"
            value={summary?.open ?? 0}
            sub="Need attention"
            icon={Clock}
            iconStyle={{ background: 'rgba(245,158,11,0.12)', color: '#d97706' }}
          />
          <StatCard
            label="Resolved"
            value={summary?.resolved ?? 0}
            sub="Completed tickets"
            icon={CheckCircle2}
            iconStyle={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}
          />
          <StatCard
            label="Avg Completion"
            value={avgCompletionLabel}
            sub="From created to resolved"
            icon={CheckCheck}
            iconStyle={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
          />
        </div>

        {/* Recent activity preview */}
        <div className="rounded-xl p-5 space-y-4" style={panel}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              <Ticket className="h-4 w-4" style={{ color: POLISH_THEME.accent }} />
              Recent tickets
            </h3>
            <button
              type="button"
              onClick={() => router.push('/tickets')}
              className="text-xs font-medium transition-colors"
              style={{ color: 'var(--color-accent)' }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              View all tickets →
            </button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
            </div>
          ) : recentTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--color-text-muted)' }}>
              <Ticket className="h-8 w-8" />
              <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>No tickets yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => router.push(`/tickets/${t.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors duration-150"
                  style={{ background: 'var(--color-bg-page)', border: `1px solid var(--color-border-default)` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-surface-raised)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-page)')}
                >
                  <span className="text-xs font-mono shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    {formatTicketId(t.id)}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: STATUS_DOT[t.status] ?? 'var(--color-text-muted)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{t.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                </button>
              ))}
              {allTickets.length > RECENT_PREVIEW_LIMIT && (
                <p className="text-xs text-center pt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Showing {RECENT_PREVIEW_LIMIT} of {allTickets.length} tickets
                </p>
              )}
            </div>
          )}
        </div>

        {/* By category */}
        {(summary?.byCategory.length ?? 0) > 0 && (
          <div className="rounded-xl p-5" style={panel}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>My Tickets by Category</h3>
            </div>
            <div className="space-y-3">
              {(summary?.byCategory ?? [])
                .sort((a, b) => b.count - a.count)
                .map((row) => (
                  <CategoryBar
                    key={row.categoryId ?? 'none'}
                    label={row.categoryName}
                    count={row.count}
                    max={maxCat}
                    color={row.categoryColor}
                  />
                ))}
            </div>
          </div>
        )}

        {/* Status breakdown */}
        {allTickets.length > 0 && (
          <div className="rounded-xl p-5" style={panel}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Breakdown by Status</h3>
            <div className="space-y-2">
              {Object.entries(
                allTickets.reduce<Record<string, number>>((acc, t) => {
                  acc[t.status] = (acc[t.status] ?? 0) + 1;
                  return acc;
                }, {}),
              )
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: STATUS_DOT[status] ?? 'var(--color-text-muted)' }}
                    />
                    <span className="flex-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {!isLoading && allTickets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3" style={{ color: 'var(--color-text-muted)' }}>
            <Ticket className="h-12 w-12" />
            <p className="text-base font-medium" style={{ color: 'var(--color-text-secondary)' }}>No tickets yet</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Tickets you create or are assigned to will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
