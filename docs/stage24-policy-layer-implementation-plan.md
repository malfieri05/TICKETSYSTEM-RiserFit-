## Stage 24: Policy Layer — Implementation Plan

### 1. Implementation Overview

- Introduce a dedicated policy module under `apps/api/src/` that:
  - Provides a pure, in-memory policy evaluation service for capabilities grouped by domain (tickets, subtasks, comments, admin).
  - Exposes NestJS-friendly guards/decorators for controller integration.
  - Delegates all ticket and subtask visibility checks to `TicketVisibilityService`.
- Controllers will:
  - Load the current user from the existing auth layer.
  - Load the relevant resource(s) from existing services **before** invoking the policy service.
  - Call the policy service with `(subject, capability, resource, context)` and enforce 403 responses on `allowed = false`.
- No database schema changes and no API contract changes are allowed in this stage.
  - All changes are internal to the backend code structure and behavior.

---

### 2. File / Module Structure

Target root: `apps/api/src/`

**New folder structure**

- `apps/api/src/policy/`
  - `policy.module.ts`
  - `policy.service.ts`
  - `policy.types.ts` (shared types/interfaces: `PolicySubject`, `PolicyResource`, `PolicyContext`, `PolicyDecision`)
  - `capabilities/`
    - `capability-keys.ts` (string literal definitions / enums grouped by domain)
    - `capability-groups.ts` (grouping helpers for tickets, subtasks, comments, admin)
  - `rules/`
    - `ticket.policy-rules.ts`
    - `subtask.policy-rules.ts`
    - `comment.policy-rules.ts`
    - `admin.policy-rules.ts`
    - `policy-rule-registry.ts` (maps capability keys to rule functions)
  - `nest/`
    - `policy.guard.ts` (NestJS guard wrapping the policy service)
    - `policy.decorator.ts` (custom decorator for declaring capabilities + resource binding metadata)
  - `__tests__/`
    - `policy.service.spec.ts`
    - `ticket.policy-rules.spec.ts`
    - `subtask.policy-rules.spec.ts`
    - `comment.policy-rules.spec.ts`
    - `admin.policy-rules.spec.ts`

**Module registration**

- `apps/api/src/app.module.ts`
  - Import `PolicyModule`.
  - Ensure it can inject `TicketVisibilityService` from its existing module.

---

### 3. Capability Definition Strategy

- Define capabilities as **string literal constants** grouped by domain, exported from `capabilities/capability-keys.ts`.
  - Example domains (no code here, conceptual only):
    - Tickets: `TICKET_CREATE`, `TICKET_VIEW`, `TICKET_LIST_INBOX`, `TICKET_TRANSITION_STATUS`, `TICKET_ASSIGN_OWNER`, `TICKET_UPDATE_CORE_FIELDS`.
    - Subtasks: `SUBTASK_VIEW`, `SUBTASK_CREATE`, `SUBTASK_UPDATE`, `SUBTASK_TRANSITION_STATUS`.
    - Comments: `COMMENT_ADD_PUBLIC`, `COMMENT_ADD_INTERNAL`, `COMMENT_VIEW_INTERNAL`.
    - Admin: `ADMIN_USER_LOCATIONS_UPDATE`, `ADMIN_WORKFLOWS_MANAGE`, `ADMIN_TAXONOMY_MANAGE`.
- `capability-groups.ts` will:
  - Provide grouped exports (arrays) by domain for readability and potential iteration (e.g. for tests).
  - Serve as a single reference point when adding or reviewing capabilities.
- Capability keys must be **stable and descriptive**:
  - Use uppercase with domain prefixes to avoid collisions.
  - Keep a one-to-one mapping between capabilities and policy rule functions.

---

### 4. Policy Rule Organization

- Implement policy rules as **pure functions** in the `rules/` directory:
  - Each rule function:
    - Accepts `(subject, resource, context, helpers)` and returns a `PolicyDecision`.
    - Uses only the provided arguments and pure helper methods; no database or network access.
  - `helpers` includes:
    - A visibility helper that wraps `TicketVisibilityService` calls (see Section 6).
