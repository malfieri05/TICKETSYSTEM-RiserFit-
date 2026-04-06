import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/database/prisma.service';
import { EmailChannel } from '../../modules/notifications/channels/email.channel';
import { TeamsChannel } from '../../modules/notifications/channels/teams.channel';
import { QUEUES, DispatchJobData } from '../../common/queue/queue.constants';

/**
 * NotificationDispatchProcessor — sends a single notification delivery.
 *
 * Receives one job per user per channel.
 * Checks idempotency before sending (status === PENDING).
 * Marks delivery SENT on success, FAILED on error (BullMQ retries on throw).
 * After max attempts, BullMQ moves job to the failed set — admin can inspect via Bull Board.
 */
@Processor(QUEUES.NOTIFICATION_DISPATCH)
export class NotificationDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannel,
    private teamsChannel: TeamsChannel,
  ) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<void> {
    const { notificationDeliveryId, channel } = job.data;

    // Load delivery + notification + user
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: notificationDeliveryId },
      include: {
        notification: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    if (!delivery) {
      this.logger.warn(
        `Delivery ${notificationDeliveryId} not found — skipping`,
      );
      return;
    }

    // Idempotency check — already sent (e.g. retried job but first attempt succeeded)
    if (delivery.status === 'SENT') {
      this.logger.debug(
        `Delivery ${notificationDeliveryId} already SENT — skipping`,
      );
      return;
    }

    // Mark as in-progress (update attempt count)
    await this.prisma.notificationDelivery.update({
      where: { id: notificationDeliveryId },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    const { notification } = delivery;
    const { user } = notification;

    try {
      switch (channel) {
        case 'EMAIL':
          await this.emailChannel.send({
            to: user.email,
            subject: notification.title,
            htmlBody: this.buildEmailHtml(
              notification.title,
              notification.body,
              notification.ticketId,
            ),
            textBody: `${notification.title}\n\n${notification.body}`,
            notificationDeliveryId,
          });
          break;

        case 'TEAMS':
          await this.teamsChannel.send({
            title: notification.title,
            body: notification.body,
            ticketId: notification.ticketId,
            notificationDeliveryId,
          });
          break;

        case 'IN_APP':
          // In-app is handled synchronously in the fan-out processor
          // This case shouldn't normally be reached via queue
          break;

        default:
          this.logger.warn(`Unknown channel ${channel} — skipping`);
      }
    } catch (err) {
      // Record the failure reason before BullMQ retries or dead-letters the job.
      // Without this, deliveries stay in an ambiguous state with only attemptCount incremented.
      const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
      await this.prisma.notificationDelivery.update({
        where: { id: notificationDeliveryId },
        data: {
          status: isLastAttempt ? 'FAILED' : undefined,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw err; // re-throw so BullMQ can retry / dead-letter
    }
  }

  private buildEmailHtml(
    title: string,
    body: string,
    ticketId?: string | null,
  ): string {
    const appUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const ticketLink = ticketId
      ? `<p><a href="${appUrl}/tickets/${ticketId}" style="color:#2563EB;">View Ticket</a></p>`
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#1f2937;">
        <div style="border-bottom:2px solid #2563EB;padding-bottom:12px;margin-bottom:20px;">
          <h1 style="font-size:18px;margin:0;color:#2563EB;">Ticket System</h1>
        </div>
        <h2 style="font-size:16px;">${this.escapeHtml(title)}</h2>
        <p style="color:#4b5563;">${this.escapeHtml(body)}</p>
        ${ticketLink}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">
          You received this because you are subscribed to ticket notifications.<br>
          <a href="${appUrl}/notifications/preferences">Manage preferences</a>
        </p>
      </body>
      </html>
    `.trim();
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
