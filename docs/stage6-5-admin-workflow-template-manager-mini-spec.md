# Stage 6.5: Admin Workflow Template Manager — Step A Mini-Spec (Planning Only)

**Status:** ✅ **Complete** — Step B implemented; verification and manual checklist in `stage6-5-final-verification-report.md` and `stage6-5-manual-sanity-checklist.md`.

**Follows:** [Task Template](task-template.md) Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Engineering Standards](engineering-standards.md), [Stage 4 Subtask Workflow Engine](stage4-subtask-workflow-engine-mini-spec.md).

---

## 1. Intent

Provide a **simple admin-only UI** for creating and editing **workflow templates** that drive ticket subtasks (Stage 4). Admins must be able to:

- **Create** a workflow template by selecting a ticket context (SUPPORT → department + support topic, or MAINTENANCE → maintenance category).
- **Add and edit** subtask template rows (title, description, responsible department, optional assigned user, required vs optional, sort order).
- **Define dependency relationships** between subtask templates (sequential and parallel), using a simple dependency selector (no drag-and-drop).
- **View** an existing template with its subtasks and dependencies.
- **Edit** an existing template: update context metadata, add/remove subtask templates, add/remove dependencies.
- **Remove** subtask templates or dependencies, and optionally delete or deactivate a workflow template.

The UI must be **simple, clear, and operationally useful**, reusing the existing Stage 4 backend workflow template APIs where possible. Backend architecture is not redesigned; only small API additions are allowed if truly necessary for usability (e.g. list templates, update/delete single template or subtask template, remove dependency).

---

## 2. Scope

**In scope**

- **Admin UI (frontend):**
  - **Context selection:** Ticket class (SUPPORT / MAINTENANCE). For SUPPORT: department dropdown → support topic dropdown. For MAINTENANCE: maintenance category dropdown. Uses existing taxonomy API (e.g. `GET /api/admin/config/ticket-taxonomy`).
  - **Create template:** Form to set context (as above) and optional name; submit to create workflow template via existing `POST /subtask-workflow/templates`.
  - **List templates:** Page or section listing workflow templates (by context or all). Requires backend to expose a list endpoint (e.g. `GET /subtask-workflow/templates`) if not already present.
  - **View template:** Load one template by id (`GET /subtask-workflow/templates/:id` already returns template with `subtaskTemplates` and `templateDependencies`). Display context, subtask list (title, description, department, assigned user, required, sort order), and dependency list (A depends on B).
  - **Edit template:** Same page or dedicated edit page. Allow: editing workflow template name/sortOrder/isActive if backend supports it; adding subtask templates (`POST /subtask-workflow/subtask-templates`); editing subtask template fields (title, description, departmentId, assignedUserId, isRequired, sortOrder) if backend supports PATCH; removing subtask templates if backend supports DELETE; adding dependencies (`POST /subtask-workflow/template-dependencies`); removing dependencies if backend supports DELETE.
  - **Subtask template rows:** For each subtask template, show or edit: title, description, responsible department (dropdown from taxonomy departments), optional assigned user (dropdown from users with department/admin role), required (checkbox or toggle), sort order (number input). Add/remove rows via create/delete API.
  - **Dependency UI:** Simple selector: for each subtask template (or in a small “Add dependency” form), select “This subtask depends on: [dropdown of other subtask templates in same workflow]”. Support multiple dependencies per subtask (parallel: C depends on A and B). No drag-and-drop; dropdowns or multi-select only. Show existing dependencies and allow removal (delete dependency).
  - **Access:** All workflow template manager routes and API calls are admin-only (existing backend uses `@Roles('ADMIN')`; frontend only exposes these pages under admin nav).

