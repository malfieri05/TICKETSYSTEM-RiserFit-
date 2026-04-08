import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, TicketListItem } from '@/types';

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
  // Default Content-Type is application/json; FormData must omit it so the runtime sets
  // multipart/form-data with a proper boundary (manual multipart header breaks multer).
  if (config.data instanceof FormData) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type');
    } else {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
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

/** Public endpoints (invite validate/accept): no JWT, no 401 → login redirect. */
export const publicApi = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

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

export type ValidateInvitationResponse =
  | { valid: false }
  | {
      valid: true;
      expiresAt: string;
      emailMasked: string;
      roleLabel: string;
      name: string;
      scopeSummary: string;
    };

/** Invite acceptance (no auth; uses publicApi to avoid 401 redirect). */
export const invitationsPublicApi = {
  validate: (token: string) =>
    publicApi.post<ValidateInvitationResponse>('/invitations/validate', { token }),
  accept: (token: string, password: string) =>
    publicApi.post<{ success: true }>('/invitations/accept', { token, password }),
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
  scopeSummary: () =>
    api.get<import('@/types').ScopeSummaryResponse>('/tickets/scope-summary'),
  inboxFolders: () =>
    api.get<import('@/types').InboxFoldersResponse>('/tickets/inbox-folders'),
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
  update: (
    id: string,
    data: {
      title?: string;
      description?: string;
      priority?: import('@/types').TicketPriority;
      formResponses?: Record<string, string>;
      dispatchTradeType?: import('@ticketing/types').DispatchTradeType | string;
      dispatchReadiness?: import('@ticketing/types').DispatchReadiness | string;
    },
  ) => api.patch<import('@/types').TicketDetail>(`/tickets/${id}`, data),
  assign: (id: string, ownerId: string | null) =>
    api.patch<import('@/types').TicketDetail>(`/tickets/${id}/assign`, { ownerId }),
  transition: (id: string, status: import('@/types').TicketStatus) =>
    api.patch<import('@/types').TicketDetail>(`/tickets/${id}/status`, { status }),
  watch: (id: string) => api.post(`/tickets/${id}/watch`),
  unwatch: (id: string) => api.delete(`/tickets/${id}/watch`),
  history: (id: string) => api.get<import('@/types').AuditEntry[]>(`/tickets/${id}/history`),
  getLeaseIqResult: (id: string) =>
    api.get<import('@/types').LeaseIqResult | null>(`/tickets/${id}/lease-iq-result`),
  reEvaluateLeaseIq: (id: string) =>
    api.post<import('@/types').LeaseIqResult>(`/tickets/${id}/lease-iq/evaluate`),
  addTag: (id: string, data: { label: string; color?: string }) =>
    api.post<{
      tag: { id: string; name: string; color: string | null };
      createdAt: string;
      createdBy: { id: string; name: string };
    }>(`/tickets/${id}/tags`, data),
  removeTag: (ticketId: string, tagId: string) =>
    api.delete<{ ok: true }>(`/tickets/${ticketId}/tags/${tagId}`),
};

// Shared helper: invalidate all major ticket list surfaces after mutations
export const invalidateTicketLists = (queryClient: QueryClient) => {
  // Global tickets list (/tickets)
  queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] });

  // Actionable inbox (/inbox)
  queryClient.invalidateQueries({ queryKey: ['tickets', 'actionable'] });

  // Studio portal: "My tickets" and "By studio(s)"
  queryClient.invalidateQueries({ queryKey: ['tickets', 'portal-my'] });
  queryClient.invalidateQueries({ queryKey: ['tickets', 'portal-studio'] });

  // Legacy portal list
  queryClient.invalidateQueries({ queryKey: ['tickets', 'portal-legacy'] });
};

/** Ticket list queryFn returns Axios responses; rows live at `cached.data.data`. */
type TicketListQueryCache = AxiosResponse<PaginatedResponse<TicketListItem>>;

/** Patch one row in every cached ticket feed (main list, portal, inbox, location profile, legacy). */
export function updateTicketRowInListCaches(
  queryClient: QueryClient,
  ticketId: string,
  updater: (row: TicketListItem) => TicketListItem,
): void {
  const apply = (old: TicketListQueryCache | undefined): TicketListQueryCache | undefined => {
    const page = old?.data;
    if (!page?.data) return old;
    let hit = false;
    const nextRows = page.data.map((row) => {
      if (row.id !== ticketId) return row;
      hit = true;
      return updater(row);
    });
    if (!hit) return old;
    return {
      ...old,
      data: {
        ...page,
        data: nextRows,
      },
    } as TicketListQueryCache;
  };

  queryClient.setQueriesData<TicketListQueryCache>({ queryKey: ['tickets'], exact: false }, apply);
  queryClient.setQueriesData<TicketListQueryCache>({ queryKey: ['location-tickets'], exact: false }, apply);
}

