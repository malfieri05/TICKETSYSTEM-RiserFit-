import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { EmailClassifierService } from './email-classifier.service';
import { OrderExtractorService } from './order-extractor.service';
import { EmailAutomationOrchestratorService } from './email-automation-orchestrator.service';
import { AssemblyTicketCreateService } from './assembly-ticket-create.service';

/**
 * Reprocess a stored email: clear related data, re-classify, re-run order or delivery path.
 * Logs to email_automation_events at key steps.
 */
@Injectable()
export class ReprocessEmailService {
  private readonly logger = new Logger(ReprocessEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classifier: EmailClassifierService,
    private readonly orderExtractor: OrderExtractorService,
    private readonly orchestrator: EmailAutomationOrchestratorService,
    private readonly assemblyTicketCreate: AssemblyTicketCreateService,
  ) {}

  private async logEvent(
    eventType: string,
    emailId: string,
    orderId?: string | null,
    deliveryEventId?: string | null,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.emailAutomationEvent.create({
      data: {
        eventType,
        emailId,
        orderId: orderId ?? null,
        deliveryEventId: deliveryEventId ?? null,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
      },
    });
  }

  /**
   * Reprocess one email by id: clear related records, re-classify, re-run order or delivery pipeline.
   */
  async reprocess(emailId: string): Promise<{ classification: string; outcome: string }> {
    const email = await this.prisma.inboundEmail.findUnique({
      where: { id: emailId },
      select: { id: true, classification: true },
    });
    if (!email) {
      throw new NotFoundException(`Inbound email ${emailId} not found`);
    }

    await this.logEvent('reprocess_started', emailId, null, null, {});

    // Remove related data so we can re-run cleanly
    const orders = await this.prisma.vendorOrderRecord.findMany({
      where: { emailId },
      select: { id: true },
    });
    for (const o of orders) {
      await this.prisma.orderLineItem.deleteMany({ where: { orderId: o.id } });
      await this.prisma.vendorOrderRecord.delete({ where: { id: o.id } });
    }
    const deliveries = await this.prisma.deliveryEvent.findMany({
      where: { emailId },
      select: { id: true },
    });
    for (const d of deliveries) {
      await this.prisma.emailAutomationReviewItem.updateMany({
        where: { deliveryEventId: d.id },
        data: { deliveryEventId: null, orderId: null },
      });
      await this.prisma.deliveryEvent.delete({ where: { id: d.id } });
    }
    await this.prisma.emailAutomationReviewItem.deleteMany({ where: { emailId } });
    await this.prisma.inboundEmail.update({
      where: { id: emailId },
      data: { processedAt: null, classification: null, classificationConfidence: null },
    });

    const row = await this.prisma.inboundEmail.findUnique({
      where: { id: emailId },
      select: { subject: true, fromAddress: true, bodyPlain: true, bodyHtml: true },
    });
    if (!row) throw new NotFoundException('Email not found');

    const result = this.classifier.classify({
      subject: row.subject,
      fromAddress: row.fromAddress,
      bodyPlain: row.bodyPlain,
      bodyHtml: row.bodyHtml,
    });
    await this.prisma.inboundEmail.update({
      where: { id: emailId },
      data: {
        classification: result.classification,
        classificationConfidence: result.confidence,
      },
    });
    await this.logEvent('classified', emailId, null, null, {
      classification: result.classification,
      confidence: result.confidence,
    });

    if (result.classification === 'ORDER_CONFIRMATION') {
      const extracted = await this.orderExtractor.extractOrderByEmailId(emailId);
      if (extracted) {
        const cfg = await this.prisma.emailAutomationConfig.findFirst({ orderBy: { createdAt: 'asc' } });
        const minOrder = cfg?.minOrderNumberConfidence ?? 0.8;
        const minAddress = cfg?.minAddressConfidence ?? 0.8;
        const minItem = cfg?.minItemConfidence ?? 0.8;
        const below =
          extracted.orderNumberConfidence < minOrder ||
          extracted.addressConfidence < minAddress ||
          extracted.itemConfidence < minItem;
        if (below) {
          await this.prisma.emailAutomationReviewItem.create({
            data: {
              emailId,
              reason: 'LOW_CONFIDENCE',
              extractedPayload: JSON.parse(JSON.stringify({ ...extracted })),
              status: 'PENDING',
              updatedAt: new Date(),
            },
          });
          await this.logEvent('review_created', emailId, null, null, { reason: 'LOW_CONFIDENCE' });
        } else {
          const order = await this.prisma.vendorOrderRecord.create({
            data: {
              orderNumber: extracted.orderNumber,
              vendorIdentifier: extracted.vendorIdentifier,
              vendorDomain: extracted.vendorDomain,
              shippingAddressRaw: extracted.shippingAddressRaw,
              shippingAddressNormalized: extracted.shippingAddressNormalized,
              emailId,
              state: 'ORDER_CONFIRMED',
              updatedAt: new Date(),
            },
          });
          for (let i = 0; i < extracted.lineItems.length; i++) {
            const item = extracted.lineItems[i];
            await this.prisma.orderLineItem.create({
              data: {
                orderId: order.id,
                itemName: item.itemName,
                quantity: item.quantity,
                sortOrder: i,
              },
            });
          }
          await this.logEvent('order_created', emailId, order.id, null, { orderNumber: extracted.orderNumber });
          await this.orchestrator.attemptAutoResolutionForOrder(
            extracted.orderNumber,
            extracted.vendorIdentifier,
          );
        }
      }
      await this.prisma.inboundEmail.update({
        where: { id: emailId },
        data: { processedAt: new Date() },
      });
      return {
        classification: result.classification,
        outcome: 'order_path_completed',
      };
    }

    if (result.classification === 'DELIVERY_CONFIRMATION') {
      await this.orchestrator.processDeliveryConfirmations();
      await this.assemblyTicketCreate.processRecordedDeliveries();
      await this.prisma.inboundEmail.update({
        where: { id: emailId },
        data: { processedAt: new Date() },
      });
      return {
        classification: result.classification,
        outcome: 'delivery_path_completed',
      };
    }

    await this.prisma.inboundEmail.update({
      where: { id: emailId },
      data: { processedAt: new Date() },
    });
    return {
      classification: result.classification,
      outcome: 'other_no_action',
    };
  }
}
