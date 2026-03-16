import { Injectable } from '@nestjs/common';
import { EmailClassifierService } from './email-classifier.service';
import { OrderExtractorService } from './order-extractor.service';
import { DeliveryExtractorService } from './delivery-extractor.service';
import { AssemblyTriggerService } from './assembly-trigger.service';
import { AddressMatchingService } from './address-matching.service';

export interface PlaygroundResult {
  classification: { type: string; confidence: number };
  extractedOrder?: {
    orderNumber: string;
    vendorIdentifier: string;
    vendorDomain: string | null;
    shippingAddressRaw: string | null;
    lineItems: { itemName: string; quantity: number }[];
    orderNumberConfidence: number;
    addressConfidence: number;
    itemConfidence: number;
  };
  extractedDelivery?: {
    orderNumber: string;
    vendorDomain: string | null;
    deliveryTimestamp: string | null;
    lineItems: { itemName: string; quantity: number }[];
    orderNumberConfidence: number;
    itemConfidence: number;
  };
  assemblyMatch?: {
    matched: boolean;
    matchedKeywords: string[];
    matchedLineItemNames: string[];
  };
  studioMatch?: { kind: 'single'; studioId: string } | { kind: 'none' } | { kind: 'ambiguous'; studioIds: string[] };
}

/**
 * Dry-run pipeline: classify + extract order/delivery + assembly match + studio match.
 * No DB writes. Used by Email Pattern Playground.
 */
@Injectable()
export class EmailPatternPlaygroundService {
  constructor(
    private readonly classifier: EmailClassifierService,
    private readonly orderExtractor: OrderExtractorService,
    private readonly deliveryExtractor: DeliveryExtractorService,
    private readonly assemblyTrigger: AssemblyTriggerService,
    private readonly addressMatching: AddressMatchingService,
  ) {}

  /**
   * Parse raw pasted email: optional "Subject: ..." first line, then body.
   * Optional "From: ..." line to set fromAddress.
   */
  parseRawEmail(rawEmail: string, subject?: string, body?: string): { subject: string | null; fromAddress: string | null; bodyPlain: string | null } {
    if (subject != null && body != null) {
      return { subject, fromAddress: null, bodyPlain: body };
    }
    const text = rawEmail.trim();
    let subj: string | null = null;
    let from: string | null = null;
    let bodyPlain: string = text;

    const lines = text.split(/\n/);
    const first = lines[0] ?? '';
    if (/^Subject:\s*/i.test(first)) {
      subj = first.replace(/^Subject:\s*/i, '').trim();
      bodyPlain = lines.slice(1).join('\n').trim();
    }
    const fromLine = lines.find((l) => /^From:\s*/i.test(l));
    if (fromLine) {
      from = fromLine.replace(/^From:\s*/i, '').trim();
    }
    return { subject: subj ?? null, fromAddress: from ?? null, bodyPlain: bodyPlain || null };
  }

  async run(rawEmail: string, subject?: string, body?: string): Promise<PlaygroundResult> {
    const { subject: subj, fromAddress, bodyPlain } = this.parseRawEmail(rawEmail, subject, body);

    const input = { subject: subj, fromAddress, bodyPlain, bodyHtml: null };

    const classification = this.classifier.classify(input);
    const result: PlaygroundResult = {
      classification: { type: classification.classification, confidence: classification.confidence },
    };

    const orderResult = this.orderExtractor.extractOrder(input);
    result.extractedOrder = {
      orderNumber: orderResult.orderNumber,
      vendorIdentifier: orderResult.vendorIdentifier,
      vendorDomain: orderResult.vendorDomain,
      shippingAddressRaw: orderResult.shippingAddressRaw,
      lineItems: orderResult.lineItems,
      orderNumberConfidence: orderResult.orderNumberConfidence,
      addressConfidence: orderResult.addressConfidence,
      itemConfidence: orderResult.itemConfidence,
    };

    const deliveryResult = this.deliveryExtractor.extractDelivery(input);
    result.extractedDelivery = {
      orderNumber: deliveryResult.orderNumber,
      vendorDomain: deliveryResult.vendorDomain,
      deliveryTimestamp: deliveryResult.deliveryTimestamp?.toISOString() ?? null,
      lineItems: deliveryResult.lineItems,
      orderNumberConfidence: deliveryResult.orderNumberConfidence,
      itemConfidence: deliveryResult.itemConfidence,
    };

    const lineItemNames = [
      ...(orderResult.lineItems?.map((i) => i.itemName) ?? []),
      ...(deliveryResult.lineItems?.map((i) => i.itemName) ?? []),
    ];
    if (lineItemNames.length > 0) {
      const assembly = await this.assemblyTrigger.matchLineItems(lineItemNames);
      result.assemblyMatch = {
        matched: assembly.matched,
        matchedKeywords: assembly.matchedKeywords,
        matchedLineItemNames: assembly.matchedLineItemNames,
      };
    }

    const addressToMatch = orderResult.shippingAddressNormalized ?? orderResult.shippingAddressRaw;
    const normalized = this.addressMatching.normalize(addressToMatch);
    result.studioMatch = await this.addressMatching.matchToStudio(normalized);

    return result;
  }
}
