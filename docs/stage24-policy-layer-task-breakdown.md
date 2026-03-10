## Stage 24 Policy Layer — Task Breakdown

Constraints (apply to all phases):

- Policy evaluation must remain **pure** (no database queries or network calls inside policy rules or the policy service).
- `TicketVisibilityService` is the **only** authority for ticket/subtask location visibility.
- Controllers must **load resources before** invoking policy checks.
- No schema changes are allowed in this stage.
- No API contract (request/response shape) changes are allowed in this stage.

---

## Phase 1 — Foundation (Policy Module Setup)

Tasks:

- Create the policy module folder structure under `apps/api/src/policy/`:
  - `apps/api/src/policy/`
    - `policy.module.ts`
    - `policy.service.ts`
    - `policy.types.ts`
    - `capabilities/`
    - `rules/`
    - `nest/`
    - `__tests__/`
- Create placeholder files:
  - `policy.module.ts` wired into `app.module` (no logic yet, just module definition).
  - `policy.service.ts` with an empty `evaluate` method signature.
  - `policy.types.ts` with placeholder types for `PolicySubject`, `PolicyResource`, `PolicyContext`, `PolicyDecision`.
- Create `capabilities` directory and capability key definition files:
  - `capabilities/capability-keys.ts` (to hold domain-grouped capability constants).
  - `capabilities/capability-groups.ts` (to group capabilities by domain).
- Create `rules` directory and empty rule files:
  - `rules/ticket.policy-rules.ts`.
  - `rules/subtask.policy-rules.ts`.
  - `rules/comment.policy-rules.ts`.
  - `rules/admin.policy-rules.ts`.
- Create `policy-rule-registry` structure:
  - `rules/policy-rule-registry.ts` with a placeholder mapping from capability keys to rule functions.
- Create Nest integration files in `policy/nest`:
  - `nest/policy.guard.ts` with a guard skeleton that will call the policy service.
  - `nest/policy.decorator.ts` with a decorator skeleton for specifying required capabilities and resource metadata.

---

## Phase 2 — Capability Definitions

Tasks:

- Define capability constants grouped by domain in `capabilities/capability-keys.ts`:
  - **Tickets**: include `ticket.create`, `ticket.view`, `ticket.list_inbox`, `ticket.transition_status`, `ticket.assign_owner`, `ticket.update_core_fields`.
  - **Subtasks**: include `subtask.view`, `subtask.create`, `subtask.update`, `subtask.transition_status`.
  - **Comments**: include `comment.add_public`, `comment.add_internal`, `comment.view_internal`.
  - **Admin**: include `admin.user.locations.update`, `admin.workflows.manage`, `admin.taxonomy.manage`.
- Export capability groups in `capabilities/capability-groups.ts`:
  - Arrays or maps grouping capabilities by domain: tickets, subtasks, comments, admin.
- Ensure a consistent naming convention for capability constants:
  - Clear domain prefixes.
  - Stable, descriptive names aligned with the Stage 24 mini-spec.

---

## Phase 3 — Policy Service Core

Tasks:

- Implement capability dispatch through the rule registry in `policy.service.ts`:
  - `evaluate(subject, capabilityKey, resource, context)`:
    - Looks up the rule function in `policy-rule-registry`.
    - Invokes the rule with the provided arguments and helper functions.
- Implement the `PolicyDecision` return structure in `policy.types.ts`:
  - At minimum: `allowed: boolean`, optional `reason` string.
- Implement structured deny logging inside `policy.service.ts`:
  - On `allowed = false`, log a structured event (user id, role, capability, resource type/id, reason).
  - Ensure logs do not leak sensitive resource details.
- Ensure policy evaluation remains pure:
  - Policy rules and `PolicyService.evaluate` must not perform any database queries or network calls.
  - Any required additional data must be present on `subject`, `resource`, or `context`.

---

## Phase 4 — TicketVisibilityService Integration

Tasks:

- Inject `TicketVisibilityService` into `PolicyService` via NestJS DI:
  - Update `PolicyModule` to import the module that provides `TicketVisibilityService`.
  - Add `TicketVisibilityService` as a dependency of `policy.service.ts`.
- Implement a helper method for ticket visibility in `policy.service.ts` (or a dedicated helper):
  - Accepts `(subject, ticket)` and returns a boolean `isVisible` using `TicketVisibilityService`.
- Ensure all ticket/subtask rules delegate visibility checks:
  - Ticket rules must use the visibility helper rather than re-encoding location/studio logic.
  - Subtask rules must resolve visibility via the parent ticket (through the helper), not by duplicating visibility logic.

---

## Phase 5 — Rule Implementation

Tasks:

- Implement **ticket** policy rules in `rules/ticket.policy-rules.ts`:
  - Implement rule functions for each ticket capability:
    - `ticket.create`.
    - `ticket.view`.
    - `ticket.list_inbox`.
    - `ticket.transition_status`.
    - `ticket.assign_owner`.
    - `ticket.update_core_fields`.
  - Each rule must:
    - Use the injected visibility helper when visibility matters.
    - Enforce studio user read-only workflow behavior.
    - Reference the corresponding capability keys explicitly.

- Implement **subtask** policy rules in `rules/subtask.policy-rules.ts`:
  - Implement rule functions for:
    - `subtask.view`.
    - `subtask.create`.
    - `subtask.update`.
    - `subtask.transition_status`.
  - Each rule must:
    - Use ticket visibility via `TicketVisibilityService` for the parent ticket.
    - Enforce studio user read-only workflow behavior.
    - Reference corresponding capability keys explicitly.

