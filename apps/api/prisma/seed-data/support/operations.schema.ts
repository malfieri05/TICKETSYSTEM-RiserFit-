/**
 * Operations department — support topic field definitions.
 * Topic names must match SupportTopic.name in DB (including long names).
 */

import type { FormFieldDef, FormFieldOption } from '../field-types';

const SYSTEMS_OPTIONS: FormFieldOption[] = [
  { value: 'POWERHOUSE', label: 'Powerhouse', sortOrder: 0 },
  { value: 'CLUB_PILATES_APP', label: 'Club Pilates app', sortOrder: 1 },
  { value: 'CLUB_READY', label: 'Club Ready', sortOrder: 2 },
  { value: 'CRC', label: 'Club Ready Connect (CRC)', sortOrder: 3 },
  { value: 'NETGYM', label: 'NetGym', sortOrder: 4 },
  { value: 'AMAZON', label: 'Amazon', sortOrder: 5 },
  { value: 'RISER_U', label: 'Riser U', sortOrder: 6 },
  { value: 'OTHER', label: 'Other', sortOrder: 7 },
];

export const OPERATIONS_TOPIC_FIELDS: Record<string, FormFieldDef[]> = {
  'System Issues - CR, CRC, CP App, Netgym, Powerhouse, Riser U, other': [
    { fieldKey: 'full_legal_name', type: 'text', label: 'Full legal name of employee', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'systems', type: 'select', label: 'Select the system(s) affected', required: true, sortOrder: 11, options: SYSTEMS_OPTIONS, section: 'Details' },
    { fieldKey: 'screenshot', type: 'textarea', label: 'Screenshot of the issue (attach or paste link)', required: false, sortOrder: 12, section: 'Details' },
    { fieldKey: 'more_details', type: 'textarea', label: 'More details of the issue', required: true, sortOrder: 13, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'CR, NetGym - add User and/or Locations': [
    { fieldKey: 'full_legal_name', type: 'text', label: 'Full legal name of employee', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'which_locations', type: 'textarea', label: 'Which locations need to be added?', required: true, sortOrder: 11, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'E-mail Reset/New/Microsoft Issues': [
    { fieldKey: 'full_legal_name', type: 'text', label: 'Full legal name of employee', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'screenshot', type: 'textarea', label: 'Screenshot of the issue (attach or paste link)', required: false, sortOrder: 11, section: 'Details' },
    { fieldKey: 'more_details', type: 'textarea', label: 'More details of the issue', required: true, sortOrder: 12, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Wipes Orders': [
    { fieldKey: 'ship_to_location', type: 'text', label: 'Location the wipes will be shipped to', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'single_bags_left', type: 'text', label: 'How many single bags do you have left?', required: false, sortOrder: 11, section: 'Details' },
    { fieldKey: 'cases_needed', type: 'text', label: 'How many cases are needed for the month? (4 bags per case)', required: true, sortOrder: 12, section: 'Details' },
    { fieldKey: 'sharing_with_studios', type: 'textarea', label: 'Are you sharing with other studios? List studios and how many cases to each.', required: false, sortOrder: 13, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Ops General Support ONLY - No Paycom': [
    { fieldKey: 'screenshot', type: 'textarea', label: 'Screenshot of the issue (attach or paste link)', required: false, sortOrder: 10, section: 'Details' },
    { fieldKey: 'more_details', type: 'textarea', label: 'More details of the issue', required: true, sortOrder: 11, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],
};
