import { Role } from '@prisma/client';
import {
  PolicyDecision,
  PolicyResource,
  PolicySubject,
  PolicyContext,
} from '../policy.types';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';

type SubtaskLike = {
  id: string;
  ticket: {
    requesterId: string;
    ownerId: string | null;
    studioId: string | null;
  };
};

interface SubtaskRuleHelpers {
  visibility: TicketVisibilityService;
}

function canViewSubtask(
  subject: PolicySubject,
  resource: PolicyResource,
  helpers: SubtaskRuleHelpers,
): PolicyDecision {
  const subtask = resource as SubtaskLike | null;
  if (!subtask) {
    return { allowed: false, reason: 'subtask_missing' };
  }

  const ticket = subtask.ticket;

  try {
    helpers.visibility.assertCanView(
      {
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId,
        studioId: ticket.studioId,
      },
      subject,
    );
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'subtask_ticket_not_visible' };
  }
}

function canMutateSubtask(
  subject: PolicySubject,
  resource: PolicyResource,
  helpers: SubtaskRuleHelpers,
): PolicyDecision {
  // Studio users may not mutate subtasks at all.
  if (subject.role === Role.STUDIO_USER) {
    return { allowed: false, reason: 'studio_user_cannot_mutate_subtasks' };
  }

  // Department users and admins may mutate subtasks if they can modify the ticket.
  const subtask = resource as SubtaskLike | null;
  if (!subtask) {
    return { allowed: false, reason: 'subtask_missing' };
  }

  const ticket = subtask.ticket;

  const canModifyTicket = helpers.visibility.canModify(
    { requesterId: ticket.requesterId, ownerId: ticket.ownerId },
    subject,
  );

  if (!canModifyTicket) {
    return { allowed: false, reason: 'subtask_ticket_not_modifiable' };
  }

  return { allowed: true };
}

export function subtaskViewRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: SubtaskRuleHelpers,
): PolicyDecision {
  return canViewSubtask(subject, resource, helpers);
}

export function subtaskCreateRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: SubtaskRuleHelpers,
): PolicyDecision {
  return canMutateSubtask(subject, resource, helpers);
}

export function subtaskUpdateRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: SubtaskRuleHelpers,
): PolicyDecision {
  return canMutateSubtask(subject, resource, helpers);
}

export function subtaskTransitionStatusRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: SubtaskRuleHelpers,
): PolicyDecision {
  return canMutateSubtask(subject, resource, helpers);
}
