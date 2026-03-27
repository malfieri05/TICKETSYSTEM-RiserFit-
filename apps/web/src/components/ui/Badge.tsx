import { cn } from '@/lib/utils';
import type { TicketStatus, TicketPriority, SubtaskStatus } from '@/types';

type BadgeStyle = { bg: string; text: string; ring: string };

const statusStyles: Record<TicketStatus, BadgeStyle> = {
  NEW:                    { bg: 'rgba(59,130,246,0.15)',  text: '#3b82f6', ring: 'rgba(59,130,246,0.3)' },
  TRIAGED:                { bg: 'rgba(168,85,247,0.15)',  text: '#a855f7', ring: 'rgba(168,85,247,0.3)' },
  IN_PROGRESS:            { bg: 'rgba(234,179,8,0.15)',   text: '#ca8a04', ring: 'rgba(234,179,8,0.3)' },
  WAITING_ON_REQUESTER:   { bg: 'rgba(249,115,22,0.15)',  text: '#ea580c', ring: 'rgba(249,115,22,0.3)' },
  WAITING_ON_VENDOR:      { bg: 'rgba(245,158,11,0.15)',  text: '#d97706', ring: 'rgba(245,158,11,0.3)' },
  RESOLVED:               { bg: 'rgba(34,197,94,0.15)',   text: '#16a34a', ring: 'rgba(34,197,94,0.3)' },
  CLOSED:                 { bg: 'rgba(34,197,94,0.15)',   text: '#16a34a', ring: 'rgba(34,197,94,0.3)' },
};

const statusLabels: Record<TicketStatus, string> = {
  NEW:                    'New',
  TRIAGED:                'Triaged',
  IN_PROGRESS:            'In Progress',
  WAITING_ON_REQUESTER:   'Waiting: Requester',
  WAITING_ON_VENDOR:      'Waiting: Vendor',
  RESOLVED:               'Resolved',
  CLOSED:                 'Closed',
};

const priorityStyles: Record<TicketPriority, BadgeStyle> = {
  LOW:    { bg: 'var(--color-bg-surface-raised)', text: 'var(--color-text-muted)',  ring: 'var(--color-border-default)' },
  MEDIUM: { bg: 'rgba(59,130,246,0.15)',  text: '#3b82f6', ring: 'rgba(59,130,246,0.3)' },
  HIGH:   { bg: 'rgba(249,115,22,0.15)',  text: '#ea580c', ring: 'rgba(249,115,22,0.3)' },
  URGENT: { bg: 'rgba(239,68,68,0.15)',   text: '#dc2626', ring: 'rgba(239,68,68,0.3)' },
};

const subtaskStyles: Record<SubtaskStatus, BadgeStyle> = {
  LOCKED:      { bg: 'var(--color-bg-surface-raised)', text: 'var(--color-text-muted)',  ring: 'var(--color-border-default)' },
  READY:       { bg: 'rgba(59,130,246,0.15)',  text: '#3b82f6', ring: 'rgba(59,130,246,0.3)' },
  IN_PROGRESS: { bg: 'rgba(234,179,8,0.15)',   text: '#ca8a04', ring: 'rgba(234,179,8,0.3)' },
  DONE:        { bg: 'rgba(34,197,94,0.15)',   text: '#16a34a', ring: 'rgba(34,197,94,0.3)' },
  SKIPPED:     { bg: 'var(--color-bg-surface-raised)', text: 'var(--color-text-muted)',  ring: 'var(--color-border-default)' },
};

function ThemeBadge({ style: s, children }: { style: BadgeStyle; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]"
      style={{ background: s.bg, color: s.text, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <ThemeBadge style={statusStyles[status]}>{statusLabels[status]}</ThemeBadge>;
}

const priorityMutedStyle: BadgeStyle = { bg: 'var(--color-bg-surface-raised)', text: 'var(--color-text-muted)', ring: 'var(--color-border-default)' };

export function PriorityBadge({ priority, muted = false }: { priority: TicketPriority; muted?: boolean }) {
  return <ThemeBadge style={muted ? priorityMutedStyle : priorityStyles[priority]}>{priority}</ThemeBadge>;
}

export function SubtaskStatusBadge({ status }: { status: SubtaskStatus }) {
  return <ThemeBadge style={subtaskStyles[status]}>{status.replace('_', ' ')}</ThemeBadge>;
}
