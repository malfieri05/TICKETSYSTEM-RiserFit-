/**
 * Retail department — support topic field definitions.
 * Topic names must match SupportTopic.name in DB.
 */

import type { FormFieldDef } from '../field-types';

export const RETAIL_TOPIC_FIELDS: Record<string, FormFieldDef[]> = {
  'Missing / Update SKU': [
    { fieldKey: 'tag_picture', type: 'textarea', label: 'Clear picture of tag (brand, style, color, size) — attach or paste link', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Retail Request': [
    { fieldKey: 'retail_request', type: 'textarea', label: 'Retail request (milestone, apparel, accessories, socks, etc.)', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'item_picture', type: 'textarea', label: 'Picture of requested item if available (attach or paste link)', required: false, sortOrder: 11, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Damaged Product': [
    { fieldKey: 'brand_style_size', type: 'text', label: 'Brand / style / size or accessory description', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'picture_of_damage', type: 'textarea', label: 'Picture of damage areas and tag (attach or paste link)', required: true, sortOrder: 11, section: 'Details' },
    { fieldKey: 'shipping_invoice', type: 'textarea', label: 'Corresponding shipping invoice if available (attach or paste link)', required: false, sortOrder: 12, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],
};
