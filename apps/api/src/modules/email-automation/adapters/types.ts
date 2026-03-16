/**
 * Email automation adapter types.
 * Classification: ORDER_CONFIRMATION | DELIVERY_CONFIRMATION | OTHER.
 */

export const EMAIL_CLASSIFICATION = {
  ORDER_CONFIRMATION: 'ORDER_CONFIRMATION',
  DELIVERY_CONFIRMATION: 'DELIVERY_CONFIRMATION',
  OTHER: 'OTHER',
} as const;

export type EmailClassification =
  (typeof EMAIL_CLASSIFICATION)[keyof typeof EMAIL_CLASSIFICATION];

export interface ClassificationResult {
  classification: EmailClassification;
  confidence: number; // 0–1
}

/** Input for classification (subject, from, body). */
export interface ClassifyInput {
  subject: string | null;
  fromAddress: string | null;
  bodyPlain: string | null;
  bodyHtml: string | null;
}

/**
 * Vendor adapters can contribute a classification hint for a known domain.
 * Return null to fall back to base parser.
 */
export interface ClassificationAdapter {
  /** Domain this adapter handles (e.g. 'amazon.com'). */
  readonly domain: string;
  /** Optional hint: ORDER_CONFIRMATION | DELIVERY_CONFIRMATION | null for fallback. */
  classify(input: ClassifyInput): ClassificationResult | null;
}

// ─── Order extraction ─────────────────────────────────────────────────────────

export interface OrderLineItemInput {
  itemName: string;
  quantity: number;
}

export interface ExtractOrderResult {
  orderNumber: string;
  vendorIdentifier: string;
  vendorDomain: string | null;
  shippingAddressRaw: string | null;
  shippingAddressNormalized: string | null;
  lineItems: OrderLineItemInput[];
  orderNumberConfidence: number;
  addressConfidence: number;
  itemConfidence: number;
}

export interface OrderExtractionInput {
  subject: string | null;
  fromAddress: string | null;
  bodyPlain: string | null;
  bodyHtml: string | null;
}

export interface OrderExtractionAdapter {
  readonly domain: string;
  extractOrder(input: OrderExtractionInput): ExtractOrderResult | null;
}

// ─── Delivery extraction ─────────────────────────────────────────────────────

export interface ExtractDeliveryResult {
  orderNumber: string;
  vendorDomain: string | null;
  deliveryTimestamp: Date | null;
  deliverySource: string | null;
  lineItems: OrderLineItemInput[];
  orderNumberConfidence: number;
  itemConfidence: number;
}

export interface DeliveryExtractionAdapter {
  readonly domain: string;
  extractDelivery(input: OrderExtractionInput): ExtractDeliveryResult | null;
}
