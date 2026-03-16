import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getVendorDomain } from '../adapters/base.parser';
import { extractOrderBase } from '../adapters/base.parser';
import type {
  OrderExtractionInput,
  ExtractOrderResult,
  OrderExtractionAdapter,
} from '../adapters/types';

/**
 * Extracts order data from ORDER_CONFIRMATION email content.
 * Selects adapter by vendor domain; falls back to base parser.
 */
@Injectable()
export class OrderExtractorService {
  private readonly adapters = new Map<string, OrderExtractionAdapter>();

  constructor(private readonly prisma: PrismaService) {}

  registerAdapter(adapter: OrderExtractionAdapter): void {
    this.adapters.set(adapter.domain.toLowerCase(), adapter);
  }

  /**
   * Extract order from a stored email by id. Returns structured data + confidence scores.
   */
  async extractOrderByEmailId(emailId: string): Promise<ExtractOrderResult | null> {
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
    return this.extractOrder({
      subject: email.subject,
      fromAddress: email.fromAddress,
      bodyPlain: email.bodyPlain,
      bodyHtml: email.bodyHtml,
    });
  }

  /**
   * Extract order from raw input (no DB). Used by Playground and reprocess.
   */
  extractOrder(input: OrderExtractionInput): ExtractOrderResult {
    const domain = getVendorDomain(input.fromAddress);
    if (domain) {
      const adapter = this.adapters.get(domain);
      if (adapter) {
        const result = adapter.extractOrder(input);
        if (result) return result;
      }
    }
    return extractOrderBase(input);
  }
}
