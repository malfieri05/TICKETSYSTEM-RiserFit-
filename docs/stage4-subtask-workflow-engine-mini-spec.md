# Stage 4: Subtask Workflow Engine — Step A Mini-Spec (Planning Only)

**Follows:** [Task Template](task-template.md) Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Engineering Standards](engineering-standards.md). Aligns with “template-driven subtask workflow engine” and “department inbox/feed routing.”

---

## 1. Intent

Introduce a **template-driven, dependency-aware subtask workflow engine** so that:

- **Ticket types/topics** (Stage 2 taxonomy: SUPPORT + department + support topic, or MAINTENANCE + maintenance category) support **admin-managed subtask workflow templates**.
- When a ticket is created, the **matching template** is instantiated as **live subtasks** with **dependency links** preserved.
- **Activation logic** enforces order: subtasks with no unmet dependencies start **READY**; others start **LOCKED**; when a subtask becomes **DONE**, downstream subtasks whose dependencies are all satisfied become **READY** (sequential and parallel workflows supported).
- **Department-level users** see tickets in their actionable queue only when the ticket has at least one **READY** subtask relevant to their department (or assigned to them).
- **Ad hoc subtasks** can be added to a live ticket without changing the admin template.

Stage 1 permissions and Stage 2/3 structures (taxonomy, form schemas, form responses) are unchanged. Notifications and full inbox UI are out of scope for this stage.

---

## 2. Scope

**In scope**

- **Subtask workflow templates (admin-managed):**
  - Keyed by same context as Stage 3 form schemas: **SUPPORT** → (ticketClassId + departmentId + supportTopicId); **MAINTENANCE** → (ticketClassId + maintenanceCategoryId). One workflow template per context (optional per context; no template = no auto-subtasks).
  - Each **subtask template** has: title, description, assigned department (FK to taxonomy departments), optional assigned user, required vs optional, sort order.
  - **Template dependencies:** one subtask template can depend on one or more predecessor templates (support sequential and parallel workflows).
- **Instantiation on ticket create:**
  - When a ticket is created with full taxonomy (ticketClassId + topic/category), resolve the matching workflow template; copy each subtask template into a **live Subtask** (title, description, departmentId, ownerId if set, isRequired, sortOrder). Copy template dependencies into **live subtask dependency** records (subtaskId, dependsOnSubtaskId).
  - Initial status: subtasks with **no dependencies** → **READY**; subtasks with **any dependency** → **LOCKED**.
- **Live subtask statuses (canonical):**
  - **LOCKED**, **READY**, **IN_PROGRESS**, **BLOCKED**, **DONE**, **SKIPPED**. **TODO** is removed from the enum; migration backfills existing TODO rows to READY (or as defined in migration).
- **Dependency satisfaction rule:** A dependency is satisfied when the upstream subtask’s status is **DONE** or **SKIPPED**.
- **Activation logic:**
  - When a live subtask is set to **DONE** (or **SKIPPED**), the system evaluates all subtasks that **depend on it**; for each, if **every** dependency is satisfied (upstream DONE or SKIPPED), set that subtask to **READY**.
  - **Subtask completion and dependency unlocking must run inside a single DB transaction** to avoid race conditions.
  - No automatic transition from READY to IN_PROGRESS (user-driven); BLOCKED is manual or future rule.
- **Department actionable queue:**
  - Backend support so department-level users see tickets where there is **at least one READY subtask** whose assigned department matches the user’s department (or subtask is assigned to that user). Expose via existing ticket list filters or a dedicated “my department actionable” query. No full inbox UI in this stage.
- **Ad hoc subtasks:**
  - Department users can **add** new subtasks to a ticket that are **ticket-specific only** (no link to a template). These do not modify any admin template. Stored as live Subtasks with a nullable “source template” reference (null = ad hoc).
- **Resolution gate:** Existing rule remains: ticket can transition to RESOLVED only when all **required** subtasks are DONE (or SKIPPED). Workflow does not weaken this.

**Out of scope (explicit)**

- Notifications (no new events or delivery for subtask workflow in this stage).
- Full inbox UI (only backend query/filter capability for department actionable queue).
- Changes to Stage 1 RBAC or visibility architecture.
- Any change that weakens Stage 2 taxonomy or Stage 3 form schema/response structures.
- Deleting or reordering template-defined subtasks from a live ticket (only add ad hoc; status transitions and dependency propagation are in scope).

