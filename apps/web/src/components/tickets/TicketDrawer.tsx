'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  X, MessageSquare, CheckSquare,
  Clock, Plus, User, CheckCircle2, Maximize2, Pencil, Scale, RefreshCw,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { ticketsApi, subtasksApi, invalidateTicketLists, dispatchApi } from '@/lib/api';
import type { SubtaskStatus } from '@/types';
import { StatusBadge, SubtaskStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { TicketAttachmentsSection } from '@/components/tickets/TicketAttachmentsSection';
import { TicketTagCapsule, TicketTagHoverMetaContent } from '@/components/tickets/TicketTagCapsule';
import { CommentThread } from '@/components/tickets/CommentThread';
import { DispatchRecommendationPanel } from '@/components/dispatch/DispatchRecommendationPanel';
import { LocationLink } from '@/components/ui/LocationLink';
import { cn } from '@/lib/utils';
import { RequesterAvatar } from '@/components/tickets/TicketRow';

interface Props {
  ticketId: string | null;
  onClose: () => void;
}

/** Must match drawer slide duration (open + close use the same easing). */
const DRAWER_SLIDE_MS = 300;
/** Tailwind `ease-out` equivalent — keep transform + shadow in sync. */
const DRAWER_EASE = 'cubic-bezier(0, 0, 0.2, 1)';

/** Canonical tab order — determines slide direction when switching. */
const TAB_ORDER = ['subtasks', 'comments', 'submission', 'history'] as const;
type TabKey = (typeof TAB_ORDER)[number];

/** Submission field key → display label: underscores to spaces, capitalize words. */
function formatFieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TicketDrawer({ ticketId, onClose }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();
  /** Slide position: true while parent still has a selection; false during slide-out. */
  const panelOpen = !!ticketId;
  const lastTicketIdRef = useRef<string | null>(null);
  /** Bumps after slide-out so we re-render once the held id is cleared from the ref. */
  const [, setPostClosePurge] = useState(0);

  if (ticketId) {
    lastTicketIdRef.current = ticketId;
  }

  const displayTicketId = ticketId ?? lastTicketIdRef.current;

  useEffect(() => {
    if (ticketId) return;
    const held = lastTicketIdRef.current;
    if (!held) return;
    const t = window.setTimeout(() => {
      lastTicketIdRef.current = null;
      setPostClosePurge((n) => n + 1);
    }, DRAWER_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [ticketId]);

  const isClosingVisual = !panelOpen && displayTicketId != null;

  const [activeTab, setActiveTab] = useState<TabKey>('subtasks');
  const [newSubtask, setNewSubtask] = useState('');
  const [completionToast, setCompletionToast] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isEditingSubmission, setIsEditingSubmission] = useState(false);
  const [submissionEditValues, setSubmissionEditValues] = useState<Record<string, string>>({});
  const [leaseIqExpanded, setLeaseIqExpanded] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActiveTab('subtasks');
    setNewSubtask('');
    setCompletionToast(false);
    setIsEditingTitle(false);
    setIsEditingSubmission(false);
    setSubmissionEditValues({});
    setLeaseIqExpanded(false);
  }, [displayTicketId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const { data: ticketRes, isLoading } = useQuery({
    queryKey: ['ticket', displayTicketId],
    queryFn: () => ticketsApi.get(displayTicketId!),
    enabled: !!displayTicketId,
  });
  const ticket = ticketRes?.data;

  const { data: historyRes } = useQuery({
    queryKey: ['ticket', displayTicketId, 'history'],
    queryFn: () => ticketsApi.history(displayTicketId!),
    enabled: !!displayTicketId && activeTab === 'history',
  });

  const subtaskMut = useMutation({
    mutationFn: () => subtasksApi.create(displayTicketId!, { title: newSubtask }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', displayTicketId] });
      invalidateTicketLists(qc);
      setNewSubtask('');
    },
  });

  const subtaskStMut = useMutation({
    mutationFn: ({ subtaskId, status }: { subtaskId: string; status: SubtaskStatus }) =>
      subtasksApi.update(displayTicketId!, subtaskId, { status }),
    onMutate: async ({ subtaskId, status: newStatus }) => {
      await qc.cancelQueries({ queryKey: ['ticket', displayTicketId] });
      const prev = qc.getQueryData<{ data: { subtasks: { id: string; status: string }[] } }>(['ticket', displayTicketId]);
      qc.setQueryData(['ticket', displayTicketId], (old: typeof prev) => {
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
      if (context?.prev) qc.setQueryData(['ticket', displayTicketId], context.prev);
    },
    onSuccess: () => {
      // After optimistic update, check if all subtasks are complete → show toast
      const cached = qc.getQueryData<{ data: { subtasks: { id: string; status: string }[] } }>(['ticket', displayTicketId]);
      const all = cached?.data?.subtasks;
      if (all && all.length > 0 && all.every((s) => s.status === 'DONE' || s.status === 'SKIPPED')) {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setCompletionToast(true);
        toastTimer.current = setTimeout(() => setCompletionToast(false), 4000);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ticket', displayTicketId] });
      invalidateTicketLists(qc);
    },
  });

  const titleUpdateMut = useMutation({
    mutationFn: (title: string) => ticketsApi.update(displayTicketId!, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', displayTicketId] });
      invalidateTicketLists(qc);
      setIsEditingTitle(false);
    },
  });

  const submissionUpdateMut = useMutation({
    mutationFn: (formResponses: Record<string, string>) =>
      ticketsApi.update(displayTicketId!, { formResponses }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', displayTicketId] });
      invalidateTicketLists(qc);
      setIsEditingSubmission(false);
    },
  });

  const reEvaluateLeaseIqMut = useMutation({
    mutationFn: () => ticketsApi.reEvaluateLeaseIq(displayTicketId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', displayTicketId] });
    },
  });

  const removeTagMut = useMutation({
    mutationFn: (tagId: string) => ticketsApi.removeTag(displayTicketId!, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', displayTicketId] });
      invalidateTicketLists(qc);
    },
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const formResponses = (ticket as { formResponses?: { fieldKey: string; value: string }[] })?.formResponses ?? [];

  type SubmissionRequester = { displayName?: string; name?: string; email?: string } | null | undefined;
  const submissionRequester = (ticket?.requester ?? null) as SubmissionRequester;
  const submissionRequesterDisplay =
    submissionRequester?.displayName?.trim() || submissionRequester?.name?.trim() || '—';
  const submissionRequesterEmail =
    submissionRequester?.email && submissionRequester.email.trim() ? submissionRequester.email.trim() : undefined;

  const TABS = useMemo(() => [
    { key: 'subtasks' as const,   label: `Subtasks${ticket ? ` (${ticket.subtasks.length})` : ''}`,   icon: CheckSquare },
    { key: 'comments' as const,   label: `Comments${ticket ? ` (${(ticket.comments ?? []).reduce((n: number, c: any) => n + 1 + (c.replies?.length ?? 0), 0)})` : ''}`, icon: MessageSquare },
    { key: 'submission' as const, label: 'Ticket Submission', icon: User },
    { key: 'history' as const,    label: 'History',           icon: Clock },
  ], [ticket]);

  const tabIndex = TAB_ORDER.indexOf(activeTab);
  const tabNavRef = useRef<HTMLElement | null>(null);
  const tabBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tabBubble, setTabBubble] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const updateTabBubble = useCallback(() => {
    const nav = tabNavRef.current;
    const btn = tabBtnRefs.current[tabIndex];
    if (!nav || !btn) return;
    const n = nav.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    setTabBubble({
      left: b.left - n.left + nav.scrollLeft,
      top: b.top - n.top + nav.scrollTop,
      width: b.width,
      height: b.height,
    });
  }, [tabIndex]);

  useLayoutEffect(() => {
    updateTabBubble();
  }, [updateTabBubble, activeTab, TABS]);

  useEffect(() => {
    window.addEventListener('resize', updateTabBubble);
    return () => window.removeEventListener('resize', updateTabBubble);
  }, [updateTabBubble]);

  return (
    <div
      className="fixed top-0 right-0 z-50 h-full flex flex-col"
      style={{
        width: 'min(828px, 68vw)',
        background: 'var(--color-bg-page)',
        /* Darken from app-header hue so the seam isn’t a pale “white” line against the navy top bars */
        borderLeft: '1px solid color-mix(in srgb, var(--color-bg-app-header) 78%, #000000)',
        /* No top border — keeps drawer header flush with viewport top and same height as <Header /> (h-14) */
        transform: panelOpen ? 'translateX(0)' : 'translateX(100%)',
        boxShadow: panelOpen ? POLISH_THEME.drawerShadow : 'none',
        transition: `transform ${DRAWER_SLIDE_MS}ms ${DRAWER_EASE}, box-shadow ${DRAWER_SLIDE_MS}ms ${DRAWER_EASE}`,
      }}
    >
      {/* ── Top bar: ticket # (left) + close — match <Header /> height (h-14) ───────── */}
      <div
        className="flex h-14 min-h-14 shrink-0 box-border items-center justify-between gap-3 px-6"
        style={{
          background: 'var(--color-bg-app-header)',
          boxShadow: 'var(--shadow-app-header)',
        }}
      >
        {displayTicketId ? (
          <button
            type="button"
            className="focus-ring header-nav-link max-w-[min(100%,14rem)] truncate rounded-[var(--radius-md)] py-1 px-1.5 text-left"
            title="Copy ticket ID to clipboard"
            onClick={() => {
              navigator.clipboard.writeText(displayTicketId).catch(() => {});
            }}
          >
            <span
              className="text-xs font-mono font-medium tabular-nums"
              style={{
                color: 'var(--color-text-app-header)',
                letterSpacing: '0.02em',
              }}
            >
              #{displayTicketId.slice(0, 8)}
            </span>
          </button>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden />
        )}
        <button
          onClick={onClose}
          aria-label="Close ticket panel"
          className="focus-ring header-nav-link shrink-0 p-1.5 rounded-[var(--radius-md)] transition-colors"
          style={{ color: 'var(--color-text-app-header-muted)' }}
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* ── Loading skeleton ───────────────────────────────────────────────────── */}
      {displayTicketId && isLoading && !ticket && (
        <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--color-bg-drawer-canvas)' }}>
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
        </div>
      )}

      {/* ── Main content (stays mounted while slide-out finishes so close matches open) ─ */}
      {displayTicketId && ticket && !isLoading && (
        <div
          className={cn('flex-1 overflow-hidden flex flex-col', isClosingVisual && 'pointer-events-none')}
          style={{ background: 'var(--color-bg-drawer-canvas)' }}
        >

          {/* ── Title / metadata / tabs on system surface (white in light mode); shadow on this shell so it follows rounded-b ─ */}
          <div
            className="shrink-0 rounded-b-[var(--radius-lg)] z-[11]"
            style={{
              background: 'var(--color-bg-surface)',
              boxShadow: POLISH_THEME.drawerTabBarShadow,
            }}
          >
          <div className="px-6 pt-4 pb-3">
            {/* Primary: title (editable when canManage) */}
            {isEditingTitle ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  className="focus-ring text-lg font-bold leading-snug min-w-0 flex-1 basis-0 px-3 py-2 rounded-[var(--radius-md)] border focus:outline-none"
                  style={{
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em',
                    background: 'var(--color-bg-surface)',
                    borderColor: POLISH_THEME.innerBorder,
                  }}
                  minLength={3}
                  maxLength={255}
                  aria-label="Ticket title"
                  autoFocus
                />
                <div className="flex gap-2 shrink-0 items-center">
                  <Button
                    size="sm"
                    onClick={() => {
                      const t = editTitleValue.trim();
                      if (t.length >= 3 && t.length <= 255) titleUpdateMut.mutate(t);
                    }}
                    disabled={editTitleValue.trim().length < 3 || editTitleValue.trim().length > 255 || titleUpdateMut.isPending}
                    loading={titleUpdateMut.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setIsEditingTitle(false);
                      setEditTitleValue(ticket.title);
                    }}
                    disabled={titleUpdateMut.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <h2
                  className="text-lg font-bold leading-snug flex-1 min-w-0"
                  style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}
                >
                  {ticket.title}
                </h2>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditTitleValue(ticket.title);
                      setIsEditingTitle(true);
                    }}
                    className="focus-ring p-1.5 rounded-[var(--radius-md)] shrink-0 transition-colors focus:outline-none hover:bg-[var(--color-bg-surface-raised)] hover:text-[var(--color-text-secondary)]"
                    style={{ color: 'var(--color-text-muted)' }}
                    aria-label="Edit ticket title"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Created / requester / location + tags (tags align right on same row when space allows) */}
            <div className="mt-2 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-xs flex min-w-0 items-center gap-1 flex-wrap" style={{ color: POLISH_THEME.metaSecondary }}>
                <span>Created: {format(new Date(ticket.createdAt), 'MMM d, yyyy')}</span>
                {ticket.requester?.displayName && <span>· {ticket.requester.displayName}</span>}
                {ticket.studio?.id && ticket.studio?.name && (
                  <>
                    <span>·</span>
                    <LocationLink
                      studioId={ticket.studio.id}
                      studioName={ticket.studio.name}
                      className="text-xs"
                    />
                  </>
                )}
                {!ticket.studio?.id && ticket.market?.name && (
                  <span>· {ticket.market.name}</span>
                )}
              </p>
              {ticket.tags && ticket.tags.length > 0 && (
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
                    style={{ color: POLISH_THEME.metaSecondary }}
                  >
                    Tags:
                  </span>
                  {ticket.tags.map((t) => (
                    <span key={t.id} className="max-w-[min(200px,100%)] min-w-0">
                      <TicketTagCapsule
                        tagId={t.id}
                        name={t.name}
                        color={t.color}
                        tooltipTypography="requesterMatch"
                        removable={canManage}
                        onRemoveTag={async (tagId) => {
                          await removeTagMut.mutateAsync(tagId);
                        }}
                        isRemoving={
                          removeTagMut.isPending && removeTagMut.variables === t.id
                        }
                        hoverText={
                          <div className="flex flex-col items-center text-center">
                            <TicketTagHoverMetaContent
                              createdAt={t.createdAt}
                              createdByDisplayName={t.createdBy?.name ?? ''}
                            />
                          </div>
                        }
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: POLISH_THEME.metaSecondary }}>
              <span>
                Due Date:{' '}
                {(() => {
                  const raw = ticket.dueDate;
                  if (!raw?.trim()) return '—';
                  const d = parseISO(raw);
                  if (Number.isNaN(d.getTime())) return '—';
                  return format(d, 'MMM d, yyyy');
                })()}
              </span>
            </p>

            {/* Status (left) + subtask progress — below due date */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusBadge status={ticket.status} />
              {(() => {
                const total = ticket.subtasks?.length ?? 0;
                const done = ticket.subtasks?.filter(
                  (s: { status: string }) => s.status === 'DONE' || s.status === 'SKIPPED',
                ).length ?? 0;
                const pct = total === 0 ? 0 : Math.round((done / total) * 100);
                if (total === 0) return null;
                return (
                  <>
                    <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: POLISH_THEME.progressGreen }}
                      />
                    </div>
                    <span className="text-xs tabular-nums" style={{ color: POLISH_THEME.metaDim }}>
                      {done}/{total} subtasks
                    </span>
                  </>
                );
              })()}
            </div>

            {/* Lease IQ — premium card */}
            {ticket.leaseIqResult != null && (() => {
              const resp = ticket.leaseIqResult.suggestedResponsibility;
              const accentColor =
                resp === 'LIKELY_LANDLORD' ? '#16a34a'
                : resp === 'LIKELY_TENANT' ? '#ca8a04'
                : '#6b7280';
              const badgeBg =
                resp === 'LIKELY_LANDLORD' ? 'rgba(34,197,94,0.12)'
                : resp === 'LIKELY_TENANT' ? 'rgba(234,179,8,0.12)'
                : 'rgba(148,163,184,0.14)';
              const badgeBorder =
                resp === 'LIKELY_LANDLORD' ? 'rgba(34,197,94,0.28)'
                : resp === 'LIKELY_TENANT' ? 'rgba(234,179,8,0.28)'
                : 'rgba(148,163,184,0.22)';
              return (
                <div
                  className="mt-3 rounded-[var(--radius-lg)] overflow-hidden"
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: `1px solid ${POLISH_THEME.listBorder}`,
                    borderLeft: `3px solid ${POLISH_THEME.accent}`,
                    boxShadow: POLISH_THEME.shadowCard,
                  }}
                >
                  {/* Card header — tap row to expand/collapse (Re-evaluate is separate) */}
                  <div
                    className="flex items-center gap-2 px-3.5 py-2.5"
                    style={{
                      background: 'var(--color-bg-drawer-canvas)',
                      borderBottom: leaseIqExpanded ? `1px solid ${POLISH_THEME.innerBorder}` : 'none',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setLeaseIqExpanded((e) => !e)}
                      aria-expanded={leaseIqExpanded}
                      className="focus-ring flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                    >
                      <Scale className="h-3.5 w-3.5 shrink-0" style={{ color: POLISH_THEME.accent }} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-primary)' }}>
                        Lease IQ
                      </span>
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: badgeBg,
                          color: accentColor,
                          boxShadow: `inset 0 0 0 1px ${badgeBorder}`,
                        }}
                      >
                        {resp.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-primary)' }}>
                        {ticket.leaseIqResult.confidence} confidence
                      </span>
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => reEvaluateLeaseIqMut.mutate()}
                        disabled={reEvaluateLeaseIqMut.isPending}
                        className="focus-ring flex shrink-0 items-center gap-1 text-[11px] px-2 py-0.5 rounded-[var(--radius-sm)] transition-colors hover:bg-black/5"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {reEvaluateLeaseIqMut.isPending ? (
                          <span className="animate-spin text-xs">↻</span>
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Re-evaluate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLeaseIqExpanded((e) => !e)}
                      aria-expanded={leaseIqExpanded}
                      aria-label={leaseIqExpanded ? 'Collapse Lease IQ' : 'Expand Lease IQ'}
                      className="focus-ring flex shrink-0 items-center justify-center rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-primary)] transition-colors hover:bg-black/5"
                    >
                      {leaseIqExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  </div>
                  {leaseIqExpanded && (
                    <div className="px-3.5 py-3 space-y-2">
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {ticket.leaseIqResult.explanation}
                        {ticket.leaseIqResult.internalResultState === 'NO_RULES_CONFIGURED' && (
                          <span> Configure lease rules in Admin → Lease IQ for this location.</span>
                        )}
                      </p>
                      {ticket.leaseIqResult.matchedTerms?.length > 0 && (
                        <p className="text-[11px]" style={{ color: POLISH_THEME.metaDim }}>
                          Matched: {ticket.leaseIqResult.matchedTerms.join(', ')}
                        </p>
                      )}
                      <p className="text-[10px] italic" style={{ color: POLISH_THEME.metaDim }}>
                        Not legal advice. Final responsibility determination is yours.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Dispatch Intelligence panel (maintenance tickets in drawer) */}
            <DispatchRecommendationPanel
              ticketId={ticket.id}
              ticket={ticket}
              canManage={canManage}
              variant="drawer"
            />
          </div>

          <div className="shrink-0 px-10 sm:px-14 pb-1" aria-hidden>
            <div
              className="h-px w-full"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-border-default) 64%, transparent) 14%, color-mix(in srgb, var(--color-border-default) 64%, transparent) 86%, transparent 100%)',
              }}
            />
          </div>

          <div className="sticky top-0 z-[11] shrink-0 flex items-center justify-between px-5 pb-2 pt-1">
            <nav
              ref={tabNavRef}
              className="relative flex flex-wrap gap-1 py-2 min-w-0 flex-1"
            >
              {tabBubble.width > 0 && (
                <div
                  aria-hidden
                  className="absolute z-0 rounded-[var(--radius-md)] pointer-events-none"
                  style={{
                    left: tabBubble.left,
                    top: tabBubble.top,
                    width: tabBubble.width,
                    height: tabBubble.height,
                    border: '2px solid var(--color-accent)',
                    background: 'var(--color-bg-surface)',
                    boxShadow: POLISH_THEME.shadowCard,
                    transition:
                      'left 280ms cubic-bezier(0.4, 0, 0.2, 1), top 280ms cubic-bezier(0.4, 0, 0.2, 1), width 280ms cubic-bezier(0.4, 0, 0.2, 1), height 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
              )}
              {TABS.map(({ key, label, icon: Icon }, i) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    ref={(el) => {
                      tabBtnRefs.current[i] = el;
                    }}
                    onClick={() => setActiveTab(key)}
                    className={`focus-ring relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors duration-150 ${
                      active
                        ? ''
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-raised)]'
                    }`}
                    style={{
                      color: active ? POLISH_THEME.accent : undefined,
                      background: 'transparent',
                      border: '2px solid transparent',
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </button>
                );
              })}
            </nav>
            {displayTicketId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/tickets/${displayTicketId}`);
                }}
                className="focus-ring p-1.5 rounded-[var(--radius-md)] transition-colors shrink-0 hover:bg-[var(--color-bg-surface-raised)] hover:text-[var(--color-text-secondary)]"
                style={{ color: 'var(--color-text-muted)' }}
                title="Open in full screen"
                aria-label="Open in full screen"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          </div>

          {/* ── Sliding tab content (page canvas — matches TicketFeedLayout gutter) ─ */}
          <div className="flex-1 overflow-hidden" style={{ background: 'var(--color-bg-drawer-canvas)' }}>
            <div
              style={{
                display: 'flex',
                width: '400%',
                height: '100%',
                transform: `translateX(-${tabIndex * 25}%)`,
                transition: 'transform 250ms ease-out',
                willChange: 'transform',
              }}
            >

              {/* ── Panel 0: Subtasks ─────────────────────────────────────────── */}
              <div style={{ flex: '0 0 25%', overflowY: 'auto' }} className={`px-6 py-5 ${POLISH_CLASS.sectionGap}`}>
                {/* Progress summary */}
                <div
                  className="dashboard-card rounded-[var(--radius-lg)] px-3.5 py-3 flex items-center justify-between"
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: `1px solid ${POLISH_THEME.listBorder}`,
                    borderTop: `1px solid var(--color-feed-accent-border)`,
                    boxShadow: POLISH_THEME.listContainerShadow,
                  }}
                >
                  {(() => {
                    const total = ticket.subtasks.length;
                    const done = ticket.subtasks.filter(
                      (s) => s.status === 'DONE' || s.status === 'SKIPPED',
                    ).length;
                    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                    return (
                      <>
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-muted)' }}>
                            Subtask Progress
                          </span>
                          <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                            {done} of {total} complete
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5 w-48">
                          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-border-default)' }}>
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${percent}%`, background: POLISH_THEME.progressGreen }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums w-8 text-right" style={{ color: 'var(--color-text-muted)' }}>
                            {percent}%
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {ticket.subtasks.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: POLISH_THEME.metaDim }}>No subtasks yet.</p>
                )}

                {ticket.subtasks.map((s) => {
                  const isComplete = s.status === 'DONE' || s.status === 'SKIPPED';
                  return (
                    <div
                      key={s.id}
                      className="rounded-[var(--radius-lg)] p-3.5 flex items-center gap-3 transition-all duration-150 ease-out hover:bg-[var(--color-bg-surface-raised)] hover:border-[var(--color-accent)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:-translate-y-px"
                      style={{
                        /* Elevated card on drawer canvas; not listBg, which blended in light mode */
                        background: isComplete
                          ? 'color-mix(in srgb, var(--color-bg-surface) 88%, var(--color-bg-surface-inset))'
                          : 'var(--color-bg-surface)',
                        border: `1px solid ${POLISH_THEME.listBorder}`,
                        boxShadow: POLISH_THEME.shadowCard,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium transition-all duration-200"
                          style={{
                            color: isComplete ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                            textDecoration: isComplete ? 'line-through' : 'none',
                          }}
                        >
                          {s.title}
                        </p>
                        {s.owner && (
                          <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: POLISH_THEME.metaDim }}>
                            <User className="h-3 w-3" />
                            {s.owner.name}
                          </p>
                        )}
                      </div>
                      <SubtaskStatusBadge status={s.status} />
                      {canManage && (
                        <Select
                          value={s.status}
                          onChange={(e) =>
                            subtaskStMut.mutate({ subtaskId: s.id, status: e.target.value as SubtaskStatus })
                          }
                          className="w-32 text-xs"
                        >
                          <option value="READY">Ready</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="DONE">Done</option>
                        </Select>
                      )}
                    </div>
                  );
                })}

                {canManage && (
                  <div
                    className="dashboard-card rounded-[var(--radius-lg)] p-3 flex gap-2"
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: `1px solid ${POLISH_THEME.listBorder}`,
                      borderTop: `1px solid var(--color-feed-accent-border)`,
                      boxShadow: POLISH_THEME.listContainerShadow,
                    }}
                  >
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
              </div>

              {/* ── Panel 1: Comments ────────────────────────────────────────── */}
              <div style={{ flex: '0 0 25%', overflowY: 'auto' }} className={`px-6 py-5 ${POLISH_CLASS.sectionGap}`}>
                <CommentThread
                  ticketId={ticket.id}
                  comments={ticket.comments ?? []}
                />
              </div>

              {/* ── Panel 2: Ticket Submission ───────────────────────────────── */}
              <div style={{ flex: '0 0 25%', overflowY: 'auto' }} className={`px-6 py-5 ${POLISH_CLASS.sectionGap}`}>
                <div
                  className="dashboard-card rounded-[var(--radius-lg)] overflow-hidden"
                  style={{
                    background: POLISH_THEME.listBg,
                    border: `1px solid ${POLISH_THEME.listBorder}`,
                    borderTop: `1px solid var(--color-feed-accent-border)`,
                    boxShadow: POLISH_THEME.listContainerShadow,
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    style={{ borderBottom: `1px solid ${POLISH_THEME.innerBorder}`, background: POLISH_THEME.tableHeaderBg }}
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
                        Submission data
                      </span>
                      <span
                        className="select-none text-xs font-light"
                        style={{ color: 'var(--color-text-muted)' }}
                        aria-hidden
                      >
                        |
                      </span>
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                        Requester:
                      </span>
                      <RequesterAvatar
                        displayName={submissionRequesterDisplay}
                        tooltipEmail={submissionRequesterEmail}
                      />
                    </div>
                    {isEditingSubmission ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => submissionUpdateMut.mutate(submissionEditValues)}
                          loading={submissionUpdateMut.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setIsEditingSubmission(false);
                            setSubmissionEditValues({});
                          }}
                          disabled={submissionUpdateMut.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : canManage && formResponses.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSubmissionEditValues(
                            Object.fromEntries(formResponses.map((r) => [r.fieldKey, r.value ?? ''])),
                          );
                          setIsEditingSubmission(true);
                        }}
                        className="focus-ring p-1.5 rounded-[var(--radius-md)] transition-colors focus:outline-none hover:bg-[var(--color-bg-surface-raised)] hover:text-[var(--color-text-secondary)]"
                        style={{ color: 'var(--color-text-primary)' }}
                        aria-label="Edit submission data"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {isEditingSubmission ? (
                    <>
                      {formResponses.length === 0 ? (
                        <p className="px-4 py-6 text-sm" style={{ color: POLISH_THEME.metaDim }}>No submission fields to edit.</p>
                      ) : (
                        <div className="p-4">
                          {formResponses.map((r) => (
                            <div
                              key={r.fieldKey}
                              className="grid grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)] gap-x-4 gap-y-0.5 items-center px-0 py-3"
                              style={{
                                borderTop: `1px solid ${POLISH_THEME.rowBorder}`,
                              }}
                            >
                              <label className="text-sm break-words" style={{ color: POLISH_THEME.metaDim }}>
                                {formatFieldLabel(r.fieldKey)}
                              </label>
                              <Input
                                value={submissionEditValues[r.fieldKey] ?? ''}
                                onChange={(e) =>
                                  setSubmissionEditValues((prev) => ({ ...prev, [r.fieldKey]: e.target.value }))
                                }
                                className="min-w-0"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {formResponses.length === 0 && (
                        <p className="px-4 py-6 text-sm" style={{ color: POLISH_THEME.metaDim }}>No form data.</p>
                      )}
                      {formResponses.map((r) => (
                        <div
                          key={r.fieldKey}
                          className="grid grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)] gap-x-4 gap-y-0.5 px-4 py-3 items-baseline"
                          style={{ borderTop: `1px solid ${POLISH_THEME.rowBorder}` }}
                        >
                          <dt className="text-sm break-words" style={{ color: POLISH_THEME.metaDim }}>{formatFieldLabel(r.fieldKey)}</dt>
                          <dd className="text-sm min-w-0 break-words" style={{ color: 'var(--color-text-primary)' }}>{r.value ?? '—'}</dd>
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <TicketAttachmentsSection ticketId={ticket.id} canManage={canManage} variant="drawer" />
              </div>

              {/* ── Panel 3: History ─────────────────────────────────────────── */}
              <div style={{ flex: '0 0 25%', overflowY: 'auto' }} className={`px-6 py-5 ${POLISH_CLASS.sectionGap}`}>
                {(historyRes?.data ?? []).length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: POLISH_THEME.metaDim }}>No history yet.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {(historyRes?.data ?? []).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-all duration-150 ease-out hover:bg-[var(--color-bg-surface)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
                      >
                        <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--color-text-muted)' }} />
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            {entry.actor?.displayName ?? 'System'}
                          </span>{' '}
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            {entry.action.toLowerCase().replace(/_/g, ' ')}
                          </span>
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
        </div>
      )}

      {/* ── Completion toast ───────────────────────────────────────────────────── */}
      {completionToast && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium pointer-events-none"
          style={{
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
