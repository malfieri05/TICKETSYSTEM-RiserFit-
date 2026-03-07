import { cn } from '@/lib/utils';
import type { TicketStatus, TicketPriority, SubtaskStatus } from '@/types';

const statusColors: Record<TicketStatus, string> = {
  NEW:                    'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30',
  TRIAGED:                'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30',
  IN_PROGRESS:            'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/30',
  WAITING_ON_REQUESTER:   'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/30',
  WAITING_ON_VENDOR:      'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30',
  RESOLVED:               'bg-green-500/20 text-green-300 ring-1 ring-green-500/30',
  CLOSED:                 'bg-green-500/20 text-green-300 ring-1 ring-green-500/30',
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

const priorityColors: Record<TicketPriority, string> = {
  LOW:    'bg-neutral-800 text-neutral-400 ring-1 ring-neutral-700/50',
  MEDIUM: 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30',
  HIGH:   'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/30',
  URGENT: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30',
};

const subtaskStatusColors: Record<SubtaskStatus, string> = {
  LOCKED:      'bg-neutral-700 text-neutral-400 ring-1 ring-neutral-600/50',
  READY:       'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
  TODO:        'bg-neutral-800 text-neutral-400 ring-1 ring-neutral-700/50',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/30',
  BLOCKED:     'bg-red-500/20 text-red-300 ring-1 ring-red-500/30',
  DONE:        'bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/30',
  SKIPPED:     'bg-neutral-700 text-neutral-500 ring-1 ring-neutral-600/50',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', statusColors[status])}>
      {statusLabels[status]}
    </span>
  );
}

const priorityMuted = 'bg-neutral-800 text-neutral-500 ring-1 ring-neutral-700/50';

export function PriorityBadge({ priority, muted = false }: { priority: TicketPriority; muted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', muted ? priorityMuted : priorityColors[priority])}>
      {priority}
    </span>
  );
}

export function SubtaskStatusBadge({ status }: { status: SubtaskStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', subtaskStatusColors[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}
