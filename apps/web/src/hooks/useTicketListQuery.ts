'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ticketsApi } from '@/lib/api';
import type { TicketFilters, TicketListItem } from '@/types';

const PAGE_SIZE_DEFAULT = 20;

/** Build a stable array for React Query key from filter params (no undefined, sorted keys). */
export function normalizeTicketListKey(
  listKey: string,
  params: TicketFilters & { viewTab?: string; search?: string },
): unknown[] {
  const {
    page = 1,
    limit = PAGE_SIZE_DEFAULT,
    search,
    viewTab,
    status,
    statusGroup,
    priority,
    departmentId,
    ticketClassId,
    supportTopicId,
    studioId,
    marketId,
    maintenanceCategoryId,
    ownerId,
    requesterId,
    teamId,
    actionableForMe,
  } = params;

  const key: unknown[] = ['tickets', listKey, page, limit, search ?? '', viewTab ?? '', statusGroup ?? ''];

  const filterKeys = [
    'status',
    'priority',
    'departmentId',
    'ticketClassId',
    'supportTopicId',
    'studioId',
    'marketId',
    'maintenanceCategoryId',
    'ownerId',
    'requesterId',
    'teamId',
  ] as const;

  for (const k of filterKeys) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') {
      key.push(k, v);
    }
  }
  if (params.actionableForMe === true) key.push('actionableForMe', true);

  return key;
}

/** Build API params from the same shape (exclude viewTab; include search). */
export function buildListParams(
  params: TicketFilters & { viewTab?: string; search?: string },
): TicketFilters {
  const { viewTab: _v, ...rest } = params;
  const out: TicketFilters = {
    page: rest.page ?? 1,
    limit: rest.limit ?? PAGE_SIZE_DEFAULT,
    ...(rest.search && { search: rest.search }),
  };
  if (rest.status != null) out.status = rest.status;
  if (rest.statusGroup != null) out.statusGroup = rest.statusGroup;
  if (rest.priority != null) out.priority = rest.priority;
  if (rest.departmentId != null) out.departmentId = rest.departmentId;
  if (rest.ticketClassId != null) out.ticketClassId = rest.ticketClassId;
  if (rest.supportTopicId != null) out.supportTopicId = rest.supportTopicId;
  if (rest.studioId != null) out.studioId = rest.studioId;
  if (rest.marketId != null) out.marketId = rest.marketId;
  if (rest.maintenanceCategoryId != null) out.maintenanceCategoryId = rest.maintenanceCategoryId;
  if (rest.ownerId != null) out.ownerId = rest.ownerId;
  if (rest.requesterId != null) out.requesterId = rest.requesterId;
  if (rest.teamId != null) out.teamId = rest.teamId;
  if (rest.actionableForMe === true) out.actionableForMe = true;
  return out;
}

export type TicketListKey = 'list' | 'actionable' | 'portal-my' | 'portal-studio';

export interface UseTicketListQueryParams extends TicketFilters {
  viewTab?: 'active' | 'completed';
  search?: string;
}

export interface UseTicketListQueryResult {
  data: { data: TicketListItem[]; total: number } | undefined;
  tickets: TicketListItem[];
  total: number;
  totalPages: number;
  isLoading: boolean;
  isFetching: boolean;
  isInitialLoading: boolean;
  isPlaceholderData: boolean;
}

export function useTicketListQuery(
  listKey: TicketListKey,
  params: UseTicketListQueryParams,
  options?: { enabled?: boolean },
): UseTicketListQueryResult {
  const apiParams = buildListParams(params);
  const queryKey = normalizeTicketListKey(listKey, params);

  const { data, isLoading, isFetching, isPlaceholderData } = useQuery({
    queryKey,
    queryFn: () => ticketsApi.list(apiParams),
    enabled: options?.enabled !== false,
    placeholderData: keepPreviousData,
  });

  const payload = data?.data;
  const tickets = payload?.data ?? [];
  const total = payload?.total ?? 0;
  const limit = params.limit ?? PAGE_SIZE_DEFAULT;
  const totalPages = Math.ceil(total / limit);

  const isInitialLoading = isLoading && !isPlaceholderData;

  return {
    data: payload,
    tickets,
    total,
    totalPages,
    isLoading,
    isFetching,
    isInitialLoading,
    isPlaceholderData,
  };
}
