import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { getVendorDomain, baseClassify } from '../adapters/base.parser';
import type {
  ClassifyInput,
  ClassificationResult,
  ClassificationAdapter,
} from '../adapters/types';

/**
 * Classifies inbound emails as ORDER_CONFIRMATION | DELIVERY_CONFIRMATION | OTHER.
 * Uses vendor domain from From address to select adapter; falls back to base parser.
 */
@Injectable()
export class EmailClassifierService {
  private readonly logger = new Logger(EmailClassifierService.name);
  private readonly adapters = new Map<string, ClassificationAdapter>();

  constructor(private readonly prisma: PrismaService) {}

  registerAdapter(adapter: ClassificationAdapter): void {
    this.adapters.set(adapter.domain.toLowerCase(), adapter);
  }

  getVendorDomain(fromAddress: string | null): string | null {
    return getVendorDomain(fromAddress);
  }

  /**
   * Classify a single email (no DB write). Used by pipeline and Playground.
   */
  classify(input: ClassifyInput): ClassificationResult {
    const domain = getVendorDomain(input.fromAddress);
    if (domain) {
      const adapter = this.adapters.get(domain);
      if (adapter) {
        const result = adapter.classify(input);
        if (result) return result;
      }
    }
    return baseClassify(input);
  }

  /**
   * Find all inbound_emails with null classification, classify and update.
   * Called after ingest (or on demand).
   */
  async classifyUnprocessedEmails(): Promise<{ processed: number }> {
    const unprocessed = await this.prisma.inboundEmail.findMany({
      where: { classification: null },
      select: {
        id: true,
        subject: true,
        fromAddress: true,
        bodyPlain: true,
        bodyHtml: true,
      },
      take: 500,
    });

    let processed = 0;
    for (const row of unprocessed) {
      const result = this.classify({
        subject: row.subject,
        fromAddress: row.fromAddress,
        bodyPlain: row.bodyPlain,
        bodyHtml: row.bodyHtml,
      });
      await this.prisma.inboundEmail.update({
        where: { id: row.id },
        data: {
          classification: result.classification,
          classificationConfidence: result.confidence,
        },
      });
      processed++;
    }

    if (processed > 0) {
      this.logger.log(`Classified ${processed} previously unprocessed emails`);
    }
    return { processed };
  }
}
