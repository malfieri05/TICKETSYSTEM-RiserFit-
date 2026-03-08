// Shared types between frontend and backend
// Both apps/web and apps/api import from '@ticketing/types'

export enum Role {
  REQUESTER = 'REQUESTER',
  AGENT = 'AGENT',
  MANAGER = 'MANAGER',
  ADMIN = 'ADMIN',
}

export enum TicketStatus {
  NEW = 'NEW',
  TRIAGED = 'TRIAGED',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_ON_REQUESTER = 'WAITING_ON_REQUESTER',
  WAITING_ON_VENDOR = 'WAITING_ON_VENDOR',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum SubtaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
}

export enum NotificationEventType {
  TICKET_CREATED = 'TICKET_CREATED',
  TICKET_ASSIGNED = 'TICKET_ASSIGNED',
  TICKET_REASSIGNED = 'TICKET_REASSIGNED',
  TICKET_STATUS_CHANGED = 'TICKET_STATUS_CHANGED',
  TICKET_RESOLVED = 'TICKET_RESOLVED',
  TICKET_CLOSED = 'TICKET_CLOSED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  MENTION_IN_COMMENT = 'MENTION_IN_COMMENT',
  SUBTASK_ASSIGNED = 'SUBTASK_ASSIGNED',
  SUBTASK_COMPLETED = 'SUBTASK_COMPLETED',
  SUBTASK_BLOCKED = 'SUBTASK_BLOCKED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
}

export enum DeliveryChannel {
  EMAIL = 'EMAIL',
  IN_APP = 'IN_APP',
  TEAMS = 'TEAMS',
}

// Pagination
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// Ticket filters (shared between frontend query params and backend)
export interface TicketFilters {
  status?: TicketStatus;
  priority?: Priority;
  categoryId?: string;
  studioId?: string;
  marketId?: string;
  ticketClassId?: string;
  maintenanceCategoryId?: string;
  ownerId?: string;
  requesterId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}
