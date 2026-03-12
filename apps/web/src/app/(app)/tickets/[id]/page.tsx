'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, MessageSquare, CheckSquare, Clock,
  Plus, User, CheckCircle2,
} from 'lucide-react';
import { ticketsApi, subtasksApi, usersApi, invalidateTicketLists } from '@/lib/api';
import type { TicketStatus, SubtaskStatus } from '@/types';
import { Header } from '@/components/layout/Header';
import { SubtaskStatusBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { TicketAttachmentsSection } from '@/components/tickets/TicketAttachmentsSection';
import { CommentThread } from '@/components/tickets/CommentThread';

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['TRIAGED', 'CLOSED'],
  TRIAGED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR', 'RESOLVED'],
  WAITING_ON_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  WAITING_ON_VENDOR: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

// Reusable panel style (theme tokens)
const panel = { background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.listBorder}` };
const panelSection = { borderTop: `1px solid ${POLISH_THEME.listBorder}` };

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [newSubtask, setNewSubtask] = useState('');
  const [activeTab, setActiveTab] = useState<'subtasks' | 'comments' | 'submission' | 'history'>('subtasks');
  const [completionToast, setCompletionToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const { data: ticketRes, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(id),
  });
  const ticket = ticketRes?.data;

  // Stage 6: deep link to subtask from #subtask-xxx or ?subtask=xxx
  useEffect(() => {
    if (!ticket) return;
    const fromQuery = searchParams.get('subtask');
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const fromHash = hash.startsWith('#subtask-') ? hash.slice('#subtask-'.length) : null;
    const subtaskId = fromQuery ?? fromHash;
    if (!subtaskId) return;
    const hasSubtask = ticket.subtasks.some((s) => s.id === subtaskId);
    if (!hasSubtask) return;
    setActiveTab('subtasks');
    const scrollToSubtask = () => {
      const el = document.getElementById(`subtask-${subtaskId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    const t = setTimeout(scrollToSubtask, 100);
    return () => clearTimeout(t);
  }, [ticket, searchParams]);

  const { data: subtasksListRes } = useQuery({
    queryKey: ['ticket', id, 'subtasks'],
    queryFn: () => subtasksApi.list(id),
    enabled: activeTab === 'subtasks' && !!id,
  });
  const subtasksList = subtasksListRes?.data ?? null;

  const { data: historyRes } = useQuery({
    queryKey: ['ticket', id, 'history'],
    queryFn: () => ticketsApi.history(id),
    enabled: activeTab === 'history',
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER',
  });
  const agents = (usersData?.data ?? []).filter((u) => u.role === 'DEPARTMENT_USER' || u.role === 'ADMIN');

  const transitionMut = useMutation({
    mutationFn: (status: TicketStatus) => ticketsApi.transition(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      invalidateTicketLists(qc);
    },
  });

  const assignMut = useMutation({
    mutationFn: (ownerId: string) => ticketsApi.assign(id, ownerId || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      invalidateTicketLists(qc);
    },
  });

  const subtaskMut = useMutation({
    mutationFn: () => subtasksApi.create(id, { title: newSubtask }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['ticket', id, 'subtasks'] });
      invalidateTicketLists(qc);
      setNewSubtask('');
    },
  });

  const subtaskStatusMut = useMutation({
    mutationFn: ({ subtaskId, status }: { subtaskId: string; status: SubtaskStatus }) =>
      subtasksApi.update(id, subtaskId, { status }),
    onMutate: async ({ subtaskId, status: newStatus }) => {
      await qc.cancelQueries({ queryKey: ['ticket', id] });
      const prev = qc.getQueryData<{ data: { subtasks: { id: string; status: string }[] } }>(['ticket', id]);
      qc.setQueryData(['ticket', id], (old: typeof prev) => {
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
      qc.setQueryData(['ticket', id, 'subtasks'], (old: { data: { id: string; status: string }[] } | undefined) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((s) => (s.id === subtaskId ? { ...s, status: newStatus } : s)),
        };
      });
      return { prev };
    },
    onError: (_err, _v, context) => {
      if (context?.prev) qc.setQueryData(['ticket', id], context.prev);
    },
    onSuccess: () => {
      const cached = qc.getQueryData<{ data: { subtasks: { id: string; status: string }[] } }>(['ticket', id]);
      const all = cached?.data?.subtasks;
      if (all && all.length > 0 && all.every((s) => s.status === 'DONE' || s.status === 'SKIPPED')) {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setCompletionToast(true);
        toastTimer.current = setTimeout(() => setCompletionToast(false), 4000);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['ticket', id, 'subtasks'] });
      invalidateTicketLists(qc);
    },
  });

  const watchMut = useMutation({
    mutationFn: () => ticketsApi.watch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const unwatchMut = useMutation({
    mutationFn: () => ticketsApi.unwatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--color-bg-page)' }}>
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  if (!ticket) {
    return <div className="p-6" style={{ color: 'var(--color-text-muted)' }}>Ticket not found.</div>;
  }

  const canManage = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const isStudioUser = user?.role === 'STUDIO_USER';
  const validTransitions = VALID_TRANSITIONS[ticket.status];
  const isWatching = ticket.watchers.some((w) => w.userId === user?.id);
  const threadedComments = ticket.comments ?? [];

  const subtaskDone = (ticket.subtasks ?? []).filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length;
  const subtaskTotal = (ticket.subtasks ?? []).length;
  const formResponses = (ticket as { formResponses?: { fieldKey: string; value: string }[] }).formResponses ?? [];

  return (
    <div className="flex flex-col h-full relative" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Ticket" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-5">
          <Button variant="ghost" size="sm" onClick={() => router.push(isStudioUser ? '/portal' : '/tickets')}>
            <ArrowLeft className="h-4 w-4" />
            {isStudioUser ? 'Back to My Tickets' : 'Back to tickets'}
          </Button>

          {/* Panel header — title primary, ID + status secondary, metadata tertiary, progress inline */}
          <div className="rounded-xl p-5" style={{ ...panel, boxShadow: 'var(--shadow-panel)' }}>
            {/* Primary: title */}
            <h1 className="text-xl font-semibold leading-snug" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              {ticket.title}
            </h1>

            {/* Secondary: ticket ID (prominent) + status badge */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <button
                type="button"
                className="flex items-center gap-1 group"
                title="Copy ticket ID to clipboard"
                onClick={() => { navigator.clipboard.writeText(ticket.id).catch(() => {}); }}
              >
                <span
                  className="text-xs font-mono px-1.5 py-0.5 rounded"
                  style={{
                    color: POLISH_THEME.accent,
                    background: 'rgba(52,120,196,0.1)',
                    border: '1px solid rgba(52,120,196,0.2)',
                  }}
                >
                  #{ticket.id.slice(0, 8)}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" style={{ color: POLISH_THEME.metaDim }}>
                  <path d="M10.5 2.5h-6A1.5 1.5 0 0 0 3 4v8a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 12 12V4a1.5 1.5 0 0 0-1.5-1.5Z"/>
                  <path d="M12.5 1h-6A1.5 1.5 0 0 0 5 2.5V3h5.5A1.5 1.5 0 0 1 12 4.5V11h.5A1.5 1.5 0 0 0 14 9.5v-7A1.5 1.5 0 0 0 12.5 1Z"/>
                </svg>
              </button>
              <StatusBadge status={ticket.status} />
            </div>

            {/* Tertiary: created, requester, location */}
            <p className="text-xs mt-2" style={{ color: POLISH_THEME.metaSecondary }}>
              Created {format(new Date(ticket.createdAt), 'MMM d, yyyy')}
              {` · Requested by ${ticket.requester.displayName}`}
              {(ticket as { studio?: { name: string } }).studio?.name
                ? ` · ${(ticket as { studio: { name: string } }).studio.name}`
                : ''}
            </p>

            {/* Progress inline bar */}
            {subtaskTotal > 0 && (
              <div className="flex items-center gap-2 mt-2.5">
                <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${subtaskTotal === 0 ? 0 : Math.round((subtaskDone / subtaskTotal) * 100)}%`,
                      background: POLISH_THEME.progressGreen,
                    }}
                  />
                </div>
                <span className="text-xs tabular-nums" style={{ color: POLISH_THEME.metaDim }}>
                  {subtaskDone}/{subtaskTotal} subtasks
                </span>
              </div>
            )}
          </div>

          {/* Tabs: Subtasks, Comments, Ticket Submission, History — sticky on scroll */}
          <div className="sticky top-0 z-10" style={{ background: 'var(--color-bg-page)', borderBottom: `1px solid ${POLISH_THEME.listBorder}` }}>
            <nav className="flex gap-6">
              {(['subtasks', 'comments', 'submission', 'history'] as const).map((tab) => {
                const icons = {
                  subtasks: <CheckSquare className="h-4 w-4" />,
                  comments: <MessageSquare className="h-4 w-4" />,
                  submission: <User className="h-4 w-4" />,
                  history: <Clock className="h-4 w-4" />,
                };
                const labels = {
                  subtasks: `Subtasks (${ticket.subtasks?.length ?? 0})`,
                  comments: `Comments (${threadedComments.reduce((n: number, c: any) => n + 1 + (c.replies?.length ?? 0), 0)})`,
                  submission: 'Ticket Submission',
                  history: 'History',
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="pb-3 text-sm font-medium border-b-2 transition-colors"
                    style={{
                      borderBottomColor: activeTab === tab ? POLISH_THEME.accent : 'transparent',
                      color: activeTab === tab ? POLISH_THEME.accent : POLISH_THEME.metaMuted,
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {icons[tab]}
                      {labels[tab]}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

            {/* Tab content with slide-in animation; key forces remount on tab change */}
            <div key={activeTab} style={{ animation: 'tabSlideIn 220ms ease-out' }}>

            {/* ── Conversation (Updates & Replies) ─── */}
            {activeTab === 'comments' && (
              <div className={POLISH_CLASS.sectionGap}>
                <CommentThread
                  ticketId={id}
                  comments={threadedComments}
                  isStudioUser={isStudioUser}
                />
              </div>
            )}

            {/* ── Subtasks (Workflow Progress) ─── */}
            {activeTab === 'subtasks' && (
              <div className={POLISH_CLASS.sectionGap}>
                {/* Progress header */}
                <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--color-bg-surface)', border: `1px solid ${POLISH_THEME.innerBorder}` }}>
                  {(() => {
                    const list = subtasksList ?? ticket.subtasks;
                    const total = list.length;
                    const done = list.filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length;
                    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                    return (
                      <>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                            Workflow Progress
                          </span>
                          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                            {done} of {total} complete
                          </span>
                        </div>
                        <div className="flex items-center gap-3 w-64">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${percent}%`,
                                background: POLISH_THEME.progressGreen,
                              }}
                            />
                          </div>
                          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                            {percent}%
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {(subtasksList ?? ticket.subtasks).length === 0 && (
                  <p className="text-sm text-center py-6" style={{ color: POLISH_THEME.theadText }}>No subtasks yet.</p>
                )}
                {(subtasksList ?? ticket.subtasks).map((subtask) => (
                  <div key={subtask.id} id={`subtask-${subtask.id}`} className="rounded-xl p-3 flex flex-wrap items-center gap-3" style={panel}>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', subtask.status === 'DONE' || subtask.status === 'SKIPPED' ? 'line-through' : 'text-[var(--color-text-primary)]')}
                        style={subtask.status === 'DONE' || subtask.status === 'SKIPPED' ? { color: 'var(--color-text-muted)', textDecoration: 'line-through' } : undefined}>
                        {subtask.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {'department' in subtask && subtask.department && (
                          <span>{subtask.department.name}</span>
                        )}
                        {'owner' in subtask && subtask.owner && (
                          <span><User className="inline h-3 w-3 mr-1" />{subtask.owner.name}</span>
                        )}
                        {'dependencyFrom' in subtask && Array.isArray(subtask.dependencyFrom) && subtask.dependencyFrom.length > 0 && subtask.status === 'LOCKED' && (
                          <span className="text-amber-400">Blocked by dependency</span>
                        )}
                      </div>
                    </div>
                    <SubtaskStatusBadge status={subtask.status} />
                    {canManage && !['LOCKED'].includes(subtask.status) && (
                      <Select
                        value={subtask.status}
                        onChange={(e) =>
                          subtaskStatusMut.mutate({ subtaskId: subtask.id, status: e.target.value as SubtaskStatus })
                        }
                        className="w-36 text-xs"
                      >
                        <option value="READY">Ready</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="DONE">Done</option>
                        <option value="SKIPPED">Skipped</option>
                      </Select>
                    )}
                  </div>
                ))}

                {canManage && (
                  <div className="rounded-xl p-3 flex gap-2" style={panel}>
                    <Input
                      placeholder="Add a subtask..."
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && newSubtask.trim() && subtaskMut.mutate()}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => subtaskMut.mutate()}
                      disabled={!newSubtask.trim()}
                      loading={subtaskMut.isPending}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Ticket Submission (read-only form data + attachments) ─── */}
            {activeTab === 'submission' && (
              <div className="space-y-4">
                {formResponses.length > 0 ? (
                  <div className="rounded-xl p-4 space-y-2" style={panel}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: POLISH_THEME.theadText }}>Submitted form data</p>
                    <dl className="space-y-1.5 text-sm">
                      {formResponses.map((r) => (
                        <div key={r.fieldKey} className="grid grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)] gap-x-4 gap-y-0.5 items-baseline">
                          <dt className="break-words" style={{ color: 'var(--color-text-muted)' }}>
                            {r.fieldKey.split('_').join(' ').split(' ').map((s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '')).join(' ')}:
                          </dt>
                          <dd className="min-w-0 break-words" style={{ color: 'var(--color-text-primary)' }}>{r.value || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <p className="text-sm py-4" style={{ color: POLISH_THEME.theadText }}>No submitted form data.</p>
                )}

                <TicketAttachmentsSection ticketId={id} canManage={canManage} variant="detail" />
              </div>
            )}

            {/* ── History ─── */}
            {activeTab === 'history' && (
              <div className="space-y-2">
                {(historyRes?.data ?? []).length === 0 && (
                  <p className="text-sm text-center py-6" style={{ color: POLISH_THEME.theadText }}>No history yet.</p>
                )}
                {(historyRes?.data ?? []).map((entry) => (
                  <div key={entry.id} className="flex gap-3 text-sm">
                    <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: 'var(--color-border-default)' }} />
                    <div>
                      <span className="font-medium text-[var(--color-text-primary)]">{entry.actor?.displayName ?? 'System'}</span>
                      {' '}
                      <span style={{ color: POLISH_THEME.metaMuted }}>{entry.action.toLowerCase().split('_').join(' ')}</span>
                      <span className="block text-xs" style={{ color: POLISH_THEME.theadText }}>
                        {format(new Date(entry.createdAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            </div>{/* end key={activeTab} animation wrapper */}
        </div>
      </div>

      {/* Completion toast */}
      {completionToast && (
        <div
          className="pointer-events-none z-20 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(22,163,74,0.95)',
            color: '#ffffff',
            boxShadow: '0 4px 16px rgba(22,163,74,0.35)',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 200ms ease-out',
          }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>All subtasks complete</span>
        </div>
      )}
    </div>
  );
}
