import { RequestUser } from '../modules/auth/strategies/jwt.strategy';

export type PolicySubject = RequestUser;

// Resource is intentionally generic; individual rules narrow it as needed.
export type PolicyResource = unknown;

export interface PolicyContext {
  // Optional bag for rule-specific inputs (e.g. target status, flags).
  // Keep this small and explicit in callers.
  [key: string]: unknown;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export type PolicyRule = (
  subject: PolicySubject,
  resource: PolicyResource,
  context: PolicyContext | undefined,
) => PolicyDecision;
