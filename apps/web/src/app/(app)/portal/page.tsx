'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Ticket, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { ticketsApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/ui/Badge';
import type { ScopeSummaryRecentTicket } from '@/types';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

function StatCard({
  label,
  value,
  icon: Icon,
  iconStyle,
}: {
  label: string;
  value: number;
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
      </div>
    </div>
  );
}

function RecentRow({ ticket, onClick }: { ticket: ScopeSummaryRecentTicket; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors"
      style={{ background: '#111111', border: '1px solid #2a2a2a' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#1a1a1a';
        e.currentTarget.style.borderColor = '#333333';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#111111';
        e.currentTarget.style.borderColor = '#2a2a2a';
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 truncate">{ticket.title}</p>
        <p className="text-xs mt-0.5" style={{ color: '#555555' }}>
          {ticket.studio?.name ?? 'No studio'} · {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
        </p>
      </div>
      <StatusBadge status={ticket.status} />
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#555555' }} />
    </button>
  );
}

export default function PortalPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['scope-summary'],
    queryFn: () => ticketsApi.scopeSummary(),
  });

  const res = data?.data;
  const openCount = res?.openCount ?? 0;
  const completedCount = res?.completedCount ?? 0;
  const recentTickets = res?.recentTickets ?? [];
  const allowedStudios = res?.allowedStudios ?? [];
  const [locationFilter, setLocationFilter] = useState<string>('');

  const viewAllHref = locationFilter ? `/portal/tickets?studioId=${encodeURIComponent(locationFilter)}` : '/portal/tickets';

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="My Tickets" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-2 flex justify-center py-12">
                <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
              </div>
            ) : (
              <>
                <StatCard
                  label="Open tickets"
                  value={openCount}
                  icon={Clock}
                  iconStyle={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
                />
                <StatCard
                  label="Completed tickets"
                  value={completedCount}
                  icon={CheckCircle2}
                  iconStyle={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
                />
              </>
            )}
          </div>

          {/* Stage 23: location filter when studio user has multiple allowed locations */}
          {allowedStudios.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Location:</span>
              <button
                type="button"
                onClick={() => setLocationFilter('')}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: !locationFilter ? '#14b8a6' : 'transparent',
                  color: !locationFilter ? '#fff' : '#888888',
                  border: `1px solid ${!locationFilter ? '#14b8a6' : '#333333'}`,
                }}
              >
                All
              </button>
              {allowedStudios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setLocationFilter(s.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: locationFilter === s.id ? '#14b8a6' : 'transparent',
                    color: locationFilter === s.id ? '#fff' : '#888888',
                    border: `1px solid ${locationFilter === s.id ? '#14b8a6' : '#333333'}`,
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Recent activity */}
          <div className="rounded-xl p-5 space-y-4" style={panel}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                <Ticket className="h-4 w-4" style={{ color: '#14b8a6' }} />
                Recent activity
              </h2>
              <button
                type="button"
                onClick={() => router.push(viewAllHref)}
                className="text-sm font-medium transition-colors"
                style={{ color: '#14b8a6' }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
              >
                View all tickets
              </button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 rounded-full border-2 border-teal-500 border-t-transparent" />
              </div>
            ) : recentTickets.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: '#555555' }}>No recent tickets.</p>
            ) : (
              <div className="space-y-2">
                {recentTickets.map((t) => (
                  <RecentRow
                    key={t.id}
                    ticket={t}
                    onClick={() => router.push(`/tickets/${t.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
