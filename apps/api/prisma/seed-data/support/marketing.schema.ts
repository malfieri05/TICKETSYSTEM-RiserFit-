/**
 * Marketing department — support topic field definitions.
 * Topic names must match SupportTopic.name in DB.
 */

import type { FormFieldDef, FormFieldOption } from '../field-types';

const GRASSROOTS_TYPE_OPTIONS: FormFieldOption[] = [
  { value: 'EXPO', label: 'Expo', sortOrder: 0 },
  { value: 'TABLE_BOOTH', label: 'Table Booth', sortOrder: 1 },
  { value: 'SPONSORSHIP', label: 'Sponsorship', sortOrder: 2 },
  { value: 'OTHER', label: 'Other', sortOrder: 3 },
];

const PRINT_MATERIALS_OPTIONS: FormFieldOption[] = [
  'Booking Classes 101 4x6 Postcard', 'Waitlist 4x6 postcard', 'Studio policies 4x6 postcard',
  'Classes and levels trifold', 'Referral program rack card', 'Plain postcard',
  'For grassroots: New to Pilates? 4x6 Postcard', 'For Grassroots: Free intro Business Card size',
  'For Grassroots: Free class 4x6 postcard', 'For grassroots: Move better Rack Card',
  'For Presale: Opening Special Business Card Size', 'For Presale: Presale Postcard',
  'For Presale: Hey neighbor Flyer', 'For Presale: Partnership Postcard',
].map((label, i) => ({ value: label.replace(/\s+/g, '_').toUpperCase().replace(/[^A-Z0-9_]/g, '_'), label, sortOrder: i }));

export const MARKETING_TOPIC_FIELDS: Record<string, FormFieldDef[]> = {
  'Grassroots Spend Approval': [
    { fieldKey: 'acknowledge_capacity', type: 'checkbox', label: 'By submitting you acknowledge that you and your team have the capacity and time to follow the full promotional plan.', required: true, sortOrder: 10, section: 'Event details' },
    { fieldKey: 'grassroots_type', type: 'select', label: 'Grassroots type', required: true, sortOrder: 11, options: GRASSROOTS_TYPE_OPTIONS, section: 'Event details' },
    { fieldKey: 'short_description', type: 'textarea', label: 'Short description of grassroots effort (e.g. Long Beach Bridal Expo)', required: true, sortOrder: 12, section: 'Event details' },
    { fieldKey: 'date_of_efforts', type: 'date', label: 'Date of grassroots efforts', required: true, sortOrder: 13, section: 'Event details' },
    { fieldKey: 'cost', type: 'text', label: 'Cost', required: true, sortOrder: 14, section: 'Event details' },
    { fieldKey: 'what_included_in_cost', type: 'textarea', label: 'What is included in cost?', required: false, sortOrder: 15, section: 'Event details' },
    { fieldKey: 'estimated_leads', type: 'text', label: 'Estimated leads expected', required: false, sortOrder: 16, section: 'Event details' },
    { fieldKey: 'why_good_fit', type: 'textarea', label: 'Why is this event a good fit for generating new leads?', required: false, sortOrder: 17, section: 'Event details' },
    { fieldKey: 'participated_before', type: 'textarea', label: 'Have we participated in this event or attempted a similar effort before? (If yes, include previous results)', required: false, sortOrder: 18, section: 'Event details' },
    { fieldKey: 'relevant_links', type: 'textarea', label: 'Relevant links (event website, socials, etc.)', required: false, sortOrder: 19, section: 'Event details' },
    { fieldKey: 'relevant_attachments', type: 'textarea', label: 'Relevant attachments (photos, PDFs — attach or describe)', required: false, sortOrder: 20, section: 'Event details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Print Materials Request': [
    { fieldKey: 'digital_stack_template', type: 'textarea', label: 'Digital stack template/photo (attach or paste link)', required: true, sortOrder: 10, section: 'Request details' },
    { fieldKey: 'description', type: 'textarea', label: 'Description of the print material', required: true, sortOrder: 11, section: 'Request details' },
    { fieldKey: 'fedex_address', type: 'text', label: 'Nearest FedEx office print and ship address', required: false, sortOrder: 12, section: 'Request details' },
    { fieldKey: 'types_of_materials', type: 'select', label: 'Types of materials needed', required: true, sortOrder: 13, options: PRINT_MATERIALS_OPTIONS, section: 'Request details' },
    { fieldKey: 'quantity', type: 'text', label: 'Quantity requested', required: true, sortOrder: 14, section: 'Request details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'General Support': [
    { fieldKey: 'general_support', type: 'textarea', label: 'General support', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Instructor Bio Update': [
    { fieldKey: 'instructor_cr_id', type: 'text', label: 'Instructor CR ID', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'description_of_update', type: 'textarea', label: 'Description of update needed', required: true, sortOrder: 11, section: 'Details' },
    { fieldKey: 'studio_locations', type: 'textarea', label: 'Studio locations where the instructor teaches', required: false, sortOrder: 12, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Custom Marketing Material': [
    { fieldKey: 'flyer_social_details', type: 'textarea', label: 'Flyer and social materials (include studio and event/partnership details)', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Club Pilates App Instructor Name Changes': [
    { fieldKey: 'current_name_new_name_location', type: 'textarea', label: 'Current name, new name change, and location of the instructor', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'instructor_club_ready_id', type: 'text', label: 'Instructor Club Ready ID', required: true, sortOrder: 11, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],
};
