## ARCHITECTURE UPGRADE RECOMMENDATION

### 1. Quick Comparison

- **Formal policy layer (permissions/capabilities)**  
  - **Architectural leverage**: High. Centralizes role, location, and workflow constraints, and becomes the single place that answers “can this user do this on this resource?”. Directly addresses: studio read-only workflow behavior, internal vs public comments, location visibility, and admin-only operations.  
  - **Implementation risk**: Low–medium. Mostly refactor + consolidation on the backend; can be rolled out incrementally endpoint-by-endpoint with guard/decorator wiring. No schema changes required.  
  - **Near-term value**: High. Clarifies “who can do what where,” reducing subtle bugs around studio scope changes, comment visibility, and workflow actions.  
  - **Fit with current codebase**: Very good. NestJS guards/interceptors plus existing `TicketVisibilityService` and role enums make a project-local policy module natural.

- **Read-model / query-layer separation (inbox/feed/counts/progress)**  
  - **Architectural leverage**: High over the long term (performance, simpler queries, specialized inbox/read models).  
  - **Implementation risk**: Medium–high. Requires new projection logic, additional query surfaces, and careful alignment with existing list APIs and SLA logic. Higher risk of subtle consistency issues.  
  - **Near-term value**: Medium. Current endpoints already provide progress summaries and are acceptable at the current scale.  
  - **Fit with current codebase**: Reasonable but more invasive, touching tickets, subtasks, inbox, and reporting.

- **Domain-event pattern for notifications/history/cache invalidation**  
  - **Architectural leverage**: Medium–high. Standardizes how notifications, history, and cache invalidation are triggered.  
  - **Implementation risk**: Medium. Requires careful canonical event design and idempotency; mis-emit can cause duplicate notifications or stale caches, especially around studio scope changes.  
  - **Near-term value**: Medium. Improves correctness of notifications and side effects, but many current issues are rooted in unclear or duplicated authorization rules.  
  - **Fit with current codebase**: Good. There is already an events/notifications backbone; this would be a refinement, not a full re-architecture.

### 2. Recommended Next Upgrade

**Recommended next upgrade: Formal policy layer for permissions/capabilities.**

### 3. Why This One First

- **Clarifies invariants** that future read models and domain events must respect: who is allowed to see or change what, in which locations, with which comment visibility.  
- **Directly tackles existing pain points**: studio users are read-only for workflow execution; internal vs public comment visibility; sensitive cache invalidation when user studio scope changes.  
- **Supports incremental rollout**: can be introduced as a thin layer around existing checks, then gradually made authoritative.  
- **Provides a reusable backend primitive** for controllers, workers, and notification fan-out to consult, reducing drift between modules.

---

## MINI-SPEC — FORMAL POLICY LAYER

### 1. Problem

The current system enforces permissions and visibility via ad-hoc role checks and scattered logic in controllers and services (for example, `TicketVisibilityService` plus local `if (user.role === ...)` branches). This leads to:

- **Inconsistent enforcement** of rules around roles (`STUDIO_USER`, `DEPARTMENT_USER`, `ADMIN`) and locations.  
- **Subtle discrepancies** in:
  - Studio users’ read-only workflow behavior (subtasks, status transitions).  
  - Internal vs public comment visibility.  
  - Admin-only operations such as studio scope management and workflow template editing.  
- **Fragile cache invalidation** around user studio scope changes, because there is no single policy authority for “which studios this user can see or act in.”

### 2. Goals

- **G1 — Centralize authorization**: Introduce a policy layer that answers “can this subject perform this action on this resource in this context?” in a single, reusable place.  
- **G2 — Encode business rules explicitly**:
  - Studio users are read-only for workflow execution but can comment (non-internal) and view progress.  
  - Internal comments are hidden from studio users but visible to department users and admins.  
  - Location-based visibility is enforced uniformly across tickets, subtasks, and comments.  
- **G3 — Minimize disruption**: Integrate the policy layer behind existing endpoints without changing public API contracts.  
- **G4 — Improve testability**: Make permissions a first-class, testable module with table-driven tests and predictable behavior.  
- **G5 — Support future enhancements**: Allow read models and domain-event handlers to reuse the same policies rather than re-encoding rules.

### 3. Non-Goals

- **N1**: Do not introduce a generic, external RBAC/ABAC framework; keep a project-specific policy implementation tuned to this domain.  
- **N2**: Do not change database schema unless a later phase proves it necessary; the first iteration must work with the existing model.  
- **N3**: Do not redesign notifications or read-model architecture; only adjust them to **consult** the policy layer where appropriate.  
- **N4**: Do not change the role model (no new roles or role hierarchy changes) in this upgrade.

