import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { SlaService } from '../../modules/sla/sla.service';
import { QUEUES } from '../../common/queue/queue.constants';

const OPEN_STATUSES = [
  'NEW',
  'TRIAGED',
  'IN_PROGRESS',
  'WAITING_ON_REQUESTER',
  'WAITING_ON_VENDOR',
];

/**
 * StaleTicketProcessor — runs on a repeatable schedule to check for SLA breaches.
 *
 * Logic:
 * 1. Find all OPEN tickets
 * 2. For each ticket, compute SLA status
 * 3. If BREACHED, check if we already sent an SLA breach notification today
 * 4. If not yet notified today → create TICKET_SLA_BREACHED notification for owner + all admins
 *
 * Idempotency: uses `checkExists()` to prevent duplicate notifications per ticket per day.
 */
@Processor(QUEUES.SCHEDULED)
export class StaleTicketProcessor extends WorkerHost {
  private readonly logger = new Logger(StaleTicketProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private sla: SlaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'stale-ticket-check') return;

    this.logger.log('Running stale ticket SLA check…');

    // 1. Load all open tickets
    const openTickets = await this.prisma.ticket.findMany({
      where: { status: { in: OPEN_STATUSES as any } },
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        ownerId: true,
        owner: { select: { id: true, name: true, email: true } },
        market: { select: { name: true } },
      },
    });

    let breachCount = 0;
    let notifiedCount = 0;

    for (const ticket of openTickets) {
      const slaStatus = this.sla.compute(ticket);
      if (slaStatus.status !== 'BREACHED') continue;

      breachCount++;

      // 2. Idempotency: skip if already notified in the last 23 hours
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          ticketId: ticket.id,
          eventType: 'TICKET_SLA_BREACHED' as any,
          createdAt: { gte: new Date(Date.now() - 23 * 60 * 60 * 1000) },
        },
      });

      if (alreadyNotified) continue;

      // 3. Notify ticket owner (if assigned)
      const recipientIds = new Set<string>();
      if (ticket.ownerId) recipientIds.add(ticket.ownerId);

      // Also notify all ADMIN and MANAGER users (escalation)
      const escalationUsers = await this.prisma.user.findMany({
        where: { role: { in: ['ADMIN'] }, isActive: true },
        select: { id: true },
      });
      escalationUsers.forEach((u) => recipientIds.add(u.id));

      const title = `⚠️ SLA Breached: ${ticket.title}`;
      const elapsedHours = slaStatus.elapsedHours.toFixed(1);
      const targetHours = slaStatus.targetHours;
      const body = `Ticket #${ticket.id.slice(0, 8)} (${ticket.priority}) has exceeded its ${targetHours}h SLA target — ${elapsedHours}h elapsed without resolution.`;

      for (const userId of recipientIds) {
        await this.notifications.createAndDeliver({
          userId,
          ticketId: ticket.id,
          eventType: 'TICKET_SLA_BREACHED',
          title,
          body,
          metadata: {
            priority: ticket.priority,
            elapsedHours,
            targetHours,
          },
        });
      }

      notifiedCount++;
    }

    this.logger.log(
      `SLA check complete: ${openTickets.length} open tickets, ${breachCount} breached, ${notifiedCount} newly notified`,
    );
  }
}
