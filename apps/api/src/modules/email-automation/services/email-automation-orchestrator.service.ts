import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { EmailAutomationConfigService } from './email-automation-config.service';
import { OrderExtractorService } from './order-extractor.service';
import { DeliveryExtractorService } from './delivery-extractor.service';
import { DeliveryEventService } from './delivery-event.service';
import { AssemblyTriggerService } from './assembly-trigger.service';
import { AddressMatchingService } from './address-matching.service';

/**
 * Orchestrates the email automation pipeline: order path and delivery path.
 */
@Injectable()
export class EmailAutomationOrchestratorService {
  private readonly logger = new Logger(EmailAutomationOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: EmailAutomationConfigService,
    private readonly orderExtractor: OrderExtractorService,
    private readonly deliveryExtractor: DeliveryExtractorService,
    private readonly deliveryEventService: DeliveryEventService,
    private readonly assemblyTrigger: AssemblyTriggerService,
    private readonly addressMatching: AddressMatchingService,
  ) {}

  /**
   * Find ORDER_CONFIRMATION emails not yet processed; extract order and either
   * create vendor_order_records + order_line_items or create review item (LOW_CONFIDENCE).
   */
  async processOrderConfirmations(): Promise<{ processed: number; ordersCreated: number; reviewCreated: number }> {
    const cfg = await this.config.getConfigOrCreateDefault();
    const minOrder = cfg.minOrderNumberConfidence ?? 0.8;
    const minAddress = cfg.minAddressConfidence ?? 0.8;
    const minItem = cfg.minItemConfidence ?? 0.8;

    const emails = await this.prisma.inboundEmail.findMany({
      where: {
        classification: 'ORDER_CONFIRMATION',
        processedAt: null,
      },
      select: { id: true },
      take: 100,
    });

    let processed = 0;
    let ordersCreated = 0;
    let reviewCreated = 0;

    for (const email of emails) {
      const extracted = await this.orderExtractor.extractOrderByEmailId(email.id);
      if (!extracted) {
        await this.prisma.inboundEmail.update({
          where: { id: email.id },
          data: { processedAt: new Date() },
        });
        processed++;
        continue;
      }

      const belowThreshold =
        extracted.orderNumberConfidence < minOrder ||
        extracted.addressConfidence < minAddress ||
        extracted.itemConfidence < minItem;

      if (belowThreshold) {
        await this.prisma.$transaction([
          this.prisma.emailAutomationReviewItem.create({
            data: {
              emailId: email.id,
              reason: 'LOW_CONFIDENCE',
              extractedPayload: JSON.parse(JSON.stringify({
                orderNumber: extracted.orderNumber,
                vendorIdentifier: extracted.vendorIdentifier,
                vendorDomain: extracted.vendorDomain,
                orderNumberConfidence: extracted.orderNumberConfidence,
                addressConfidence: extracted.addressConfidence,
                itemConfidence: extracted.itemConfidence,
                lineItems: extracted.lineItems,
              })),
              status: 'PENDING',
              updatedAt: new Date(),
            },
          }),
          this.prisma.inboundEmail.update({
            where: { id: email.id },
            data: { processedAt: new Date() },
          }),
        ]);
        reviewCreated++;
      } else {
        await this.prisma.$transaction(async (tx) => {
          const order = await tx.vendorOrderRecord.create({
            data: {
              orderNumber: extracted.orderNumber,
              vendorIdentifier: extracted.vendorIdentifier,
              vendorDomain: extracted.vendorDomain,
              shippingAddressRaw: extracted.shippingAddressRaw,
              shippingAddressNormalized: extracted.shippingAddressNormalized,
              emailId: email.id,
              state: 'ORDER_CONFIRMED',
              updatedAt: new Date(),
            },
          });
          for (let i = 0; i < extracted.lineItems.length; i++) {
            const item = extracted.lineItems[i];
            await tx.orderLineItem.create({
              data: {
                orderId: order.id,
                itemName: item.itemName,
                quantity: item.quantity,
                sortOrder: i,
              },
            });
          }
          await tx.inboundEmail.update({
            where: { id: email.id },
            data: { processedAt: new Date() },
          });
        });
        ordersCreated++;
        // Auto-resolution: link any PENDING_ORDER_MATCH delivery_events for this order
        await this.attemptAutoResolutionForOrder(
          extracted.orderNumber,
          extracted.vendorIdentifier,
        );
      }
      processed++;
    }

    if (processed > 0) {
      this.logger.log(
        `Order path: processed=${processed}, ordersCreated=${ordersCreated}, reviewCreated=${reviewCreated}`,
      );
    }
    return { processed, ordersCreated, reviewCreated };
  }

