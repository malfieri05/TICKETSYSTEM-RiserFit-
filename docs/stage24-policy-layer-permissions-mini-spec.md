## Stage 24: Policy Layer Permissions — Mini-Spec

### 1. Intent

- Introduce a formal, project-local policy layer that centralizes permissions and capabilities for tickets, subtasks, comments, and admin operations.
- Ensure policy evaluation is pure (no database or network access) and operates only on already-loaded user and resource data.
- Delegate all ticket and subtask visibility checks to `TicketVisibilityService` so studio/location visibility logic exists in a single place.

---

### 2. Scope

**In scope**

- Policy layer for:
  - **Tickets**: create, view, list/inbox, status transitions, ownership and core-field updates.
  - **Subtasks**: view, create, update, status transitions.
  - **Comments**: public and internal comment creation, internal comment visibility.
  - **Admin**: user studio location updates, workflow template management, taxonomy management.
- NestJS integration via a dedicated policy service and guards/decorators used by controllers.
- Explicit encoding of studio user read-only workflow behavior and internal vs public comment visibility rules.
- Alignment of notifications and inbox/read-model consumers with the same policy decisions.

**Out of scope**

- Changes to the existing role model (`STUDIO_USER`, `DEPARTMENT_USER`, `ADMIN`).
- Introduction of a generic external RBAC/ABAC library.
- Schema changes (unless a later stage proves them necessary).
- Major redesign of notifications or read-model architecture.

---

### 3. Problem

- Permission and visibility rules are currently scattered across controllers and services (local role checks plus `TicketVisibilityService` calls).
- Studio user read-only workflow behavior is not enforced through a single, testable policy layer.
- Internal vs public comment visibility is encoded ad-hoc, increasing risk of leaks to studio users.
- Cache invalidation around user studio scope changes is sensitive because there is no single authority that defines visibility.

---

### 4. Goals

- Centralize authorization into a dedicated policy layer that answers “can this subject perform this action on this resource in this context?”.
- Enforce:
  - Studio users are read-only for workflow execution but can add non-internal comments and view progress.
  - Internal comments are hidden from studio users but visible to department users and admins.
  - All ticket and subtask visibility checks go through `TicketVisibilityService`.
- Keep the implementation incremental and non-breaking for existing API contracts.
- Make permissions behavior predictable and easy to test.

---

### 5. Non-Goals

- No new roles or role hierarchy changes.
- No generic policy DSL or external policy engine.
- No schema changes or data migrations in this stage.
- No change to the core ticket state machine or subtask workflow rules.

---

### 6. Current System Touchpoints

- **Auth / User context**
  - JWT-based auth providing user id, role, and allowed markets/studios.
  - Current-user endpoint used by the frontend.

- **Tickets and subtasks**
  - `TicketVisibilityService` for location-based ticket visibility.
  - Tickets module: list/detail, create, updates, status transitions, assignment.
  - Subtasks module: CRUD, status transitions, dependencies.

- **Comments and attachments**
  - Comments module: public vs internal comments, mentions.
  - Attachment access and download permissions.

- **Admin**
  - Admin endpoints for markets, studios, users (including studio scope changes), categories, workflow templates.

- **Notifications and caches**
  - Notification fan-out rules determining recipients.
  - Any studio- or user-scoped caches for ticket lists, inbox counts, feeds.

---

### 7. Core Design

#### 7.1 Policy Evaluation Contract

- **Inputs**
  - `subject`: current user (id, role, pre-loaded allowed studios/markets and other scope attributes).
  - `action`: capability key (string/enum) representing the requested operation.
  - `resource`: already-loaded domain object or descriptor (ticket, subtask, comment, user, studio, etc.).
  - `context`: optional additional data (target status, filters, flags).

- **Output**
  - `allowed: boolean`.
  - Optional `reason` string for logging and diagnostics (not required to be surfaced to clients).

**Purity requirement**

- Policy evaluation must be **PURE**:
  - No database queries.
  - No network calls.
  - Operates only on the provided `subject`, `resource`, and `context`.
  - Any additional data needed for evaluation must be passed in via `context` or pre-populated onto the resource.

---

#### 7.2 Capability Groups

Capabilities are grouped by domain.

- **Tickets**
  - `ticket.create`
  - `ticket.view`
  - `ticket.list_inbox` (taxonomy-based inbox, including location filters)
  - `ticket.transition_status`
  - `ticket.assign_owner`
  - `ticket.update_core_fields` (priority, category, etc.)

- **Subtasks**
  - `subtask.view`
  - `subtask.create`
  - `subtask.update`
  - `subtask.transition_status`