- Implement **comment** policy rules in `rules/comment.policy-rules.ts`:
  - Implement rule functions for:
    - `comment.add_public`.
    - `comment.add_internal`.
    - `comment.view_internal`.
  - Each rule must:
    - Use ticket visibility (via `TicketVisibilityService`) where appropriate.
    - Enforce that studio users cannot create or view internal comments.
    - Reference corresponding capability keys explicitly.

- Implement **admin** policy rules in `rules/admin.policy-rules.ts`:
  - Implement rule functions for:
    - `admin.user.locations.update`.
    - `admin.workflows.manage`.
    - `admin.taxonomy.manage`.
  - Each rule must:
    - Enforce admin-only access for these operations.
    - Reference corresponding capability keys explicitly.

- Update `rules/policy-rule-registry.ts`:
  - Map each capability key to the corresponding rule function.

---

## Phase 6 — Controller Integration

Tasks:

- Integrate policy checks into **ticket controllers**:
  - Identify all ticket-related endpoints (create, list, detail, transitions, updates).
  - For each endpoint:
    - Load the current user from the auth context.
    - Load the ticket(s) using existing services before policy checks.
    - Build any necessary context (e.g. target status).
    - Call `PolicyService.evaluate` with the correct ticket capability key.
    - If denied, return 403 using a consistent error format.

- Integrate policy checks into **comment controllers**:
  - Identify endpoints that create and retrieve comments.
  - For each endpoint:
    - Load the current user.
    - Load the associated ticket (and/or comment) before policy checks.
    - Choose the appropriate comment capability key (`comment.add_public`, `comment.add_internal`, `comment.view_internal`).
    - Call policy evaluate and handle 403 responses.

- Integrate policy checks into **subtask controllers**:
  - Identify endpoints that view and mutate subtasks.
  - For each endpoint:
    - Load the current user.
    - Load the subtask and its parent ticket before policy checks.
    - Choose the appropriate subtask capability key.
    - Call policy evaluate and handle 403 responses.

- Integrate policy checks into **admin controllers**:
  - Identify endpoints for user studio locations, workflow templates, taxonomy.
  - For each endpoint:
    - Load the current user.
    - Load any admin resources required (user, template, taxonomy entities) before policy checks.
    - Choose the appropriate admin capability key.
    - Call policy evaluate and handle 403 responses.

---

## Phase 7 — Testing

Tasks:

- Implement unit tests for policy rules in `apps/api/src/policy/__tests__/`:
  - Add tests per domain file:
    - `ticket.policy-rules.spec.ts`.
    - `subtask.policy-rules.spec.ts`.
    - `comment.policy-rules.spec.ts`.
    - `admin.policy-rules.spec.ts`.
  - Cover positive and negative cases for each capability/role combination.

- Mock `TicketVisibilityService` in unit tests:
  - Provide deterministic visible/non-visible responses per test.
  - Assert that policy rules use the visibility helper (not direct studio checks).

- Implement integration tests for endpoints:
  - Extend or add tests for ticket, comment, subtask, and admin endpoints.
  - For each endpoint and role combination, verify:
    - Allowed cases return 200-range responses.
    - Disallowed cases return 403 responses.
  - Confirm response shapes are unchanged for successful requests.

- Verify no database calls occur inside policy evaluation:
  - Use mocks/spies on repositories or data access services.
  - Ensure they are not invoked from within `PolicyService.evaluate` or rule functions.

---

## Phase 8 — Shadow Mode Rollout

Tasks:

- Add logging-only policy checks:
  - In controllers, call `PolicyService.evaluate` but do not enforce 403 yet.
  - Log policy decisions and existing authorization behavior side-by-side.

- Compare policy decisions vs existing behavior:
  - Identify cases where policy denies but existing code allows, or vice versa.
  - Collect examples for each mismatch (capability, role, resource type).

- Review logs and adjust rules if needed:
  - Refine policy rules to match intended product behavior.
  - Re-run shadow mode until discrepancies are resolved or documented as intentional changes.

---

## Phase 9 — Enforcement

Tasks:

- Enable enforcement for **ticket** and **comment** endpoints:
  - Switch controllers from log-only to strict 403 handling on `allowed = false`.
  - Monitor logs and 403 rates.

- Enable enforcement for **subtask** endpoints:
  - Switch subtask controllers to strict 403 handling.
  - Monitor for regressions in workflow behavior.

- Enable enforcement for **admin** endpoints:
  - Switch admin controllers to strict 403 handling.
  - Confirm only admin users can access admin capabilities.

---

## Phase 10 — Completion

Tasks:

- Verify Definition of Done from the Stage 24 implementation plan:
  - Policy module structure exists and is wired into `app.module`.
  - Capabilities are defined and grouped by domain (including `ticket.create`).
  - Policy evaluation is pure and does not access the database or network.
  - All ticket, subtask, comment, and relevant admin endpoints use the policy layer.
  - All ticket/subtask visibility logic uses `TicketVisibilityService`.

- Confirm no API contract changes:
  - Request/response payloads remain the same for successful calls.
  - Only unauthorized behavior now results in explicit 403 responses.

- Confirm no schema changes:
  - No migrations or Prisma schema modifications were introduced in this stage.

- Confirm full test coverage:
  - Unit tests for policy rules are passing and cover all capabilities.
  - Integration tests for endpoints are passing and reflect the new policy layer.
  - Shadow mode discrepancies were resolved before full enforcement.