  /**
   * When an order is newly created, find review items with PENDING_ORDER_MATCH for this order number
   * and link their delivery_events to the order. The next run of processRecordedDeliveries will then
   * create the ticket. Resolve the review items so the queue reflects auto-resolution.
   */
  async attemptAutoResolutionForOrder(
    orderNumber: string,
    vendorIdentifier: string,
  ): Promise<{ linked: number }> {
    const order = await this.prisma.vendorOrderRecord.findUnique({
      where: {
        orderNumber_vendorIdentifier: { orderNumber, vendorIdentifier },
      },
      select: { id: true },
    });
    if (!order) return { linked: 0 };

    const pendingItems = await this.prisma.emailAutomationReviewItem.findMany({
      where: { reason: 'PENDING_ORDER_MATCH', status: 'PENDING' },
      select: { id: true, deliveryEventId: true, extractedPayload: true },
    });

    const matching = pendingItems.filter((r) => {
      const p = r.extractedPayload as { orderNumber?: string } | null;
      return p?.orderNumber === orderNumber;
    });

    let linked = 0;
    for (const item of matching) {
      if (!item.deliveryEventId) continue;
      await this.prisma.deliveryEvent.update({
        where: { id: item.deliveryEventId },
        data: { orderId: order.id, updatedAt: new Date() },
      });
      await this.prisma.emailAutomationReviewItem.update({
        where: { id: item.id },
        data: {
          orderId: order.id,
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedBy: 'system_auto_resolution',
          updatedAt: new Date(),
        },
      });
      linked++;
    }
    if (linked > 0) {
      this.logger.log(
        `Auto-resolution: linked ${linked} delivery_events to order ${orderNumber}`,
      );
    }
    return { linked };
  }

