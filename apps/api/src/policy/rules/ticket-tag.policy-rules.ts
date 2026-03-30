import { Role } from '@prisma/client';
import {
  PolicyDecision,
  PolicyResource,
  PolicySubject,
  PolicyContext,
} from '../policy.types';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';

type TicketForTagLike = {
  requesterId: string;
  ownerId: string | null;
  studioId: string | null;
  department?: { code: string } | null;
  owner?: { teamId?: string | null; team?: { name: string } | null } | null;
};

interface TicketTagRuleHelpers {
  visibility: TicketVisibilityService;
}

export function ticketAddTagRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: TicketTagRuleHelpers,
): PolicyDecision {
  if (subject.role === Role.STUDIO_USER) {
    return { allowed: false, reason: 'studio_user_cannot_add_tag' };
  }

  const ticket = resource as TicketForTagLike | null;
  if (!ticket) {
    return { allowed: false, reason: 'ticket_missing' };
  }

  try {
    helpers.visibility.assertCanView(
      {
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId,
        studioId: ticket.studioId,
        department: ticket.department,
        owner: ticket.owner,
      },
      subject,
    );
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'ticket_not_visible' };
  }
}
