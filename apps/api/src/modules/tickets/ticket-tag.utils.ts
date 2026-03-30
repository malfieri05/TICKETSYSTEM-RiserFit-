/** Single normalizer for tag labels (v1 spec §2). */
export function normalizeTicketTagLabel(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const TICKET_TAG_LABEL_MAX_LEN = 80;
export const TICKET_MAX_TAGS_PER_TICKET = 20;