---

## 3. Files to Change

| Area | File(s) | Change |
|------|---------|--------|
| **Prisma schema** | `apps/api/prisma/schema.prisma` | Extend `SubtaskStatus` with LOCKED, READY, SKIPPED. Add optional `departmentId` and source-template link (e.g. `subtaskTemplateId` nullable) to `Subtask`. New models: workflow template (keyed like form schema), subtask templates, subtask template dependencies; live subtask dependencies. Migration(s). |
| **Migrations** | `apps/api/prisma/migrations/` | New migration(s): enum extension, new tables, new columns on `subtasks`, backfill strategy for existing TODO if desired. |
| **Subtask workflow (templates)** | New or existing admin module | Service + (admin) endpoints to CRUD workflow templates, subtask templates, and template dependencies. Resolve workflow template by (ticketClassId, departmentId?, supportTopicId?, maintenanceCategoryId?). |
| **Ticket create** | `apps/api/src/modules/tickets/tickets.service.ts` | After creating ticket (and form responses), if taxonomy is full, resolve workflow template; instantiate subtask templates as live subtasks and create live dependency rows; set initial status (READY vs LOCKED). |
| **Subtask status update** | `apps/api/src/modules/subtasks/subtasks.service.ts` | On transition to DONE (and optionally SKIPPED), evaluate downstream subtasks; if all dependencies satisfied, set status to READY. Keep resolution-gate check. |
| **Department queue** | `apps/api/src/modules/tickets/` or visibility/query layer | New filter or dedicated endpoint: tickets where at least one subtask has status READY and (subtask.departmentId in user’s departments or subtask.ownerId = user). Integrate with existing list/visibility without changing Stage 1 permission model. |
| **Ad hoc subtask create** | `apps/api/src/modules/subtasks/` | Allow creating a subtask with no template link (e.g. no `subtaskTemplateId` or `isFromTemplate: false`). Validation: department users only; ticket exists; no modification of template. |
| **Seed / admin data** | `apps/api/prisma/seed.ts` or admin seed script | Optional: seed one or more workflow templates + subtask templates + dependencies for a few contexts so engine is testable. |
| **Packages/types** | `packages/types` (if shared enums) | Export extended `SubtaskStatus` if used by frontend later. |

**Not changed**

- Stage 1 permission checks, role definitions, or visibility rules (only additive filtering for “has READY subtask for my department”).
- Stage 2 taxonomy tables or ticket classification.
- Stage 3 form schemas, form fields, or ticket_form_responses.
- Notification or inbox UI implementation.

---

## 4. Schema impact

- **Enum:** `SubtaskStatus` — canonical values only: **LOCKED**, **READY**, **IN_PROGRESS**, **BLOCKED**, **DONE**, **SKIPPED**. **TODO** is removed; migration backfills existing TODO rows to READY.
- **Subtask (live):**
  - Add **departmentId** (nullable, FK to taxonomy `departments`) for “assigned department” (queue routing). Existing rows null.
  - Add **subtaskTemplateId** (nullable, FK to subtask_templates) to mark template-origin; null = ad hoc.
  - Index on (ticketId, status) and (departmentId, status) for queue queries.
- **New tables:**
  - **SubtaskWorkflowTemplate** (or equivalent): id, ticketClassId, departmentId?, supportTopicId?, maintenanceCategoryId?, name?, sortOrder, isActive, timestamps. Same uniqueness as `TicketFormSchema`: one per (ticketClassId, supportTopicId) and one per (ticketClassId, maintenanceCategoryId). FKs to ticket_classes, departments, support_topics, maintenance_categories.
  - **SubtaskTemplate:** id, workflowTemplateId, title, description, departmentId (FK), assignedUserId? (nullable), isRequired, sortOrder, timestamps. FK to workflow template.
  - **SubtaskTemplateDependency:** workflow-scoped dependency between templates: e.g. (subtaskTemplateId, dependsOnSubtaskTemplateId), both FKs to SubtaskTemplate, unique on (subtaskTemplateId, dependsOnSubtaskTemplateId), check subtaskTemplateId ≠ dependsOnSubtaskTemplateId.
  - **SubtaskDependency** (live): (subtaskId, dependsOnSubtaskId), both FKs to Subtask, unique pair; index on **dependsOnSubtaskId** for lookups when propagating READY; ensures acyclic at application level when instantiating.
