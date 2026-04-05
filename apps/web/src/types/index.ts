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

export type SubtaskStatus = 'LOCKED' | 'READY' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';

export type UserRole = 'ADMIN' | 'DEPARTMENT_USER' | 'STUDIO_USER';

/** Department enum (backend). Only applies to DEPARTMENT_USER. */
export type Department = 'HR' | 'OPERATIONS' | 'MARKETING' | 'RETAIL';

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

/** Operational tag on a ticket (v1): `id` is the global Tag id. */
export type TagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export interface TicketTagItem {
  id: string;
  name: string;
  color?: TagColor | string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}

export interface TicketListItem {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** ISO; default at create = createdAt + 7 calendar days */
  dueDate: string;
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
  /** When actionableForMe=true, backend returns incomplete subtasks for list; avoids N+1. */
  readySubtasksSummary?: { id: string; title: string }[];
  completedSubtasks?: number;
  totalSubtasks?: number;
  progressPercent?: number;
  tags?: TicketTagItem[];
}

/** Studio Portal scope-summary: counts + recent tickets (minimal fields). */
export interface ScopeSummaryRecentTicket {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  dueDate: string;
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

export interface LeaseIqResult {
  id: string;
  suggestedResponsibility: 'LIKELY_LANDLORD' | 'LIKELY_TENANT' | 'NEEDS_HUMAN_REVIEW';
  internalResultState?: 'RESOLVED' | 'AMBIGUOUS' | 'NO_MATCH' | 'NO_RULES_CONFIGURED' | null;
  confidence: string;
  matchedRuleIds: string[];
  matchedTerms: string[];
  explanation: string;
  evaluatedAt: string;
  evaluationTrigger: string;
}

export interface TicketDetail extends TicketListItem {
  description?: string;
  resolvedAt?: string;
  closedAt?: string;
  team?: { id: string; name: string };
  comments: Comment[];
  subtasks: Subtask[];
  watchers: { userId: string; user: { displayName: string; email: string } }[];
  tags: TicketTagItem[];
  formResponses?: TicketFormResponseItem[];
  leaseIqResult?: LeaseIqResult | null;
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
  createdAt: string;
  availableAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
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

/** GET /notifications — paginated list plus badge count. */
export interface NotificationListResponse extends PaginatedResponse<Notification> {
  unreadCount: number;
  totalPages?: number;
}

export interface TicketFilters {
  status?: TicketStatus;
  /** Convenience filter: 'active' = not RESOLVED/CLOSED; 'completed' = RESOLVED/CLOSED. Overrides status. */
  statusGroup?: 'active' | 'completed';
  priority?: TicketPriority;
  departmentId?: string;
  /** Public filter: ticket class (e.g. SUPPORT, MAINTENANCE or ticket class ID). Backend maps to ticketClassId. */
  ticketClass?: string;
  supportTopicId?: string;
  studioId?: string;
  /** Public filter: state (market/region). Backend maps to marketId. */
  state?: string;
  maintenanceCategoryId?: string;
  ownerId?: string;
  requesterId?: string;
  search?: string;
  page?: number;
  limit?: number;
  /** When true, list only tickets with incomplete subtasks for current user's dept/assignment. */
  actionableForMe?: boolean;
  /** ISO date string: filter tickets created on or after this date (inclusive start of day). */
  createdAfter?: string;
  /** ISO date string: filter tickets created on or before this date (inclusive end of day). */
  createdBefore?: string;
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

// ─── Location Profile (V1) ──────────────────────────────────────────────────

export interface StudioIdentity {
  id: string;
  name: string;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  externalCode: string | null;
  isActive: boolean;
  market: { id: string; name: string };
}

export type LocationMetadataAvailability = 'full' | 'missing';

export interface OperationalPublic {
  district: string | null;
  status: string | null;
  maturity: string | null;
  studioSize: number | null;
  priceTier: number | null;
  openType: string | null;
  studioOpenDate: string | null; // YYYY-MM-DD
  rfSoftOpenDate: string | null; // YYYY-MM-DD
}

export interface OwnershipTeamRestricted {
  dm: string | null;
  gm: string | null;
  agm: string | null;
  edc: string | null;
  li: string | null;
}

export interface ContactInfoRestricted {
  studioEmail: string | null;
  gmEmail: string | null;
  gmTeams: string | null;
  liEmail: string | null;
}

export interface InternalIdentifiersRestricted {
  studioCode: string | null;
  netsuiteName: string | null;
  ikismetName: string | null;
  crName: string | null;
  crId: string | null;
  paycomCode: string | null;
}

export interface LocationProfileResponse {
  studio: StudioIdentity;
  profile: {
    metadataAvailability: LocationMetadataAvailability;
    public: OperationalPublic;
    restricted: {
      ownership: OwnershipTeamRestricted;
      contact: ContactInfoRestricted;
      identifiers: InternalIdentifiersRestricted;
    } | null;
  };
  visibility: {
    showOwnership: boolean;
    showContact: boolean;
    showIdentifiers: boolean;
  };
  hasPublishedLeaseIqRuleset: boolean;
}

/** Stage 7A: workflow execution visibility — GET /subtask-workflow/templates/:id/stats */
export interface WorkflowTemplateStatsDto {
  ticketsUsingTemplate: number;
  activeExecutions: number;
  completedExecutions: number;
}