### 4. Current System Touchpoints

The policy layer will primarily touch:

- **Auth / User context**  
  - JWT-based auth that exposes user id, role, and allowed markets/studios.  
  - Current-user endpoint that the frontend uses for capability hints.  

- **Ticket visibility and workflow behavior**  
  - `TicketVisibilityService` (location-based visibility).  
  - Tickets module: list/detail, create, mutations for status transitions (via ticket state machine), assignment, and updates.  
  - Subtasks module: CRUD for subtasks, status transitions, and dependency management.  

- **Comments and attachments**  
  - Comments module: internal vs public comments, visibility, and mentions.  
  - Attachment access and any role/location-based restrictions.  

- **Admin and configuration**  
  - Admin endpoints for markets, studios, users (including studio scope changes), categories, and workflow templates.  

- **Notifications and caches**  
  - Notification fan-out rules that decide who should receive events.  
  - Any user- or studio-scoped caches used for ticket lists, inbox counts, or feeds.

### 5. Proposed Design

#### 5.1 Core Concept

Introduce a project-local **policy layer** that exposes a small API for capability checks:

- **Inputs**  
  - `subject`: current user, including id, role, and pre-loaded scope information (allowed studios/markets, etc.).  
  - `action`: a string or enum representing a capability (for example, `ticket.view`, `comment.add_public`).  
  - `resource`: the already-loaded domain object or descriptor (ticket, subtask, comment, user, studio, etc.).  
  - `context`: optional extra parameters (for example, requested new status, filters being applied).

- **Output**  
  - `allowed: boolean`.  
  - Optional `reason` string suitable for logs/diagnostics (not necessarily returned to clients).

**Purity requirement:** Policy evaluation must be **pure**. It must never perform database queries or network calls. Policies operate only on the already-loaded user and resource plus any explicit context passed in.

#### 5.2 Capability Matrix (Organized by Domain Group)

Capabilities are grouped by domain. This initial set focuses on tickets, subtasks, comments, and admin operations.

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

Each capability’s rules combine:

- Role (`STUDIO_USER`, `DEPARTMENT_USER`, `ADMIN`).  
- Location constraints (whether the ticket or subtask belongs to a studio the user is allowed to see).  
- Workflow constraints (for example, studio users are read-only for status transitions and subtask mutations).  
- Comment visibility constraints (internal comments hidden from studio users in all flows).

#### 5.3 NestJS Integration

The policy layer will be implemented as:

- A dedicated policy service that performs capability evaluation given the subject, action, resource, and context.  
- Reusable guards/decorators that controller methods can use to declare their required capabilities and resource bindings.  
- A standard 403 response shape for denied requests, so callers see consistent error behavior when a capability is not granted.

Controllers will:

- Resolve the current user (subject) from the auth layer.  
- Load the resource using existing services (for example, ticket by id, subtask by id).  
- Delegate the authorization decision to the policy service before executing business logic.

#### 5.4 Relationship with TicketVisibilityService

The policy layer must **never duplicate studio visibility logic**. All ticket and subtask visibility checks must delegate to `TicketVisibilityService` for studio and location constraints.

Concretely:

- When evaluating capabilities like `ticket.view`, `ticket.list_inbox`, `subtask.view`, or any capability that depends on whether a user is allowed to see a ticket or subtask, the policy layer:
  - Uses the pre-loaded ticket/subtask and user scope.  
  - Delegates any non-trivial “is this resource visible to this user?” question to `TicketVisibilityService`.  
- The policy layer is responsible for role- and action-level logic; `TicketVisibilityService` remains the single place that knows how studio/location visibility works.

This ensures that:

- Changes to studio scoping rules are made in one place.  
- API handlers, inbox/read-model queries, and notification fan-out all respect the same visibility semantics.

#### 5.5 Logging and Observability

- For denied policy evaluations, the system should log a compact event that includes:
  - User id and role.  
  - Capability.  
  - Resource type and id (or anonymized equivalent).  
  - Reason string from the policy decision.  
- These logs make it easier to diagnose misconfigurations or overly strict rules during rollout.

#### 5.6 Example Controller Flow with Policy Invocation

When handling a controller endpoint, the flow will be:

1. The controller resolves the **current user** from the auth context.  
2. The controller uses existing services to **load the resource** (for example, ticket or subtask) from the database.  
3. Before executing business logic, the controller calls the **policy layer** with:
   - subject = current user.  
   - action = the capability associated with the endpoint (for example, `ticket.view`, `ticket.transition_status`, `comment.add_internal`).  
   - resource = the already-loaded domain object.  
   - context = any additional data needed (for example, target status).  
