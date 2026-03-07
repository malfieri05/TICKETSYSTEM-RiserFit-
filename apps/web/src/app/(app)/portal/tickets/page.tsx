'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ticketsApi } from '@/lib/api';
import type { TicketFilters, TicketStatus, TicketListItem } from '@/types';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

const PAGE_SIZE = 20;

export default function PortalTicketsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<TicketFilters>({ page: 1, limit: PAGE_SIZE });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setFilters((f) => ({ ...f, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', filters, debouncedSearch],
    queryFn: () => ticketsApi.list({ ...filters, search: debouncedSearch || undefined }),
  });

  const tickets: TicketListItem[] = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Derive studio and department options from current result set (for filter dropdowns)
  const { studioOptions, departmentOptions } = useMemo(() => {
    const studios = new Map<string, string>();
    const departments = new Map<string, string>();
    tickets.forEach((t) => {
      if (t.studio?.id && t.studio?.name) studios.set(t.studio.id, t.studio.name);
      const dept = (t as TicketListItem & { department?: { id: string; name: string } }).department;
      if (dept?.id && dept?.name) departments.set(dept.id, dept.name);
    });
    return {
      studioOptions: Array.from(studios.entries()).map(([id, name]) => ({ id, name })),
      departmentOptions: Array.from(departments.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [tickets]);

  const setFilter = (key: keyof TicketFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFilters({ page: 1, limit: PAGE_SIZE });
  };

  const hasActiveFilters =
    filters.status || filters.studioId || filters.departmentId || debouncedSearch;

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="My Tickets" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/portal')}>
            ← Back to dashboard
          </Button>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#555555' }} />
              <Input
                placeholder="Search tickets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 pl-9"
              />
            </div>
            <Select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)} className="w-40">
              <option value="">All statuses</option>
              <option value="NEW">New</option>
              <option value="TRIAGED">Triaged</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING_ON_REQUESTER">Waiting: Requester</option>
              <option value="WAITING_ON_VENDOR">Waiting: Vendor</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <Select value={filters.departmentId ?? ''} onChange={(e) => setFilter('departmentId', e.target.value)} className="w-44">
              <option value="">All departments</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
            <Select value={filters.studioId ?? ''} onChange={(e) => setFilter('studioId', e.target.value)} className="w-44">
              <option value="">All locations</option>
              {studioOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            {isLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48" style={{ color: '#555555' }}>
                <p className="text-sm">No tickets found</p>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Title</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Location</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => router.push(`/tickets/${ticket.id}`)}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid #222222' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#222222')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-100 line-clamp-1">{ticket.title}</span>
                        <span className="block text-xs mt-0.5" style={{ color: '#555555' }}>
                          {(ticket.requester as { displayName?: string; name?: string }).displayName ??
                            (ticket.requester as { displayName?: string; name?: string }).name ??
                            '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#888888' }}>
                        {ticket.studio?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={ticket.status} /></td>
                      <td className="px-4 py-3">
                        <PriorityBadge
                          priority={ticket.priority}
                          muted={['RESOLVED', 'CLOSED'].includes(ticket.status)}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#555555' }}>
                        {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: '#555555' }}>
                Showing {((filters.page ?? 1) - 1) * PAGE_SIZE + 1}–{Math.min((filters.page ?? 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={(filters.page ?? 1) >= totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
