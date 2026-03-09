/**
 * Builds section header lookup (fieldKey -> section) from seed field definitions.
 * Used by the API to attach optional section to each field in the schema DTO.
 * No DB storage; visual only.
 */

import { HR_TOPIC_FIELDS } from './support/hr.schema';
import { MARKETING_TOPIC_FIELDS } from './support/marketing.schema';
import { RETAIL_TOPIC_FIELDS } from './support/retail.schema';
import { OPERATIONS_TOPIC_FIELDS } from './support/operations.schema';
import { MAINTENANCE_FIELDS } from './maintenance.schema';

const SUPPORT_MAP: Record<string, Record<string, Array<{ fieldKey: string; section?: string }>>> = {
  HR: HR_TOPIC_FIELDS,
  MARKETING: MARKETING_TOPIC_FIELDS,
  RETAIL: RETAIL_TOPIC_FIELDS,
  OPERATIONS: OPERATIONS_TOPIC_FIELDS,
};

function buildSectionMap(fields: Array<{ fieldKey: string; section?: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.section) out[f.fieldKey] = f.section;
  }
  return out;
}

/** Support: department code (HR, MARKETING, RETAIL, OPERATIONS) + topic name. */
export function getSectionMapForSupportTopic(departmentCode: string, topicName: string): Record<string, string> {
  const topicFields = SUPPORT_MAP[departmentCode]?.[topicName];
  if (!topicFields) return {};
  return buildSectionMap(topicFields);
}

/** Maintenance: same fields for all categories. */
export function getSectionMapForMaintenance(): Record<string, string> {
  return buildSectionMap(MAINTENANCE_FIELDS);
}
