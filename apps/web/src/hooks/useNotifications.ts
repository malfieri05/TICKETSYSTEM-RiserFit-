'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import { useAuth } from './useAuth';

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

/** Subscribe to SSE notification stream and invalidate query cache on new events */
export function useNotificationStream() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const url = `${apiUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);

    es.addEventListener('notification', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [token, apiUrl, queryClient]);

  return { connected };
}
