/** Query param for opening a ticket in the `/tickets` feed drawer (not full-page detail). */
export const TICKETS_PANEL_QUERY_PARAM = 'panel';

export function ticketsPanelUrl(ticketId: string): string {
  const q = new URLSearchParams();
  q.set(TICKETS_PANEL_QUERY_PARAM, ticketId);
  return `/tickets?${q.toString()}`;
}
