'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, ArrowUp, ArrowDown, Trash2, CheckCircle2, XCircle, Plus,
} from 'lucide-react';
import { dispatchApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { POLISH_THEME } from '@/lib/polish';
import { DISPATCH_TRADE_TYPE_LABELS } from '@ticketing/types';
import { LocationLink } from '@/components/ui/LocationLink';

export default function DispatchGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');

  const { data: groupRes, isLoading } = useQuery({
    queryKey: ['dispatch-group', id],
    queryFn: () => dispatchApi.getGroup(id),
  });
  const group = groupRes?.data;

  const updateMut = useMutation({
    mutationFn: (data: { notes?: string; targetDate?: string; status?: string }) =>
      dispatchApi.updateGroup(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-group', id] }),
  });

  const removeMut = useMutation({
    mutationFn: (itemId: string) => dispatchApi.removeItem(id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-group', id] }),
  });

  const reorderMut = useMutation({
    mutationFn: (order: { itemId: string; stopOrder: number }[]) =>
      dispatchApi.reorderItems(id, order),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-group', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--color-bg-page)' }}>
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  if (!group) {
    return <div className="p-6" style={{ color: 'var(--color-text-muted)' }}>Group not found.</div>;
  }

  const isDraft = group.status === 'DRAFT';
  const items = group.items ?? [];

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[index], newItems[swapIdx]] = [newItems[swapIdx], newItems[index]];
    const order = newItems.map((item, i) => ({ itemId: item.id, stopOrder: i + 1 }));
    reorderMut.mutate(order);
  };

  const handleFinalize = () => updateMut.mutate({ status: 'READY_TO_SEND' });
  const handleCancel = () => {
    if (confirm('Cancel this dispatch group? Tickets will be released for future groups.')) {
      updateMut.mutate({ status: 'CANCELLED' });
    }
  };

  const handleSaveNotes = () => {
    updateMut.mutate({ notes: notesValue });
    setEditingNotes(false);
  };

  const statusColor =
    group.status === 'DRAFT' ? 'rgba(234,179,8,0.15)' :
    group.status === 'READY_TO_SEND' ? 'rgba(52,120,196,0.15)' :
    'rgba(148,163,184,0.2)';

  const statusLabel = group.status === 'READY_TO_SEND' ? 'Ready to Send' : group.status;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Dispatch Group" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-5">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dispatch')}>
            <ArrowLeft className="h-4 w-4" /> Back to Dispatch
          </Button>

          {/* Group header */}
          <div className="dashboard-card rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-panel)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {(DISPATCH_TRADE_TYPE_LABELS as any)[group.tradeType] ?? group.tradeType}
                </h1>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Created by {group.creator?.name ?? 'Unknown'}
                  {' · '}
                  {format(new Date(group.createdAt), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              <span
                className="text-xs font-semibold px-3 py-1 rounded-full"
                style={{ background: statusColor, color: 'var(--color-text-primary)' }}
              >
                {statusLabel}
              </span>
            </div>

            {group.targetDate && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                Target date: {format(new Date(group.targetDate), 'MMM d, yyyy')}
              </p>
            )}

            {/* Notes */}
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-default)' }}>
              {editingNotes && isDraft ? (
                <div className="space-y-2">
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={3}
                    className="w-full text-sm rounded-md p-2"
                    style={{ border: '1px solid var(--color-border-default)', background: 'var(--color-bg-page)', color: 'var(--color-text-primary)' }}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNotes} disabled={updateMut.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm" style={{ color: group.notes ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    {group.notes || 'No notes'}
                  </p>
                  {isDraft && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setNotesValue(group.notes ?? ''); setEditingNotes(true); }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3 pt-3 flex gap-2" style={{ borderTop: '1px solid var(--color-border-default)' }}>
              {isDraft && (
                <Button size="sm" onClick={handleFinalize} disabled={updateMut.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> Mark Ready to Send
                </Button>
              )}
              {(group.status === 'DRAFT' || group.status === 'READY_TO_SEND') && (
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={updateMut.isPending}>
                  <XCircle className="h-4 w-4" /> Cancel Group
                </Button>
              )}
            </div>
            {updateMut.isError && (
              <p className="text-xs text-red-500 mt-2">
                {(updateMut.error as any)?.response?.data?.message ?? 'Update failed'}
              </p>
            )}
          </div>

          {/* Item list */}
          <div className="dashboard-card rounded-xl p-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Tickets ({items.length})
              </h2>
            </div>

            {items.length === 0 ? (
              <p className="text-sm py-4" style={{ color: 'var(--color-text-muted)' }}>No tickets in this group.</p>
            ) : (
              <div className="space-y-1">
                {items.map((item: any, index: number) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-lg"
                    style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}
                  >
                    {/* Stop order */}
                    <span
                      className="text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0"
                      style={{ background: 'rgba(52,120,196,0.1)', color: POLISH_THEME.accent }}
                    >
                      {item.stopOrder}
                    </span>

                    {/* Ticket info */}
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => router.push(`/tickets/${item.ticket.id}`)}
                        className="text-sm font-medium truncate block text-left hover:underline"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {item.ticket.title}
                      </button>
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                        {item.ticket.studio?.id ? (
                          <LocationLink studioId={item.ticket.studio.id} studioName={item.ticket.studio.name} className="text-xs" />
                        ) : (
                          'No location'
                        )}
                        {item.ticket.studio?.formattedAddress ? ` · ${item.ticket.studio.formattedAddress}` : ''}
                      </span>
                    </div>

                    <StatusBadge status={item.ticket.status} />

                    {/* Reorder + remove controls (DRAFT only) */}
                    {isDraft && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveItem(index, 'up')}
                          disabled={index === 0 || reorderMut.isPending}
                          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(index, 'down')}
                          disabled={index === items.length - 1 || reorderMut.isPending}
                          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMut.mutate(item.id)}
                          disabled={removeMut.isPending}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
