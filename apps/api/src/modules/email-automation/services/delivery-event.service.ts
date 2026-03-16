import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { DeliveryEventStatus } from '@prisma/client';

export interface CreateDeliveryEventInput {
  emailId: string;
  orderId: string | null;
  deliveryTimestamp: Date | null;
  deliverySource: string | null;
  deliveryStatus: DeliveryEventStatus;
}

/**
 * Creates and updates delivery_events. Used by the delivery path and auto-resolution.
 */
@Injectable()
export class DeliveryEventService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateDeliveryEventInput): Promise<{ id: string }> {
    const row = await this.prisma.deliveryEvent.create({
      data: {
        emailId: data.emailId,
        orderId: data.orderId,
        deliveryTimestamp: data.deliveryTimestamp,
        deliverySource: data.deliverySource,
        deliveryStatus: data.deliveryStatus,
        updatedAt: new Date(),
      },
    });
    return { id: row.id };
  }

  async updateStatus(
    deliveryEventId: string,
    deliveryStatus: DeliveryEventStatus,
  ): Promise<void> {
    await this.prisma.deliveryEvent.update({
      where: { id: deliveryEventId },
      data: { deliveryStatus, updatedAt: new Date() },
    });
  }

  async findByEmailId(emailId: string) {
    return this.prisma.deliveryEvent.findFirst({
      where: { emailId },
    });
  }
}
