/**
 * Common maintenance form — same fields for every maintenance category.
 * Applied to each TicketFormSchema for maintenance categories.
 *
 * Note: pictures_videos uses textarea (attach or describe) as fallback until
 * create-ticket UI supports file-type form fields.
 */

import type { FormFieldDef } from './field-types';

export const MAINTENANCE_FIELDS: FormFieldDef[] = [
  { fieldKey: 'issue', type: 'text', label: 'Issue (brief description, e.g. Toilet clogged, Springboard loose)', required: true, sortOrder: 10, section: 'Issue details' },
  { fieldKey: 'detailed_description', type: 'textarea', label: 'Detailed description of the issue', required: true, sortOrder: 11, section: 'Issue details' },
  { fieldKey: 'first_day_availability', type: 'date', label: 'First day availability (preferred date for maintenance visit)', required: true, sortOrder: 12, section: 'Scheduling' },
  { fieldKey: 'pictures_videos', type: 'textarea', label: 'Pictures/videos of the issue (attach or paste link)', required: false, sortOrder: 13, section: 'Scheduling' },
  { fieldKey: 'additional_comments', type: 'textarea', label: 'Additional comments (dates and times that work for your studio)', required: false, sortOrder: 14, section: 'Additional' },
];