- **Comments**
  - `comment.add_public`
  - `comment.add_internal`
  - `comment.view_internal`

- **Admin**
  - `admin.user.locations.update`
  - `admin.workflows.manage`
  - `admin.taxonomy.manage`

Rules for each capability combine:

- Role (`STUDIO_USER`, `DEPARTMENT_USER`, `ADMIN`).
- Location constraints (ticket/subtask studio within user’s allowed studios).
- Workflow constraints (studio users read-only for ticket transitions and subtask mutations).
- Comment visibility constraints (internal comments hidden from studio users).

---

#### 7.3 Relationship with TicketVisibilityService

- The policy layer must **never duplicate** studio/location visibility logic.
- All ticket and subtask visibility checks must delegate to `TicketVisibilityService`:
  - Capabilities such as `ticket.view`, `ticket.list_inbox`, and `subtask.view` must rely on `TicketVisibilityService` to determine if a resource is visible to the user.
  - Policy rules apply role- and action-level decisions on top of the visibility result from `TicketVisibilityService`.
- Any change to studio or location scoping is implemented once in `TicketVisibilityService` and automatically consumed by all policy decisions that depend on visibility.

---

#### 7.4 NestJS Integration

- Introduce a dedicated policy module exposing:
  - A policy service that evaluates capabilities using pre-loaded `subject`, `resource`, and `context`.
  - Guards/decorators that allow controllers to declare required capabilities and resource bindings.
- Controller pattern:
  - Resolve current user from auth.
  - Load resource(s) via existing services.
  - Invoke the policy service for the relevant capability before executing business logic.
  - Return 403 for denied decisions using a standard error format.

---

### 8. Controller Flow Example

**Example: Ticket detail endpoint**

1. Extract current user from the request (subject).
2. Load the ticket by id using the existing tickets service.
3. Invoke the policy service with:
   - `action = ticket.view`
   - `subject = current user`
   - `resource = loaded ticket`
   - `context = {}` (or any needed extra data)
4. Policy service:
   - Delegates ticket visibility to `TicketVisibilityService` (based on subject scope and ticket studio).
   - Applies role-based rules (e.g. studio user vs department user vs admin).
5. If `allowed = false`, return 403.
6. If `allowed = true`, proceed with existing ticket detail logic and return the response.

The same pattern applies to other endpoints with different capabilities (e.g. `ticket.transition_status`, `comment.add_internal`, `subtask.transition_status`).

---

### 9. Request-Level Examples

#### 9.1 Studio User Viewing a Ticket in Their Studio

- Action: `ticket.view`.
- Subject: studio user with a defined allowed studio list.
- Resource: ticket whose studio is within the allowed list.
- Policy:
  - Uses `TicketVisibilityService` to confirm visibility.
  - Allows view if visibility passes and no other rule denies.

#### 9.2 Studio User Attempting to Transition Ticket Status

- Action: `ticket.transition_status`.
- Subject: studio user.
- Resource: ticket (any studio).
- Policy:
  - Enforces studio user read-only workflow rule.
  - Denies regardless of visibility; returns 403 to the caller.

#### 9.3 Department User Adding Internal Comment

- Action: `comment.add_internal`.
- Subject: department user.
- Resource: ticket (must be visible via `TicketVisibilityService`).
- Policy:
  - Confirms ticket visibility.
  - Allows internal comment creation for department users.
  - Ensures internal comments remain hidden from studio users via `comment.view_internal`.

#### 9.4 Admin Updating User Studio Locations

- Action: `admin.user.locations.update`.
- Subject: admin user.
- Resource: target user record.
- Policy:
  - Allows only if subject is admin.
  - After successful update, admin/user service continues to handle any cache invalidation; policy layer remains pure.

---

### 10. Backend Changes

#### 10.1 New Policy Module

- Add a policy module with:
  - Policy service implementing the evaluation contract.
  - Guards/decorators for controller integration.
- No direct database access from policy evaluation; all required data must be provided by callers.

#### 10.2 Policy Rules

- Implement explicit rules for all capabilities in the four domain groups:
  - Tickets: `ticket.create`, `ticket.view`, `ticket.list_inbox`, `ticket.transition_status`, `ticket.assign_owner`, `ticket.update_core_fields`.
  - Subtasks: `subtask.view`, `subtask.create`, `subtask.update`, `subtask.transition_status`.
  - Comments: `comment.add_public`, `comment.add_internal`, `comment.view_internal`.
  - Admin: `admin.user.locations.update`, `admin.workflows.manage`, `admin.taxonomy.manage`.
