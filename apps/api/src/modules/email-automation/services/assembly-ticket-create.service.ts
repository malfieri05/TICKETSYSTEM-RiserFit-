import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { EmailAutomationConfigService } from './email-automation-config.service';
import { AutomationLockService } from './automation-lock.service';
import { DeliveryEventService } from './delivery-event.service';
import { AddressMatchingService } from './address-matching.service';
import { TicketsService } from '../../tickets/tickets.service';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

/**
 * Finds delivery_events with DELIVERY_RECORDED, resolves to single studio, acquires lock,
 * creates one "Assembly needed" ticket per order, records idempotency, updates delivery status.
 */
@Injectable()
export class AssemblyTicketCreateService {
  private readonly logger = new Logger(AssemblyTicketCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: EmailAutomationConfigService,
    private readonly lock: AutomationLockService,
    private readonly deliveryEvent: DeliveryEventService,
    private readonly addressMatching: AddressMatchingService,
    private readonly tickets: TicketsService,
  ) {}

  /**
   * Process all delivery_events with DELIVERY_RECORDED: match to studio, create ticket, set ASSEMBLY_TRIGGERED.
   */
  async processRecordedDeliveries(): Promise<{
    processed: number;
    ticketsCreated: number;
    reviewCreated: number;
  }> {
    const cfg = await this.config.getConfigOrCreateDefault();
    if (!cfg.assemblyCategoryId || !cfg.systemRequesterId) {
      this.logger.warn('Assembly category or system requester not configured — skipping ticket creation');
      return { processed: 0, ticketsCreated: 0, reviewCreated: 0 };
    }

    const systemUser = await this.prisma.user.findUnique({
      where: { id: cfg.systemRequesterId, isActive: true },
    });
    if (!systemUser) {
      this.logger.warn(`System requester ${cfg.systemRequesterId} not found or inactive — skipping`);
      return { processed: 0, ticketsCreated: 0, reviewCreated: 0 };
    }

    const actor: RequestUser = {
      id: systemUser.id,
      email: systemUser.email,
      displayName: systemUser.name,
      role: systemUser.role,
      teamId: systemUser.teamId,
      studioId: null,
      marketId: null,
      isActive: true,
      departments: [],
      scopeStudioIds: [],
    };

    const maintenanceClass = await this.prisma.ticketClass.findUnique({
      where: { code: 'MAINTENANCE' },
    });
    if (!maintenanceClass) {
      this.logger.warn('MAINTENANCE ticket class not found — skipping');
      return { processed: 0, ticketsCreated: 0, reviewCreated: 0 };
    }

    const events = await this.prisma.deliveryEvent.findMany({
      where: { deliveryStatus: 'DELIVERY_RECORDED' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            vendorIdentifier: true,
            shippingAddressNormalized: true,
            lineItems: { select: { itemName: true } },
          },
        },
      },
      take: 50,
    });

    let processed = 0;
    let ticketsCreated = 0;
    let reviewCreated = 0;

    for (const ev of events) {
      if (!ev.order) continue;

      const order = ev.order;
      const normalizedAddress = order.shippingAddressNormalized
        ? this.addressMatching.normalize(order.shippingAddressNormalized)
        : null;
      const matchResult = await this.addressMatching.matchToStudio(normalizedAddress);

      if (matchResult.kind !== 'single') {
        if (matchResult.kind === 'none') {
          await this.prisma.emailAutomationReviewItem.create({
            data: {
              emailId: ev.emailId,
              orderId: ev.orderId!,
              deliveryEventId: ev.id,
              reason: 'NO_STUDIO_MATCH',
              extractedPayload: JSON.parse(JSON.stringify({ address: order.shippingAddressNormalized })),
              status: 'PENDING',
              updatedAt: new Date(),
            },
          });
          reviewCreated++;
        } else {
          await this.prisma.emailAutomationReviewItem.create({
            data: {
              emailId: ev.emailId,
              orderId: ev.orderId!,
              deliveryEventId: ev.id,
              reason: 'AMBIGUOUS_ADDRESS',
              extractedPayload: JSON.parse(JSON.stringify({ studioIds: matchResult.studioIds })),
              status: 'PENDING',
              updatedAt: new Date(),
            },
          });
          reviewCreated++;
        }
        processed++;
        continue;
      }

      const acquired = await this.lock.acquire(order.orderNumber, order.vendorIdentifier);
      if (!acquired) {
        processed++;
        continue;
      }

      try {
        const existing = await this.prisma.emailAutomationTicketCreated.findUnique({
          where: {
            orderNumber_vendorIdentifier: {
              orderNumber: order.orderNumber,
              vendorIdentifier: order.vendorIdentifier,
            },
          },
        });
        if (existing) {
          await this.deliveryEvent.updateStatus(ev.id, 'ASSEMBLY_TRIGGERED');
          processed++;
          continue;
        }

        const itemSummary = order.lineItems.map((i) => i.itemName).join(', ') || 'Item';
        const description = `Assembly needed. Source: email_automation. Order #: ${order.orderNumber}. Vendor: ${order.vendorIdentifier}. Items: ${itemSummary}`;

        const ticket = await this.tickets.create(
          {
            title: 'Assembly needed',
            description,
            ticketClassId: maintenanceClass.id,
            maintenanceCategoryId: cfg.assemblyCategoryId,
            studioId: matchResult.studioId,
          },
          actor,
        );

        const ticketId = (ticket as { id: string }).id;
        await this.prisma.emailAutomationTicketCreated.create({
          data: {
            orderNumber: order.orderNumber,
            vendorIdentifier: order.vendorIdentifier,
            ticketId,
          },
        });
        await this.deliveryEvent.updateStatus(ev.id, 'ASSEMBLY_TRIGGERED');
        ticketsCreated++;
      } catch (err) {
        this.logger.warn(`Ticket create failed for order ${order.orderNumber}: ${err}`);
        await this.prisma.emailAutomationReviewItem.create({
          data: {
            emailId: ev.emailId,
            orderId: ev.orderId!,
            deliveryEventId: ev.id,
            reason: 'TICKET_CREATE_FAILED',
            extractedPayload: JSON.parse(JSON.stringify({
              orderNumber: order.orderNumber,
              vendorIdentifier: order.vendorIdentifier,
              error: String(err),
            })),
            status: 'PENDING',
            updatedAt: new Date(),
          },
        });
        reviewCreated++;
      } finally {
        await this.lock.release(order.orderNumber, order.vendorIdentifier);
      }
      processed++;
    }

    if (processed > 0) {
      this.logger.log(
        `Assembly ticket creation: processed=${processed}, ticketsCreated=${ticketsCreated}, reviewCreated=${reviewCreated}`,
      );
    }
    return { processed, ticketsCreated, reviewCreated };
  }
}
