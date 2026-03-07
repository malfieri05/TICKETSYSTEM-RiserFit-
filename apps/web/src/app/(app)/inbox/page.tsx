'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Inbox as InboxIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ticketsApi } from '@/lib/api';
import type { TicketFilters } from '@/types';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';

const PAGE_SIZE = 20;

export default function InboxPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const filters: TicketFilters = { actionableForMe: true, page, limit: PAGE_SIZE };

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', 'actionable', filters],
    queryFn: () => ticketsApi.list(filters),
  });

  const tickets = data?.data.data ?? [];
  const total = data?.data.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="Actionable" />

      <div className="flex-1 p-6 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: '#555555' }}>
            <InboxIcon className="h-10 w-10 mb-3" style={{ color: '#333333' }} />
            <p className="text-sm">No actionable tickets</p>
            <p className="text-xs mt-1" style={{ color: '#444444' }}>
              Tickets with READY subtasks assigned to you will appear here.
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            {tickets.map((ticket, i) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => router.push(`/tickets/${ticket.id}`)}
                className="w-full text-left flex flex-col gap-2 px-4 py-3 transition-colors"
                style={{
                  borderTop: i > 0 ? '1px solid #222222' : undefined,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#222222';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white truncate flex-1 min-w-0">{ticket.title}</span>
                  <StatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                </div>
                {ticket.readySubtasksSummary && ticket.readySubtasksSummary.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs font-medium" style={{ color: '#888888' }}>Ready:</span>
                    {ticket.readySubtasksSummary.map((s) => (
                      <span
                        key={s.id}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'rgba(20,184,166,0.15)', color: '#14b8a6' }}
                      >
                        {s.title}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs" style={{ color: '#555555' }}>
                  {ticket.owner && <span>Owner: {ticket.owner.displayName ?? ticket.owner.name ?? ticket.owner.email}</span>}
                  <span>{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                </div>
              </button>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3" style={{ borderTop: '1px solid #2a2a2a' }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="text-sm font-medium px-3 py-1 rounded disabled:opacity-50"
                  style={{ color: '#14b8a6' }}
                >
                  Previous
                </button>
                <span className="text-sm" style={{ color: '#888888' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="text-sm font-medium px-3 py-1 rounded disabled:opacity-50"
                  style={{ color: '#14b8a6' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