4. If the policy returns `allowed = false`, the controller returns a 403 response using the standard error format.  
5. If the policy returns `allowed = true`, the controller proceeds with the existing business logic and response.

This pattern ensures policy evaluation remains pure (no queries inside the policy layer) and grounded in the same resource data the controller is about to operate on.

### 6. Request-Level Examples

#### 6.1 Studio User Viewing a Ticket in Their Studio

- **Scenario**: A studio user requests `GET /tickets/:id` for a ticket in one of their allowed studios.  
- **Policy evaluation**:  
  - Action: `ticket.view`.  
  - Subject: studio user with allowed studios.  
  - Resource: loaded ticket, including studio id.  
  - The policy layer delegates visibility to `TicketVisibilityService` to determine whether the ticket is visible in the user’s scope.  
- **Outcome**: If `TicketVisibilityService` confirms the ticket is visible and no other rule denies access, the request is allowed.

#### 6.2 Studio User Attempting to Transition Ticket Status

- **Scenario**: A studio user sends a request to transition a ticket from `IN_PROGRESS` to `RESOLVED`.  
- **Policy evaluation**:  
  - Action: `ticket.transition_status`.  
  - Subject: studio user.  
  - Resource: loaded ticket.  
  - Business rule: studio users are read-only for workflow execution.  
- **Outcome**: Policy denies the action regardless of ticket location; controller returns 403.

#### 6.3 Department User Adding Internal Comment

- **Scenario**: A department user posts an internal comment on a ticket.  
- **Policy evaluation**:  
  - Action: `comment.add_internal`.  
  - Subject: department user.  
  - Resource: loaded ticket (for location visibility).  
  - Policy ensures both location visibility (via `TicketVisibilityService`) and role constraints.  
- **Outcome**: Request is allowed; the created internal comment remains hidden from studio users via `comment.view_internal`.

#### 6.4 Admin Updating a User’s Studio Locations

- **Scenario**: An admin updates a user’s allowed studios through an admin endpoint.  
- **Policy evaluation**:  
  - Action: `admin.user.locations.update`.  
  - Subject: admin user.  
  - Resource: target user record.  
- **Outcome**: Request is allowed only for admins; after a successful update, any location-scoped caches remain the responsibility of the admin/user service, which can now reliably attach invalidation behavior to this single capability.

### 7. Backend Changes

#### 7.1 New Policy Module

- Add a dedicated policy module that exposes:
  - A policy service responsible for evaluating capabilities using pre-loaded subjects and resources.  
  - Guard/decorator utilities for controllers to declare the capabilities they require.  
- Ensure the module has no database access; it must operate purely on data handed to it by callers.

#### 7.2 Policy Rules Implementation

- Define explicit rules for each capability in the four domain groups:
  - **Tickets**: `ticket.create`, `ticket.view`, `ticket.list_inbox`, `ticket.transition_status`, `ticket.assign_owner`, `ticket.update_core_fields`.  
  - **Subtasks**: `subtask.view`, `subtask.create`, `subtask.update`, `subtask.transition_status`.  
  - **Comments**: `comment.add_public`, `comment.add_internal`, `comment.view_internal`.  
  - **Admin**: `admin.user.locations.update`, `admin.workflows.manage`, `admin.taxonomy.manage`.  
- Encode rules that:
  - Use `TicketVisibilityService` for all location/studio visibility questions.  
  - Enforce that studio users are read-only for ticket transitions and subtask mutations.  
  - Restrict internal comment creation and visibility to department users and admins.  
  - Restrict admin capabilities to admin users.

#### 7.3 Controller Integration (Incremental)

Prioritized integration targets:

1. **Tickets module**  
   - Ticket creation (`ticket.create`).  
   - Ticket list/inbox endpoints (`ticket.list_inbox`).  
   - Ticket detail (`ticket.view`).  
   - Ticket status transitions (`ticket.transition_status`).  
   - Ticket ownership changes and field updates (`ticket.assign_owner`, `ticket.update_core_fields`).  

2. **Subtasks module**  
   - View vs create/update/transition subtasks aligning with role and location rules.  

3. **Comments module**  
   - Add public and internal comments.  
   - Enforce internal comment visibility on all read paths.  

4. **Admin module**  
   - User studio location updates.  
   - Workflow template management.  
   - Taxonomy management.

Each endpoint should:

- Continue to use existing services for data loading and business logic.  
- Insert a policy check at the point where a decision is required, before mutating or returning sensitive data.

#### 7.4 Notifications and Workers

- Where notification fan-out or worker processors need to determine who should receive a notification or see a particular event:
  - Use policy capabilities like `ticket.view` or `comment.view_internal` on potential recipients and resources.  
  - Ensure they delegate to `TicketVisibilityService` for location checks.  
