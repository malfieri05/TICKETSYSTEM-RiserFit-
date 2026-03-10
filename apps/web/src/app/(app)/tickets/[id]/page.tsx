'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft, MessageSquare, CheckSquare, Clock,
  Send, Plus, User,
} from 'lucide-react';
import { ticketsApi, commentsApi, subtasksApi, usersApi, invalidateTicketLists } from '@/lib/api';
import type { TicketStatus, SubtaskStatus } from '@/types';
import { Header } from '@/components/layout/Header';
import { SubtaskStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Textarea, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { TicketAttachmentsSection } from '@/components/tickets/TicketAttachmentsSection';

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

  const [commentBody, setCommentBody] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [activeTab, setActiveTab] = useState<'subtasks' | 'comments' | 'submission' | 'history'>('subtasks');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const commentMut = useMutation({
    mutationFn: () => commentsApi.create(id, { body: commentBody }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['ticket', id] });
      const prev = qc.getQueryData<{ data: { comments: unknown[] } }>(['ticket', id]);
      const body = commentBody;
      setCommentBody('');
      const optimisticComment = {
        id: `opt-${Date.now()}`,
        body,
        author: { id: user?.id ?? '', displayName: user?.displayName ?? '', name: user?.email ?? '' },
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData(['ticket', id], (old: typeof prev) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            comments: [...(old.data.comments ?? []), optimisticComment],
          },
        };
      });
      return { prev };
    },
    onError: (_err, _v, context) => {
      if (context?.prev) qc.setQueryData(['ticket', id], context.prev);
    },
    onSettled: () => {
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
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
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
  const visibleComments = ticket.comments ?? [];

  const subtaskDone = (ticket.subtasks ?? []).filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length;
  const subtaskTotal = (ticket.subtasks ?? []).length;
  const formResponses = (ticket as { formResponses?: { fieldKey: string; value: string }[] }).formResponses ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Ticket" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-5">
          <Button variant="ghost" size="sm" onClick={() => router.push(isStudioUser ? '/portal' : '/tickets')}>
            <ArrowLeft className="h-4 w-4" />
            {isStudioUser ? 'Back to My Tickets' : 'Back to tickets'}
          </Button>

          {/* Stage 22: header — title, created, requester, location, progress; ticket ID demoted */}
          <div className="rounded-xl p-5 space-y-2" style={panel}>
            <h1 className="text-xl font-semibold text-gray-100">{ticket.title}</h1>
            <p className="text-sm" style={{ color: POLISH_THEME.metaDim }}>
              Created {format(new Date(ticket.createdAt), 'MMM d')} • Requested by {ticket.requester.displayName}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {(ticket as { studio?: { name: string } }).studio?.name && (
                <span style={{ color: POLISH_THEME.metaMuted }}>{(ticket as { studio: { name: string } }).studio.name}</span>
              )}
              <span className="text-xs font-medium tabular-nums" style={{ color: POLISH_THEME.accent }}>
                Progress {subtaskDone} / {subtaskTotal}
              </span>
            </div>
            <p className="text-xs" style={{ color: POLISH_THEME.theadText }}>
              Ticket #{ticket.id.slice(0, 8)}
            </p>
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
                  comments: `Comments (${visibleComments.length})`,
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

            {/* ── Conversation (Updates & Replies) ─── */}
            {activeTab === 'comments' && (
              <div className={POLISH_CLASS.sectionGap}>
                {visibleComments.length === 0 && (
                  <p className="text-sm text-center py-6" style={{ color: POLISH_THEME.theadText }}>
                    {isStudioUser ? 'No updates yet.' : 'No replies yet.'}
                  </p>
                )}
                {visibleComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl p-4 space-y-2"
                    style={panel}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-semibold">
                        {((comment.author as { displayName?: string; name?: string }).displayName ?? (comment.author as { displayName?: string; name?: string }).name ?? '?')[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-200">
                        {(comment.author as { displayName?: string; name?: string }).displayName ?? (comment.author as { displayName?: string; name?: string }).name ?? '—'}
                      </span>
                      <span className="ml-auto text-xs" style={{ color: POLISH_THEME.theadText }}>
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>{comment.body}</p>
                  </div>
                ))}

                <div className="rounded-xl p-4 space-y-3" style={panel}>
                  <Textarea
                    placeholder={isStudioUser ? 'Add an update...' : 'Reply...'}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    <div />
                    <Button
                      size="sm"
                      onClick={() => commentMut.mutate()}
                      disabled={!commentBody.trim()}
                      loading={commentMut.isPending}
                      className="ml-auto"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {canManage ? 'Reply' : 'Add update'}
                    </Button>
                  </div>
                </div>
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
                                background:
                                  percent === 100
                                    ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                                    : 'linear-gradient(90deg,#22c55e,#4ade80)',
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
                      <p className={cn('text-sm font-medium', subtask.status === 'DONE' || subtask.status === 'SKIPPED' ? 'line-through' : 'text-gray-200')}
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
                    {subtask.isRequired && (
                      <span className="text-xs font-medium shrink-0" style={{ color: '#f87171' }}>Required</span>
                    )}
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
                        <option value="BLOCKED">Blocked</option>
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
                      <span className="font-medium text-gray-300">{entry.actor?.displayName ?? 'System'}</span>
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
        </div>
      </div>
    </div>
  );
}
