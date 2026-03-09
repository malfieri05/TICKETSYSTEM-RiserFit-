/**
 * Stage 21 — Auto-summary ticket titles.
 * Single source of truth: backend generates title from taxonomy + schema fields + location.
 * Max length 255; segments omitted when missing; fallback to "<Topic> Submission" / "Support Request" / "Maintenance Request".
 */

const MAX_TITLE_LENGTH = 255;

function trimToMax(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

function segment(parts: (string | undefined | null)[]): string {
  return parts.filter((p) => p != null && String(p).trim() !== '').join(' – ');
}

function truncateDetail(val: string, maxChars = 50): string {
  const t = val.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars - 3) + '...';
}

export interface TitleGeneratorParams {
  ticketClassCode: 'SUPPORT' | 'MAINTENANCE';
  supportTopicName: string | null;
  maintenanceCategoryName: string | null;
  formResponses: Record<string, string>;
  studioName: string | null;
}

/**
 * Generate a ticket title from taxonomy + form responses + location.
 * Deterministic; safe for empty/missing data.
 */
export function generateTicketTitle(params: TitleGeneratorParams): string {
  const { ticketClassCode, supportTopicName, maintenanceCategoryName, formResponses, studioName } = params;
  const r = (key: string) => (formResponses[key] ?? '').trim();
  const loc = (studioName ?? '').trim() || null;

  if (ticketClassCode === 'MAINTENANCE') {
    const categoryLabel = (maintenanceCategoryName ?? 'Maintenance').trim();
    const shortCategory = categoryLabel.split('/')[0].trim() || 'Maintenance';
    const issue = r('issue');
    const parts: string[] = [shortCategory + ' Issue'];
    if (loc) parts.push(loc);
    if (issue) parts.push(truncateDetail(issue, 40));
    const title = segment(parts);
    if (title) return trimToMax(title, MAX_TITLE_LENGTH);
    return trimToMax(segment([shortCategory + ' Issue', loc]) || 'Maintenance Request', MAX_TITLE_LENGTH);
  }

  // SUPPORT
  const topicName = (supportTopicName ?? 'Support').trim();
  if (!topicName) return 'Support Request';

  const first = r('legal_first_name');
  const last = r('legal_last_name');
  const fullName = [first, last].filter(Boolean).join(' ').trim() || null;

  switch (topicName) {
    case 'New Hire':
      return trimToMax(segment([topicName, fullName || 'Submission', loc]) || 'New Hire – Submission', MAX_TITLE_LENGTH);
    case 'Resignation / Termination':
      return trimToMax(segment(['Resignation', fullName || 'Submission', loc]) || 'Resignation – Submission', MAX_TITLE_LENGTH);
    case 'PAN / Change in Relationship':
      return trimToMax(segment(['PAN', fullName || 'Submission', loc]) || 'PAN – Submission', MAX_TITLE_LENGTH);
    case 'New Job Posting':
      return trimToMax(segment([topicName, r('position') || 'Request', loc]) || topicName + ' – Request', MAX_TITLE_LENGTH);
    case 'Workshop Bonus':
      return trimToMax(segment([topicName, r('name') || 'Submission', loc]) || topicName + ' – Submission', MAX_TITLE_LENGTH);
    case 'Paycom':
      return trimToMax(segment([topicName, loc]) || topicName + ' – Request', MAX_TITLE_LENGTH);
    default:
      break;
  }

  // Marketing / Retail / Operations: topic + first strong field + location
  const identifying =
    fullName ||
    r('full_legal_name') ||
    r('short_description') ||
    r('general_support') ||
    r('instructor_cr_id') ||
    r('current_name_new_name_location') ||
    r('retail_request') ||
    r('brand_style_size') ||
    r('which_locations') ||
    r('more_details') ||
    r('ship_to_location') ||
    r('cases_needed');
  const primary = identifying ? truncateDetail(identifying, 45) : null;
  const title = segment([topicName, primary || 'Request', loc]);
  return trimToMax(title || topicName + ' – Submission', MAX_TITLE_LENGTH);
}
