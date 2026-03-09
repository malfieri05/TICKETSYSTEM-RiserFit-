/**
 * HR department — support topic field definitions.
 * Topic names must match SupportTopic.name in DB (seed.ts SUPPORT_TOPICS).
 */

import type { FormFieldDef, FormFieldOption } from '../field-types';

const POSITION_OPTIONS: FormFieldOption[] = [
  'Corporate', 'RM', 'DM', 'GM', 'AGM', 'SA', 'EDC', 'Lead Instructor', 'Instructor',
  'Junior Instructor', 'Apprentice Instructor', 'Junior Apprentice Instructor', 'Pilates Trainer',
].map((label, i) => ({ value: label.replace(/\s+/g, '_').toUpperCase(), label, sortOrder: i }));

export const HR_TOPIC_FIELDS: Record<string, FormFieldDef[]> = {
  'New Hire': [
    { fieldKey: 'legal_first_name', type: 'text', label: 'Legal first name', required: true, sortOrder: 10, section: 'Employee information' },
    { fieldKey: 'legal_last_name', type: 'text', label: 'Legal last name', required: true, sortOrder: 11, section: 'Employee information' },
    { fieldKey: 'alternate_name', type: 'text', label: 'Alternate name', required: false, sortOrder: 12, section: 'Employee information' },
    { fieldKey: 'employee_phone', type: 'text', label: 'Employee phone', required: false, sortOrder: 13, section: 'Employee information' },
    { fieldKey: 'employee_personal_email', type: 'text', label: 'Personal email', required: false, sortOrder: 14, section: 'Employee information' },
    { fieldKey: 'position', type: 'select', label: 'Position', required: true, sortOrder: 15, options: POSITION_OPTIONS, section: 'Role & compensation' },
    { fieldKey: 'reports_to', type: 'text', label: 'Reports to (Supervisor)', required: false, sortOrder: 16, section: 'Role & compensation' },
    { fieldKey: 'date_of_offer', type: 'date', label: 'Date of offer', required: false, sortOrder: 17, section: 'Role & compensation' },
    { fieldKey: 'start_date', type: 'date', label: 'Start date', required: true, sortOrder: 18, section: 'Role & compensation' },
    { fieldKey: 'pay_rate', type: 'text', label: 'Pay rate ($)', required: false, sortOrder: 19, section: 'Role & compensation' },
    { fieldKey: 'employment_type', type: 'select', label: 'Part-time or Full-time?', required: true, sortOrder: 20, options: [{ value: 'PART_TIME', label: 'Part-time', sortOrder: 0 }, { value: 'FULL_TIME', label: 'Full-time', sortOrder: 1 }], section: 'Role & compensation' },
    { fieldKey: 'referred', type: 'checkbox', label: 'Was this candidate referred by a current employee?', required: false, sortOrder: 21, section: 'Referral & source' },
    { fieldKey: 'referring_employee_name', type: 'text', label: 'Referring employee full name', required: false, sortOrder: 22, conditionalFieldKey: 'referred', conditionalValue: 'true', section: 'Referral & source' },
    { fieldKey: 'candidate_source', type: 'select', label: 'Candidate source', required: false, sortOrder: 23, options: [{ value: 'JAZZHR', label: 'JazzHR', sortOrder: 0 }, { value: 'REFERRAL', label: 'Referral', sortOrder: 1 }, { value: 'CAREER_PAGE', label: 'Career Page', sortOrder: 2 }, { value: 'OTHER', label: 'Other', sortOrder: 3 }], section: 'Referral & source' },
    { fieldKey: 'candidate_source_other', type: 'text', label: 'What source? (if Other)', required: false, sortOrder: 24, conditionalFieldKey: 'candidate_source', conditionalValue: 'OTHER', section: 'Referral & source' },
    { fieldKey: 'candidate_application_date', type: 'date', label: 'Candidate application date', required: false, sortOrder: 25, section: 'Referral & source' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'PAN / Change in Relationship': [
    { fieldKey: 'legal_first_name', type: 'text', label: 'Legal first name', required: true, sortOrder: 10, section: 'Employee information' },
    { fieldKey: 'legal_last_name', type: 'text', label: 'Legal last name', required: true, sortOrder: 11, section: 'Employee information' },
    { fieldKey: 'alternate_name', type: 'text', label: 'Alternate name', required: false, sortOrder: 12, section: 'Employee information' },
    { fieldKey: 'position', type: 'select', label: 'Position', required: true, sortOrder: 13, options: POSITION_OPTIONS, section: 'Role & pay' },
    { fieldKey: 'pay_rate', type: 'text', label: 'Pay rate ($)', required: false, sortOrder: 14, section: 'Role & pay' },
    { fieldKey: 'effective_date', type: 'date', label: 'Effective date', required: true, sortOrder: 15, section: 'Role & pay' },
    { fieldKey: 'action_new_position_rate', type: 'textarea', label: 'Action (Change to Position/Pay), New Position, New Rate', required: true, sortOrder: 16, section: 'Role & pay' },
    { fieldKey: 'equipment_return', type: 'checkbox', label: 'Does the employee have company-issued equipment to return?', required: false, sortOrder: 17, section: 'Equipment' },
    { fieldKey: 'equipment_type', type: 'textarea', label: 'What type of equipment needs to be collected? (e.g. Laptop, iPad, phone)', required: false, sortOrder: 18, conditionalFieldKey: 'equipment_return', conditionalValue: 'true', section: 'Equipment' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Resignation / Termination': [
    { fieldKey: 'legal_first_name', type: 'text', label: 'Legal first name', required: true, sortOrder: 10, section: 'Employee information' },
    { fieldKey: 'legal_last_name', type: 'text', label: 'Legal last name', required: true, sortOrder: 11, section: 'Employee information' },
    { fieldKey: 'position', type: 'select', label: 'Position of employee', required: true, sortOrder: 12, options: POSITION_OPTIONS, section: 'Employee information' },
    { fieldKey: 'effective_date_last_day', type: 'date', label: 'Effective date / Last day worked', required: true, sortOrder: 13, section: 'Departure details' },
    { fieldKey: 'resigned_on', type: 'date', label: 'Resigned on', required: false, sortOrder: 14, section: 'Departure details' },
    { fieldKey: 'resignation_documents', type: 'textarea', label: 'Resignation letter or documents (attach or describe)', required: false, sortOrder: 15, section: 'Departure details' },
    { fieldKey: 'why_leaving', type: 'textarea', label: 'Why is the employee leaving Riser Fitness?', required: true, sortOrder: 16, section: 'Departure details' },
    { fieldKey: 'equipment_return', type: 'checkbox', label: 'Does the employee have company-issued equipment to return?', required: false, sortOrder: 17, section: 'Equipment' },
    { fieldKey: 'equipment_type', type: 'textarea', label: 'What type of equipment needs to be collected? (e.g. Laptop, iPad, phone)', required: false, sortOrder: 18, conditionalFieldKey: 'equipment_return', conditionalValue: 'true', section: 'Equipment' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'New Job Posting': [
    { fieldKey: 'position', type: 'select', label: 'Position', required: true, sortOrder: 10, options: POSITION_OPTIONS, section: 'Position details' },
    { fieldKey: 'employment_type', type: 'select', label: 'Part-time or Full-time?', required: true, sortOrder: 11, options: [{ value: 'PART_TIME', label: 'Part-time', sortOrder: 0 }, { value: 'FULL_TIME', label: 'Full-time', sortOrder: 1 }], section: 'Position details' },
    { fieldKey: 'hiring_manager', type: 'textarea', label: 'Hiring Manager (who can view applicants/candidates?)', required: true, sortOrder: 12, section: 'Position details' },
    { fieldKey: 'pay_rate_range', type: 'text', label: 'Pay rate / Pay range', required: false, sortOrder: 13, section: 'Position details' },
    { fieldKey: 'reason_for_post', type: 'select', label: 'Reason for post', required: true, sortOrder: 14, options: [{ value: 'PROMOTION', label: 'Promotion', sortOrder: 0 }, { value: 'NEW_POSITION', label: 'New Position', sortOrder: 1 }, { value: 'NEW_STUDIO', label: 'New Studio', sortOrder: 2 }, { value: 'RESIGNATION', label: 'Resignation', sortOrder: 3 }, { value: 'INVOLUNTARY_TERMINATION', label: 'Involuntary Termination', sortOrder: 4 }], section: 'Position details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Workshop Bonus': [
    { fieldKey: 'name', type: 'text', label: 'Name', required: true, sortOrder: 10, section: 'Details' },
    { fieldKey: 'date_and_name_of_workshop', type: 'text', label: 'Date and name of workshop', required: true, sortOrder: 11, section: 'Details' },
    { fieldKey: 'additional_details', type: 'textarea', label: 'Additional details', required: false, sortOrder: 100, section: 'Additional' },
  ],

  'Paycom': [
    { fieldKey: 'paycom_redirect_info', type: 'textarea', label: 'Information', required: false, sortOrder: 10, section: 'Information' },
  ],
};