- **DAG validation:** On **SubtaskTemplateDependency** create, enforce DAG (no cycles). Reject insert if adding the edge would create a cycle (e.g. graph traversal / reachability check before insert).
- **Resolution gate:** Continue to use existing `isRequired` on Subtask; count required subtasks not DONE (and not SKIPPED) before allowing RESOLVED. No schema change to that rule.

---

## 5. Risks

- **Cycles in template dependencies:** **DAG validation** on create of `SubtaskTemplateDependency`: before insert, check that adding the edge would not create a cycle (e.g. reachability from new predecessor to new successor). Reject if cycle would occur.
- **Orphaned workflow context:** If a workflow template is deleted or deactivated, existing tickets already have live subtasks; no change. New tickets for that context simply get no template (no auto-subtasks). Template delete should be soft (isActive) or restrict delete when in use.
- **Backward compatibility:** Migration backfills existing subtasks with status TODO to READY. Existing rows may have null departmentId/subtaskTemplateId; resolution gate and list/detail continue to work.
- **Department queue and Stage 1:** “Department users only see tickets with at least one READY subtask for their department” is an **additional** filter on top of existing visibility (e.g. scope by studio/market/role). It must not broaden access: only further restrict or reorder what department users already can see.
- **Concurrent status updates:** Subtask completion (status → DONE or SKIPPED) and dependency unlocking (evaluate downstream, set to READY) **run inside a single DB transaction** so that race conditions are avoided and propagation is atomic.
- **Template versioning:** Not in scope. Changing a template only affects **new** tickets. Existing tickets keep their already-instantiated subtasks. Document for admins.

---

## 6. Test plan

- **Template and dependency CRUD (admin):**
  - Create workflow template for a SUPPORT and a MAINTENANCE context; create subtask templates with department, optional user, required, sort order; add template dependencies (A → B, B → C; parallel A → C, B → C). Assert cycle rejection (A → B, B → A fails).
- **Ticket create instantiation:**
  - Create ticket with full taxonomy that has a workflow template; assert live subtasks created with correct title, description, departmentId, isRequired, sortOrder; assert live dependency rows match template dependencies; assert no-dependency subtasks in READY, others in LOCKED.
  - Create ticket with taxonomy that has no workflow template; assert no subtasks created (or only ad hoc later).
  - Legacy create (no full taxonomy) does not instantiate templates.
- **Activation (DONE/SKIPPED → READY):**
  - Dependency satisfaction: upstream DONE or SKIPPED satisfies the dependency.
  - Ticket with three subtasks A → B → C. Set A to DONE; assert B becomes READY (C stays LOCKED). Set B to DONE; assert C becomes READY.
  - Parallel: A → C, B → C. Set A to DONE; C stays LOCKED. Set B to DONE; assert C becomes READY.
  - SKIPPED: set A to SKIPPED; assert B becomes READY (SKIPPED satisfies dependency).
  - Assert completion + propagation run in a single DB transaction.
- **Resolution gate:**
  - Ticket with required workflow subtasks; transition to RESOLVED only when all required are DONE (or SKIPPED per product rule). Unchanged behavior from current resolution gate.
- **Department actionable queue:**
  - As department user, list tickets filtered by “has READY subtask for my department”; assert only tickets with at least one READY subtask in that department appear; assert no tickets where all relevant subtasks are LOCKED/DONE.
  - Assert Stage 1 visibility still enforced (e.g. cannot see tickets outside scope).
- **Ad hoc subtask:**
  - Add ad hoc subtask to ticket (no template link); assert it is stored with subtaskTemplateId null; assert template for that ticket’s context unchanged; assert ad hoc subtask can transition status and does not break dependency propagation for template-origin subtasks.
- **Permissions / scope:**
  - Department users can create ad hoc subtasks; studio users cannot (existing rule). No new permission bypass.

---

**Summary:** Stage 4 adds admin-managed subtask workflow templates keyed by ticket type/topic, template dependencies, and live subtask dependencies. On ticket create, templates are copied to live subtasks with READY/LOCKED initial status; when a subtask becomes DONE, downstream subtasks with all dependencies satisfied become READY. Department users get a backend-supported “actionable queue” filter (READY subtask for their department). Ad hoc subtasks are ticket-only and do not modify templates. Notifications and full inbox UI are not implemented; Stage 1–3 structures are unchanged.