  /**
   * Process DELIVERY_CONFIRMATION emails: extract delivery, link to order, assembly match, studio match.
   * No ticket creation here (Stage 7); creates delivery_events and review items as needed.
   */
  async processDeliveryConfirmations(): Promise<{
    processed: number;
    deliveryRecorded: number;
    completeNoAssembly: number;
    reviewCreated: number;
  }> {
    const cfg = await this.config.getConfigOrCreateDefault();
    const minOrder = cfg.minOrderNumberConfidence ?? 0.8;
    const minItem = cfg.minItemConfidence ?? 0.8;

    const emails = await this.prisma.inboundEmail.findMany({
      where: {
        classification: 'DELIVERY_CONFIRMATION',
        processedAt: null,
      },
      select: { id: true },
      take: 100,
    });

    let processed = 0;
    let deliveryRecorded = 0;
    let completeNoAssembly = 0;
    let reviewCreated = 0;

    for (const email of emails) {
      const extracted = await this.deliveryExtractor.extractDeliveryByEmailId(email.id);
      if (!extracted) {
        await this.prisma.inboundEmail.update({
          where: { id: email.id },
          data: { processedAt: new Date() },
        });
        processed++;
        continue;
      }

      const belowThreshold =
        extracted.orderNumberConfidence < minOrder || extracted.itemConfidence < minItem;
      if (belowThreshold) {
        await this.prisma.$transaction([
          this.prisma.emailAutomationReviewItem.create({
            data: {
              emailId: email.id,
              reason: 'LOW_CONFIDENCE',
              extractedPayload: JSON.parse(JSON.stringify({
                ...extracted,
                deliveryTimestamp: extracted.deliveryTimestamp?.toISOString(),
              })),
              status: 'PENDING',
              updatedAt: new Date(),
            },
          }),
          this.prisma.inboundEmail.update({
            where: { id: email.id },
            data: { processedAt: new Date() },
          }),
        ]);
        reviewCreated++;
        processed++;
        continue;
      }

      const vendorIdentifier = extracted.vendorDomain || 'unknown';
      const order = await this.prisma.vendorOrderRecord.findUnique({
        where: {
          orderNumber_vendorIdentifier: {
            orderNumber: extracted.orderNumber,
            vendorIdentifier,
          },
        },
        select: {
          id: true,
          shippingAddressNormalized: true,
        },
      });

      if (!order) {
        const { id: deliveryId } = await this.deliveryEventService.create({
          emailId: email.id,
          orderId: null,
          deliveryTimestamp: extracted.deliveryTimestamp,
          deliverySource: extracted.deliverySource,
          deliveryStatus: 'DELIVERY_RECORDED',
        });
        await this.prisma.$transaction([
          this.prisma.emailAutomationReviewItem.create({
            data: {
              emailId: email.id,
              deliveryEventId: deliveryId,
              reason: 'PENDING_ORDER_MATCH',
              extractedPayload: JSON.parse(JSON.stringify({
                orderNumber: extracted.orderNumber,
                vendorDomain: extracted.vendorDomain,
                deliveryTimestamp: extracted.deliveryTimestamp?.toISOString(),
              })),
              status: 'PENDING',
              updatedAt: new Date(),
            },
          }),
          this.prisma.inboundEmail.update({
            where: { id: email.id },
            data: { processedAt: new Date() },
          }),
        ]);
        reviewCreated++;
        processed++;
        continue;
      }

      const { id: deliveryId } = await this.deliveryEventService.create({
        emailId: email.id,
        orderId: order.id,
        deliveryTimestamp: extracted.deliveryTimestamp,
        deliverySource: extracted.deliverySource,
        deliveryStatus: 'DELIVERY_RECORDED',
      });

      const lineItemNames = extracted.lineItems.map((i) => i.itemName);
      const assemblyResult = await this.assemblyTrigger.matchLineItems(lineItemNames);

      if (!assemblyResult.matched) {
        await this.deliveryEventService.updateStatus(deliveryId, 'COMPLETE_NO_ASSEMBLY');
        await this.prisma.inboundEmail.update({
          where: { id: email.id },
          data: { processedAt: new Date() },
        });
        completeNoAssembly++;
        processed++;
        continue;
      }

      const normalizedAddress = order.shippingAddressNormalized
        ? this.addressMatching.normalize(order.shippingAddressNormalized)
        : null;
      const matchResult = await this.addressMatching.matchToStudio(normalizedAddress);

      if (matchResult.kind === 'none') {
        await this.prisma.emailAutomationReviewItem.create({
          data: {
            emailId: email.id,
            orderId: order.id,
            deliveryEventId: deliveryId,
            reason: 'NO_STUDIO_MATCH',
            extractedPayload: JSON.parse(JSON.stringify({
              address: order.shippingAddressNormalized,
              assemblyMatch: assemblyResult,
            })),
            status: 'PENDING',
            updatedAt: new Date(),
          },
        });
        reviewCreated++;
      } else if (matchResult.kind === 'ambiguous') {
        await this.prisma.emailAutomationReviewItem.create({
          data: {
            emailId: email.id,
            orderId: order.id,
            deliveryEventId: deliveryId,
            reason: 'AMBIGUOUS_ADDRESS',
            extractedPayload: JSON.parse(JSON.stringify({
              studioIds: matchResult.studioIds,
              assemblyMatch: assemblyResult,
            })),
            status: 'PENDING',
            updatedAt: new Date(),
          },
        });
        reviewCreated++;
      } else {
        deliveryRecorded++;
      }

      await this.prisma.inboundEmail.update({
        where: { id: email.id },
        data: { processedAt: new Date() },
      });
      processed++;
    }

    if (processed > 0) {
      this.logger.log(
        `Delivery path: processed=${processed}, deliveryRecorded=${deliveryRecorded}, completeNoAssembly=${completeNoAssembly}, reviewCreated=${reviewCreated}`,
      );
    }
    return {
      processed,
      deliveryRecorded,
      completeNoAssembly,
      reviewCreated,
    };
  }
}
