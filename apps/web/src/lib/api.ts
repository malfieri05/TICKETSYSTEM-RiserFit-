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
  devLogin: (email: string) =>
    api.post<{ access_token: string; user: import('@/types').User }>('/auth/dev-login', { email }),
  me: () => api.get<import('@/types').User>('/auth/me'),
};

// ─── Tickets ───────────────────────────────────────────────────────────────

export const ticketsApi = {
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

// ─── Admin ─────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get<import('@/types').User[]>('/users'),
  get: (id: string) => api.get<import('@/types').User>(`/users/${id}`),
  updateRole: (id: string, role: import('@/types').UserRole) =>
    api.patch(`/users/${id}/role`, { role }),
  deactivate: (id: string) => api.patch(`/users/${id}/deactivate`),
};
