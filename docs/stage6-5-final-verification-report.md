# Stage 6.5: Admin Workflow Template Manager — Final Verification Report

**Date:** 2026-03-07  
**Scope:** Admin workflow template CRUD, subtask templates, dependencies, preview, activation, deletion.  
**Status:** Code verification + build/test complete. **Do not merge yet** per request.

---

## 1. Template lifecycle

| Check | Result | Evidence |
|-------|--------|----------|
| **Create SUPPORT (dept + support topic)** | ✅ Verified | New page: ticket class → SUPPORT → department dropdown → support topic dropdown. Submit calls `workflowTemplatesApi.create({ ticketClassId, departmentId, supportTopicId, name? })`. Backend `createWorkflowTemplate` accepts same; unique key `@@unique([ticketClassId, supportTopicId])`. |
| **Create MAINTENANCE (maintenance category)** | ✅ Verified | New page: ticket class → MAINTENANCE → maintenance category dropdown. Submit sends `maintenanceCategoryId`; backend unique `@@unique([ticketClassId, maintenanceCategoryId])`. |
| **List shows correct context and count** | ✅ Verified | List page uses `contextLabel(t)`: ticketClass name, supportTopic or maintenanceCategory name, optional template name. Table shows `t._count?.subtaskTemplates`; list API includes `_count: { subtaskTemplates: true }` and taxonomy relations (ticketClass, department, supportTopic, maintenanceCategory). |

---

## 2. Subtask template behavior

| Check | Result | Evidence |
|-------|--------|----------|
| **Add multiple subtasks (department, required)** | ✅ Verified | Detail page: Add subtask form with title, department (required), description, assigned user, required checkbox, sort order. `createSubtaskTemplate` sends workflowTemplateId, title, description, departmentId, assignedUserId?, isRequired, sortOrder. Backend validates workflow exists and creates row. |
| **Edit title, description, department, assignedUserId, isRequired, sortOrder** | ✅ Verified | Inline edit: Edit opens form with current values; `updateSubtaskTemplate(id, { title, description, departmentId, assignedUserId, isRequired, sortOrder })`. Backend PATCH applies only defined fields. |
| **Delete subtask template** | ✅ Verified | Remove button calls `deleteSubtaskTemplate(s.id)`; backend DELETE cascades (SubtaskTemplateDependency FK onDelete: Cascade). UI invalidates `['workflow-template', id]` so template refetches and list updates. |

---

## 3. Dependency logic

| Check | Result | Evidence |
|-------|--------|----------|
| **Add dependency (A depends on B)** | ✅ Verified | Add dependency: two dropdowns “This subtask” and “Depends on”; submit calls `addDependency({ workflowTemplateId, subtaskTemplateId, dependsOnSubtaskTemplateId })`. Backend creates SubtaskTemplateDependency row. |
| **Self-dependency blocked in UI** | ✅ Verified | `canAddDep = depSubtaskId && depDependsOnId && depSubtaskId !== depDependsOnId`. “Depends on” options are `subtasks.filter((s) => s.id !== depSubtaskId)`. Message shown when both match: “A subtask cannot depend on itself.” |
| **Circular dependency rejected by backend** | ✅ Verified | `addTemplateDependency` throws if `subtaskTemplateId === dependsOnSubtaskTemplateId` (self). Then `wouldCreateCycle(workflowTemplateId, subtaskTemplateId, dependsOnSubtaskTemplateId)`; if true, throws `BadRequestException('Adding this dependency would create a cycle in the workflow template')`. wouldCreateCycle uses reachability from dependsOn to subtaskTemplate; A→B then B→A makes second add return true. Unit tests cover self and cycle. |
| **Dependency list updates after add/remove** | ✅ Verified | addDepMut and removeDepMut onSuccess invalidate `['workflow-template', id]`; template refetches and `templateDependencies` + dependency list re-render. |

---

## 4. Workflow preview accuracy

| Check | Result | Evidence |
|-------|--------|----------|
| **Preview reflects order and dependencies** | ✅ Verified | Preview uses `subtasks` (from template, ordered by sortOrder) and `deps` (templateDependencies). For each subtask: `dependsOn = deps.filter((d) => d.subtaskTemplateId === s.id).map((d) => idToTitle.get(d.dependsOnSubtaskTemplateId))`. Renders “N. Title (depends on: X, Y)”. |
| **Preview updates after edits** | ✅ Verified | Any mutation (update template, create/update/delete subtask, add/remove dependency) invalidates the template query; refetch updates subtasks and templateDependencies, so preview recomputes. |

