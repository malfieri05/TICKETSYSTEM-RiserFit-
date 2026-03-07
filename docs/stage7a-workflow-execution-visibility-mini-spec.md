# Stage 7A: Workflow Execution Visibility — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Stage 4 Subtask Workflow Engine](stage4-subtask-workflow-engine-mini-spec.md), [Stage 6.5 Admin Workflow Template Manager](stage6-5-admin-workflow-template-manager-mini-spec.md).

---

## 1. Intent

Add a **first visibility layer** for how workflows are executing in production, using the existing architecture and schema. The goal is to give admins and operators:

- **On the ticket:** A clear view of the instantiated workflow (subtasks, status, dependency/ready state, order) so they can see progress and bottlenecks.
- **On the workflow template list:** Aggregate usage and execution counts per template (how many tickets, how many active vs completed executions).
- **On the workflow template detail:** A small summary of usage and execution for that template.

All of this is **read-only visibility** — no new workflow engine behavior, no new state machines, no analytics dashboard or charting. Prefer **derived/aggregated queries** over new tables; stay within the current modular monolith, NestJS + Prisma + React Query patterns.

---

## 2. Scope

**In scope**

- **A. Ticket Workflow Progress View**  
  On the ticket detail page, show the list of instantiated subtasks for that ticket with: subtask title, department, status, dependency/ready state where useful, and ordering by workflow/subtask sort order. Uses existing `Subtask` and `SubtaskDependency`; subtasks already have `subtaskTemplateId`, `status`, `title`, `departmentId`, and relations to dependencies. No new entities.

- **B. Workflow Template Usage Visibility**  
  On the admin workflow templates list (or list API response), add per-template visibility: number of tickets using the template, number of active/in-progress workflow executions, number of completed workflow executions. “Using the template” = tickets that have at least one subtask whose `subtaskTemplateId` belongs to that workflow template’s subtask templates. Active = ticket has at least one subtask not in DONE/SKIPPED; completed = ticket has all required subtasks in DONE or SKIPPED (or ticket resolved/closed, as defined by existing rules). Implemented via aggregated/count queries over existing tables.

- **C. Workflow Template Detail Visibility**  
  On the workflow template detail page, add a small summary section: same usage stats (tickets using template, active executions, completed executions) and optional high-level execution visibility (e.g. same counts or a short summary). No charting; text/counts only.

**Out of scope**

- New database tables for analytics or execution snapshots.
- Advanced analytics dashboard, charting, or time-series.
- Refactoring the workflow engine or dependency/READY logic.
- New workflow execution features (only visibility of existing data).
- Changes to instantiation, state machine, or notification logic.

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **Tickets module** (ticket detail): Extend ticket-by-id response or add a small dedicated read for “subtasks for this ticket” suitable for the workflow progress view. Likely files: `apps/api/src/modules/tickets/tickets.service.ts`, `apps/api/src/modules/tickets/tickets.controller.ts`. Optionally reuse or extend existing subtasks endpoint `GET /api/tickets/:ticketId/subtasks` if it already returns the needed fields and order; otherwise ensure ticket detail or subtasks list returns subtasks ordered by sort order, with department and dependency/ready state where useful.
- **Subtask-workflow module** (admin templates): Add or extend list/detail to include usage and execution counts. Likely files: `apps/api/src/modules/subtask-workflow/subtask-workflow.service.ts`, `apps/api/src/modules/subtask-workflow/subtask-workflow.controller.ts`. May add DTOs or response extensions for counts (e.g. `ticketsUsingTemplate`, `activeExecutions`, `completedExecutions`).

**Frontend (Next.js, React Query)**

- **Ticket detail page:** Add a “Workflow progress” or “Subtasks” section that renders the instantiated subtasks (title, department, status, dependency/ready state, order). Likely file: `apps/web/src/app/(app)/tickets/[id]/page.tsx` and possibly a small presentational component for the subtask list/table.
- **Admin workflow templates list:** Show usage/execution counts per row (e.g. “X tickets · Y active · Z completed”). Likely file: `apps/web/src/app/(app)/admin/workflow-templates/page.tsx`. Data from list API response (extended with counts).
- **Admin workflow template detail:** Add a summary section with usage stats and high-level execution visibility. Likely file: `apps/web/src/app/(app)/admin/workflow-templates/[id]/page.tsx`. Data from detail API response (extended with counts) or from the same counts endpoint used for the list.

**Shared / types**

- `apps/web/src/types/index.ts` (or equivalent): Extend or add types for workflow usage stats (e.g. ticketsUsingTemplate, activeExecutions, completedExecutions) and for ticket subtask list display (title, department, status, ordering, optional “depends on” / ready state).
- `apps/web/src/lib/api.ts`: Use existing or new endpoints for ticket subtasks and for workflow template list/detail with counts; no new API surface beyond what’s needed for the above.

Exact file list will be finalized in Step B; the above identifies the likely touchpoints.

---

## 4. Schema Impact

**No new tables, no new columns.**

- **Ticket Workflow Progress:** Uses existing `Subtask` (and `SubtaskDependency` for ready state). Subtask already has `ticketId`, `subtaskTemplateId`, `title`, `departmentId`, `status`, and relations to `dependencyFrom` / `dependencyTo`. Ordering can follow the template’s `sortOrder` (via `subtaskTemplate`) or a stable order (e.g. by subtask `createdAt` or by template sort order when loading with template).
- **Template usage and execution counts:** Derived from existing relations: `SubtaskWorkflowTemplate` → `SubtaskTemplate` (ids) → `Subtask` (where `subtaskTemplateId` in those ids) → distinct `ticketId`. “Active” vs “completed” is computed from subtask statuses and ticket state (e.g. ticket resolved or all required subtasks DONE/SKIPPED) using current schema. No migrations required.