- **Backend (minimal additions only if needed for usability):**
  - **List workflow templates:** If not present, add `GET /subtask-workflow/templates` (optional query: ticketClassId, supportTopicId, maintenanceCategoryId) returning array of workflow templates with minimal fields (id, ticketClassId, departmentId, supportTopicId, maintenanceCategoryId, name, isActive, _count of subtaskTemplates). Admin only.
  - **Update workflow template:** If not present, add `PATCH /subtask-workflow/templates/:id` (name, sortOrder, isActive). Admin only.
  - **Update subtask template:** If not present, add `PATCH /subtask-workflow/subtask-templates/:id` (title, description, departmentId, assignedUserId, isRequired, sortOrder). Admin only. Validate workflowTemplateId ownership.
  - **Delete subtask template:** If not present, add `DELETE /subtask-workflow/subtask-templates/:id`. Cascade deletes template dependencies involving this id. Admin only.
  - **Remove template dependency:** If not present, add `DELETE /subtask-workflow/template-dependencies` with body or query (workflowTemplateId, subtaskTemplateId, dependsOnSubtaskTemplateId) or `DELETE .../template-dependencies/:subtaskTemplateId/:dependsOnSubtaskTemplateId`. Admin only.
  - **Delete workflow template:** If not present, add `DELETE /subtask-workflow/templates/:id` (or soft-delete via PATCH isActive=false). Admin only. Document that existing tickets keep their live subtasks; only new tickets are affected.

**Out of scope**

- Drag-and-drop reordering or dependency authoring.
- Non-admin access to workflow template CRUD.
- Changing Stage 4 instantiation or dependency logic (DAG validation, READY/LOCKED rules).
- Versioning of templates or “apply to existing tickets.”
- Bulk import/export of workflow templates.

---

## 3. Files to Change

| Area | File(s) | Change |
|------|---------|--------|
| **Admin nav** | `apps/web/src/components/layout/Sidebar.tsx` | Add “Workflow Templates” (or “Workflow Manager”) under Admin section, linking to e.g. `/admin/workflow-templates`. |
| **Admin workflow list** | `apps/web/src/app/(app)/admin/workflow-templates/page.tsx` | New page: fetch list of workflow templates; show table or cards (context summary, name, subtask count, link to view/edit). Button “New workflow template” → create flow. |
| **Admin workflow create** | `apps/web/src/app/(app)/admin/workflow-templates/new/page.tsx` (or inline on list) | New page or modal: select ticket class → department + support topic (SUPPORT) or maintenance category (MAINTENANCE); optional name; submit → POST templates → redirect to view/edit. |
| **Admin workflow view/edit** | `apps/web/src/app/(app)/admin/workflow-templates/[id]/page.tsx` | Load template by id (GET templates/:id). Display context, list of subtask templates (title, description, department, assigned user, required, sort order). Section “Dependencies”: list “A depends on B”; add dependency (dropdown: subtask A, dropdown: depends on B); remove dependency. Buttons: Add subtask template, Edit subtask template (inline or modal), Remove subtask, Add dependency, Remove dependency. If backend supports PATCH/DELETE, wire them. |
| **API client** | `apps/web/src/lib/api.ts` | Add `workflowTemplatesApi`: list(), get(id), create(body), update(id, body), delete(id); createSubtaskTemplate(body), updateSubtaskTemplate(id, body), deleteSubtaskTemplate(id); addDependency(body), removeDependency(params). |
| **Types** | `apps/web/src/types/index.ts` (or equivalent) | Add types for workflow template (id, ticketClassId, departmentId?, supportTopicId?, maintenanceCategoryId?, name?, sortOrder, isActive, subtaskTemplates[], templateDependencies[]), subtask template (id, workflowTemplateId, title, description, departmentId, assignedUserId?, isRequired, sortOrder, department?, assignedUser?), template dependency (subtaskTemplateId, dependsOnSubtaskTemplateId). |
| **Backend list** | `apps/api/src/modules/subtask-workflow/subtask-workflow.controller.ts`, `subtask-workflow.service.ts` | If missing: GET /subtask-workflow/templates (optional filters), return list with minimal fields + _count. |
| **Backend update/delete** | Same controller + service | If missing: PATCH templates/:id, DELETE templates/:id; PATCH subtask-templates/:id, DELETE subtask-templates/:id; DELETE template-dependencies (by composite key). Implement in service with same DAG/ownership checks as existing code. |

**Not changed**

- Stage 4 schema (SubtaskWorkflowTemplate, SubtaskTemplate, SubtaskTemplateDependency).
- Ticket create or instantiation logic.
- RBAC beyond ensuring workflow template endpoints remain ADMIN-only.

---

## 4. Schema impact

