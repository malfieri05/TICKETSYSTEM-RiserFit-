'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  X, MessageSquare, CheckSquare,
  Clock, Plus, User,
} from 'lucide-react';
import { ticketsApi, subtasksApi, invalidateTicketLists } from '@/lib/api';
import type { SubtaskStatus } from '@/types';
import { SubtaskStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { TicketAttachmentsSection } from '@/components/tickets/TicketAttachmentsSection';
import { CommentThread } from '@/components/tickets/CommentThread';

interface Props {
  ticketId: string | null;
  onClose: () => void;
}

export function TicketDrawer({ ticketId, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const open = !!ticketId;

  const [activeTab, setActiveTab] = useState<'subtasks' | 'comments' | 'submission' | 'history'>('subtasks');
  const [newSubtask, setNewSubtask] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab('subtasks');
    setNewSubtask('');
  }, [ticketId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data: ticketRes, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => ticketsApi.get(ticketId!),
    enabled: !!ticketId,
  });
  const ticket = ticketRes?.data;

  const { data: historyRes } = useQuery({
    queryKey: ['ticket', ticketId, 'history'],
    queryFn: () => ticketsApi.history(ticketId!),
    enabled: !!ticketId && activeTab === 'history',
  });


  const subtaskMut    = useMutation({
    mutationFn: () => subtasksApi.create(ticketId!, { title: newSubtask }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      invalidateTicketLists(qc);
      setNewSubtask('');
    },
  });
  const subtaskStMut = useMutation({
    mutationFn: ({ subtaskId, status }: { subtaskId: string; status: SubtaskStatus }) =>
      subtasksApi.update(ticketId!, subtaskId, { status }),
    onMutate: async ({ subtaskId, status: newStatus }) => {
      await qc.cancelQueries({ queryKey: ['ticket', ticketId] });
      const prev = qc.getQueryData<{ data: { subtasks: { id: string; status: string }[] } }>(['ticket', ticketId]);
      qc.setQueryData(['ticket', ticketId], (old: typeof prev) => {
        if (!old?.data?.subtasks) return old;
        return {
          ...old,
          data: {
            ...old.data,
            subtasks: old.data.subtasks.map((s) =>
              s.id === subtaskId ? { ...s, status: newStatus } : s,
            ),
          },
        };
      });
      return { prev };
    },
    onError: (_err, _v, context) => {
      if (context?.prev) qc.setQueryData(['ticket', ticketId], context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      invalidateTicketLists(qc);
    },
  });
  const canManage = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const formResponses = (ticket as { formResponses?: { fieldKey: string; value: string }[] })?.formResponses ?? [];

  const TABS = [
    { key: 'subtasks' as const,   label: `Subtasks${ticket ? ` (${ticket.subtasks.length})` : ''}`, icon: CheckSquare },
    { key: 'comments' as const,  label: `Comments${ticket ? ` (${(ticket.comments ?? []).reduce((n: number, c: any) => n + 1 + (c.replies?.length ?? 0), 0)})` : ''}`,  icon: MessageSquare },
    { key: 'submission' as const, label: 'Ticket Submission', icon: User },
    { key: 'history' as const,    label: 'History',         icon: Clock },
  ];

  return (
      /* Drawer — no backdrop so the ticket list stays fully interactive */
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col transition-transform duration-300 ease-out"
        style={{
          width: 'min(920px, 76vw)',
          background: 'var(--color-bg-surface-raised)',
          borderLeft: `1px solid ${POLISH_THEME.listBorder}`,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          boxShadow: open ? 'var(--shadow-raised)' : 'none',
        }}
      >
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-end px-6 h-12 shrink-0"
          style={{ background: 'var(--color-bg-surface)', borderBottom: `1px solid ${POLISH_THEME.innerBorder}` }}
        >
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--color-bg-surface-raised)' }}>
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
          </div>
        )}

        {/* ── Main content ────────────────────────────────────────────────── */}
        {ticket && !isLoading && (
          <div className="flex-1 overflow-hidden flex">

            {/* ── Left: main column ──────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--color-bg-surface)' }}>

              {/* Header: title, created, requester, location, progress, ticket # */}
              <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                <h2 className="text-xl font-bold leading-snug" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                  {ticket.title}
                </h2>
                <p className="text-sm mt-1.5" style={{ color: POLISH_THEME.metaSecondary }}>
                  Created {format(new Date(ticket.createdAt), 'MMM d')} · Requested by {ticket.requester?.displayName ?? '—'}
                </p>
                {(ticket.studio?.name ?? ticket.market?.name) && (
                  <p className="text-sm mt-0.5" style={{ color: POLISH_THEME.metaDim }}>
                    {[ticket.studio?.name, ticket.market?.name].filter(Boolean).join(' · ')}
                  </p>
                )}
                {(() => {
                  const total = ticket.subtasks?.length ?? 0;
                  const done = ticket.subtasks?.filter((s: { status: string }) => s.status === 'DONE' || s.status === 'SKIPPED').length ?? 0;
                  return (
                    <p className="text-sm mt-1" style={{ color: POLISH_THEME.metaDim }}>
                      Progress {done} / {total}
                    </p>
                  );
                })()}
                <button
                  type="button"
                  className="text-xs mt-2 flex items-center gap-1 group cursor-pointer"
                  style={{ color: POLISH_THEME.metaMuted }}
                  title="Copy ticket ID to clipboard"
                  onClick={() => {
                    const id = ticket.id ?? ticketId ?? '';
                    navigator.clipboard.writeText(id).catch(() => {});
                  }}
                >
                  <span>Ticket #{ticket.id?.slice(0, 8) ?? ticketId?.slice(0, 8)}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity">
                    <path d="M10.5 2.5h-6A1.5 1.5 0 0 0 3 4v8a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 12 12V4a1.5 1.5 0 0 0-1.5-1.5Z"/>
                    <path d="M12.5 1h-6A1.5 1.5 0 0 0 5 2.5V3h5.5A1.5 1.5 0 0 1 12 4.5V11h.5A1.5 1.5 0 0 0 14 9.5v-7A1.5 1.5 0 0 0 12.5 1Z"/>
                  </svg>
                </button>
              </div>

              {/* Tab bar — pill-style, sticky on scroll */}
              <div className="sticky top-0 z-10 px-6 shrink-0" style={{ background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-default)' }}>
                <nav className="flex gap-1 py-2">
                  {TABS.map(({ key, label, icon: Icon }) => {
                    const active = activeTab === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{
                          background: active ? 'var(--color-bg-surface-raised)' : 'transparent',
                          color: active ? POLISH_THEME.accent : 'var(--color-text-muted)',
                          border: active ? `1px solid ${POLISH_THEME.listBorder}` : '1px solid transparent',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Scrollable tab content */}
              <div className={`flex-1 overflow-y-auto px-6 py-5 ${POLISH_CLASS.sectionGap}`}>

                {/* ── Comments ── */}
                {activeTab === 'comments' && (
                  <CommentThread
                    ticketId={ticketId!}
                    comments={ticket.comments ?? []}
                  />
                )}

                {/* ── Subtasks ── */}
                {activeTab === 'subtasks' && (
                  <>
                    {/* Progress header */}
                    <div className="rounded-xl px-3.5 py-3 mb-2 flex items-center justify-between" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                      {(() => {
                        const total = ticket.subtasks.length;
                        const done = ticket.subtasks.filter((s) => s.status === 'DONE').length;
                        const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                        return (
                          <>
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-muted)' }}>
                                Subtask Progress
                              </span>
                              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                {done} of {total} complete
                              </span>
                            </div>
                            <div className="flex items-center gap-3 w-52">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${percent}%`,
                                    background:
                                      percent === 100
                                        ? 'linear-gradient(90deg,#16a34a,#15803d)'
                                        : 'linear-gradient(90deg,#16a34a,#22c55e)',
                                  }}
                                />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                                {percent}%
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    {ticket.subtasks.length === 0 && (
                      <p className="text-sm text-center py-10" style={{ color: POLISH_THEME.metaDim }}>No subtasks yet.</p>
                    )}
                    {ticket.subtasks.map((s) => (
                      <div key={s.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.innerBorder}` }}>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: s.status === 'DONE' ? 'var(--color-text-muted)' : 'var(--color-text-primary)', textDecoration: s.status === 'DONE' ? 'line-through' : 'none' }}
                          >
                            {s.title}
                          </p>
                          {s.owner && (
                            <p className="text-xs mt-0.5" style={{ color: POLISH_THEME.metaDim }}>
                              <User className="inline h-3 w-3 mr-1" />{s.owner.name}
                            </p>
                          )}
                        </div>
                        <SubtaskStatusBadge status={s.status} />
                        {canManage && (
                          <Select value={s.status} onChange={(e) => subtaskStMut.mutate({ subtaskId: s.id, status: e.target.value as SubtaskStatus })} className="w-32 text-xs">
                            <option value="READY">Ready</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="DONE">Done</option>
                            <option value="SKIPPED">Skipped</option>
                          </Select>
                        )}
                      </div>
                    ))}
                    {canManage && (
                      <div className="rounded-xl p-3 flex gap-2" style={{ background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.innerBorder}` }}>
                        <Input
                          placeholder="Add a subtask…"
                          value={newSubtask}
                          onChange={(e) => setNewSubtask(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && newSubtask.trim() && subtaskMut.mutate()}
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => subtaskMut.mutate()} disabled={!newSubtask.trim()} loading={subtaskMut.isPending}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* ── Ticket Submission (form data + attachments) ── */}
                {activeTab === 'submission' && (
                  <>
                    {/* Read-only form data */}
                    <div className="rounded-xl overflow-hidden space-y-1" style={{ background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.innerBorder}` }}>
                      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${POLISH_THEME.innerBorder}` }}>
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: POLISH_THEME.metaDim }}>Submission data</span>
                      </div>
                      {formResponses.length === 0 && (
                        <p className="px-4 py-6 text-sm" style={{ color: POLISH_THEME.metaDim }}>No form data.</p>
                      )}
                      {formResponses.map((r) => (
                        <div key={r.fieldKey} className="grid grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)] gap-x-4 gap-y-0.5 px-4 py-3 items-baseline" style={{ borderTop: `1px solid ${POLISH_THEME.rowBorder}` }}>
                          <dt className="text-sm break-words" style={{ color: POLISH_THEME.metaDim }}>{r.fieldKey}</dt>
                          <dd className="text-sm min-w-0 break-words" style={{ color: 'var(--color-text-primary)' }}>{r.value ?? '—'}</dd>
                        </div>
                      ))}
                    </div>
                    {/* Attachments section */}
                    <TicketAttachmentsSection ticketId={ticketId!} canManage={canManage} variant="drawer" />
                  </>
                )}

                {/* ── History ── */}
                {activeTab === 'history' && (
                  <div className="space-y-1">
                    {(historyRes?.data ?? []).length === 0 && (
                      <p className="text-sm text-center py-10" style={{ color: POLISH_THEME.metaDim }}>No history yet.</p>
                    )}
                    {(historyRes?.data ?? []).map((entry) => (
                      <div key={entry.id} className="flex gap-3 py-2 text-sm" style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}` }}>
                        <div className="mt-2 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--color-text-muted)' }} />
                        <div>
                          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{entry.actor?.displayName ?? 'System'}</span>
                          {' '}
                          <span style={{ color: 'var(--color-text-secondary)' }}>{entry.action.toLowerCase().replace(/_/g, ' ')}</span>
                          <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {format(new Date(entry.createdAt), 'MMM d, yyyy · h:mm a')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
