/** Keep in sync with `TicketDrawer` shell: `width: min(828px, 68vw)`. */
const TICKET_DRAWER_MAX_PX = 828;
const TICKET_DRAWER_VW = 0.68;

export function getTicketDrawerWidthPx(): number {
  if (typeof window === 'undefined') return TICKET_DRAWER_MAX_PX;
  return Math.min(TICKET_DRAWER_MAX_PX, window.innerWidth * TICKET_DRAWER_VW);
}
