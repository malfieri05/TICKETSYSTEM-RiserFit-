'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  Ticket, CheckCircle2, Clock, BarChart2,
  Eye, EyeOff, CheckCheck, ChevronRight,
} from 'lucide-react';
import { ticketsApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';

// ── Palette ────────────────────────────────────────────────────────────────
const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

// ── Local-storage key for hidden ticket IDs ─────────────────────────────────
const LS_KEY = 'dashboard_hidden_tickets';

function useHiddenTickets() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const clearAll = () => {
    setHidden(new Set());
    localStorage.removeItem(LS_KEY);
  };

  return { hidden, toggle, clearAll };
}

// ── Stat card ──────────────────────────────────────────────────────────────
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
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>{label}</p>
        <p className="text-2xl font-bold text-gray-100 mt-0.5">{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: '#555555' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Category bar ───────────────────────────────────────────────────────────
function CategoryBar({ label, count, max, color }: { label: string; count: number; max: number; color?: string | null }) {
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 truncate shrink-0" style={{ color: '#888888' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color ?? '#14b8a6' }} />
      </div>
      <span className="w-6 text-right text-xs font-medium" style={{ color: '#666666' }}>{count}</span>
    </div>
  );
}

// ── Status dot colours ────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  NEW: '#60a5fa',
  TRIAGED: '#a78bfa',
  IN_PROGRESS: '#34d399',
  WAITING_ON_REQUESTER: '#fbbf24',
  WAITING_ON_VENDOR: '#f97316',
  RESOLVED: '#14b8a6',
  CLOSED: '#555555',
};

const DONE_STATUSES = new Set(['RESOLVED', 'CLOSED']);