- File-level organization:
  - `ticket.policy-rules.ts`: all rules for ticket capabilities.
  - `subtask.policy-rules.ts`: all rules for subtask capabilities.
  - `comment.policy-rules.ts`: all rules for comment capabilities.
  - `admin.policy-rules.ts`: all rules for admin capabilities.
- `policy-rule-registry.ts`:
  - Exposes a mapping from capability key → rule function.
  - Used by `PolicyService` to dispatch evaluation to the correct rule.
- Readability and maintainability:
  - Keep each rule small and deterministic.
  - Co-locate rule-specific constants and helper logic in the same file.
  - Add brief comments for non-obvious business rules (e.g. “studio users are read-only for workflow execution”).

---

### 5. Controller Integration Pattern

Controllers should follow a consistent pattern:

1. Resolve the **current user** (`subject`) from the existing auth context (e.g. request-scoped user object).
2. Load the **resource** using existing services **before** invoking the policy layer:
   - Ticket endpoints: tickets service loads the ticket.
   - Subtask endpoints: subtasks service loads the subtask (and ticket if needed).
   - Comment endpoints: tickets or comments service loads the ticket or associated resource.
3. Build an optional **context** object with any inputs required by the rule (e.g. requested new status, filters, flags).
4. Call `PolicyService` with `(subject, capabilityKey, resource, context)`.
5. If `allowed = false`, short-circuit and:
   - Return a 403 response with a consistent error body (e.g. error code + message).
   - Optionally include a generic “forbidden” message, not the raw `reason` string.
6. If `allowed = true`, proceed with the existing business logic and response construction.

**Example: Ticket View Flow (conceptual)**

- Endpoint: ticket detail.
- Steps:
  - Load current user from auth.
  - Load ticket by id from tickets service.
  - Invoke policy with:
    - `capabilityKey = TICKET_VIEW`.
    - `subject = current user`.
    - `resource = loaded ticket`.
    - `context = {}`.
  - If denied: respond 403.
  - If allowed: return ticket detail as currently implemented.

**Example: Comment Creation Flow (conceptual)**

- Endpoint: create comment on ticket.
- Steps:
  - Load current user from auth.
  - Load ticket by id from tickets service (resource for visibility and role checks).
  - Determine intended comment type from payload (public vs internal).
  - Select capability:
    - Public: `COMMENT_ADD_PUBLIC`.
    - Internal: `COMMENT_ADD_INTERNAL`.
  - Invoke policy with:
    - `capabilityKey = selected comment capability`.
    - `subject = current user`.
    - `resource = loaded ticket`.
    - `context = { isInternal: true/false }`.
  - If denied: respond 403.
  - If allowed: proceed to create comment and return response.

---

### 6. TicketVisibilityService Integration

- `PolicyService` must not implement location/studio visibility logic directly.
- Integration strategy:
  - `PolicyModule` imports the module that provides `TicketVisibilityService`.
  - `PolicyService` receives `TicketVisibilityService` via dependency injection.
  - A visibility helper exposes:
    - A method that accepts `(subject, ticket)` and returns a boolean “isVisible” via `TicketVisibilityService`.
  - Ticket and subtask policy rules invoke this helper:
    - Ticket-related capabilities (`TICKET_VIEW`, `TICKET_LIST_INBOX`, etc.) use the helper before evaluating role-level rules.
    - Subtask-related capabilities (`SUBTASK_VIEW`, etc.) use the helper on the parent ticket or required ticket context.
- All ticket and subtask visibility decisions pass through this helper so that:
  - Any change to studio scoping is made solely in `TicketVisibilityService`.
  - Policy rules never re-encode studio or location checks.

---

### 7. Incremental Adoption Plan

Migration order:

1. **Tickets**
   - Integrate policy checks into:
     - Ticket create (`TICKET_CREATE`).
     - Ticket list/inbox (`TICKET_LIST_INBOX`).
     - Ticket detail (`TICKET_VIEW`).
     - Ticket status transitions (`TICKET_TRANSITION_STATUS`).
     - Ticket owner/core-field updates (`TICKET_ASSIGN_OWNER`, `TICKET_UPDATE_CORE_FIELDS`).
2. **Comments**
   - Integrate policy checks into:
     - Comment creation (`COMMENT_ADD_PUBLIC`, `COMMENT_ADD_INTERNAL`).
     - Comment reads where internal comments must be filtered (`COMMENT_VIEW_INTERNAL`).