If performance demands it later, consider indexed counts or cached stats only after measuring; not in scope for this mini-spec.

---

## 5. API Impact

- **Ticket detail or subtasks:**  
  Ensure `GET /api/tickets/:ticketId/subtasks` (or the data used by ticket detail) returns subtasks with fields needed for the progress view: at least `id`, `title`, `departmentId` (or department name/code), `status`, `isRequired`, and ordering (e.g. by subtask template `sortOrder` or equivalent). Optionally include dependency/ready state (e.g. “blocked by” or “READY”/“LOCKED”) if not already derivable on the client. No new HTTP method or path required if existing endpoint can be extended; otherwise a minimal read endpoint for “subtasks for ticket with workflow view” is acceptable.

- **Workflow template list:**  
  Extend `GET /api/subtask-workflow/templates` response (or a dedicated admin endpoint) so each template includes optional usage/execution fields, e.g. `ticketsUsingTemplate`, `activeExecutions`, `completedExecutions`. Backend computes these via Prisma aggregated queries (count distinct tickets, count where not all done, count where all done). Admin-only; same auth as existing workflow template list.

- **Workflow template detail:**  
  Extend `GET /api/subtask-workflow/templates/:id` response to include the same usage/execution counts (and optionally a short summary) for that template. Same auth as existing.

No breaking changes to existing response shapes if counts are added as optional fields. New query logic only; no new resources.

---

## 6. UI Impact

- **Ticket detail page:** New or expanded section “Workflow progress” (or “Subtasks”) showing a list/table of instantiated subtasks: columns or fields for title, department, status, and dependency/ready state where useful; rows ordered by workflow/subtask sort order. Read-only; no new actions required for this stage. Fits within existing ticket detail layout (e.g. sidebar or main content).

- **Admin workflow templates list:** Each row (or card) shows, in addition to current context and subtask count, usage/execution stats: e.g. “X tickets · Y active · Z completed” or similar short text. No charting; numbers and short labels only.

- **Admin workflow template detail page:** New small “Usage & execution” (or similar) summary block: same metrics (tickets using template, active executions, completed executions) and optional one-line summary. Placed so it does not dominate the page (e.g. above or beside the existing workflow preview and subtask template list).

All within existing patterns: React Query for data, existing auth and admin-only routes, existing design system (Tailwind, existing components where applicable).

---

## 7. Risks

- **Performance:** Counts over subtasks/tickets per template could be expensive if many tickets and subtasks exist. Mitigation: use aggregated Prisma queries (count, groupBy) and existing indexes (`subtaskTemplateId`, `ticketId`, `status`); avoid N+1. If needed, add indexes only (no new tables). Defer caching or materialized stats unless profiling shows a problem.
- **Definition of “active” vs “completed”:** Must align with existing product meaning (e.g. “completed” = all required subtasks DONE or SKIPPED, or ticket RESOLVED/CLOSED). Document the definition in the implementation and keep it consistent between list and detail.
- **Tickets without workflow:** Tickets that have no subtasks (or no workflow template applied) show an empty workflow progress view; no error. Template usage counts only consider tickets that have at least one subtask linked to that template’s subtask templates.
- **Scope creep:** Resist adding charts, filters, or export in this stage; limit to the three visibility areas above.

---

## 8. Test Plan

- **Unit (backend):**  
  - Count / aggregation logic for “tickets using template,” “active executions,” “completed executions” for a given workflow template: test with fixtures (tickets with subtasks from that template in various statuses; tickets with all required subtasks DONE/SKIPPED vs not).  
  - Ticket subtasks list or ticket-detail payload: returns subtasks in correct order with required fields and correct department/status/dependency info.

- **Integration / API:**  
  - `GET /api/tickets/:ticketId/subtasks` (or equivalent) returns 200 with ordered subtasks and fields needed for the progress view.  
  - `GET /api/subtask-workflow/templates` (admin) returns 200 with optional count fields when implemented.  
  - `GET /api/subtask-workflow/templates/:id` (admin) returns 200 with usage/execution counts when implemented.

- **Manual / E2E:**  
  - Ticket detail: Open a ticket that has workflow subtasks; confirm “Workflow progress” (or “Subtasks”) section shows correct subtasks, order, department, status, and dependency/ready state.  
  - Admin workflow templates list: Confirm each template row shows usage/execution counts consistent with DB (e.g. create a ticket with a template, confirm counts update).  
  - Admin workflow template detail: Confirm usage summary section shows and matches list counts.

- **Non-functional:**  
  - List/detail with counts under typical data volume (e.g. dozens of templates, hundreds of tickets) respond within acceptable time; no N+1 in logs.

---

## Summary

| Area | Deliverable |
|------|-------------|
| **A. Ticket Workflow Progress** | Ticket detail shows instantiated subtasks (title, department, status, dependency/ready, order). |
| **B. Template Usage (list)** | Admin workflow templates list shows per-template: tickets using template, active executions, completed executions. |
| **C. Template Detail** | Workflow template detail page has a small usage/execution summary section. |
| **Schema** | No new tables or columns; use existing Subtask, SubtaskDependency, SubtaskTemplate, SubtaskWorkflowTemplate. |
| **API** | Extend ticket subtasks response and workflow template list/detail responses with derived counts and fields. |
| **Risks** | Performance of counts; clear definition of active vs completed; avoid scope creep. |

---

*Mini-spec only. No implementation. No code. No architecture refactor.*
