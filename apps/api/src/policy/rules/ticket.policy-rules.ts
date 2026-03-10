import { Role } from '@prisma/client';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import {
  PolicyDecision,
  PolicyResource,
  PolicySubject,
  PolicyContext,
} from '../policy.types';

type TicketLike = {
  id: string;
  requesterId: string;
  ownerId: string | null;
  studioId: string | null;
  owner?: { teamId?: string | null; team?: { name: string } | null } | null;
};

interface TicketRuleHelpers {
  visibility: TicketVisibilityService;
}

function canViewTicket(
  subject: PolicySubject,
  resource: PolicyResource,
  helpers: TicketRuleHelpers,
): PolicyDecision {
  const ticket = resource as TicketLike | null;
  if (!ticket) {
    return { allowed: false, reason: 'ticket_missing' };
  }

  // Delegate full visibility logic to TicketVisibilityService.
  try {
    helpers.visibility.assertCanView(ticket, subject);
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'ticket_not_visible' };
  }
}

function canListTickets(subject: PolicySubject): PolicyDecision {
  // All authenticated roles may list tickets; TicketVisibilityService determines scope.
  if (!subject || !subject.id) {
    return { allowed: false, reason: 'unauthenticated' };
  }
  return { allowed: true };
}

function canCreateTicket(subject: PolicySubject): PolicyDecision {
  // All authenticated roles can create tickets.
  if (!subject || !subject.id) {
    return { allowed: false, reason: 'unauthenticated' };
  }
  return { allowed: true };
}

function canModifyTicket(
  subject: PolicySubject,
  resource: PolicyResource,
  helpers: TicketRuleHelpers,
): PolicyDecision {
  const ticket = resource as TicketLike | null;
  if (!ticket) {
    return { allowed: false, reason: 'ticket_missing' };
  }

  if (helpers.visibility.canModify(ticket, subject)) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'ticket_not_modifiable' };
}

export function ticketCreateRule(
  subject: PolicySubject,
  _resource: PolicyResource,
  _context: PolicyContext | undefined,
  _helpers: TicketRuleHelpers,
): PolicyDecision {
  return canCreateTicket(subject);
}

export function ticketViewRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: TicketRuleHelpers,
): PolicyDecision {
  return canViewTicket(subject, resource, helpers);
}

export function ticketListInboxRule(
  subject: PolicySubject,
  _resource: PolicyResource,
  _context: PolicyContext | undefined,
  _helpers: TicketRuleHelpers,
): PolicyDecision {
  return canListTickets(subject);
}

export function ticketTransitionStatusRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: TicketRuleHelpers,
): PolicyDecision {
  // Studio users are read-only for workflow execution.
  if (subject.role === Role.STUDIO_USER) {
    return { allowed: false, reason: 'studio_user_cannot_transition' };
  }

  // Admin and department users must still be allowed to modify the ticket.
  return canModifyTicket(subject, resource, helpers);
}

export function ticketAssignOwnerRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: TicketRuleHelpers,
): PolicyDecision {
  // Only department users and admins may assign tickets.
  if (subject.role !== Role.DEPARTMENT_USER && subject.role !== Role.ADMIN) {
    return { allowed: false, reason: 'role_cannot_assign_ticket' };
  }

  return canModifyTicket(subject, resource, helpers);
}

export function ticketUpdateCoreFieldsRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: TicketRuleHelpers,
): PolicyDecision {
  // All roles rely on canModify semantics; studio users may only edit their own submitted tickets.
  return canModifyTicket(subject, resource, helpers);
}