3. **Subtasks**
   - Integrate policy checks into:
     - Subtask view (`SUBTASK_VIEW`).
     - Subtask create (`SUBTASK_CREATE`).
     - Subtask update (`SUBTASK_UPDATE`).
     - Subtask status transitions (`SUBTASK_TRANSITION_STATUS`).
4. **Admin**
   - Integrate policy checks into:
     - User studio location updates (`ADMIN_USER_LOCATIONS_UPDATE`).
     - Workflow template management (`ADMIN_WORKFLOWS_MANAGE`).
     - Taxonomy management (`ADMIN_TAXONOMY_MANAGE`).

For each phase:

- Replace existing inline role checks with calls to `PolicyService`.
- Keep all existing business logic and response behavior unchanged.

---

### 8. Testing Plan

**Unit tests (policy layer)**

- Location: `apps/api/src/policy/__tests__/`.
- Scope:
  - `policy.service.spec.ts`:
    - Ensures dispatch from capability key to rule function.
    - Verifies that policy evaluation is pure (no DB calls; can be enforced by using mocks and verifying no repository methods are invoked).
  - `*.policy-rules.spec.ts` per domain:
    - Table-driven tests for each capability/role combination.
    - Test visibility outcomes by mocking `TicketVisibilityService` responses.
    - Confirm studio users are denied for workflow execution and internal comment access.

**Mocking `TicketVisibilityService`**

- Provide a Jest mock in unit tests:
  - For ticket/subtask rules:
    - Control visibility outcomes (visible vs not visible).
    - Assert that policy rules call visibility helper rather than duplicating logic.

**Integration tests (API)**

- Extend existing endpoint tests or add new ones to cover:
  - Tickets:
    - Create, list, detail, status transitions across roles.
  - Comments:
    - Public and internal comment creation and retrieval across roles.
  - Subtasks:
    - View and mutate subtasks across roles and studios.
  - Admin:
    - User studio location updates and relevant admin operations.
- Assertions:
  - Successful operations for allowed combinations (200-range responses).
  - 403 responses for disallowed combinations.
  - No change to response shapes for successful requests.

---

### 9. Rollout Strategy

**Shadow mode vs enforcement**

- Phase A: Shadow mode (staging, then optionally production):
  - Controllers call `PolicyService` but do not enforce denies.
  - Log decisions where:
    - Policy would deny but current behavior allows.
    - Policy would allow but current behavior denies (should be rare).
  - Use structured logs (user id, role, capability, resource id/type, decision, reason).
- Phase B: Gradual enforcement:
  - Enable enforcement for tickets and comments first.
  - Monitor 403 rates and logs.
  - Resolve any mis-specified rules.
- Phase C: Full enforcement:
  - Enable enforcement for subtasks and admin endpoints.
  - Keep logging for denied decisions to support debugging.

At all stages:

- Do not change API contracts; only behavior on unauthorized operations changes (from implicit or inconsistent handling to explicit 403).

---

### 10. Definition of Done

- Policy module is present under `apps/api/src/policy/` with:
  - `policy.module`, `policy.service`, `capabilities/*`, `rules/*`, `nest/*`, and test files.
- Capabilities are defined and grouped by domain (tickets, subtasks, comments, admin), including `ticket.create`.
- Policy evaluation is pure:
  - No DB queries or network calls from policy rules or `PolicyService`.
  - All needed data is provided by controllers via `subject`, `resource`, and `context`.
- Controllers in tickets, comments, subtasks, and admin modules:
  - Load resources before invoking policy checks.
  - Use the new policy layer for authorization instead of ad-hoc role checks.
  - Return 403 for denied decisions with a consistent error response.
- All ticket and subtask visibility logic is delegated to `TicketVisibilityService`:
  - No duplicated studio/location checks in policy rules.
- No database schema changes and no public API contract changes were introduced.
- Unit tests cover policy rules and capability behavior across roles and visibility outcomes.
- Integration tests verify endpoint behavior (200 vs 403) for key flows.
- Shadow mode was executed on staging and any discovered discrepancies were resolved before full enforcement.