// ─── Comments ──────────────────────────────────────────────────────────────

export const commentsApi = {
  list: (ticketId: string) =>
    api.get<import('@/types').Comment[]>(`/tickets/${ticketId}/comments`),
  create: (ticketId: string, data: { body: string; parentCommentId?: string; isInternal?: boolean }) =>
    api.post<import('@/types').Comment>(`/tickets/${ticketId}/comments`, data),
  update: (ticketId: string, commentId: string, data: { body: string }) =>
    api.patch<import('@/types').Comment>(`/tickets/${ticketId}/comments/${commentId}`, data),
};

export const mentionableUsersApi = {
  list: (ticketId: string, search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.get<{ id: string; name: string | null; email: string; displayName: string; avatarUrl: string | null }[]>(
      `/tickets/${ticketId}/mentionable-users${params}`,
    );
  },
};

// ─── Subtasks ──────────────────────────────────────────────────────────────

export const subtasksApi = {
  list: (ticketId: string) =>
    api.get<import('@/types').Subtask[]>(`/tickets/${ticketId}/subtasks`),
  create: (ticketId: string, data: { title: string; ownerId?: string; teamId?: string }) =>
    api.post<import('@/types').Subtask>(`/tickets/${ticketId}/subtasks`, data),
  update: (ticketId: string, subtaskId: string, data: { status?: import('@/types').SubtaskStatus; title?: string }) =>
    api.patch<import('@/types').Subtask>(`/tickets/${ticketId}/subtasks/${subtaskId}`, data),
};

