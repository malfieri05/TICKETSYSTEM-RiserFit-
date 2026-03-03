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
  mySummary: () => api.get<{
    total: number;
    open: number;
    resolved: number;
    closed: number;
    byCategory: { categoryId: string | null; categoryName: string; categoryColor: string | null; count: number }[];
    tickets: import('@/types').TicketListItem[];
  }>('/tickets/my-summary'),
  list: (params?: import('@/types').TicketFilters) =>
    api.get<import('@/types').PaginatedResponse<import('@/types').TicketListItem>>('/tickets', { params }),
  get: (id: string) => api.get<import('@/types').TicketDetail>(`/tickets/${id}`),
  create: (data: {
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
};

// ─── AI Assistant ───────────────────────────────────────────────────────────

export const aiApi = {
  /** Ask the AI assistant a question */
  chat: (message: string) =>
    api.post<{ answer: string; sources: { documentId: string; title: string; excerpt: string }[]; usedContext: boolean }>(
      '/ai/chat',
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

// ─── Admin ─────────────────────────────────────────────────────────────────

export const adminApi = {
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
  deactivate: (id: string) => api.patch(`/users/${id}/deactivate`),
};
