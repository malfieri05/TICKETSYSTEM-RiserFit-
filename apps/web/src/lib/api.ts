import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ─── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { email: string; name: string; password: string }) =>
    api.post<{ access_token: string; user: import('@/types').User }>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ access_token: string; user: import('@/types').User }>('/auth/login', data),
  devLogin: (email: string) =>
    api.post<{ access_token: string; user: import('@/types').User }>('/auth/dev-login', { email }),
  me: () => api.get<import('@/types').User>('/auth/me'),
};

// ─── Tickets ───────────────────────────────────────────────────────────────

export const ticketsApi = {
  mySummary: (params?: { page?: number; limit?: number }) =>
    api.get<{
      total: number;
      open: number;
      resolved: number;
      closed: number;
      byCategory: { categoryId: string | null; categoryName: string; categoryColor: string | null; count: number }[];
      tickets: import('@/types').TicketListItem[];
      page: number;
      limit: number;
      totalPages: number;
    }>('/tickets/my-summary', { params }),
  list: (params?: import('@/types').TicketFilters) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').TicketListItem>>('/tickets', { params }),
  get: (id: string) => api.get<import('@/types').TicketDetail>(`/tickets/${id}`),
  create: (data:
    | import('@/types').CreateTicketPayload
    | {
        title: string;
        description?: string;
        priority: import('@/types').TicketPriority;
        categoryId?: string;
        studioId?: string;
        marketId?: string;
        teamId?: string;
        ownerId?: string;
      }) => api.post<import('@/types').TicketDetail>('/tickets', data),
  update: (id: string, data: { title?: string; description?: string; priority?: import('@/types').TicketPriority }) =>
    api.patch<import('@/types').TicketDetail>(`/tickets/${id}`, data),
  assign: (id: string, ownerId: string | null) =>
    api.patch<import('@/types').TicketDetail>(`/tickets/${id}/assign`, { ownerId }),
  transition: (id: string, status: import('@/types').TicketStatus) =>
    api.patch<import('@/types').TicketDetail>(`/tickets/${id}/status`, { status }),
  watch: (id: string) => api.post(`/tickets/${id}/watch`),
  unwatch: (id: string) => api.delete(`/tickets/${id}/watch`),
  history: (id: string) => api.get<import('@/types').AuditEntry[]>(`/tickets/${id}/history`),
};

// ─── Comments ──────────────────────────────────────────────────────────────

export const commentsApi = {
  list: (ticketId: string) =>
    api.get<import('@/types').Comment[]>(`/tickets/${ticketId}/comments`),
  create: (ticketId: string, data: { body: string; isInternal?: boolean }) =>
    api.post<import('@/types').Comment>(`/tickets/${ticketId}/comments`, data),
  update: (ticketId: string, commentId: string, data: { body: string }) =>
    api.patch<import('@/types').Comment>(`/tickets/${ticketId}/comments/${commentId}`, data),
};

// ─── Subtasks ──────────────────────────────────────────────────────────────

export const subtasksApi = {
  list: (ticketId: string) =>
    api.get<import('@/types').Subtask[]>(`/tickets/${ticketId}/subtasks`),
  create: (ticketId: string, data: { title: string; isRequired?: boolean; ownerId?: string; teamId?: string }) =>
    api.post<import('@/types').Subtask>(`/tickets/${ticketId}/subtasks`, data),
  update: (ticketId: string, subtaskId: string, data: { status?: import('@/types').SubtaskStatus; title?: string }) =>
    api.patch<import('@/types').Subtask>(`/tickets/${ticketId}/subtasks/${subtaskId}`, data),
};

// ─── Notifications ─────────────────────────────────────────────────────────

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').Notification>>('/notifications', { params }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// ─── Attachments ───────────────────────────────────────────────────────────

