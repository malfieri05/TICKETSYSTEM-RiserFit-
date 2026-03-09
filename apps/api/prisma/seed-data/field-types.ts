/**
 * Shared types for schema field definitions used by Stage 20 seed.
 * Keyed by topic name (support) or used as single definition (maintenance).
 */

export interface FormFieldOption {
  value: string;
  label: string;
  sortOrder: number;
}

export interface FormFieldDef {
  fieldKey: string;
  type: string;
  label: string;
  required: boolean;
  sortOrder: number;
  /** Optional section header (visual only; not stored in DB). */
  section?: string;
  conditionalFieldKey?: string;
  conditionalValue?: string;
  options?: FormFieldOption[];
}

/** Support: topic name -> array of field definitions */
export type SupportTopicFields = Record<string, FormFieldDef[]>;

/** Maintenance: single array of field definitions applied to every category */
export type MaintenanceFieldDefs = FormFieldDef[];
