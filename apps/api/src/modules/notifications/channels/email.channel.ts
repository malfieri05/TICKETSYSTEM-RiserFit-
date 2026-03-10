import { Injectable, Logger } from '@nestjs/common';
import * as postmark from 'postmark';
import { PrismaService } from '../../../common/database/prisma.service';

export interface EmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  notificationDeliveryId: string;
}

/**
 * EmailChannel — sends transactional emails via Postmark.
 *
 * Design:
 * - Uses idempotency keys on NotificationDelivery records to prevent duplicate sends.
 * - Records every send attempt (success/failure) in notification_deliveries table.
 * - Fails gracefully: errors are caught, logged, and re-thrown so BullMQ can retry.
 */
@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private client: postmark.ServerClient | null = null;
  private readonly fromEmail: string;

  constructor(private prisma: PrismaService) {
    const apiToken = process.env.POSTMARK_API_TOKEN;
    this.fromEmail =
      process.env.POSTMARK_FROM_EMAIL ?? 'tickets@yourcompany.com';

    if (apiToken) {
      this.client = new postmark.ServerClient(apiToken);
      this.logger.log('Postmark email client initialized');
    } else {
      this.logger.warn(
        'POSTMARK_API_TOKEN not set — email notifications will be logged only (dev mode)',
      );
    }
  }

  async send(payload: EmailPayload): Promise<void> {
    // Dev mode: log and mark as sent so dev flow isn't blocked
    if (!this.client) {
      this.logger.log(
        `[DEV EMAIL] To: ${payload.to} | Subject: ${payload.subject}`,
      );
      await this.markDelivered(payload.notificationDeliveryId, 'DEV_MODE');
      return;
    }

    try {
      const result = await this.client.sendEmail({
        From: this.fromEmail,
        To: payload.to,
        Subject: payload.subject,
        HtmlBody: payload.htmlBody,
        TextBody: payload.textBody,
        MessageStream: 'outbound',
      });

      await this.markDelivered(
        payload.notificationDeliveryId,
        result.MessageID,
      );
      this.logger.debug(`Email sent to ${payload.to}: ${result.MessageID}`);
    } catch (error) {
      await this.markFailed(payload.notificationDeliveryId, String(error));
      this.logger.error(`Email failed to ${payload.to}: ${error}`);
      throw error; // Re-throw so BullMQ retries the job
    }
  }

  private async markDelivered(deliveryId: string, externalId: string) {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SENT',
        succeededAt: new Date(),
        externalId,
      },
    });
  }

  private async markFailed(deliveryId: string, errorMessage: string) {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: errorMessage.substring(0, 500),
      },
    });
  }
}
