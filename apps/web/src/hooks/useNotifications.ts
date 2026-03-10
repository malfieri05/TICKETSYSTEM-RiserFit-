'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import { useAuth } from './useAuth';

const TICKET_UPDATE_DEBOUNCE_MS = 250;

export function useNotificationCount() {
  const { token } = useAuth();
  const { data } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => notificationsApi.list({ unreadOnly: true, limit: 1 }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return { unreadCount: data?.data.total ?? 0 };
}

export function useNotifications(params?: { page?: number; limit?: number; unreadOnly?: boolean }) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => notificationsApi.list(params),
    enabled: !!token,
  });
}

interface TicketUpdatePayload {
  ticketId: string;
  eventType: string;
  occurredAt: string;
}

/** Subscribe to SSE stream: notifications + ticket_update. Invalidates React Query with debounce. */
export function useNotificationStream() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const [connected, setConnected] = useState(false);

  const pendingTicketIdsRef = useRef<Set<string>>(new Set());
  const pendingInboxFoldersRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasOpenedOnceRef = useRef(false);

  useEffect(() => {
    if (!token) return;

    function flushTicketUpdates() {
      const ticketIds = Array.from(pendingTicketIdsRef.current);
      const shouldInvalidateInboxFolders = pendingInboxFoldersRef.current;
      pendingTicketIdsRef.current = new Set();
      pendingInboxFoldersRef.current = false;
      debounceTimerRef.current = null;

      for (const ticketId of ticketIds) {
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId, 'subtasks'] });
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId, 'history'] });
      }
      queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets', 'actionable'] });
      queryClient.invalidateQueries({ queryKey: ['tickets', 'portal-my'] });
      queryClient.invalidateQueries({ queryKey: ['tickets', 'portal-studio'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      if (shouldInvalidateInboxFolders) {
        queryClient.invalidateQueries({ queryKey: ['inbox-folders'] });
      }
    }

    function scheduleFlush() {
      if (debounceTimerRef.current) return;
      debounceTimerRef.current = setTimeout(() => {
        flushTicketUpdates();
      }, TICKET_UPDATE_DEBOUNCE_MS);
    }

    function onTicketUpdate(payload: TicketUpdatePayload) {
      const { ticketId, eventType } = payload;
      if (!ticketId || !eventType) return;
      pendingTicketIdsRef.current.add(ticketId);
      if (eventType === 'SUBTASK_BECAME_READY') {
        pendingInboxFoldersRef.current = true;
      }
      scheduleFlush();
    }

    const url = `${apiUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onopen = () => {
      setConnected(true);
      if (hasOpenedOnceRef.current) {
        // Reconnect: catch up by invalidating ticket lists once
        queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] });
        queryClient.invalidateQueries({ queryKey: ['tickets', 'actionable'] });
        queryClient.invalidateQueries({ queryKey: ['tickets', 'portal-my'] });
        queryClient.invalidateQueries({ queryKey: ['tickets', 'portal-studio'] });
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
      }
      hasOpenedOnceRef.current = true;
    };

    es.addEventListener('notification', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'count'] });
    });

    es.addEventListener('ticket_update', (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        onTicketUpdate(data as TicketUpdatePayload);
      } catch {
        // ignore malformed payload
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      es.close();
      setConnected(false);
    };
  }, [token, apiUrl, queryClient]);

  return { connected };
}
