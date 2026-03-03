'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ticketsApi, adminApi, usersApi } from '@/lib/api';
import type { TicketFilters, TicketStatus, TicketPriority } from '@/types';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { SlaBadge } from '@/components/ui/SlaBadge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';

const PAGE_SIZE = 20;

type ViewTab = 'active' | 'completed';

const ACTIVE_STATUSES: TicketStatus[] = ['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR'];
const COMPLETED_STATUSES: TicketStatus[] = ['RESOLVED', 'CLOSED'];

export default function TicketsPage() {
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [filters, setFilters] = useState<TicketFilters>({ page: 1, limit: PAGE_SIZE });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Debounce search input — fires query 300ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setFilters((f) => ({ ...f, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', filters, viewTab, debouncedSearch],
    queryFn: () => ticketsApi.list({ ...filters, search: debouncedSearch || undefined }),
  });

  const allTickets = data?.data.data ?? [];

  // Categories for filter dropdown
  const { data: categoriesRes } = useQuery({
    queryKey: ['categories'],
    queryFn: () => adminApi.listCategories(),
  });
  const categories = categoriesRes?.data ?? [];

  // Departments (teams) derived from users list
  const { data: usersRes } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });
  const users = usersRes?.data ?? [];
  const departments = Array.from(
    new Map(
      users
        .filter((u) => u.teamId && u.teamName)
        .map((u) => [u.teamId as string, u.teamName as string]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const usersById = new Map(users.map((u) => [u.id, u]));

  // Live counts for Active / Completed tabs based on the currently loaded set.
  // This automatically respects search + filter controls and updates as results change.
  const matchesDepartment = (ticket: typeof allTickets[number]) => {
    if (!filters.teamId) return true;
    const requester = usersById.get(ticket.requester.id);
    const owner = ticket.owner ? usersById.get(ticket.owner.id) : undefined;
    return (
      (requester?.teamId && requester.teamId === filters.teamId) ||
      (owner?.teamId && owner.teamId === filters.teamId)
    );
  };

  const ticketsByDept = allTickets.filter(matchesDepartment);

  const activeCount = ticketsByDept.filter((t) => ACTIVE_STATUSES.includes(t.status as TicketStatus)).length;
  const completedCount = ticketsByDept.filter((t) => COMPLETED_STATUSES.includes(t.status as TicketStatus)).length;

  const tickets = ticketsByDept.filter((t) =>
    filters.status
      ? true // if user picked a specific status from dropdown, don't override
      : viewTab === 'active'
        ? ACTIVE_STATUSES.includes(t.status as TicketStatus)
        : COMPLETED_STATUSES.includes(t.status as TicketStatus),
  );
  const total = data?.data.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const setFilter = (key: keyof TicketFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Tickets" />

      {/* Sub-category tabs */}
      <div className="flex items-center gap-1 px-6 py-2.5" style={{ background: '#0a0a0a', borderBottom: '1px solid #1e1e1e' }}>
        {([
          { key: 'active' as ViewTab, label: 'Active', count: activeCount },
          { key: 'completed' as ViewTab, label: 'Completed', count: completedCount },
        ]).map(({ key, label, count }) => {
          const active = viewTab === key;
          return (
            <button
              key={key}
              onClick={() => { setViewTab(key); setFilters((f) => ({ ...f, status: undefined, page: 1 })); setSelectedId(null); }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? '#1e1e1e' : 'transparent',
                color: active ? '#f0f0f0' : '#666666',
                border: active ? '1px solid #2a2a2a' : '1px solid transparent',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#aaaaaa'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#666666'; }}
            >
              {label}
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: active ? '#2a2a2a' : '#1a1a1a',
                  color: active ? '#e0e0e0' : '#555555',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 p-6 space-y-4" style={{ background: '#000000' }}>
        {/* Filters bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#555555' }} />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9"
            />
          </div>

          <Select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)} className="w-44">
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="TRIAGED">Triaged</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="WAITING_ON_REQUESTER">Waiting: Requester</option>
            <option value="WAITING_ON_VENDOR">Waiting: Vendor</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>

          <Select value={filters.priority ?? ''} onChange={(e) => setFilter('priority', e.target.value)} className="w-36">
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>

          <Select
            value={filters.categoryId ?? ''}
            onChange={(e) => setFilter('categoryId', e.target.value)}
            className="w-48"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            value={filters.teamId ?? ''}
            onChange={(e) => setFilter('teamId', e.target.value)}
            className="w-48"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>

          {(filters.status || filters.priority || filters.categoryId || filters.teamId || filters.search) && (
            <Button variant="ghost" size="md" onClick={() => { setFilters({ page: 1, limit: PAGE_SIZE }); setSearch(''); }}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48" style={{ color: '#555555' }}>
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
                <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Date Created</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Due Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Requester</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Owner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid #222222',
                      background: selectedId === ticket.id ? '#1e2a1e' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (selectedId !== ticket.id) e.currentTarget.style.background = '#222222'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = selectedId === ticket.id ? '#1e2a1e' : 'transparent'; }}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-100 line-clamp-1">{ticket.title}</span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#aaaaaa' }}>
                      {format(new Date(ticket.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={ticket.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={ticket.priority} muted={COMPLETED_STATUSES.includes(ticket.status as TicketStatus)} /></td>
                    <td className="px-4 py-3">
                      {ticket.sla && ticket.sla.status !== 'RESOLVED'
                        ? <SlaBadge sla={ticket.sla} showTime />
                        : <span style={{ color: '#444444' }}>—</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#777777' }}>{ticket.requester.displayName}</td>
                    <td className="px-4 py-3" style={{ color: '#777777' }}>{ticket.owner?.displayName ?? '—'}</td>
                    <td className="px-4 py-3" style={{ color: '#777777' }}>{ticket.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#555555' }}>
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
            <p className="text-sm" style={{ color: '#555555' }}>
              Showing {((filters.page ?? 1) - 1) * PAGE_SIZE + 1}–{Math.min((filters.page ?? 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={(filters.page ?? 1) <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={(filters.page ?? 1) >= totalPages} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-in drawer */}
      <TicketDrawer ticketId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
