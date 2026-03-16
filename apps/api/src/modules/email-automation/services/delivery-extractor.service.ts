import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getVendorDomain } from '../adapters/base.parser';
import { extractDeliveryBase } from '../adapters/base.parser';
import type {
  OrderExtractionInput,
  ExtractDeliveryResult,
  DeliveryExtractionAdapter,
} from '../adapters/types';

/**
 * Extracts delivery data from DELIVERY_CONFIRMATION email content.
 * Adapter by vendor domain; fallback to base parser.
 */
@Injectable()
export class DeliveryExtractorService {
  private readonly adapters = new Map<string, DeliveryExtractionAdapter>();

  constructor(private readonly prisma: PrismaService) {}

  registerAdapter(adapter: DeliveryExtractionAdapter): void {
    this.adapters.set(adapter.domain.toLowerCase(), adapter);
  }

  async extractDeliveryByEmailId(emailId: string): Promise<ExtractDeliveryResult | null> {
    const email = await this.prisma.inboundEmail.findUnique({
      where: { id: emailId },
      select: {
        subject: true,
        fromAddress: true,
        bodyPlain: true,
        bodyHtml: true,
      },
    });
    if (!email) return null;
    return this.extractDelivery({
      subject: email.subject,
      fromAddress: email.fromAddress,
      bodyPlain: email.bodyPlain,
      bodyHtml: email.bodyHtml,
    });
  }

  extractDelivery(input: OrderExtractionInput): ExtractDeliveryResult {
    const domain = getVendorDomain(input.fromAddress);
    if (domain) {
      const adapter = this.adapters.get(domain);
      if (adapter) {
        const result = adapter.extractDelivery(input);
        if (result) return result;
      }
    }
    return extractDeliveryBase(input);
  }
}
