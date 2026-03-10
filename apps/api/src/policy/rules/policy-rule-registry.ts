import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { CapabilityKey } from '../capabilities/capability-keys';
import {
  PolicyContext,
  PolicyDecision,
  PolicyResource,
  PolicySubject,
} from '../policy.types';
import {
  ticketAssignOwnerRule,
  ticketCreateRule,
  ticketListInboxRule,
  ticketTransitionStatusRule,
  ticketUpdateCoreFieldsRule,
  ticketViewRule,
} from './ticket.policy-rules';
import {
  subtaskCreateRule,
  subtaskTransitionStatusRule,
  subtaskUpdateRule,
  subtaskViewRule,
} from './subtask.policy-rules';
import { commentAddPublicRule } from './comment.policy-rules';
import {
  adminTaxonomyManageRule,
  adminUserLocationsUpdateRule,
  adminWorkflowsManageRule,
} from './admin.policy-rules';

type RuleWithHelpers = (
  subject: PolicySubject,
  resource: PolicyResource,
  context: PolicyContext | undefined,
  helpers: { visibility: TicketVisibilityService },
) => PolicyDecision;

interface RegistryDependencies {
  visibility: TicketVisibilityService;
}

const buildRegistry = (
  deps: RegistryDependencies,
): Record<CapabilityKey, RuleWithHelpers> => ({
  // Tickets
  'ticket.create': ticketCreateRule,
  'ticket.view': ticketViewRule,
  'ticket.list_inbox': ticketListInboxRule,
  'ticket.transition_status': ticketTransitionStatusRule,
  'ticket.assign_owner': ticketAssignOwnerRule,
  'ticket.update_core_fields': ticketUpdateCoreFieldsRule,

  // Subtasks
  'subtask.view': subtaskViewRule,
  'subtask.create': subtaskCreateRule,
  'subtask.update': subtaskUpdateRule,
  'subtask.transition_status': subtaskTransitionStatusRule,

  // Comments
  'comment.add_public': commentAddPublicRule,

  // Admin
  'admin.user.locations.update': adminUserLocationsUpdateRule,
  'admin.workflows.manage': adminWorkflowsManageRule,
  'admin.taxonomy.manage': adminTaxonomyManageRule,
});

export class PolicyRuleRegistry {
  private readonly rules: Record<CapabilityKey, RuleWithHelpers>;

  constructor(private readonly deps: RegistryDependencies) {
    this.rules = buildRegistry(deps);
  }

  evaluate(
    capability: CapabilityKey,
    subject: PolicySubject,
    resource: PolicyResource,
    context: PolicyContext | undefined,
  ): PolicyDecision {
    const rule = this.rules[capability];

    if (!rule) {
      return {
        allowed: false,
        reason: `unknown_capability:${capability}`,
      };
    }

    return rule(subject, resource, context, {
      visibility: this.deps.visibility,
    });
  }
}
