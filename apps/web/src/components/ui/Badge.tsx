import type { TicketStatus, TicketPriority, SubtaskStatus } from '@/types';

/** Solid capsule fill; label uses this foreground (black on pastel fills). */
const CAPSULE_FG = '#0a0a0a';

type BadgeStyle = { bg: string; text: string; border: string };

const statusStyles: Record<TicketStatus, BadgeStyle> = {
  NEW:                    { bg: '#86efac', text: CAPSULE_FG, border: '1.25px solid #16a34a' },
  TRIAGED:                { bg: '#d8b4fe', text: CAPSULE_FG, border: '1.25px solid #9333ea' },
  IN_PROGRESS:            { bg: '#fde047', text: CAPSULE_FG, border: '1.25px solid #ca8a04' },
  WAITING_ON_REQUESTER:   { bg: '#fdba74', text: CAPSULE_FG, border: '1.25px solid #ea580c' },
  WAITING_ON_VENDOR:      { bg: '#fcd34d', text: CAPSULE_FG, border: '1.25px solid #d97706' },
  RESOLVED:               { bg: '#6ee7b7', text: CAPSULE_FG, border: '1.25px solid #059669' },
  CLOSED:                 { bg: '#cbd5e1', text: CAPSULE_FG, border: '1.25px solid #475569' },
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

const neutralBorder = '1.25px solid var(--color-border-default)';

const priorityStyles: Record<TicketPriority, BadgeStyle> = {
  LOW:    { bg: 'var(--color-bg-surface-raised)', text: 'var(--color-text-primary)', border: neutralBorder },
  MEDIUM: { bg: '#93c5fd', text: CAPSULE_FG, border: '1.25px solid #2563eb' },
  HIGH:   { bg: '#fdba74', text: CAPSULE_FG, border: '1.25px solid #ea580c' },
  URGENT: { bg: '#fca5a5', text: CAPSULE_FG, border: '1.25px solid #dc2626' },
};

/** Subtasks: lighter tinted chips + colored label + inset ring (distinct from ticket status capsules). */
type SubtaskBadgeStyle = { bg: string; text: string; ring: string };

const subtaskStyles: Record<SubtaskStatus, SubtaskBadgeStyle> = {
  LOCKED:      { bg: 'var(--color-bg-surface-raised)', text: 'var(--color-text-muted)', ring: 'var(--color-border-default)' },
  READY:       { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', ring: 'rgba(59,130,246,0.3)' },
  IN_PROGRESS: { bg: 'rgba(234,179,8,0.15)', text: '#ca8a04', ring: 'rgba(234,179,8,0.3)' },
  DONE:        { bg: 'rgba(34,197,94,0.15)', text: '#16a34a', ring: 'rgba(34,197,94,0.3)' },
  SKIPPED:     { bg: 'var(--color-bg-surface-raised)', text: 'var(--color-text-muted)', ring: 'var(--color-border-default)' },
};

function SubtaskThemeBadge({ style: s, children }: { style: SubtaskBadgeStyle; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]"
      style={{
        background: s.bg,
        color: s.text,
        boxShadow: `inset 0 0 0 1px ${s.ring}`,
      }}
    >
      {children}
    </span>
  );
}

function ThemeBadge({ style: s, children }: { style: BadgeStyle; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] box-border"
      style={{
        background: s.bg,
        color: s.text,
        border: s.border,
      }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <ThemeBadge style={statusStyles[status]}>{statusLabels[status]}</ThemeBadge>;
}

const priorityMutedStyle: BadgeStyle = {
  bg: 'var(--color-bg-surface-raised)',
  text: 'var(--color-text-primary)',
  border: neutralBorder,
};

export function PriorityBadge({ priority, muted = false }: { priority: TicketPriority; muted?: boolean }) {
  return <ThemeBadge style={muted ? priorityMutedStyle : priorityStyles[priority]}>{priority}</ThemeBadge>;
}

export function SubtaskStatusBadge({ status }: { status: SubtaskStatus }) {
  return <SubtaskThemeBadge style={subtaskStyles[status]}>{status.replace('_', ' ')}</SubtaskThemeBadge>;
}