// ─── Notifications ─────────────────────────────────────────────────────────

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) =>
    api.get<import('@/types').NotificationListResponse>('/notifications', { params }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// ─── Attachments ───────────────────────────────────────────────────────────

export const attachmentsApi = {
  /**
   * Single-step proxy upload — sends the file to our own API which uploads to S3
   * server-side. No browser→R2 direct PUT, no CORS required.
   */
  upload: (ticketId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<import('@/types').Attachment>(
      `/tickets/${ticketId}/attachments/upload`,
      form,
    );
  },

  // Legacy: get a presigned upload URL (kept for reference; not used by UI)
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
    try {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!res.ok) {
        let host = '';
        try {
          host = new URL(uploadUrl).host;
        } catch {
          // ignore URL parse failure
        }
        throw new Error(
          `Direct upload to storage failed (s3-put stage)${
            host ? ` for host ${host}` : ''
          }: ${res.status} ${res.statusText}`,
        );
      }
    } catch (err) {
      if (err instanceof TypeError) {
        let host = '';
        try {
          host = new URL(uploadUrl).host;
        } catch {
          // ignore URL parse failure
        }
        throw new Error(
          `Direct upload to storage failed (network/CORS at s3-put stage)${
            host ? ` for host ${host}` : ''
          }: ${err.message}`,
        );
      }
      throw err;
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

// ─── Dashboard (Stage 5) ───────────────────────────────────────────────────

export interface DashboardSummaryResponse {
  newTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  avgCompletionHours: number | null;
  avgFirstResponseHours: number | null;
  kpiRange?: { from: string; to: string };
  supportByDepartment: { deptId: string; deptName: string; count: number }[];
  supportByType: { typeId: string; typeName: string; count: number }[];
  maintenanceByCategory: { categoryId: string; categoryName: string; count: number }[];
  maintenanceByLocation: { locationId: string; locationName: string; count: number }[];
}

export interface StudioDashboardSummaryResponse {
  openTickets: number;
  completedTickets: number;
  avgCompletionHours: number | null;
  avgFirstResponseHours: number | null;
  byLocation: { locationId: string; locationName: string; count: number }[];
}

export const dashboardApi = {
  summary: (
    studioId?: string,
    kpiRange?: { from: string; to: string },
  ) =>
    api.get<DashboardSummaryResponse | StudioDashboardSummaryResponse>(
      '/dashboard/summary',
      {
        params: {
          ...(studioId ? { studioId } : {}),
          ...(kpiRange?.from && kpiRange?.to
            ? { from: kpiRange.from, to: kpiRange.to }
            : {}),
        },
      },
    ),
};

// ─── Reporting ─────────────────────────────────────────────────────────────

export interface WorkflowTimingStep {
  stepId: string;
  stepName: string;
  avgSubtaskCompletionHours: number | null;
  avgActiveWorkHours: number | null;
}

export interface WorkflowTimingEntry {
  workflowId: string;
  workflowName: string;
  avgTicketCompletionHours: number | null;
  steps: WorkflowTimingStep[];
}

export const reportingApi = {
  summary: () =>
    api.get<{
      total: number;
      open: number;
      resolved: number;
      avgResolutionHours: number | null;
      avgFirstResponseHours: number | null;
    }>('/reporting/summary'),

  /** Pass days=0 to request all-time data (no date filter). */
  volumeByDay: (days = 30) =>
    api.get<{ date: string; count: number; closed: number }[]>(`/reporting/volume?days=${days}`),

  /** Inclusive calendar range — matches dashboard KPI timeframe. */
  volumeByDateRange: (from: string, to: string) =>
    api.get<{ date: string; count: number; closed: number }[]>('/reporting/volume', {
      params: { from, to },
    }),

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

  workflowTiming: () =>
    api.get<{ workflows: WorkflowTimingEntry[] }>('/reporting/workflow-timing'),

  byLocation: () =>
    api.get<{ marketId: string | null; marketName: string; count: number }[]>(
      '/reporting/by-location',
    ),

  // Dispatch: open maintenance only (Stage 13, ADMIN only)
  dispatchByStudio: (params?: { studioId?: string; marketId?: string; maintenanceCategoryId?: string; createdAfter?: string; createdBefore?: string; priority?: string }) =>
    api.get<{
      studioId: string | null;
      studioName: string;
      marketName: string;
      count: number;
      categoryNames: string[];
      openTickets: { id: string; title: string; maintenanceCategoryName: string }[];
    }[]>('/reporting/dispatch/by-studio', { params }),
  dispatchByCategory: (params?: { studioId?: string; marketId?: string; maintenanceCategoryId?: string; createdAfter?: string; createdBefore?: string; priority?: string }) =>
    api.get<{ maintenanceCategoryId: string | null; categoryName: string; count: number }[]>('/reporting/dispatch/by-category', { params }),
  dispatchByMarket: (params?: { studioId?: string; marketId?: string; maintenanceCategoryId?: string; createdAfter?: string; createdBefore?: string; priority?: string }) =>
    api.get<{ marketId: string | null; marketName: string; count: number }[]>('/reporting/dispatch/by-market', { params }),
  dispatchStudiosWithMultiple: (params?: { studioId?: string; marketId?: string; maintenanceCategoryId?: string; createdAfter?: string; createdBefore?: string; priority?: string }) =>
    api.get<{ studioId: string | null; studioName: string; marketName: string; count: number }[]>('/reporting/dispatch/studios-with-multiple', { params }),
};

// ─── AI Assistant ───────────────────────────────────────────────────────────

export const aiApi = {
  /** Ask the AI assistant a question */
  chat: (message: string) =>
    api.post<{ answer: string; sources: { documentId: string; title: string; excerpt: string; pageNumber?: number }[]; usedContext: boolean }>(
      '/ai/chat',
      { message },
    ),

  /** Studio users only: RAG over handbook documents */
  handbookChat: (message: string) =>
    api.post<{ answer: string; sources: { documentId: string; title: string; excerpt: string; pageNumber?: number }[]; usedContext: boolean }>(
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
      ingestionStatus: string;
      lastIndexedAt: string | null;
      upstreamProvider: string | null;
      upstreamId: string | null;
      upstreamVersion: string | null;
      reviewOn: string | null;
      reviewDue: string | null;
      lastSyncedAt: string | null;
      createdAt: string;
      uploadedBy: { id: string; name: string };
      _count: { chunks: number };
    }[]>('/ai/documents'),

  /** Fetch a public URL, extract its text, and ingest it into the knowledge base (admin) */
  ingestUrl: (title: string, url: string) =>
    api.post<{ documentId: string; chunksCreated: number }>('/ai/ingest/url', { title, url }),

  /** Ingest raw text (admin) */
  ingestText: (title: string, content: string) =>
    api.post<{ documentId: string; chunksCreated: number }>('/ai/ingest/text', { title, content }),

  /** Upload a .txt / .md file for ingestion (admin) */
  ingestFile: (title: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    return api.post<{ documentId: string; chunksCreated: number }>('/ai/ingest/file', form);
  },

  /** Upload a PDF for handbook ingestion (admin). Max 25MB. Stores in S3 and enqueues ingestion. */
  ingestPdf: (title: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    return api.post<{ documentId: string; status: string; message: string }>('/ai/ingest/pdf', form);
  },

  /** Re-index a knowledge document (admin). Requires document to have stored file (s3Key). */
  reindexDocument: (id: string) =>
    api.post<{ message: string }>(`/ai/knowledge/${id}/reindex`),

  /** Enable / disable a document */
  toggleDocument: (id: string, isActive: boolean) =>
    api.patch(`/ai/documents/${id}/toggle`, { isActive }),

  /** Permanently delete a document and its chunks */
  deleteDocument: (id: string) => api.delete(`/ai/documents/${id}`),

  /** Sync Riser policies into the knowledge base (admin). Empty body uses RISER_* env vars. */
  syncRiserPolicies: (body?: {
    baseUrl?: string;
    apiKey?: string;
    policyIds?: string;
  }) =>
    api.post<{
      synced: number;
      skipped: number;
      failed: number;
      details: { id: string; status: string; reason?: string }[];
      configMissing?: boolean;
    }>('/ai/riser/sync', body ?? {}),
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
  sources?: Array<{
    documentId: string;
    title: string;
    text: string;
    pagesLabel?: string;
  }>;
}

/** One server-sent event from POST /agent/chat-stream. Mirrors the backend `AgentStreamEvent` union. */
export type AgentStreamEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'thinking'; phase: 'tools' | 'compose' }
  | { type: 'delta'; delta: string }
  | { type: 'done'; payload: AgentResponse }
  | { type: 'error'; message: string };

export const agentApi = {
  chat: (message: string, conversationId?: string, allowWebSearch?: boolean) =>
    api.post<AgentResponse>('/agent/chat', { message, conversationId, allowWebSearch }),

  /**
   * Streaming variant of `chat`. Calls POST /agent/chat-stream and parses
   * the SSE response, invoking `onEvent` once per event. Resolves when the
   * server closes the stream. Throws on network/HTTP failure.
   *
   * Uses `fetch` directly because axios doesn't expose the response body as
   * a ReadableStream in browsers — we need byte-level access to parse SSE
   * frames as they arrive. Auth header is read from the same localStorage
   * key the axios interceptor uses.
   */
  chatStream: async (
    message: string,
    onEvent: (ev: AgentStreamEvent) => void,
    opts?: { conversationId?: string; allowWebSearch?: boolean; signal?: AbortSignal },
  ): Promise<void> => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const res = await fetch(`${API_URL}/api/agent/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        conversationId: opts?.conversationId,
        allowWebSearch: opts?.allowWebSearch,
      }),
      signal: opts?.signal,
    });

    if (!res.ok) {
      // Match axios behavior: 401 redirects to login.
      if (res.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.href = '/login';
      }
      throw new Error(`chat-stream failed: HTTP ${res.status}`);
    }
    if (!res.body) {
      throw new Error('chat-stream failed: no response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line ("\n\n"). Parse complete
        // frames out of the buffer; leave any partial trailing frame for the
        // next chunk.
        let sepIdx: number;
        while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          // A frame is one or more lines like `data: ...`. We only emit
          // events for `data:` lines (ignore comments / unrelated fields).
          const dataLines = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart());
          if (dataLines.length === 0) continue;

          const json = dataLines.join('\n');
          try {
            const parsed = JSON.parse(json) as AgentStreamEvent;
            onEvent(parsed);
          } catch {
            // Skip malformed frames silently — the stream is best-effort.
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }
  },

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
    sortOrder?: number;
  }) => api.post<import('@/types').WorkflowTemplateSubtaskDto>('/subtask-workflow/subtask-templates', data),
  updateSubtaskTemplate: (id: string, data: {
    title?: string;
    description?: string | null;
    departmentId?: string;
    assignedUserId?: string | null;
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
}

export interface WorkflowSubtaskTimingRow {
  subtaskTemplateId: string;
  title: string;
  sortOrder: number;
  departmentName: string;
  assignedUserName: string | null;
  avgDurationHours: number | null;
  completedCount: number;
}

export interface WorkflowSubtaskTimingResponse {
  templateId: string;
  templateName: string | null;
  subtasks: WorkflowSubtaskTimingRow[];
}

export const workflowAnalyticsApi = {
  getTemplates: () =>
    api.get<WorkflowTemplateAnalyticsRow[]>('/admin/workflow-analytics/templates'),
  getDepartments: () =>
    api.get<WorkflowDepartmentMetricsRow[]>('/admin/workflow-analytics/departments'),
  getBottlenecks: () =>
    api.get<WorkflowBottlenecksResponse>('/admin/workflow-analytics/bottlenecks'),
  getSubtaskTiming: (templateId: string) =>
    api.get<WorkflowSubtaskTimingResponse>(`/admin/workflow-analytics/subtask-timing`, {
      params: { templateId },
    }),
};

// ─── Admin ─────────────────────────────────────────────────────────────────

export const adminApi = {
  getTicketTaxonomy: () =>
    api.get<import('@/types').TicketTaxonomyResponse>('/admin/config/ticket-taxonomy'),

  // Markets
  listMarkets: () =>
    api.get<{ id: string; name: string; isActive: boolean; studios: { id: string; name: string }[] }[]>('/admin/markets'),
  createMarket: (data: { name: string }) => api.post('/admin/markets', data),
  updateMarket: (id: string, data: { isActive?: boolean }) => api.patch(`/admin/markets/${id}`, data),

  // Studios
  listStudios: () => api.get('/admin/studios'),
  createStudio: (data: {
    name: string;
    marketId: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
  }) => api.post('/admin/studios', data),
  updateStudio: (
    id: string,
    data: {
      name?: string;
      formattedAddress?: string;
      latitude?: number;
      longitude?: number;
      isActive?: boolean;
    },
  ) => api.patch(`/admin/studios/${id}`, data),

  // System monitoring (admin-only)
  invitations: {
    list: (params?: { status?: string; skip?: number; take?: number }) =>
      api.get<{
        data: Array<{
          id: string;
          emailNormalized: string;
          status: string;
          assignedRole: string;
          seedName: string;
          expiresAt: string;
          createdAt: string;
          acceptedAt: string | null;
          lastSentAt: string | null;
          sendCount: number;
          createdUserId: string | null;
          invitedByUserId: string;
        }>;
        total: number;
      }>('/admin/invitations', { params }),
    create: (data: {
      email: string;
      seedName: string;
      assignedRole: import('@/types').UserRole;
      departments?: import('@/types').Department[];
      defaultStudioId?: string;
      additionalStudioIds?: string[];
    }) =>
      api.post<{ id: string; emailNormalized: string; expiresAt: string }>('/admin/invitations', data),
    resend: (id: string) => api.post(`/admin/invitations/${id}/resend`),
    regenerate: (id: string) => api.post(`/admin/invitations/${id}/regenerate`),
    revoke: (id: string) => api.post(`/admin/invitations/${id}/revoke`),
  },

  getSystemServices: () =>
    api.get<{
      environment: { name: string; region?: string; version?: string | null };
      services: {
        id: string;
        name: string;
        category:
          | 'database'
          | 'cache'
          | 'storage'
          | 'email'
          | 'ai'
          | 'policy'
          | 'hosting'
          | 'monitoring'
          | 'other';
        roleDescription: string;
        status: 'healthy' | 'degraded' | 'unknown' | 'not_configured';
        statusReason?: string;
        criticality: 'critical' | 'important' | 'optional';
        lastCheckedAt: string;
        lastError?: string | null;
        details: {
          host?: string;
          region?: string;
          planHint?: string;
        };
        links: {
          label: string;
          url: string;
          kind: 'dashboard' | 'docs' | 'other';
        }[];
      }[];
    }>('/admin/system/services'),
};

// ─── Email Automation (admin) ───────────────────────────────────────────────

const EMAIL_AUTOMATION_PREFIX = '/admin/email-automation';

export const emailAutomationApi = {
  getConfig: () => api.get<{
    id: string;
    gmailLabel: string | null;
    gmailPollWindowHours: number;
    gmailConnectedEmail: string | null;
    assemblyCategoryId: string | null;
    systemRequesterId: string | null;
    minOrderNumberConfidence: number;
    minAddressConfidence: number;
    minItemConfidence: number;
    isEnabled: boolean;
    updatedAt: string;
    createdAt: string;
  }>(`${EMAIL_AUTOMATION_PREFIX}/config`),
  getGmailAuthUrl: () =>
    api.get<{ url: string }>(`${EMAIL_AUTOMATION_PREFIX}/gmail/auth-url`),
  gmailDisconnect: () =>
    api.post<{ ok: boolean }>(`${EMAIL_AUTOMATION_PREFIX}/gmail/disconnect`),
  updateConfig: (data: {
    gmailLabel?: string | null;
    gmailPollWindowHours?: number;
    assemblyCategoryId?: string | null;
    systemRequesterId?: string | null;
    minOrderNumberConfidence?: number;
    minAddressConfidence?: number;
    minItemConfidence?: number;
    isEnabled?: boolean;
  }) => api.patch(`${EMAIL_AUTOMATION_PREFIX}/config`, data),
  runIngest: () =>
    api.post<{ fetched: number; stored: number; skipped: number }>(`${EMAIL_AUTOMATION_PREFIX}/ingest/run`),

  listAssemblyItems: () =>
    api.get<{ id: string; keywordOrPhrase: string; displayName: string | null; matchMode: string; isActive: boolean; sortOrder: number }[]>(
      `${EMAIL_AUTOMATION_PREFIX}/assembly-items`,
    ),
  createAssemblyItem: (data: { keywordOrPhrase: string; displayName?: string | null; matchMode?: string; isActive?: boolean; sortOrder?: number }) =>
    api.post(`${EMAIL_AUTOMATION_PREFIX}/assembly-items`, data),
  updateAssemblyItem: (id: string, data: { keywordOrPhrase?: string; displayName?: string | null; matchMode?: string; isActive?: boolean; sortOrder?: number }) =>
    api.patch(`${EMAIL_AUTOMATION_PREFIX}/assembly-items/${id}`, data),
  deleteAssemblyItem: (id: string) => api.delete(`${EMAIL_AUTOMATION_PREFIX}/assembly-items/${id}`),

  listNormalizedAddresses: () =>
    api.get<{ id: string; studioId: string; normalizedAddress: string; studio: { id: string; name: string } }[]>(
      `${EMAIL_AUTOMATION_PREFIX}/normalized-addresses`,
    ),
  refreshNormalizedAddresses: () =>
    api.post<{ updated: number }>(`${EMAIL_AUTOMATION_PREFIX}/normalized-addresses/refresh`),

  listEmails: (params?: { page?: number; limit?: number; classification?: string }) =>
    api.get(`${EMAIL_AUTOMATION_PREFIX}/emails`, { params }),
  getEmail: (id: string) => api.get(`${EMAIL_AUTOMATION_PREFIX}/emails/${id}`),
  reprocessEmail: (id: string) =>
    api.post<{ classification: string; outcome: string }>(`${EMAIL_AUTOMATION_PREFIX}/emails/${id}/reprocess`),

  listReviewQueue: (params?: { reason?: string; status?: string; page?: number; limit?: number }) =>
    api.get(`${EMAIL_AUTOMATION_PREFIX}/review-queue`, { params }),
  resolveReviewItem: (id: string, resolvedBy?: string) =>
    api.patch(`${EMAIL_AUTOMATION_PREFIX}/review-queue/${id}/resolve`, { resolvedBy }),
  dismissReviewItem: (id: string) =>
    api.patch(`${EMAIL_AUTOMATION_PREFIX}/review-queue/${id}/dismiss`),

  listEvents: (params?: { emailId?: string; eventType?: string; page?: number; limit?: number }) =>
    api.get(`${EMAIL_AUTOMATION_PREFIX}/events`, { params }),

  /** Paste raw email, get classification + extracted fields + assembly match + studio match (no persist). */
  emailPatternPlayground: (data: { rawEmail: string; subject?: string; body?: string }) =>
    api.post<{
      classification: { type: string; confidence: number };
      extractedOrder?: {
        orderNumber: string;
        vendorIdentifier: string;
        vendorDomain: string | null;
        shippingAddressRaw: string | null;
        lineItems: { itemName: string; quantity: number }[];
        orderNumberConfidence: number;
        addressConfidence: number;
        itemConfidence: number;
      };
      extractedDelivery?: {
        orderNumber: string;
        vendorDomain: string | null;
        deliveryTimestamp: string | null;
        lineItems: { itemName: string; quantity: number }[];
        orderNumberConfidence: number;
        itemConfidence: number;
      };
      assemblyMatch?: { matched: boolean; matchedKeywords: string[]; matchedLineItemNames: string[] };
      studioMatch?: { kind: 'single'; studioId: string } | { kind: 'none' } | { kind: 'ambiguous'; studioIds: string[] };
    }>(`${EMAIL_AUTOMATION_PREFIX}/email-pattern-playground`, data),
};

// ─── Lease IQ (admin) ─────────────────────────────────────────────────────

const LEASE_IQ_PREFIX = '/admin/lease-iq';

export type LeaseIqSourceRow = {
  id: string;
  sourceType: string;
  originalFileName: string | null;
  uploadedAt: string;
  uploadedByUserId: string | null;
  uploadedBytes: number | null;
  textCharCount: number | null;
};

export const leaseIqApi = {
  listSources: (studioId: string) =>
    api.get<LeaseIqSourceRow[]>(`${LEASE_IQ_PREFIX}/studios/${studioId}/sources`),
  uploadSource: (studioId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ id: string }>(`${LEASE_IQ_PREFIX}/studios/${studioId}/sources/upload`, form);
  },
  pasteSource: (studioId: string, pastedText: string) =>
    api.post<{ id: string }>(`${LEASE_IQ_PREFIX}/studios/${studioId}/sources/paste`, { pastedText }),
  deleteSource: (studioId: string, sourceId: string) =>
    api.delete(`${LEASE_IQ_PREFIX}/studios/${studioId}/sources/${sourceId}`),
  parse: (studioId: string, sourceIds: string[]) =>
    api.post<{ rulesetId: string }>(`${LEASE_IQ_PREFIX}/studios/${studioId}/parse`, { sourceIds }),
  studiosWithRulesets: () =>
    api.get<{ studioIds: string[]; publishedStudioIds: string[] }>(
      `${LEASE_IQ_PREFIX}/studios-with-rulesets`,
    ),
  listRulesets: (studioId: string) =>
    api.get<{ id: string; status: string; createdAt: string; _count: { rules: number } }[]>(
      `${LEASE_IQ_PREFIX}/studios/${studioId}/rulesets`,
    ),
  getRuleset: (rulesetId: string) =>
    api.get<{
      id: string;
      status: string;
      rules: Array<{
        id: string;
        ruleType: string;
        categoryScope: string | null;
        clauseReference: string | null;
        notes: string | null;
        priority: number;
        terms: Array<{ id: string; term: string; termType: string }>;
      }>;
    }>(`${LEASE_IQ_PREFIX}/rulesets/${rulesetId}`),
  updateRules: (
    rulesetId: string,
    rules: Array<{
      ruleType: string;
      categoryScope?: string | null;
      clauseReference?: string | null;
      notes?: string | null;
      priority?: number;
      terms: Array<{ term: string; termType: string }>;
    }>,
  ) =>
    api.patch(`${LEASE_IQ_PREFIX}/rulesets/${rulesetId}/rules`, { rules }),
  publish: (studioId: string, rulesetId: string) =>
    api.post(`${LEASE_IQ_PREFIX}/studios/${studioId}/publish`, { rulesetId }),
  playground: (data: {
    studioId: string;
    maintenanceCategoryId?: string | null;
    title: string;
    description: string;
  }) =>
    api.post<{
      suggestedResponsibility: string;
      confidence: string;
      matchedRuleIds: string[];
      matchedTerms: string[];
      explanation: string;
      ruleSetId: string | null;
    }>(`${LEASE_IQ_PREFIX}/playground`, data),
  copyPrompt: () =>
    api.get<{ text: string }>(`${LEASE_IQ_PREFIX}/copy-prompt`),
};

// ─── Dispatch Intelligence ─────────────────────────────────────────────────

export const dispatchApi = {
  getRecommendations: (ticketId: string, params?: { radiusMiles?: number; tradeType?: string }) =>
    api.get<{
      primaryTicket: any;
      sameLocationCandidates: any[];
      nearbyLocationCandidates: any[];
      summary: { sameLocationCount: number; nearbyCount: number; message?: string };
    }>(`/dispatch/recommendations/${ticketId}`, { params }),

  getSuggestedTradeType: (maintenanceCategoryId: string) =>
    api.get<{ suggestedDispatchTradeType: string | null }>(
      `/dispatch/classification/suggest/${maintenanceCategoryId}`,
    ),

  getReadyTickets: (params?: { tradeType?: string; studioId?: string; marketId?: string; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>(
      '/dispatch/ready',
      { params },
    ),

  listGroups: (params?: { status?: string; tradeType?: string; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>(
      '/dispatch/groups',
      { params },
    ),

  getGroup: (id: string) => api.get<any>(`/dispatch/groups/${id}`),

  createGroup: (data: { tradeType: string; ticketIds: string[]; notes?: string; targetDate?: string }) =>
    api.post<any>('/dispatch/groups', data),

  updateGroup: (id: string, data: { notes?: string; targetDate?: string; status?: string }) =>
    api.patch<any>(`/dispatch/groups/${id}`, data),

  addItem: (groupId: string, ticketId: string) =>
    api.post<any>(`/dispatch/groups/${groupId}/items`, { ticketId }),

  removeItem: (groupId: string, itemId: string) =>
    api.delete(`/dispatch/groups/${groupId}/items/${itemId}`),

  reorderItems: (groupId: string, order: { itemId: string; stopOrder: number }[]) =>
    api.patch(`/dispatch/groups/${groupId}/items/reorder`, { order }),

  getWorkspaceNearby: (params: { anchorTicketId: string; radiusMiles: number }) =>
    api.get<{ anchor: any; nearby: any[]; message?: string }>('/dispatch/workspace/nearby', { params }),

  listTemplates: () => api.get<any[]>('/dispatch/templates'),
  getTemplate: (id: string) => api.get<any>(`/dispatch/templates/${id}`),
  createTemplate: (data: {
    name: string;
    dispatchTradeType: string;
    maintenanceCategoryId?: string;
    anchorStudioId?: string;
    radiusMiles: number;
  }) => api.post<any>('/dispatch/templates', data),
  updateTemplate: (id: string, data: {
    name?: string;
    dispatchTradeType?: string;
    maintenanceCategoryId?: string | null;
    anchorStudioId?: string | null;
    radiusMiles?: number;
  }) => api.patch<any>(`/dispatch/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/dispatch/templates/${id}`),
};

// ─── Location Profiles ──────────────────────────────────────────────────────

export const locationsApi = {
  getProfile: (studioId: string) =>
    api.get<import('@/types').LocationProfileResponse>(`/locations/${studioId}/profile`),
};

/** PATCH /admin/studios/:id/profile — partial body; matches API UpsertStudioProfileDto */
export type StudioProfilePatch = Partial<{
  district: string;
  status: string;
  maturity: string;
  studioSize: number | null;
  priceTier: number | null;
  openType: string;
  studioOpenDate: string | null;
  rfSoftOpenDate: string | null;
  dm: string;
  gm: string;
  agm: string;
  edc: string;
  li: string;
  studioEmail: string;
  gmEmail: string;
  gmTeams: string;
  liEmail: string;
  studioCode: string;
  netsuiteName: string;
  ikismetName: string;
  crName: string;
  crId: string;
  paycomCode: string;
}>;

export const adminStudiosApi = {
  patchStudioProfile: (studioId: string, body: StudioProfilePatch) =>
    api.patch(`/admin/studios/${studioId}/profile`, body),
};

export const usersApi = {
  list: () => api.get<import('@/types').User[]>('/users'),
  get: (id: string) => api.get<import('@/types').User>(`/users/${id}`),
  updateRole: (id: string, role: import('@/types').UserRole) =>
    api.patch(`/users/${id}/role`, { role }),
  setDepartments: (id: string, departments: import('@/types').Department[]) =>
    api.patch(`/users/${id}/departments`, { departments }),
  deactivate: (id: string) => api.patch(`/users/${id}/deactivate`),
  setDefaultStudio: (userId: string, studioId: string | null) =>
    api.patch<{ id: string; studioId: string | null; studio: { id: string; name: string } | null }>(`/users/${userId}/default-studio`, { studioId }),
  listStudioScopes: (userId: string) =>
    api.get<import('@/types').StudioScopeItem[]>(`/users/${userId}/studio-scopes`),
  addStudioScope: (userId: string, studioId: string) =>
    api.post<import('@/types').StudioScopeItem[]>(`/users/${userId}/studio-scopes`, { studioId }),
  removeStudioScope: (userId: string, studioId: string) =>
    api.delete<import('@/types').StudioScopeItem[]>(`/users/${userId}/studio-scopes/${studioId}`),
  /** Default studio = first by name; additional scopes = all other studios. */
  grantAllStudioScopes: (userId: string) =>
    api.post<{
      id: string;
      studioId: string | null;
      studio: { id: string; name: string } | null;
      scopes: import('@/types').StudioScopeItem[];
    }>(`/users/${userId}/studio-scopes/grant-all`),
  /** Clears additional scopes only (does not change default studio). */
  removeAllStudioScopes: (userId: string) =>
    api.delete<import('@/types').StudioScopeItem[]>(`/users/${userId}/studio-scopes/all`),
};