export const attachmentsApi = {
  // Step 1: get a presigned upload URL
  requestUploadUrl: (
    ticketId: string,
    data: { filename: string; mimeType: string; sizeBytes: number },
  ) =>
    api.post<{ uploadUrl: string; s3Key: string; expiresIn: number }>(
      `/tickets/${ticketId}/attachments/upload-url`,
      data,
    ),

  // Step 1b: upload the file directly to S3 using the presigned URL
  // This does NOT go through our API — it hits S3/R2 directly
  uploadToS3: async (uploadUrl: string, file: File): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`);
    }
  },

  // Step 2: confirm upload is done → API saves DB record
  confirmUpload: (
    ticketId: string,
    data: { s3Key: string; filename: string; mimeType: string; sizeBytes: number },
  ) =>
    api.post<import('@/types').Attachment>(
      `/tickets/${ticketId}/attachments/confirm`,
      data,
    ),

  // List all attachments for a ticket
  list: (ticketId: string) =>
    api.get<import('@/types').Attachment[]>(`/tickets/${ticketId}/attachments`),

  // Get a short-lived presigned download URL
  getDownloadUrl: (attachmentId: string) =>
    api.get<{ downloadUrl: string; filename: string; expiresIn: number }>(
      `/attachments/${attachmentId}/download-url`,
    ),

  // Delete from S3 + DB
  delete: (attachmentId: string) =>
    api.delete<{ deleted: boolean }>(`/attachments/${attachmentId}`),
};

// ─── Reporting ─────────────────────────────────────────────────────────────

export const reportingApi = {
  summary: () =>
    api.get<{
      total: number;
      open: number;
      resolved: number;
      avgResolutionHours: number | null;
    }>('/reporting/summary'),

  volumeByDay: (days = 30) =>
    api.get<{ date: string; count: number }[]>(`/reporting/volume?days=${days}`),

  byStatus: () =>
    api.get<{ status: string; count: number }[]>('/reporting/by-status'),

  byPriority: () =>
    api.get<{ priority: string; count: number }[]>('/reporting/by-priority'),

  byCategory: () =>
    api.get<{ categoryId: string | null; categoryName: string; count: number }[]>(
      '/reporting/by-category',
    ),

  byMarket: () =>
    api.get<{ marketId: string | null; marketName: string; count: number }[]>(
      '/reporting/by-market',
    ),

  resolutionTime: () =>
    api.get<{ categoryName: string; avgHours: number; ticketCount: number }[]>(
      '/reporting/resolution-time',
    ),

  completionByOwner: () =>
    api.get<{ userId: string; userName: string; avgHours: number | null; closedCount: number }[]>(
      '/reporting/completion-time/owners',
    ),
};

// ─── AI Assistant ───────────────────────────────────────────────────────────

export const aiApi = {
  /** Ask the AI assistant a question */
  chat: (message: string) =>
    api.post<{ answer: string; sources: { documentId: string; title: string; excerpt: string }[]; usedContext: boolean }>(
      '/ai/chat',
      { message },
    ),

  /** Studio users only: RAG over handbook documents */
  handbookChat: (message: string) =>
    api.post<{ answer: string; sources: { documentId: string; title: string; excerpt: string }[]; usedContext: boolean }>(
      '/ai/handbook-chat',
      { message },
    ),

  /** List all knowledge base documents (admin) */
  listDocuments: () =>
    api.get<{
      id: string;
      title: string;
      sourceType: string;
      sourceUrl: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      documentType: string | null;
      isActive: boolean;
      createdAt: string;
      uploadedBy: { id: string; name: string };
      _count: { chunks: number };
    }[]>('/ai/documents'),

  /** Ingest raw text (admin) */
  ingestText: (title: string, content: string) =>
    api.post<{ documentId: string; chunksCreated: number }>('/ai/ingest/text', { title, content }),

  /** Upload a .txt / .md file for ingestion (admin) */
  ingestFile: (title: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    return api.post<{ documentId: string; chunksCreated: number }>('/ai/ingest/file', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Upload a PDF for handbook ingestion (admin). Max 15MB. */
  ingestPdf: (title: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    return api.post<{ documentId: string; chunksCreated: number }>('/ai/ingest/pdf', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Enable / disable a document */
  toggleDocument: (id: string, isActive: boolean) =>
    api.patch(`/ai/documents/${id}/toggle`, { isActive }),

  /** Permanently delete a document and its chunks */
  deleteDocument: (id: string) => api.delete(`/ai/documents/${id}`),
};

// ─── AI Agent (tool calling) ────────────────────────────────────────────────

export interface AgentActionPlan {
  summary: string;
  actions: Array<{ tool: string; args: Record<string, unknown> }>;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  requires_confirmation: boolean;
}

export interface AgentResponse {
  conversationId: string;
  messageId: string;
  mode: 'ASK' | 'DO';
  content: string;
  actionPlan?: AgentActionPlan;
  toolResults?: Array<{ tool: string; result: unknown }>;
  sources?: Array<{ title: string; text: string }>;
}

export const agentApi = {
  chat: (message: string, conversationId?: string, allowWebSearch?: boolean) =>
    api.post<AgentResponse>('/agent/chat', { message, conversationId, allowWebSearch }),

  confirm: (conversationId: string, messageId: string) =>
    api.post<AgentResponse>('/agent/confirm', { conversationId, messageId }),

  getConversations: () =>
    api.get<Array<{ id: string; title: string | null; createdAt: string; updatedAt: string }>>('/agent/conversations'),

  getMessages: (conversationId: string) =>
    api.get<Array<{
      id: string; role: string; content: string | null; mode: string | null;
      actionPlan: AgentActionPlan | null; toolResults: unknown; createdAt: string;
    }>>(`/agent/conversations/${conversationId}/messages`),
};

// ─── Ticket forms (Stage 3 schema) ──────────────────────────────────────────

export const ticketFormsApi = {
  getSchema: (params: {
    ticketClassId: string;
    departmentId?: string;
    supportTopicId?: string;
    maintenanceCategoryId?: string;
  }) =>
    api.get<import('@/types').TicketFormSchemaDto>('/ticket-forms/schema', { params }),
};

// ─── Workflow templates (Stage 4 / 6.5 admin) ──────────────────────────────

export const workflowTemplatesApi = {
  list: (params?: { ticketClassId?: string; supportTopicId?: string; maintenanceCategoryId?: string }) =>
    api.get<import('@/types').WorkflowTemplateListItemDto[]>('/subtask-workflow/templates', { params }),
  get: (id: string) =>
    api.get<import('@/types').WorkflowTemplateDetailDto>(`/subtask-workflow/templates/${id}`),
  getStats: (id: string) =>
    api.get<import('@/types').WorkflowTemplateStatsDto>(`/subtask-workflow/templates/${id}/stats`),
  create: (data: {
    ticketClassId: string;
    departmentId?: string | null;
    supportTopicId?: string | null;
    maintenanceCategoryId?: string | null;
    name?: string | null;
    sortOrder?: number;
  }) => api.post<{ id: string }>('/subtask-workflow/templates', data),
  update: (id: string, data: { name?: string | null; sortOrder?: number; isActive?: boolean }) =>
    api.patch<import('@/types').WorkflowTemplateListItemDto>(`/subtask-workflow/templates/${id}`, data),
  delete: (id: string) =>
    api.delete<{ deleted: boolean }>(`/subtask-workflow/templates/${id}`),
  createSubtaskTemplate: (data: {
    workflowTemplateId: string;
    title: string;
    description?: string | null;
    departmentId: string;
    assignedUserId?: string | null;
    isRequired?: boolean;
    sortOrder?: number;
  }) => api.post<import('@/types').WorkflowTemplateSubtaskDto>('/subtask-workflow/subtask-templates', data),
  updateSubtaskTemplate: (id: string, data: {
    title?: string;
    description?: string | null;
    departmentId?: string;
    assignedUserId?: string | null;
    isRequired?: boolean;
    sortOrder?: number;
  }) => api.patch<import('@/types').WorkflowTemplateSubtaskDto>(`/subtask-workflow/subtask-templates/${id}`, data),
  deleteSubtaskTemplate: (id: string) =>
    api.delete<{ deleted: boolean }>(`/subtask-workflow/subtask-templates/${id}`),
  addDependency: (data: { workflowTemplateId: string; subtaskTemplateId: string; dependsOnSubtaskTemplateId: string }) =>
    api.post<import('@/types').WorkflowTemplateDependencyDto>('/subtask-workflow/template-dependencies', data),
  removeDependency: (data: { subtaskTemplateId: string; dependsOnSubtaskTemplateId: string }) =>
    api.delete<{ removed: boolean }>('/subtask-workflow/template-dependencies', { data }),
  reorderSubtaskTemplates: (workflowTemplateId: string, subtaskTemplateIds: string[]) =>
    api.post<{ reordered: boolean }>(`/subtask-workflow/templates/${workflowTemplateId}/subtask-templates/reorder`, { subtaskTemplateIds }),
};

// ─── Workflow analytics (Stage 7B, admin only) ───────────────────────────────

export interface WorkflowTemplateAnalyticsRow {
  templateId: string;
  templateName: string | null;
  totalExecutions: number;
  activeExecutions: number;
  completedExecutions: number;
  avgCompletionTimeHours: number | null;
  mostRecentExecutionAt: string | null;
}

export interface WorkflowDepartmentMetricsRow {
  departmentId: string;
  departmentName: string;
  ticketsCreated: number;
  workflowsStarted: number;
  workflowsCompleted: number;
  avgWorkflowDurationHours: number | null;
}

export interface WorkflowBottlenecksResponse {
  longestSubtasks: { subtaskTemplateId: string; title: string; avgDurationHours: number }[];
  mostBlockedSubtasks: { subtaskTemplateId: string; title: string; blockedCount: number }[];
}

export const workflowAnalyticsApi = {
  getTemplates: () =>
    api.get<WorkflowTemplateAnalyticsRow[]>('/admin/workflow-analytics/templates'),
  getDepartments: () =>
    api.get<WorkflowDepartmentMetricsRow[]>('/admin/workflow-analytics/departments'),
  getBottlenecks: () =>
    api.get<WorkflowBottlenecksResponse>('/admin/workflow-analytics/bottlenecks'),
};

// ─── Admin ─────────────────────────────────────────────────────────────────

export const adminApi = {
  getTicketTaxonomy: () =>
    api.get<import('@/types').TicketTaxonomyResponse>('/admin/config/ticket-taxonomy'),

  // Categories
  listCategories: () =>
    api.get<{ id: string; name: string; color: string | null; isActive: boolean }[]>('/admin/categories'),
  createCategory: (data: { name: string; description?: string; color?: string }) =>
    api.post('/admin/categories', data),
  updateCategory: (id: string, data: { isActive?: boolean; name?: string; color?: string }) =>
    api.patch(`/admin/categories/${id}`, data),

  // Markets
  listMarkets: () =>
    api.get<{ id: string; name: string; isActive: boolean; studios: { id: string; name: string }[] }[]>('/admin/markets'),
  createMarket: (data: { name: string }) => api.post('/admin/markets', data),
  updateMarket: (id: string, data: { isActive?: boolean }) => api.patch(`/admin/markets/${id}`, data),

  // Studios
  listStudios: () => api.get('/admin/studios'),
  createStudio: (data: { name: string; marketId: string }) => api.post('/admin/studios', data),
  updateStudio: (id: string, data: { isActive?: boolean }) => api.patch(`/admin/studios/${id}`, data),
};

export const usersApi = {
  list: () => api.get<import('@/types').User[]>('/users'),
  get: (id: string) => api.get<import('@/types').User>(`/users/${id}`),
  updateRole: (id: string, role: import('@/types').UserRole) =>
    api.patch(`/users/${id}/role`, { role }),
  setDepartments: (id: string, departments: import('@/types').Department[]) =>
    api.patch(`/users/${id}/departments`, { departments }),
  deactivate: (id: string) => api.patch(`/users/${id}/deactivate`),
};