- This aligns notifications and inbox behavior with the same underlying policies used by the main API.

### 8. Frontend Impact

- No backend API shapes need to change for this upgrade.  
- Optionally, expose a lightweight **capability snapshot** on the current-user endpoint that derives booleans from the policy layer (for example, `canCreateTickets`, `canTransitionTickets`, `canAddInternalComments`, `isAdmin`).  
- Use the snapshot to:
  - Hide or disable status transition controls for studio users.  
  - Hide internal-comment toggles for users who cannot create or view internal comments.  
  - Avoid presenting UI affordances the backend will immediately reject.

Frontend changes are not required for core correctness because the backend will enforce policy; they are recommended for better UX.

### 9. Testing Strategy

- **Unit tests for the policy layer**  
  - Table-driven tests that cover each capability across combinations of role, location (using example tickets/subtasks and user scopes), and status where applicable.  
  - Explicit tests ensuring:
    - Studio users cannot transition ticket status or mutate subtasks.  
    - Studio users cannot create or view internal comments.  
    - Department users and admins can perform the expected actions.  
    - All visibility decisions delegate to a mocked `TicketVisibilityService` rather than reimplementing logic.  

- **Integration tests for key endpoints**  
  - Cover critical ticket, subtask, comment, and admin endpoints with studio, department, and admin roles.  
  - Confirm that allowed combinations return success and disallowed combinations return 403.  

- **Regression tests around studio scope changes**  
  - Validate that updating a user’s allowed studios does not introduce visibility regressions and that ticket/inbox endpoints continue to honor `TicketVisibilityService`.  

- **Logging verification**  
  - Confirm denied decisions result in structured logs that can be used during rollout.

### 10. Risks / Edge Cases

- **Over-restrictive policies** could break existing flows if rules are mis-specified.  
  - Mitigation: Start in a “shadow” mode on staging where policy decisions are logged but not enforced; compare with existing behavior.  

- **Performance overhead** from frequent policy checks.  
  - Mitigation: Keep the policy layer pure and in-memory, with no database access. Rely on already-loaded user, ticket, and subtask objects plus `TicketVisibilityService`.  

- **Tickets moved across studios** or users whose studio scopes change.  
  - Ensure that all location decisions flow through `TicketVisibilityService` so logic remains centralized.  

- **Historical internal comments** created before this upgrade.  
  - Ensure policy rules for `comment.view_internal` apply uniformly to all internal comments, regardless of creation time.

### 11. Rollout Plan

1. **Design and policy matrix review**  
   - Finalize the capability matrix grouped by domain and review with stakeholders to confirm role expectations.  
2. **Implement policy module and unit tests**  
   - Build the pure policy layer and its test suite without wiring it to controllers initially.  
3. **Shadow integration on staging**  
   - Add policy calls to selected endpoints (tickets and comments) but only log denies; compare with current behavior.  
4. **Enable enforcement for core flows**  
   - Turn on policy-based 403 handling for ticket view/list, ticket transitions, comment creation, and comment visibility once logs indicate alignment.  
5. **Extend coverage to subtasks and admin endpoints**  
   - Integrate the policy layer into subtask and admin flows.  
6. **Frontend UX alignment**  
   - Consume capability hints on the frontend to hide or disable unavailable actions.  
7. **Monitor and iterate**  
   - Monitor 403 rates, logs, and support feedback; adjust policy rules as needed.

### 12. Acceptance Criteria

- **AC1**: A dedicated policy module exists and provides pure capability evaluation for tickets, subtasks, comments, and admin operations, with no database access inside policy evaluation.  
- **AC2**: All ticket, subtask, comment, and selected admin endpoints use the policy layer instead of ad-hoc role checks for authorization decisions.  
- **AC3**: All ticket and subtask visibility decisions are delegated to `TicketVisibilityService`; no studio/location visibility logic is duplicated in the policy implementation.  
- **AC4**: Studio users are read-only for workflow execution: they cannot transition ticket status, create or mutate subtasks, or create/view internal comments.  
- **AC5**: Department users and admins can perform the expected workflow and admin operations consistent with current business rules.  
- **AC6**: Notifications and inbox/read-model consumers that depend on visibility consult the policy layer (and thus `TicketVisibilityService`) so they never leak internal comments or tickets outside a user’s allowed studios.  
- **AC7**: Policy rules are covered by unit tests and integration tests across roles and locations, and all existing regressions remain green.  
- **AC8**: No public API contracts are broken, and no database schema changes are required for this upgrade.  
- **AC9**: Policy-related deny logs are present and usable for diagnosing authorization issues during and after rollout.