---

## 5. Template activation behavior

| Check | Result | Evidence |
|-------|--------|----------|
| **Inactive templates do not instantiate** | ✅ Verified | `resolveWorkflowTemplate` uses `where: { ..., isActive: true }` for both SUPPORT and MAINTENANCE lookups. Inactive template is never returned; `instantiateForTicket` gets null and returns without creating subtasks. |
| **Active templates instantiate on matching ticket** | ✅ Verified | Ticket create (tickets.service) calls `instantiateForTicket(tx, ticketId, resolved)` with full taxonomy. resolveWorkflowTemplate loads active template by context; subtask templates and dependencies copied to live Subtask and SubtaskDependency; READY/LOCKED set by dependency. No change in this flow for Stage 6.5. |

---

## 6. Deletion safety

| Check | Result | Evidence |
|-------|--------|----------|
| **Template disappears from list** | ✅ Verified | deleteWorkflowTemplate removes row; list endpoint returns findMany so deleted id no longer appears. Frontend invalidates `['workflow-templates']` and navigates to list. |
| **Creating ticket for that context no longer generates subtasks** | ✅ Verified | resolveWorkflowTemplate findFirst for that context returns null after delete; instantiateForTicket exits early, no subtasks created. |

---

## 7. Regression checks

| Check | Result | Evidence |
|-------|--------|----------|
| **Ticket creation (SUPPORT and MAINTENANCE)** | ✅ Verified | No change to tickets.service create or schema-driven New Ticket UI. Full payload (ticketClassId, departmentId/supportTopicId or maintenanceCategoryId, formResponses) unchanged. |
| **Existing tickets and subtasks unaffected** | ✅ Verified | instantiateForTicket runs only during ticket create (same transaction). Template edits or deletes do not touch existing Ticket or Subtask rows. |
| **Only ADMIN can access workflow endpoints/pages** | ✅ Verified | All 10 workflow controller endpoints have `@Roles('ADMIN')`. Frontend workflow template routes are under `/admin/workflow-templates`; sidebar shows “Workflow Templates” only in admin section (with other admin items). Non-ADMIN callers receive 403 from API. |

---

## 8. Build and test health

| Item | Result |
|------|--------|
| **API build** | ✅ Pass (nest build, exit 0). |
| **API unit tests** | ✅ Pass — 6 suites, 60 tests (including subtask-workflow.service.spec: wouldCreateCycle, addTemplateDependency self/cycle). |
| **Web build** | ✅ Pass — Next.js build; routes include /admin/workflow-templates, /admin/workflow-templates/new, /admin/workflow-templates/[id]. |

**E2E:** No Stage 6.5–specific e2e tests were added. Existing e2e (stage4, stage5) may hit workflow or ticket create; no new e2e run was executed for this report. Adding e2e for workflow template CRUD and dependency cycle rejection is recommended in a follow-up if desired.

---

## 9. Manual verification (recommended before merge)

- Create one SUPPORT and one MAINTENANCE workflow template; confirm they appear in the list with correct context and subtask count.
- Add 2–3 subtasks with different departments and required flags; edit one (title, description, department, etc.); remove one; confirm list and detail match backend.
- Add dependency A→B; confirm preview and dependency list show it. Try adding B→A and confirm backend returns cycle error and UI shows it.
- Set a template to Inactive; create a ticket for that context and confirm no subtasks. Set Active and create again; confirm subtasks appear.
- Delete a workflow template; confirm it leaves the list and new tickets for that context get no subtasks.

---

## 10. Conclusion

- **Code verification:** Template lifecycle (create list view), subtask CRUD, dependency add/remove, self-dependency prevention in UI, cycle rejection in backend, workflow preview, isActive behavior, delete behavior, and regressions are all satisfied by the current implementation.
- **Build/test:** API and web builds pass; API unit tests pass (60 tests). No new e2e coverage was run.

**Stage 6.5 is safe to merge** from a code and verification standpoint, with the following:

1. **Do not merge yet** per your instruction; this report is for final verification only.
2. A quick **manual pass** (create/edit/delete templates, add deps, toggle active, create tickets) is recommended before merge.
3. Consider adding **e2e tests** for workflow template list/create and dependency cycle rejection in a later PR.