**None.** All entities (SubtaskWorkflowTemplate, SubtaskTemplate, SubtaskTemplateDependency) and their columns already exist from Stage 4. This stage adds only admin UI and, if needed, new HTTP endpoints that operate on the same tables. No migrations required.

---

## 5. Risks

- **Backend API gaps:** Existing API has create workflow, get one, create subtask template, add dependency. If list/update/delete are missing, the UI cannot offer full “view/edit/delete” without those endpoints. Mitigation: implement minimal list and update/delete endpoints as specified in Scope; keep them admin-only and consistent with existing DAG and ownership rules.
- **Dependency UX confusion:** Users may add circular dependencies; backend already rejects cycles. UI should surface backend error (“Adding this dependency would create a cycle”) and optionally disable or warn when selecting a dependency that would create a cycle (e.g. call a check endpoint or derive from current graph).
- **Deleting a subtask template** that has dependencies: backend must cascade or forbid. Current schema uses onDelete: Cascade on SubtaskTemplateDependency, so deleting a subtask template removes its dependency edges. Deleting a template that is referenced by live subtasks (subtaskTemplateId on Subtask): schema has onDelete: SetNull, so live subtasks are not deleted but lose template link. Document for admins.
- **Concurrent edit:** No optimistic locking. Last write wins. Acceptable for admin-only, low-concurrency workflow config.
- **Taxonomy consistency:** Context (department, support topic, maintenance category) must match taxonomy IDs from Stage 2. UI uses taxonomy API for dropdowns; backend already validates FKs. No new risk.

---

## 6. Test plan

- **Permissions:** All workflow template and subtask template endpoints are ADMIN-only. As non-ADMIN user, list/create/update/delete return 403. As ADMIN, operations succeed.
- **List templates:** GET list returns workflow templates; optional filter by ticketClassId or context reduces list. Response shape matches frontend expectations (id, context fields, name, subtask count or similar).
- **Create workflow template:** Submit valid context (SUPPORT + departmentId + supportTopicId, or MAINTENANCE + maintenanceCategoryId). Assert 201 and template exists. Submit invalid context (e.g. SUPPORT without supportTopicId); assert 400 or 409.
- **Get template:** GET by id returns template with subtaskTemplates and templateDependencies. 404 for unknown id.
- **Create subtask template:** POST with workflowTemplateId, title, departmentId, optional assignedUserId, isRequired, sortOrder. Assert 201 and row exists under workflow. Validate departmentId and assignedUserId are valid FKs.
- **Update subtask template:** PATCH subtask-templates/:id with new title, description, departmentId, etc. Assert 200 and persisted. Validate ownership (subtask template belongs to workflow).
- **Delete subtask template:** DELETE subtask-templates/:id. Assert 204 or 200; template and its dependency edges (where it is head or tail) removed or updated per schema.
- **Add dependency:** POST template-dependencies with (workflowTemplateId, subtaskTemplateId, dependsOnSubtaskTemplateId). Assert 201. POST same again or self-dependency; assert 400. POST dependency that creates cycle; assert 400 with message about cycle.
- **Remove dependency:** DELETE template-dependency by composite key. Assert 204 or 200; dependency row removed.
- **Update workflow template:** PATCH templates/:id (name, isActive). Assert 200 and persisted.
- **Delete workflow template:** DELETE templates/:id (or PATCH isActive=false). Assert success; GET by id returns 404 or isActive false. Existing tickets with instantiated subtasks unchanged.
- **UI (manual or E2E):** Admin can open Workflow Templates, create a template with context, add several subtask templates, add dependencies (sequential A→B→C and parallel A→C, B→C), save, reload and edit (change title, add/remove dependency), delete a subtask template, and delete or deactivate the workflow template. No drag-and-drop required; dependency selector and add/remove buttons suffice.

---

**Summary:** Stage 6.5 adds an admin-only UI to create, list, view, edit, and delete workflow templates and their subtask templates and dependencies, reusing Stage 4 backend APIs and adding only minimal list/update/delete endpoints if missing. Context selection supports SUPPORT (department + support topic) and MAINTENANCE (maintenance category). Dependency UI is simple selectors (no drag-and-drop). Schema unchanged.