// ── Main page ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { hidden, toggle, clearAll } = useHiddenTickets();
  const [showHidden, setShowHidden] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my-summary'],
    queryFn: () => ticketsApi.mySummary(),
    refetchInterval: 30_000,
  });

  const summary = data?.data;
  const allTickets = summary?.tickets ?? [];
  const maxCat = Math.max(...(summary?.byCategory.map((c) => c.count) ?? [1]), 1);

  // Separate open vs done tickets
  const openTickets = allTickets.filter((t) => !DONE_STATUSES.has(t.status));
  const doneTickets = allTickets.filter((t) => DONE_STATUSES.has(t.status));

  // Average completion time for my tickets (resolved/closed)
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

  // Apply hide filters
  const visibleOpen = openTickets.filter((t) => !hidden.has(t.id));
  const hiddenOpen  = openTickets.filter((t) =>  hidden.has(t.id));

  const visibleDone = hideCompleted ? [] : doneTickets.filter((t) => !hidden.has(t.id));
  const hiddenDone  = doneTickets.filter((t) => hidden.has(t.id));

  const totalHidden = hiddenOpen.length + hiddenDone.length;

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title={`Dashboard${user?.displayName ? ` — ${user.displayName}` : ''}`} />

      <div className="flex-1 overflow-hidden flex">

        {/* ── LEFT: My Tickets checklist ─────────────────────────────────── */}
        <div
          className="w-80 shrink-0 flex flex-col overflow-hidden"
          style={{ background: '#111111', borderRight: '1px solid #2a2a2a' }}
        >
          {/* Panel header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #2a2a2a' }}>
            <div>
              <p className="text-sm font-semibold text-gray-100">My Tickets</p>
              <p className="text-xs mt-0.5" style={{ color: '#555555' }}>
                {allTickets.length} total · {openTickets.length} open
              </p>
            </div>
            <div className="flex gap-1">
              {/* Hide completed toggle */}
              <button
                onClick={() => setHideCompleted((v) => !v)}
                title={hideCompleted ? 'Show completed' : 'Hide completed'}
                className="p-1.5 rounded transition-colors"
                style={{ color: hideCompleted ? '#14b8a6' : '#555555' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#cccccc')}
                onMouseLeave={(e) => (e.currentTarget.style.color = hideCompleted ? '#14b8a6' : '#555555')}
              >
                <CheckCheck className="h-4 w-4" />
              </button>
              {/* Show/hide manually hidden */}
              {totalHidden > 0 && (
                <button
                  onClick={() => setShowHidden((v) => !v)}
                  title={showHidden ? 'Hide dismissed' : `Show ${totalHidden} dismissed`}
                  className="p-1.5 rounded transition-colors"
                  style={{ color: '#555555' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#cccccc')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
                >
                  {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto py-2">
            {isLoading ? (
              <div className="flex justify-center pt-12">
                <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
              </div>
            ) : allTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center pt-16 gap-2" style={{ color: '#444444' }}>
                <Ticket className="h-8 w-8" />
                <p className="text-sm">No tickets yet</p>
              </div>
            ) : (
              <>
                {/* ── Open tickets ── */}
                {visibleOpen.length > 0 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#444444' }}>
                      Open
                    </p>
                    {visibleOpen.map((t) => (
                      <TicketRow
                        key={t.id}
                        ticket={t}
                        isDone={false}
                        isHidden={false}
                        onHide={() => toggle(t.id)}
                        onClick={() => router.push(`/tickets/${t.id}`)}
                      />
                    ))}
                  </div>
                )}

                {/* ── Completed tickets ── */}
                {!hideCompleted && visibleDone.length > 0 && (
                  <div className="mt-2">
                    <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#444444' }}>
                      Completed
                    </p>
                    {visibleDone.map((t) => (
                      <TicketRow
                        key={t.id}
                        ticket={t}
                        isDone
                        isHidden={false}
                        onHide={() => toggle(t.id)}
                        onClick={() => router.push(`/tickets/${t.id}`)}
                      />
                    ))}
                  </div>
                )}

                {/* ── Manually hidden (shown when toggled) ── */}
                {showHidden && totalHidden > 0 && (
                  <div className="mt-2">
                    <div className="px-4 py-1.5 flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#333333' }}>
                        Hidden ({totalHidden})
                      </p>
                      <button
                        onClick={clearAll}
                        className="text-[10px] underline transition-colors"
                        style={{ color: '#555555' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#cccccc')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
                      >
                        Show all
                      </button>
                    </div>
                    {[...hiddenOpen, ...hiddenDone].map((t) => (
                      <TicketRow
                        key={t.id}
                        ticket={t}
                        isDone={DONE_STATUSES.has(t.status)}
                        isHidden
                        onHide={() => toggle(t.id)}
                        onClick={() => router.push(`/tickets/${t.id}`)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Stats ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* KPI cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="My Tickets"
              value={summary?.total ?? 0}
              icon={Ticket}
              iconStyle={{ background: 'rgba(20,184,166,0.15)', color: '#14b8a6' }}
            />
            <StatCard
              label="Open"
              value={summary?.open ?? 0}
              sub="Need attention"
              icon={Clock}
              iconStyle={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
            />
            <StatCard
              label="Resolved"
              value={summary?.resolved ?? 0}
              sub="Completed tickets"
              icon={CheckCircle2}
              iconStyle={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
            />
            <StatCard
              label="Avg Completion"
              value={avgCompletionLabel}
              sub="From created to resolved"
              icon={CheckCheck}
              iconStyle={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
            />
          </div>

          {/* By category */}
          {(summary?.byCategory.length ?? 0) > 0 && (
            <div className="rounded-xl p-5" style={panel}>
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="h-4 w-4" style={{ color: '#555555' }} />
                <h3 className="text-sm font-semibold text-gray-100">My Tickets by Category</h3>
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
              <h3 className="text-sm font-semibold text-gray-100 mb-4">Breakdown by Status</h3>
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
                        style={{ background: STATUS_DOT[status] ?? '#555555' }}
                      />
                      <span className="flex-1 text-sm" style={{ color: '#888888' }}>
                        {status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-medium text-gray-300">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && allTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3" style={{ color: '#444444' }}>
              <Ticket className="h-12 w-12" />
              <p className="text-base font-medium" style={{ color: '#666666' }}>No tickets yet</p>
              <p className="text-sm" style={{ color: '#444444' }}>
                Tickets you create or are assigned to will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ticket row component ────────────────────────────────────────────────────
function TicketRow({
  ticket,
  isDone,
  isHidden,
  onHide,
  onClick,
}: {
  ticket: { id: string; title: string; status: string; priority: string; updatedAt: string; category?: { name: string; color?: string } | null };
  isDone: boolean;
  isHidden: boolean;
  onHide: () => void;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-colors"
      style={{ background: hovered ? '#1a1a1a' : 'transparent', opacity: isHidden ? 0.4 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Status dot / checkmark */}
      <div className="mt-0.5 shrink-0 flex items-center justify-center h-4 w-4">
        {isDone ? (
          <CheckCircle2 className="h-4 w-4" style={{ color: '#14b8a6' }} />
        ) : (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: STATUS_DOT[ticket.status] ?? '#555555' }}
          />
        )}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-snug truncate"
          style={{
            color: isDone ? '#555555' : '#cccccc',
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {ticket.title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#444444' }}>
          {ticket.category?.name ?? 'No category'} ·{' '}
          {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
        </p>
      </div>

      {/* Hide button + chevron */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onHide(); }}
          title={isHidden ? 'Show' : 'Hide'}
          className="p-0.5 rounded transition-colors"
          style={{ color: '#444444' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#cccccc')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#444444')}
        >
          {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <ChevronRight className="h-3.5 w-3.5" style={{ color: '#444444' }} />
      </div>
    </div>
  );
}
