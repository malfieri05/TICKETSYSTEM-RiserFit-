import {
  PolicyDecision,
  PolicyResource,
  PolicySubject,
  PolicyContext,
} from '../policy.types';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';

type TicketForCommentLike = {
  requesterId: string;
  ownerId: string | null;
  studioId: string | null;
};

interface CommentRuleHelpers {
  visibility: TicketVisibilityService;
}

function ensureTicketVisible(
  subject: PolicySubject,
  resource: PolicyResource,
  helpers: CommentRuleHelpers,
): PolicyDecision {
  const ticket = resource as TicketForCommentLike | null;
  if (!ticket) {
    return { allowed: false, reason: 'ticket_missing' };
  }

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
    return { allowed: false, reason: 'ticket_not_visible' };
  }
}

export function commentAddPublicRule(
  subject: PolicySubject,
  resource: PolicyResource,
  _context: PolicyContext | undefined,
  helpers: CommentRuleHelpers,
): PolicyDecision {
  const visibilityDecision = ensureTicketVisible(subject, resource, helpers);
  if (!visibilityDecision.allowed) {
    return visibilityDecision;
  }

  // All visible users may add public comments.
  return { allowed: true };
}
