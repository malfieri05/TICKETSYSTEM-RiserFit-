# Stage 8: Workflow Editor UX Improvements — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Stage 4 Subtask Workflow Engine](stage4-subtask-workflow-engine-mini-spec.md), [Stage 6.5 Admin Workflow Template Manager](stage6-5-admin-workflow-template-manager-mini-spec.md), [Stage 7A Workflow Execution Visibility](stage7a-workflow-execution-visibility-mini-spec.md).

---

## 1. Intent

Improve the **usability, safety, and clarity** of the workflow template editor in the admin UI. Admins can already create and edit workflow templates, subtask templates, and dependencies; the goal is to make that experience easier and less error-prone **without changing the workflow engine**.

Concretely:

- **Easier ordering:** Reorder subtasks via drag-and-drop or move up/down instead of only editing a numeric sort order.
- **Clear dependencies:** Show a visual representation of the dependency DAG so admins understand structure at a glance.
- **Proactive safety:** Prevent circular dependencies in the UI before the backend rejects them, and warn before destructive edits (e.g. deleting a subtask or dependency).
- **Confidence before save:** Let admins preview how the workflow would execute (order + dependencies) before committing changes.

All changes are **editor UX only** — same data model, same APIs for persistence, same engine behavior at runtime.

---

## 2. Scope

**In scope**

- **A. Subtask ordering UX**  
  Allow admins to reorder subtask templates more easily. Options: (1) Drag-and-drop reorder in the subtask list; (2) Move up / move down buttons per row. Reordering must update `subtaskTemplate.sortOrder` in a consistent way (e.g. gap-based or compact renumbering). No change to the meaning of sortOrder (display/execution order of template steps).

- **B. Dependency visualization**  
  In the workflow template detail editor, show a clear visual representation of dependencies between subtask templates (the DAG). Examples: node-link diagram (nodes = subtasks, edges = “depends on”), or an enhanced list/grid that shows “depends on” and “required by” relationships. Purpose: help admins understand and validate the workflow structure without inferring from a flat dependency list.

- **C. Dependency safety (no cycles in UI)**  
  Prevent admins from creating circular dependencies in the UI before the backend rejects them. Options: (1) Expose a “would create cycle?” check (e.g. optional GET or POST preview) and disable or warn when the chosen “Add dependency” combination would create a cycle; (2) Client-side DAG representation + cycle detection using existing template and dependency data, so the UI can grey out or hide invalid “depends on” choices. Backend already enforces DAG on `addTemplateDependency`; this is about avoiding failed submissions and unclear errors.

- **D. Safer editing**  
  When the admin deletes a subtask template or removes a dependency, show clear warnings about downstream effects. Examples: “Removing this subtask will remove N dependencies. X tickets currently use this template.” / “Removing this dependency will change when [subtask] can start.” Confirmations or inline copy only; no change to backend delete semantics.

- **E. Workflow preview**  
  Allow admins to preview how the workflow would execute (subtasks in order, dependency relationships visible) before saving. This can be an enhanced “Workflow preview” section that: (1) Reflects current in-memory/UI state when reordering or editing (e.g. optimistic preview); and/or (2) Shows a “preview mode” that displays the same structure that would be used at runtime (sortOrder + dependencies). No new engine behavior; preview is read-only and for clarity only.

**Out of scope**

- Changes to the workflow engine, instantiation logic, READY/LOCKED rules, or notification behavior.
- New workflow execution features.
- Schema changes unless strictly required (e.g. no new tables or columns for UX alone).
- External UI libraries unless justified (e.g. a lightweight DAG or drag-and-drop library may be acceptable if native implementation is impractical).

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **Subtask-workflow module (optional for C):**  
  If dependency safety is implemented via a “preview” endpoint: add an optional endpoint such as `GET /api/subtask-workflow/templates/:id/check-dependency?subtaskTemplateId=...&dependsOnSubtaskTemplateId=...` returning `{ wouldCreateCycle: boolean }`, or equivalent. Reuse existing `wouldCreateCycle` in `subtask-workflow.service.ts`. Controller: `subtask-workflow.controller.ts`. If cycle check is done entirely on the client using template + dependencies data, no backend change for C.
- **Subtask-workflow module (A — reorder):**  
  Existing `PATCH /api/subtask-workflow/subtask-templates/:id` already accepts `sortOrder`. Optionally add a dedicated “reorder” endpoint (e.g. `POST /api/subtask-workflow/templates/:id/subtask-templates/reorder` with body `{ subtaskTemplateIds: string[] }`) that updates sortOrder in one shot to avoid multiple PATCHes and race conditions. Files: `subtask-workflow.service.ts`, `subtask-workflow.controller.ts`, optional DTO. If reorder is implemented as multiple PATCH calls from the UI, no new endpoint required.