- Enforce:
  - Studio users cannot transition ticket status or create/update/transition subtasks.
  - Studio users cannot create or view internal comments.
  - Department users and admins have appropriate modification rights according to existing business rules.
  - All visibility-sensitive decisions consult `TicketVisibilityService`.

#### 10.3 Controller Integration (Incremental)

- Phase 1 (tickets and comments):
  - Ticket create, list/inbox, detail, status transitions, owner/core-field updates.
  - Comment create (public/internal) and internal comment visibility.
- Phase 2 (subtasks and admin):
  - Subtask view/create/update/transition.
  - Admin endpoints for user studio locations, workflow templates, taxonomy management.
- For each endpoint:
  - Keep existing data loading and domain logic.
  - Add policy checks to gate execution and responses.

#### 10.4 Notifications and Workers

- Where notification fan-out or workers need to determine recipients:
  - Use `ticket.view` and `comment.view_internal` capabilities when evaluating potential recipients.
  - Delegate visibility checks to `TicketVisibilityService`.
- Align inbox and notification visibility with the same policy decisions used by the main API.

---

### 11. Frontend Impact

- No required changes to API request/response shapes.
- Optional: expose a capability snapshot via the current-user endpoint:
  - Examples: `canCreateTickets`, `canTransitionTickets`, `canAddInternalComments`, `isAdmin`.
- Use capability snapshot to:
  - Hide/disable workflow controls (e.g. status transitions, subtask operations) for studio users.
  - Hide internal-comment toggles for users who cannot create or view internal comments.

---

### 12. Testing Strategy

- **Unit tests (policy layer)**
  - Table-driven coverage for all capabilities across:
    - Roles: studio, department, admin.
    - Location visibility outcomes (using a mocked `TicketVisibilityService`).
    - Relevant ticket/subtask statuses.
  - Assertions:
    - No database or network access from policy evaluation.
    - Studio users cannot transition tickets, modify subtasks, or access internal comments.
    - Department users and admins have expected capabilities.

- **Integration tests (API)**
  - Tickets:
    - Create, list, detail, transitions for each role; verify 200 vs 403 behavior.
  - Subtasks:
    - View vs mutate subtasks per role and location.
  - Comments:
    - Public vs internal comments (creation and visibility).
  - Admin:
    - User studio location updates and workflow/taxonomy management.

- **Regression tests (studio scope changes)**
  - Update user studio scopes and confirm:
    - Ticket and inbox endpoints reflect updated visibility via `TicketVisibilityService`.
    - No regression in visibility semantics.

- **Logging verification**
  - Denied decisions produce structured logs including user, capability, resource type/id, and reason.

---

### 13. Risks / Edge Cases

- Over-restrictive rules may break existing flows.
  - Mitigation: shadow mode on staging (log-only decisions) before enforcing 403s.
- Performance overhead from frequent policy checks.
  - Mitigation: keep evaluation pure and in-memory; reuse already-loaded resources and `TicketVisibilityService`.
- Tickets moved between studios or users whose studio scopes change.
  - Mitigation: rely exclusively on `TicketVisibilityService` for visibility.
- Historical internal comments created before this stage.
  - Mitigation: apply `comment.view_internal` rules uniformly to all internal comments.

---

### 14. Rollout Plan

1. Finalize capability matrix and policy rules grouped by domain.
2. Implement policy module and unit tests (pure evaluation, no DB).
3. Wire controllers in shadow mode on staging; log discrepancies vs current behavior.
4. Enable enforcement for ticket and comment flows once logs show alignment.
5. Extend enforcement to subtasks and admin endpoints.
6. Optionally expose capability snapshot to frontend and adjust UI affordances.
7. Monitor logs and 403 rates; refine rules as needed.

---

### 15. Acceptance Criteria

- Policy module exists and evaluates capabilities purely, without database or network access.
- All ticket, subtask, comment, and relevant admin endpoints use the policy layer instead of ad-hoc role checks.
- All ticket and subtask visibility logic delegates to `TicketVisibilityService`; no duplicated studio/location visibility logic.
- Capability groups (tickets, subtasks, comments, admin) are implemented, including `ticket.create`.
- Studio users:
  - Cannot transition ticket status.
  - Cannot create/update/transition subtasks.
  - Cannot create or view internal comments.
- Department users and admins can perform expected operations in line with existing business rules.
- Notifications and inbox/read-model consumers use policy checks (and thus `TicketVisibilityService`) to avoid leaking tickets or internal comments outside a user’s allowed studios.
- Policy behavior is covered by unit and integration tests; all existing regression tests remain passing.

