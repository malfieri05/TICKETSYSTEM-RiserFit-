import { TicketStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/**
 * TICKET STATE MACHINE
 * ====================
 * This is the ONLY place in the codebase where ticket status transitions are defined.
 * All status changes MUST go through assertValidTransition() before persisting.
 *
 * Transition map:
 *   NEW              → TRIAGED, IN_PROGRESS, CLOSED  (Stage 2: auto NEW→IN_PROGRESS on subtask activity)
 *   TRIAGED          → IN_PROGRESS, CLOSED
 *   IN_PROGRESS      → WAITING_ON_REQUESTER, WAITING_ON_VENDOR, RESOLVED
 *   WAITING_ON_*     → IN_PROGRESS, RESOLVED, CLOSED
 *   RESOLVED         → CLOSED, IN_PROGRESS  (re-open allowed)
 *   CLOSED           → (terminal — no transitions)
 */
export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['TRIAGED', 'IN_PROGRESS', 'CLOSED'],
  TRIAGED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR', 'RESOLVED'],
  WAITING_ON_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  WAITING_ON_VENDOR: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export function assertValidTransition(
  currentStatus: TicketStatus,
  newStatus: TicketStatus,
): void {
  if (currentStatus === newStatus) {
    throw new BadRequestException(
      `Ticket is already in status ${currentStatus}.`,
    );
  }

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(newStatus)) {
    const allowedList =
      allowed.length > 0
        ? allowed.join(', ')
        : 'none — this is a terminal status';
    throw new BadRequestException(
      `Cannot transition from ${currentStatus} → ${newStatus}. Allowed: [${allowedList}]`,
    );
  }
}

export function isTerminalStatus(status: TicketStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}
