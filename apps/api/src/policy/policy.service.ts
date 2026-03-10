import { Injectable, Logger } from '@nestjs/common';
import { TicketVisibilityService } from '../common/permissions/ticket-visibility.service';
import { CapabilityKey } from './capabilities/capability-keys';
import {
  PolicyContext,
  PolicyDecision,
  PolicyResource,
  PolicySubject,
} from './policy.types';
import { PolicyRuleRegistry } from './rules/policy-rule-registry';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);
  private readonly registry: PolicyRuleRegistry;

  constructor(
    private readonly ticketVisibilityService: TicketVisibilityService,
  ) {
    this.registry = new PolicyRuleRegistry({
      visibility: this.ticketVisibilityService,
    });
  }

  evaluate(
    capability: CapabilityKey,
    subject: PolicySubject,
    resource: PolicyResource,
    context?: PolicyContext,
  ): PolicyDecision {
    const decision = this.registry.evaluate(
      capability,
      subject,
      resource,
      context,
    );

    if (!decision.allowed) {
      this.logger.warn({
        message: 'Policy decision denied',
        capability,
        userId: subject?.id,
        role: subject?.role,
        reason: decision.reason,
      });
    }

    return decision;
  }
}
