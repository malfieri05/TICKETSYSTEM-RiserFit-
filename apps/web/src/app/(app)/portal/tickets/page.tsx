'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Search } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ticketsApi } from '@/lib/api';
import type { TicketFilters, TicketListItem } from '@/types';
import { Header } from '@/components/layout/Header';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { useAuth } from '@/hooks/useAuth';

const PAGE_SIZE = 20;

export default function PortalTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studioIdFromUrl = searchParams.get('studioId') ?? undefined;
  const { user } = useAuth();

  const [filters, setFilters] = useState<TicketFilters>(() => ({
    page: 1,
    limit: PAGE_SIZE,
    ...(studioIdFromUrl && { studioId: studioIdFromUrl }),
  }));
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const handleSelect = useCallback((id: string) => setSelectedId(id), []);
  const handleClose = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    if (studioIdFromUrl !== undefined) {
      setFilters((f) => ({ ...f, studioId: studioIdFromUrl || undefined, page: 1 }));
    }
  }, [studioIdFromUrl]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setFilters((f) => ({ ...f, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: scopeData } = useQuery({
    queryKey: ['scope-summary'],
    queryFn: () => ticketsApi.scopeSummary(),
  });
  const allowedStudios = scopeData?.data?.allowedStudios ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', 'portal-legacy', filters, debouncedSearch],
    queryFn: () => ticketsApi.list({ ...filters, search: debouncedSearch || undefined }),
  });

  const tickets: TicketListItem[] = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Location options: Stage 23 use allowedStudios when available; else derive from result set
  const { studioOptions, departmentOptions } = useMemo(() => {
    const departments = new Map<string, string>();
    tickets.forEach((t) => {
      const dept = (t as TicketListItem & { department?: { id: string; name: string } }).department;
      if (dept?.id && dept?.name) departments.set(dept.id, dept.name);
    });
    const studioOptionsFromAllowed =
      allowedStudios.length > 0
        ? allowedStudios.map((s) => ({ id: s.id, name: s.name }))
        : [];
    const studiosFromTickets = new Map<string, string>();
    tickets.forEach((t) => {
      if (t.studio?.id && t.studio?.name) studiosFromTickets.set(t.studio.id, t.studio.name);
    });
    const studioOptionsFromTickets = Array.from(studiosFromTickets.entries()).map(([id, name]) => ({ id, name }));
    return {
      studioOptions: studioOptionsFromAllowed.length > 0 ? studioOptionsFromAllowed : studioOptionsFromTickets,
      departmentOptions: Array.from(departments.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [tickets, allowedStudios]);

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

  // Legacy route alignment: redirect to modern portal views
  if (user) {
    if (user.role === 'STUDIO_USER') {
      if (studioIdFromUrl) {
        router.replace(`/portal?tab=studio&studioId=${studioIdFromUrl}`);
      } else {
        router.replace('/portal?tab=my');
      }
    } else {
      router.replace('/tickets');
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="My Tickets" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/portal')}>
            ← Back to dashboard
          </Button>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
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
            <ComboBox
              placeholder="All departments"
              options={departmentOptions.map((d) => ({ value: d.id, label: d.name }))}
              value={filters.departmentId ?? ''}
              onChange={(v) => setFilter('departmentId', v)}
              className="w-44"
            />
            <ComboBox
              placeholder="All locations"
              options={studioOptions.map((s) => ({ value: s.id, label: s.name }))}
              value={filters.studioId ?? ''}
              onChange={(v) => setFilter('studioId', v)}
              className="w-44"
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'var(--color-text-muted)' }}>
                {hasActiveFilters ? (
                  <>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets found</p>
                    <p className="text-xs text-center">Try adjusting your filters.</p>
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">No tickets yet</p>
                    <p className="text-xs text-center max-w-sm">Tickets you've requested will appear here.</p>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-surface-raised)' }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Topic / Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Title</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Location</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const topicLabel = ticket.supportTopic?.name ?? ticket.maintenanceCategory?.name ?? '—';
                    const commentCount = ticket._count?.comments ?? 0;
                    const requesterName =
                      (ticket.requester as { displayName?: string; name?: string }).displayName ??
                      (ticket.requester as { displayName?: string; name?: string }).name ??
                      '—';
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => router.push(`/tickets/${ticket.id}`)}
                        className="cursor-pointer transition-colors hover:bg-[var(--color-bg-surface)]"
                        style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                      >
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{topicLabel}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                          {format(new Date(ticket.createdAt), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-[var(--color-text-primary)] line-clamp-1">{ticket.title}</span>
                          <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <span>{requesterName}</span>
                            {commentCount > 0 && (
                              <span className="flex items-center gap-1">
                                <MessageCircle className="h-3 w-3" />
                                <span className="tabular-nums">{commentCount}</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {ticket.studio?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={ticket.status} /></td>
                        <td className="px-4 py-3">
                          <PriorityBadge
                            priority={ticket.priority}
                            muted={['RESOLVED', 'CLOSED'].includes(ticket.status)}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
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
      <TicketDrawer ticketId={selectedId} onClose={handleClose} />
    </div>
  );
}
