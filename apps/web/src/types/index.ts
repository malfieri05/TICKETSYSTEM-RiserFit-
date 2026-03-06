// ─── Enums (mirror backend Prisma enums) ───────────────────────────────────

export type TicketStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'WAITING_ON_REQUESTER'
  | 'WAITING_ON_VENDOR'
  | 'RESOLVED'
  | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type SubtaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

export type UserRole = 'ADMIN' | 'DEPARTMENT_USER' | 'STUDIO_USER';

/** Department enum (backend). Only applies to DEPARTMENT_USER. */
export type Department = 'HR' | 'OPERATIONS' | 'MARKETING';

export type NotificationChannel = 'EMAIL' | 'TEAMS' | 'IN_APP';

// ─── Core entities ─────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string;
  isActive: boolean;
  teamId?: string;
  teamName?: string | null;
  studioId?: string;
  marketId?: string;
  departments?: Department[];
  scopeStudioIds?: string[];
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Market {
  id: string;
  name: string;
}

export interface Studio {
  id: string;
  name: string;
  marketId: string;
  market?: Market;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
}

export interface Team {
  id: string;
  name: string;
}

// ─── SLA ───────────────────────────────────────────────────────────────────

export type SlaStatusValue = 'OK' | 'AT_RISK' | 'BREACHED' | 'RESOLVED';

export interface SlaStatus {
  status: SlaStatusValue;
  targetHours: number;
  elapsedHours: number;
  remainingHours: number;
  percentUsed: number;
}

// ─── Tickets ───────────────────────────────────────────────────────────────

export interface TicketListItem {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  requester: { id: string; displayName: string; email: string };
  owner?: { id: string; displayName: string; email: string };
  category?: { id: string; name: string };
  studio?: { id: string; name: string };
  market?: { id: string; name: string };
  _count?: { comments: number; subtasks: number; attachments: number };
  sla?: SlaStatus;
}

export interface TicketDetail extends TicketListItem {
  description?: string;
  resolvedAt?: string;
  closedAt?: string;
  team?: { id: string; name: string };
  comments: Comment[];
  subtasks: Subtask[];
  watchers: { userId: string; user: { displayName: string; email: string } }[];
  tags: { tag: { id: string; name: string } }[];
}

export interface Comment {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; displayName: string; email: string; avatarUrl?: string };
  mentions: { mentionedUser: { id: string; displayName: string } }[];
}

export interface Subtask {
  id: string;
  title: string;
  status: SubtaskStatus;
  isRequired: boolean;
  createdAt: string;
  owner?: { id: string; displayName: string };
  team?: { id: string; name: string };
}

export interface AuditEntry {
  id: string;
  action: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  createdAt: string;
  actor?: { displayName: string; email: string };
}

// ─── Notifications ─────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  ticketId?: string;
  ticket?: { id: string; title: string };
}

// ─── API response shapes ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  studioId?: string;
  marketId?: string;
  ownerId?: string;
  requesterId?: string;
   teamId?: string;
  search?: string;
  page?: number;
  limit?: number;
}
