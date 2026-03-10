import { Injectable } from '@nestjs/common';

// ── SLA resolution targets (hours) per priority ──────────────────────────────
// These can be overridden via env vars for future admin configurability.
// "Resolution SLA" = time from ticket creation to status RESOLVED/CLOSED.
export const SLA_RESOLUTION_HOURS: Record<string, number> = {
  URGENT: parseFloat(process.env.SLA_URGENT_HOURS ?? '4'), // 4 hours
  HIGH: parseFloat(process.env.SLA_HIGH_HOURS ?? '24'), // 1 business day
  MEDIUM: parseFloat(process.env.SLA_MEDIUM_HOURS ?? '72'), // 3 business days
  LOW: parseFloat(process.env.SLA_LOW_HOURS ?? '168'), // 1 week
};

// Ticket is "AT_RISK" when less than 20% of resolution time remains
const AT_RISK_THRESHOLD = 0.2;

export type SlaStatusValue = 'OK' | 'AT_RISK' | 'BREACHED' | 'RESOLVED';

export interface SlaStatus {
  status: SlaStatusValue;
  targetHours: number;
  elapsedHours: number;
  remainingHours: number;
  percentUsed: number;
}

@Injectable()
export class SlaService {
  /**
   * Compute the SLA resolution status for a single ticket.
   *
   * - RESOLVED/CLOSED tickets always return `{ status: 'RESOLVED' }`.
   * - Open tickets are measured from `createdAt` to now.
   * - BREACHED: elapsedHours > targetHours
   * - AT_RISK:  remainingHours < 20% of targetHours
   * - OK:       all good
   */
  compute(ticket: {
    priority: string;
    status: string;
    createdAt: Date;
    resolvedAt?: Date | null;
  }): SlaStatus {
    const isResolved =
      ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

    const targetHours =
      SLA_RESOLUTION_HOURS[ticket.priority] ?? SLA_RESOLUTION_HOURS['MEDIUM'];

    const referenceDate =
      isResolved && ticket.resolvedAt ? ticket.resolvedAt : new Date();

    const elapsedMs = referenceDate.getTime() - ticket.createdAt.getTime();
    const elapsedHours = parseFloat((elapsedMs / (1000 * 60 * 60)).toFixed(2));
    const remainingHours = parseFloat((targetHours - elapsedHours).toFixed(2));
    const percentUsed = Math.min(
      100,
      parseFloat(((elapsedHours / targetHours) * 100).toFixed(1)),
    );

    if (isResolved) {
      return {
        status: 'RESOLVED',
        targetHours,
        elapsedHours,
        remainingHours,
        percentUsed,
      };
    }

    if (elapsedHours >= targetHours) {
      return {
        status: 'BREACHED',
        targetHours,
        elapsedHours,
        remainingHours,
        percentUsed,
      };
    }

    if (remainingHours / targetHours < AT_RISK_THRESHOLD) {
      return {
        status: 'AT_RISK',
        targetHours,
        elapsedHours,
        remainingHours,
        percentUsed,
      };
    }

    return {
      status: 'OK',
      targetHours,
      elapsedHours,
      remainingHours,
      percentUsed,
    };
  }

  /** Annotate a collection of ticket objects with their SLA status. */
  annotateMany<
    T extends {
      priority: string;
      status: string;
      createdAt: Date;
      resolvedAt?: Date | null;
    },
  >(tickets: T[]): (T & { sla: SlaStatus })[] {
    return tickets.map((t) => ({ ...t, sla: this.compute(t) }));
  }

  /** Returns true if a ticket has crossed its resolution SLA target. */
  isBreached(ticket: {
    priority: string;
    status: string;
    createdAt: Date;
  }): boolean {
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')
      return false;
    return this.compute(ticket).status === 'BREACHED';
  }
}
