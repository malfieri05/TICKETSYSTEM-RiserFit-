// Capability keys grouped by domain. These are stable identifiers used by policy rules.

export const TICKET_CREATE = 'ticket.create';
export const TICKET_VIEW = 'ticket.view';
export const TICKET_LIST_INBOX = 'ticket.list_inbox';
export const TICKET_TRANSITION_STATUS = 'ticket.transition_status';
export const TICKET_ASSIGN_OWNER = 'ticket.assign_owner';
export const TICKET_UPDATE_CORE_FIELDS = 'ticket.update_core_fields';
export const TICKET_ADD_TAG = 'ticket.add_tag';

export const SUBTASK_VIEW = 'subtask.view';
export const SUBTASK_CREATE = 'subtask.create';
export const SUBTASK_UPDATE = 'subtask.update';
export const SUBTASK_TRANSITION_STATUS = 'subtask.transition_status';

export const COMMENT_ADD_PUBLIC = 'comment.add_public';

export const ADMIN_USER_LOCATIONS_UPDATE = 'admin.user.locations.update';
export const ADMIN_WORKFLOWS_MANAGE = 'admin.workflows.manage';
export const ADMIN_TAXONOMY_MANAGE = 'admin.taxonomy.manage';

// Convenience union of all capability keys
export type CapabilityKey =
  | typeof TICKET_CREATE
  | typeof TICKET_VIEW
  | typeof TICKET_LIST_INBOX
  | typeof TICKET_TRANSITION_STATUS
  | typeof TICKET_ASSIGN_OWNER
  | typeof TICKET_UPDATE_CORE_FIELDS
  | typeof TICKET_ADD_TAG
  | typeof SUBTASK_VIEW
  | typeof SUBTASK_CREATE
  | typeof SUBTASK_UPDATE
  | typeof SUBTASK_TRANSITION_STATUS
  | typeof COMMENT_ADD_PUBLIC
  | typeof ADMIN_USER_LOCATIONS_UPDATE
  | typeof ADMIN_WORKFLOWS_MANAGE
  | typeof ADMIN_TAXONOMY_MANAGE;
