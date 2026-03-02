import { cn } from '@/lib/utils';
import type { TicketStatus, TicketPriority, SubtaskStatus } from '@/types';

const statusColors: Record<TicketStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  TRIAGED: 'bg-purple-100 text-purple-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  WAITING_ON_REQUESTER: 'bg-orange-100 text-orange-800',
  WAITING_ON_VENDOR: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
};

const statusLabels: Record<TicketStatus, string> = {
  NEW: 'New',
  TRIAGED: 'Triaged',
  IN_PROGRESS: 'In Progress',
  WAITING_ON_REQUESTER: 'Waiting: Requester',
  WAITING_ON_VENDOR: 'Waiting: Vendor',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const priorityColors: Record<TicketPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const subtaskStatusColors: Record<SubtaskStatus, string> = {
  TODO: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  BLOCKED: 'bg-red-100 text-red-700',
  DONE: 'bg-green-100 text-green-800',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', statusColors[status])}>
      {statusLabels[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', priorityColors[priority])}>
      {priority}
    </span>
  );
}

export function SubtaskStatusBadge({ status }: { status: SubtaskStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', subtaskStatusColors[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}