**Frontend (Next.js, React Query)**

- **Workflow template detail page:**  
  `apps/web/src/app/(app)/admin/workflow-templates/[id]/page.tsx` — primary touchpoint. Changes: (A) Add drag-and-drop or move up/down for subtask list and wire to sortOrder updates; (B) Add dependency visualization (DAG or enhanced list); (C) Before adding a dependency, call cycle-check (if backend exposed) or compute cycle from current template + deps and disable/warn for invalid choices; (D) Before delete subtask or remove dependency, show confirmation modal or inline warning with downstream impact copy; (E) Enhance “Workflow preview” to reflect current order and dependencies (and optionally unsaved state).
- **Components (optional):**  
  If DAG visualization or drag-and-drop is factored out: new components under `apps/web/src/components/` (e.g. `WorkflowDagGraph.tsx`, `SortableSubtaskList.tsx`). Prefer small, focused components; avoid large new dependencies unless justified.
- **API client and types:**  
  `apps/web/src/lib/api.ts` — add calls for any new endpoints (reorder, check-dependency). `apps/web/src/types/index.ts` — extend only if new response shapes are introduced.

**Docs**

- Update `CLAUDE.md` or stage docs to mention Stage 8 and the workflow editor UX improvements once implemented.

Exact file list will be finalized in Step B.

---

## 4. Schema Impact

**No new tables or columns required.**

- **Subtask ordering (A):** Uses existing `SubtaskTemplate.sortOrder`. Reorder UX only changes how that value is set (e.g. via one bulk update or multiple PATCHes). No migration.
- **Dependency visualization (B), safety (C), warnings (D), preview (E):** All use existing `SubtaskWorkflowTemplate`, `SubtaskTemplate`, `SubtaskTemplateDependency`. No schema change.

If a future iteration introduces persisted “draft” or “preview” state, that would be a separate change; not in scope for Stage 8.

---

## 5. API Impact

- **Existing endpoints unchanged in contract:**  
  `GET /api/subtask-workflow/templates/:id` (template + subtask templates + dependencies), `PATCH /api/subtask-workflow/subtask-templates/:id` (includes `sortOrder`), `POST /api/subtask-workflow/template-dependencies` (add), `DELETE /api/subtask-workflow/template-dependencies` (remove), `DELETE /api/subtask-workflow/subtask-templates/:id` (delete subtask template). Behavior and response shapes remain as today.

- **Optional new endpoints:**  
  - **Reorder (A):** If implemented server-side in one shot: e.g. `POST /api/subtask-workflow/templates/:id/subtask-templates/reorder` with body `{ subtaskTemplateIds: string[] }`. Service updates each subtask template’s `sortOrder` by array index (0, 1, 2, …). Idempotent; admin-only.  
  - **Cycle check (C):** If implemented server-side: e.g. `GET /api/subtask-workflow/templates/:id/check-dependency?subtaskTemplateId=...&dependsOnSubtaskTemplateId=...` returning `{ wouldCreateCycle: boolean }`. Read-only; admin-only. No persistence.

- **Auth:** All existing and any new endpoints remain admin-only (`@Roles('ADMIN')` or equivalent). No change to non-admin APIs.

---

## 6. UI Impact

- **Workflow template detail page (`/admin/workflow-templates/[id]`):**  
  - **Subtask list (A):** Subtask templates list supports reorder via drag-and-drop and/or “Move up” / “Move down” buttons. After reorder, persist via existing PATCH or new reorder endpoint. Loading and error states; no duplicate orders.  
  - **Dependencies (B):** A dedicated “Dependency graph” or “DAG” section (or enhancement of the current Dependencies section) shows nodes (subtask templates) and directed edges (A depends on B). Layout: simple node-link or compact list/grid with clear “depends on” / “required by” labels. No editing from the graph required; editing stays in existing dependency add/remove controls.  
  - **Add dependency (C):** When selecting “This subtask” and “Depends on”, either: (1) Call cycle-check API and disable “Add dependency” or show warning if `wouldCreateCycle`; or (2) Compute cycle client-side from current template + dependencies and grey out or hide options that would create a cycle. Self-dependency (same subtask) remains disabled.  
  - **Delete subtask / remove dependency (D):** Before confirming: show a short warning (e.g. modal or inline). Examples: “Removing this subtask will also remove N dependencies. X tickets currently use this template.” / “This dependency will be removed. [Subtask A] will no longer wait for [Subtask B].” Use existing usage stats (e.g. ticketsUsingTemplate from Stage 7A) where available.  
  - **Workflow preview (E):** The existing “Workflow preview” block is enhanced to show subtasks in `sortOrder` with dependency relationships clearly indicated. If the UI supports unsaved reorder/edit state, preview can optionally reflect that state (e.g. “Preview (unsaved)” vs “Preview (saved)”).

