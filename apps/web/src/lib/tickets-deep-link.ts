import type { TicketFilters } from '@/types';

/** Query param for opening a ticket in the `/tickets` feed drawer (not full-page detail). */
export const TICKETS_PANEL_QUERY_PARAM = 'panel';

export function ticketsPanelUrl(ticketId: string): string {
  const q = new URLSearchParams();
  q.set(TICKETS_PANEL_QUERY_PARAM, ticketId);
  return `/tickets?${q.toString()}`;
}

const FEED_DEEP_LINK_KEYS: (keyof TicketFilters)[] = [
  'departmentId',
  'ticketClass',
  'supportTopicId',
  'maintenanceCategoryId',
  'studioId',
  'tagId',
  'createdAfter',
  'createdBefore',
];

/**
 * `/tickets` URL with query params read by the Tickets feed (`FILTER_KEYS` there).
 * Optional `range` sets created date bounds (YYYY-MM-DD) to match the dashboard KPI window.
 */
export function buildTicketsFeedHref(
  filters: Partial<TicketFilters>,
  range?: { from: string; to: string },
): string {
  const merged: Partial<TicketFilters> = { ...filters };
  if (range?.from && range?.to) {
    merged.createdAfter = `${range.from}T00:00:00.000Z`;
    merged.createdBefore = `${range.to}T23:59:59.999Z`;
  }
  const params = new URLSearchParams();
  for (const key of FEED_DEEP_LINK_KEYS) {
    const v = merged[key];
    if (v) params.set(key, v as string);
  }
  const qs = params.toString();
  return qs ? `/tickets?${qs}` : '/tickets';
}
