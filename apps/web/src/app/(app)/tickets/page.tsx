'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ticketsApi } from '@/lib/api';
import type { TicketFilters, TicketStatus, TicketPriority } from '@/types';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

const PAGE_SIZE = 20;

export default function TicketsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [filters, setFilters] = useState<TicketFilters>({ page: 1, limit: PAGE_SIZE });
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => ticketsApi.list({ ...filters, search: search || undefined }),
  });

  const tickets = data?.data.data ?? [];
  const total = data?.data.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const setFilter = (key: keyof TicketFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, search: search || undefined, page: 1 }));
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Tickets"
        action={
          <Button size="sm" onClick={() => router.push('/tickets/new')}>
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Filters bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Button type="submit" variant="secondary" size="md">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          <Select
            value={filters.status ?? ''}
            onChange={(e) => setFilter('status', e.target.value)}
            className="w-44"
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="TRIAGED">Triaged</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="WAITING_ON_REQUESTER">Waiting: Requester</option>
            <option value="WAITING_ON_VENDOR">Waiting: Vendor</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>

          <Select
            value={filters.priority ?? ''}
            onChange={(e) => setFilter('priority', e.target.value)}
            className="w-36"
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>

          {(user?.role === 'ADMIN' || user?.role === 'AGENT') && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => setFilters((f) => ({ ...f, ownerId: f.ownerId ? undefined : user?.id, page: 1 }))}
              className={filters.ownerId ? 'bg-indigo-50 text-indigo-700' : ''}
            >
              <Filter className="h-4 w-4" />
              {filters.ownerId ? 'My tickets' : 'Mine'}
            </Button>
          )}

          {(filters.status || filters.priority || filters.search || filters.ownerId) && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => { setFilters({ page: 1, limit: PAGE_SIZE }); setSearch(''); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <p className="text-sm">No tickets found</p>
              {Object.keys(filters).some((k) => k !== 'page' && k !== 'limit' && filters[k as keyof TicketFilters]) && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setFilters({ page: 1, limit: PAGE_SIZE }); setSearch(''); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Requester</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 line-clamp-1">{ticket.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{ticket.requester.displayName}</td>
                    <td className="px-4 py-3 text-gray-600">{ticket.owner?.displayName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{ticket.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
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
  );
}