- **No new routes.** No change to workflow template list or create flow beyond any shared component reuse.

- **Libraries:** Prefer CSS and existing Tailwind for layout. Drag-and-drop: consider native HTML5 drag-and-drop first; if insufficient, a small library (e.g. minimal sortable list) may be introduced with justification. DAG drawing: consider CSS/SVG with existing stack first; if a lightweight graph library is needed for layout, document the choice in Step B.

---

## 7. Risks

- **Drag-and-drop complexity:** Custom DnD can be brittle (accessibility, touch). Mitigation: provide move up/down as a fallback; keep DnD scope limited to one list; test keyboard and screen reader if DnD is added.
- **DAG visualization scope creep:** Full graph layout (e.g. automatic node positioning) can become large. Mitigation: start with a simple representation (e.g. list with indentation or a small node-link with fixed or manual layout); avoid heavy graph libraries unless needed.
- **Cycle check consistency:** If cycle check is done on the client, the algorithm must match the backend (reachability from “depends on” node to “subtask” node). Mitigation: document the rule; optional backend check endpoint keeps one source of truth.
- **Reorder race conditions:** If two tabs or users reorder simultaneously, last-write-wins. Mitigation: single reorder endpoint with full ordered list reduces intermediate inconsistent state; optional optimistic UI with invalidation on conflict.
- **Downstream warning accuracy:** “Tickets using this template” is already available (Stage 7A). “Dependencies that will be removed” is derivable. More nuanced impact (e.g. “N active workflows will be affected”) is optional and can be phased.

---

## 8. Test Plan

- **Unit (backend, if new endpoints):**  
  - Reorder: given a template and ordered list of subtask template IDs, assert sortOrder values after reorder.  
  - Cycle check: given template and dependencies, assert `wouldCreateCycle` true/false for several pairs (no cycle, would create cycle, self).

- **Integration / API:**  
  - Reorder endpoint (if added): 200 with correct sortOrder persisted; 403 for non-admin; 400 for invalid template IDs or wrong template.  
  - Cycle-check endpoint (if added): 200 and correct `wouldCreateCycle` for valid query params; 403 for non-admin.

- **Manual / E2E:**  
  - **A:** On template detail, reorder subtasks via move up/down (and DnD if implemented); reload and confirm order persisted; add subtask and confirm it appears in correct position.  
  - **B:** Open template with dependencies; confirm DAG or dependency visualization shows correct nodes and edges.  
  - **C:** Try to add a dependency that would create a cycle; confirm UI prevents or warns and does not submit, or backend returns 400 and UI shows clear error.  
  - **D:** Click delete subtask or remove dependency; confirm warning text appears; confirm after accept, change is persisted and UI updates.  
  - **E:** Change order or dependencies; confirm workflow preview reflects current (and optionally unsaved) state.

- **Non-functional:**  
  - Reorder and cycle check (if server-side) remain fast for templates with tens of subtasks and dependencies.  
  - No regression in existing workflow template create/edit or engine behavior.

---

## Summary

| Area | Deliverable |
|------|-------------|
| **A. Subtask ordering UX** | Drag-and-drop and/or move up/down; persist via sortOrder (existing PATCH or new reorder endpoint). |
| **B. Dependency visualization** | Visual DAG or enhanced list of dependencies in template detail editor. |
| **C. Dependency safety** | Prevent or warn before creating circular dependency (client-side and/or optional backend check). |
| **D. Safer editing** | Warnings/confirmations before deleting subtask or removing dependency, with downstream impact copy. |
| **E. Workflow preview** | Preview section shows execution order and dependencies; optionally reflects unsaved state. |
| **Schema** | No new tables or columns. |
| **API** | Optional: reorder endpoint, cycle-check endpoint. Existing endpoints unchanged in contract. |
| **Risks** | DnD complexity, DAG scope, cycle-check consistency, reorder races, warning accuracy. |

---

*Mini-spec only. No implementation. No code. No file changes beyond adding this document.*
