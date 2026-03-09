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

export type SubtaskStatus = 'LOCKED' | 'READY' | 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'SKIPPED';

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
  studioId?: string | null;
  studio?: { id: string; name: string } | null;
  marketId?: string;
  departments?: Department[];
  scopeStudioIds?: string[];
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
  /** API may return name or displayName */
  owner?: { id: string; displayName?: string; name?: string; email: string };
  ticketClass?: { id: string; code: string; name: string };
  supportTopic?: { id: string; name: string };
  maintenanceCategory?: { id: string; name: string; color?: string | null };
  studio?: { id: string; name: string };
  market?: { id: string; name: string };
  _count?: { comments: number; subtasks: number; attachments: number };
  sla?: SlaStatus;
  /** When actionableForMe=true, backend returns READY subtasks for list; avoids N+1. */
  readySubtasksSummary?: { id: string; title: string }[];
}

/** Studio Portal scope-summary: counts + recent tickets (minimal fields). */
export interface ScopeSummaryRecentTicket {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  updatedAt: string;
  studio?: { id: string; name: string } | null;
  requester: { id: string; name: string };
}

export interface ScopeSummaryResponse {
  openCount: number;
  completedCount: number;
  recentTickets: ScopeSummaryRecentTicket[];
  /** Stage 23: for STUDIO_USER, list of studios the user can view (for location filter). */
  allowedStudios?: { id: string; name: string }[];
}

export interface TicketFormResponseItem {
  fieldKey: string;
  value: string;
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
  formResponses?: TicketFormResponseItem[];
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
  departmentId?: string | null;
  subtaskTemplateId?: string | null;
  owner?: { id: string; name: string; email?: string; avatarUrl?: string };
  team?: { id: string; name: string };
  department?: { id: string; code: string; name: string } | null;
  /** IDs of subtasks this one depends on (must be DONE/SKIPPED before READY). */
  dependencyFrom?: { dependsOnSubtaskId: string }[];
  subtaskTemplate?: { sortOrder: number } | null;
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
  /** Optional payload for deep links (e.g. subtaskId for ticket#subtask-xxx). */
  metadata?: { subtaskId?: string };
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
  departmentId?: string;
  ticketClassId?: string;
  supportTopicId?: string;
  studioId?: string;
  marketId?: string;
  maintenanceCategoryId?: string;
  ownerId?: string;
  requesterId?: string;
  teamId?: string;
  search?: string;
  page?: number;
  limit?: number;
  /** When true, list only tickets with READY subtasks for current user (dept/owner). */
  actionableForMe?: boolean;
}

/** Stage 23: studio scope item (additional location for a user). */
export interface StudioScopeItem {
  studioId: string;
  studio: { id: string; name: string };
  grantedAt?: string;
}

/** Stage 23: inbox folder (All or support topic) with active count. */
export interface InboxFolder {
  id: string;
  label: string;
  activeCount: number;
}

export interface InboxFoldersResponse {
  folders: InboxFolder[];
}

// ─── Ticket taxonomy (Stage 2) & form schema (Stage 3) ─────────────────────

export interface TicketClassDto {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface TaxonomyDepartmentDto {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface SupportTopicDto {
  id: string;
  name: string;
  sortOrder: number;
}

export interface DepartmentWithTopicsDto extends TaxonomyDepartmentDto {
  topics: SupportTopicDto[];
}

export interface MaintenanceCategoryDto {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder: number;
}

export interface TicketTaxonomyResponse {
  ticketClasses: TicketClassDto[];
  departments: TaxonomyDepartmentDto[];
  supportTopicsByDepartment: DepartmentWithTopicsDto[];
  maintenanceCategories: MaintenanceCategoryDto[];
}

export interface FormFieldOptionDto {
  value: string;
  label: string;
  sortOrder: number;
}

export interface FormFieldDto {
  id: string;
  fieldKey: string;
  type: string;
  label: string;
  required: boolean;
  sortOrder: number;
  /** Optional section header (visual only). */
  section?: string | null;
  conditionalFieldKey?: string | null;
  conditionalValue?: string | null;
  options?: FormFieldOptionDto[];
}

export interface TicketFormSchemaDto {
  id: string;
  ticketClassId: string;
  departmentId: string | null;
  supportTopicId: string | null;
  maintenanceCategoryId: string | null;
  version: number;
  name: string | null;
  sortOrder: number;
  fields: FormFieldDto[];
}

/** Full create payload when using taxonomy (no categoryId). Omit title for schema-backed tickets (backend will generate). */
export interface CreateTicketPayload {
  title?: string;
  description?: string;
  priority: TicketPriority;
  ticketClassId: string;
  departmentId?: string;
  supportTopicId?: string;
  maintenanceCategoryId?: string;
  formResponses?: Record<string, string>;
  studioId?: string;
  marketId?: string;
  ownerId?: string;
}

// ─── Workflow templates (Stage 4 / 6.5) ─────────────────────────────────────

export interface WorkflowTemplateSubtaskDto {
  id: string;
  workflowTemplateId: string;
  title: string;
  description: string | null;
  departmentId: string;
  assignedUserId: string | null;
  isRequired: boolean;
  sortOrder: number;
  department?: { id: string; code: string; name: string };
  assignedUser?: { id: string; name: string; email: string } | null;
}

export interface WorkflowTemplateDependencyDto {
  subtaskTemplateId: string;
  dependsOnSubtaskTemplateId: string;
}

export interface WorkflowTemplateDetailDto {
  id: string;
  ticketClassId: string;
  departmentId: string | null;
  supportTopicId: string | null;
  maintenanceCategoryId: string | null;
  name: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  ticketClass: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  supportTopic: { id: string; name: string } | null;
  maintenanceCategory: { id: string; name: string } | null;
  subtaskTemplates: WorkflowTemplateSubtaskDto[];
  templateDependencies: WorkflowTemplateDependencyDto[];
}

export interface WorkflowTemplateListItemDto {
  id: string;
  ticketClassId: string;
  departmentId: string | null;
  supportTopicId: string | null;
  maintenanceCategoryId: string | null;
  name: string | null;
  sortOrder: number;
  isActive: boolean;
  ticketClass: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  supportTopic: { id: string; name: string } | null;
  maintenanceCategory: { id: string; name: string } | null;
  _count: { subtaskTemplates: number };
}

/** Stage 7A: workflow execution visibility — GET /subtask-workflow/templates/:id/stats */
export interface WorkflowTemplateStatsDto {
  ticketsUsingTemplate: number;
  activeExecutions: number;
  completedExecutions: number;
}
