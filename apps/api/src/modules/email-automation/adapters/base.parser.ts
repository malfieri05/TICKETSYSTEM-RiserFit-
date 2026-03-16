import {
  ClassifyInput,
  ClassificationResult,
  EMAIL_CLASSIFICATION,
  OrderExtractionInput,
  ExtractOrderResult,
  OrderLineItemInput,
  ExtractDeliveryResult,
} from './types';

/**
 * Base classification using regex and common patterns.
 * Vendor adapters override for known domains; otherwise we use this.
 */

// Common phrases that suggest order confirmation
const ORDER_PATTERNS = [
  /order\s+confirm/i,
  /order\s+received/i,
  /order\s+placed/i,
  /order\s+#\s*\d+/i,
  /your\s+order\s+has\s+been/i,
  /order\s+summary/i,
  /order\s+details/i,
  /confirmation\s+of\s+order/i,
  /receipt\s+for\s+order/i,
];

// Common phrases that suggest delivery confirmation
const DELIVERY_PATTERNS = [
  /delivered/i,
  /delivery\s+confirm/i,
  /has\s+been\s+delivered/i,
  /was\s+delivered/i,
  /delivery\s+complete/i,
  /shipped\s+and\s+delivered/i,
  /successfully\s+delivered/i,
];

export function getVendorDomain(fromAddress: string | null): string | null {
  if (!fromAddress || typeof fromAddress !== 'string') return null;
  const match = fromAddress.match(/@([^\s>]+)/);
  if (!match) return null;
  const full = match[1].toLowerCase();
  // Strip port if present
  const host = full.split(':')[0];
  // Remove leading "www."
  return host.replace(/^www\./, '') || null;
}

/**
 * Base classifier: no adapter used, rules + regex only.
 * Returns OTHER with low confidence when ambiguous.
 */
export function baseClassify(input: ClassifyInput): ClassificationResult {
  const text = [input.subject, input.bodyPlain]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!text.trim()) {
    return { classification: EMAIL_CLASSIFICATION.OTHER, confidence: 0 };
  }

  const orderScore = ORDER_PATTERNS.filter((r) => r.test(text)).length;
  const deliveryScore = DELIVERY_PATTERNS.filter((r) => r.test(text)).length;

  if (deliveryScore > 0 && deliveryScore >= orderScore) {
    return {
      classification: EMAIL_CLASSIFICATION.DELIVERY_CONFIRMATION,
      confidence: Math.min(0.95, 0.6 + deliveryScore * 0.1),
    };
  }
  if (orderScore > 0) {
    return {
      classification: EMAIL_CLASSIFICATION.ORDER_CONFIRMATION,
      confidence: Math.min(0.95, 0.6 + orderScore * 0.1),
    };
  }

  return { classification: EMAIL_CLASSIFICATION.OTHER, confidence: 0.5 };
}

// ─── Order extraction (base) ─────────────────────────────────────────────────

const ORDER_NUMBER_PATTERNS = [
  /order\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
  /order\s+number\s*:?\s*([A-Z0-9\-]+)/i,
  /order\s+id\s*:?\s*([A-Z0-9\-]+)/i,
  /order\s+([A-Z0-9\-]{6,})/i,
  /#\s*([A-Z0-9\-]{6,})/,
];

/** Naive address normalization: lowercase, collapse whitespace, strip some punctuation. */
export function normalizeAddressRaw(raw: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bRoad\b/gi, 'Rd')
    .toLowerCase()
    .trim();
}

/**
 * Base order extraction from body/subject. Low confidence when patterns are weak.
 */
export function extractOrderBase(input: OrderExtractionInput): ExtractOrderResult {
  const text = [input.subject, input.bodyPlain].filter(Boolean).join('\n');
  const vendorDomain = getVendorDomain(input.fromAddress);

  let orderNumber = '';
  for (const re of ORDER_NUMBER_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      orderNumber = m[1].trim();
      break;
    }
  }
  const orderNumberConfidence = orderNumber ? 0.7 : 0.2;

  // Heuristic: look for lines that look like addresses (digit + word + St/Ave/etc.)
  const addressLine =
    text.match(/\d+[\s\w.,]+(?:st|ave|road|blvd|drive|ln|way)\b[\s\w.,]*/i)?.[0]?.trim() ?? null;
  const shippingAddressRaw = addressLine || null;
  const shippingAddressNormalized = normalizeAddressRaw(shippingAddressRaw);
  const addressConfidence = shippingAddressRaw ? 0.6 : 0.3;

  // Very simple line-item detection: "Qty 2 Item Name" or "2 x Item Name" or "* Item Name"
  const lineItems: OrderLineItemInput[] = [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const qtyMatch = line.match(/^(?:qty|quantity)?\s*(\d+)\s*[x×]\s*(.+)$/i) ?? line.match(/^(\d+)\s+(.+)$/);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10);
      const name = qtyMatch[2].trim();
      if (name.length > 1 && name.length < 200) {
        lineItems.push({ itemName: name, quantity: isNaN(qty) ? 1 : qty });
      }
    }
  }
  if (lineItems.length === 0 && (text.includes('item') || text.includes('product'))) {
    lineItems.push({ itemName: 'Unknown item', quantity: 1 });
  }
  const itemConfidence = lineItems.length > 0 ? 0.6 : 0.3;

  const vendorIdentifier = vendorDomain || input.fromAddress || 'unknown';

  return {
    orderNumber: orderNumber || `unknown-${Date.now()}`,
    vendorIdentifier,
    vendorDomain,
    shippingAddressRaw,
    shippingAddressNormalized,
    lineItems,
    orderNumberConfidence,
    addressConfidence,
    itemConfidence,
  };
}

// ─── Delivery extraction (base) ──────────────────────────────────────────────

const DELIVERY_DATE_PATTERNS = [
  /delivered\s+(?:on|at)?\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /delivery\s+date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
];

/**
 * Base delivery extraction: order number, optional delivery date, line items.
 */
export function extractDeliveryBase(input: OrderExtractionInput): ExtractDeliveryResult {
  const text = [input.subject, input.bodyPlain].filter(Boolean).join('\n');
  const vendorDomain = getVendorDomain(input.fromAddress);

  let orderNumber = '';
  for (const re of ORDER_NUMBER_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      orderNumber = m[1].trim();
      break;
    }
  }
  const orderNumberConfidence = orderNumber ? 0.7 : 0.2;

  let deliveryTimestamp: Date | null = null;
  for (const re of DELIVERY_DATE_PATTERNS) {
    const m = text.match(re);
    if (m && m[1]) {
      const parsed = new Date(m[1]);
      if (!isNaN(parsed.getTime())) deliveryTimestamp = parsed;
      break;
    }
  }

  const lineItems: OrderLineItemInput[] = [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const qtyMatch = line.match(/^(?:qty|quantity)?\s*(\d+)\s*[x×]\s*(.+)$/i) ?? line.match(/^(\d+)\s+(.+)$/);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10);
      const name = qtyMatch[2].trim();
      if (name.length > 1 && name.length < 200) {
        lineItems.push({ itemName: name, quantity: isNaN(qty) ? 1 : qty });
      }
    }
  }
  if (lineItems.length === 0 && (text.includes('item') || text.includes('delivered'))) {
    lineItems.push({ itemName: 'Unknown item', quantity: 1 });
  }
  const itemConfidence = lineItems.length > 0 ? 0.6 : 0.3;

  return {
    orderNumber: orderNumber || `unknown-${Date.now()}`,
    vendorDomain,
    deliveryTimestamp,
    deliverySource: 'email',
    lineItems,
    orderNumberConfidence,
    itemConfidence,
  };
}
