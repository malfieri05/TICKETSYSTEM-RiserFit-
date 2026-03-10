import { Role } from '@prisma/client';
import {
  PolicyDecision,
  PolicyResource,
  PolicySubject,
  PolicyContext,
} from '../policy.types';

function requireAdmin(subject: PolicySubject): PolicyDecision {
  if (subject.role === Role.ADMIN) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'admin_only' };
}

export function adminUserLocationsUpdateRule(
  subject: PolicySubject,
  _resource: PolicyResource,
  _context: PolicyContext | undefined,
): PolicyDecision {
  return requireAdmin(subject);
}

export function adminWorkflowsManageRule(
  subject: PolicySubject,
  _resource: PolicyResource,
  _context: PolicyContext | undefined,
): PolicyDecision {
  return requireAdmin(subject);
}

export function adminTaxonomyManageRule(
  subject: PolicySubject,
  _resource: PolicyResource,
  _context: PolicyContext | undefined,
): PolicyDecision {
  return requireAdmin(subject);
}
