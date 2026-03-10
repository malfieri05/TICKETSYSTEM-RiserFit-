import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

export interface TeamsPayload {
  title: string;
  body: string;
  ticketId?: string | null;
  notificationDeliveryId: string;
}

/**
 * TeamsChannel — sends Adaptive Card notifications to a MS Teams channel
 * via an incoming webhook URL.
 *
 * Configuration:
 *   TEAMS_WEBHOOK_URL — Incoming webhook URL from Teams channel settings
 *   FRONTEND_URL      — Base URL for "View Ticket" deep-link
 *
 * Design:
 * - Posts an Adaptive Card (JSON over HTTP POST) to the webhook URL.
 * - In dev mode (no webhook URL configured) it logs the payload and marks delivery SENT
 *   so the queue doesn't get stuck during local development.
 * - On failure: marks delivery FAILED and re-throws so BullMQ can retry.
 */
@Injectable()
export class TeamsChannel {
  private readonly logger = new Logger(TeamsChannel.name);
  private readonly webhookUrl: string | undefined;
  private readonly appUrl: string;

  constructor(private prisma: PrismaService) {
    this.webhookUrl = process.env.TEAMS_WEBHOOK_URL || undefined;
    this.appUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (this.webhookUrl) {
      this.logger.log('MS Teams webhook channel initialized');
    } else {
      this.logger.warn(
        'TEAMS_WEBHOOK_URL not set — Teams notifications will be logged only (dev mode)',
      );
    }
  }

  async send(payload: TeamsPayload): Promise<void> {
    // Dev mode: log and mark sent so the queue flow stays clean
    if (!this.webhookUrl) {
      this.logger.log(
        `[DEV TEAMS] ${payload.title}: ${payload.body.slice(0, 100)}`,
      );
      await this.markDelivered(payload.notificationDeliveryId, 'DEV_MODE');
      return;
    }

    const card = this.buildAdaptiveCard(payload);

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'no body');
        throw new Error(`Teams webhook returned ${res.status}: ${errorText}`);
      }

      await this.markDelivered(
        payload.notificationDeliveryId,
        `teams-ok-${Date.now()}`,
      );
      this.logger.debug(
        `Teams card sent for delivery ${payload.notificationDeliveryId}`,
      );
    } catch (error) {
      await this.markFailed(payload.notificationDeliveryId, String(error));
      this.logger.error(`Teams send failed: ${error}`);
      throw error; // Re-throw so BullMQ retries
    }
  }

  /**
   * Builds a Teams-compatible Adaptive Card wrapped in the incoming-webhook envelope.
   * Uses the Adaptive Card 1.2 schema which is supported by all modern Teams clients.
   */
  private buildAdaptiveCard(payload: TeamsPayload): object {
    const ticketUrl = payload.ticketId
      ? `${this.appUrl}/tickets/${payload.ticketId}`
      : null;

    const actions = ticketUrl
      ? [
          {
            type: 'Action.OpenUrl',
            title: 'View Ticket',
            url: ticketUrl,
          },
        ]
      : [];

    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.2',
            body: [
              {
                type: 'Container',
                style: 'emphasis',
                items: [
                  {
                    type: 'TextBlock',
                    text: '🎫 Ticket Notification',
                    weight: 'Lighter',
                    size: 'Small',
                    color: 'Accent',
                  },
                ],
                bleed: true,
              },
              {
                type: 'TextBlock',
                text: payload.title,
                weight: 'Bolder',
                size: 'Medium',
                wrap: true,
              },
              {
                type: 'TextBlock',
                text: payload.body,
                wrap: true,
                color: 'Default',
                isSubtle: false,
              },
            ],
            actions,
            msteams: {
              // Prevents the card from notifying every channel member
              width: 'Full',
            },
          },
        },
      ],
    };
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
