# Stage 7B: Workflow Analytics & Admin Reporting — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Stage 4 Subtask Workflow Engine](stage4-subtask-workflow-engine-mini-spec.md), [Stage 7A Workflow Execution Visibility](stage7a-workflow-execution-visibility-mini-spec.md).

---

## 1. Intent

Introduce **admin analytics and reporting for workflow execution** so administrators can understand how workflows perform operationally across the system. The goal is to provide:

- **Per-template analytics:** Total, active, and completed executions; optional average completion time; most recent execution.
- **Department-level metrics:** Tickets created, workflows started, workflows completed, average workflow duration by department.
- **Bottleneck visibility:** Subtasks that most often block completion (longest average duration, most frequently BLOCKED).
- **A single admin analytics page** that surfaces these metrics in a summary dashboard.

All metrics are **derived from existing tables** (tickets, subtasks, workflow templates, taxonomy). No time-series store, no external analytics tools, no changes to the workflow engine. Stay within NestJS + Prisma + React Query.

---

## 2. Scope

**In scope**

- **A. Workflow Template Analytics**  
  For each workflow template (or on demand per template): total executions (tickets using template), active executions, completed executions (definitions as in Stage 7A). Optionally: average completion time (e.g. mean of ticket resolvedAt − createdAt for tickets that used the template and are resolved/closed); most recent execution (e.g. latest ticket createdAt or latest subtask updatedAt for that template). Delivered via derived Prisma queries; may extend or reuse existing stats logic.

- **B. Department Workflow Metrics**  
  Aggregate by taxonomy department (ticket’s departmentId or subtask’s departmentId as appropriate): tickets created (count by department), workflows started (tickets that have at least one subtask from a template), workflows completed (tickets where all required subtasks are DONE/SKIPPED or ticket resolved/closed), average workflow duration (e.g. mean of resolvedAt − createdAt or closedAt − createdAt for completed tickets in that department). Department = taxonomy departments (e.g. HR, Operations); use existing `departments` / `TaxonomyDepartment` and ticket/subtask departmentId.

- **C. Bottleneck Visibility**  
  Identify subtask templates (or live subtask titles) that most often slow workflows: (1) subtasks with longest average duration (completedAt − readyAt or completedAt − createdAt, grouped by subtaskTemplateId or title); (2) subtasks most often in BLOCKED state (count of subtasks by subtaskTemplateId where status = BLOCKED, or by department). Output a small “bottleneck” list (e.g. top N) for the dashboard. No real-time streaming; point-in-time aggregated queries.

- **D. Admin Analytics Page**  
  New route: `/admin/workflow-analytics`. Summary dashboard with: key workflow template metrics (e.g. table or cards), department metrics (table or summary), and bottleneck summary (e.g. top blocking subtasks, longest-running subtask types). Read-only; admin-only. No charting requirement in this stage (numbers and simple tables/lists acceptable).

**Out of scope**

- New database tables (e.g. analytics snapshots, time-series tables) unless a clear need is identified during design.
- Time-series analytics (e.g. “workflows per day over last 90 days” as a time series).
- External analytics or BI tools.
- Changes to the workflow engine, state machine, or notification logic.
- Export to CSV/Excel (can be a later enhancement).
- Charting/visualizations (optional later; not required for Stage 7B).

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **New module or reporting extension:** Either a new `WorkflowAnalyticsModule` (e.g. `apps/api/src/modules/workflow-analytics/`) with controller and service, or extend the existing `ReportingModule` / `SubtaskWorkflowModule` with analytics endpoints. Recommendation: dedicated `workflow-analytics` module for clarity and admin-only scope.
- **Service:** Implement aggregated queries for: (1) per-template metrics (total/active/completed, optional avg completion time, most recent execution); (2) per-department metrics (tickets created, workflows started/completed, avg duration); (3) bottleneck queries (subtask templates or subtasks by average duration, by BLOCKED count). All via Prisma (groupBy, findMany with aggregates, raw queries only if necessary).
- **Controller:** Expose admin-only endpoints, e.g. `GET /api/admin/workflow-analytics/summary` or `GET /api/admin/workflow-analytics/templates`, `GET /api/admin/workflow-analytics/departments`, `GET /api/admin/workflow-analytics/bottlenecks`. Or a single summary endpoint that returns all sections. DTOs for response shapes.
- **Guards:** Reuse `@Roles('ADMIN')`; ensure routes are under admin prefix or clearly admin-only.

**Frontend (Next.js, React Query)**

- **New page:** `apps/web/src/app/(app)/admin/workflow-analytics/page.tsx` — dashboard layout with sections for template analytics, department metrics, and bottlenecks. Fetches from new analytics API(s).
- **API client:** `apps/web/src/lib/api.ts` — add functions for workflow analytics endpoints (e.g. `adminApi.getWorkflowAnalyticsSummary()` or per-section calls).
- **Types:** `apps/web/src/types/index.ts` — add response types for analytics (template metrics, department metrics, bottleneck items).
- **Sidebar/nav:** Add “Workflow Analytics” (or “Workflow Reporting”) under Admin in `apps/web/src/components/layout/Sidebar.tsx` linking to `/admin/workflow-analytics`.

**Docs**

- Update `CLAUDE.md` or stage docs to mention Stage 7B and the new admin analytics page once implemented.

Exact file list will be finalized in Step B.

---

## 4. Schema Impact

**No new tables or columns required.**

- **Workflow template analytics:** Use existing `SubtaskWorkflowTemplate`, `SubtaskTemplate`, `Subtask`, `Ticket`. “Executions” = tickets with ≥1 subtask whose `subtaskTemplateId` belongs to the template; active/completed as in Stage 7A. Average completion time = aggregate over tickets (e.g. `resolvedAt − createdAt` or `closedAt − createdAt`) where ticket has used that template and has resolvedAt/closedAt. Most recent = max ticket createdAt or max subtask updatedAt for that template.
- **Department metrics:** Ticket has `departmentId` (taxonomy department for ticket context). Count tickets by departmentId; “workflows started” = tickets with ≥1 subtask (optionally with subtaskTemplateId set); “workflows completed” = same completion definition (all required subtasks DONE/SKIPPED or ticket resolved/closed). Average duration = mean(resolvedAt − createdAt) or mean(closedAt − createdAt) for completed tickets in that department. Optionally include subtask-level departmentId for “subtask department” view if needed (e.g. which department’s subtasks are slowest).
- **Bottlenecks:** Subtask has `subtaskTemplateId`, `status`, `completedAt`, `createdAt`, `readyAt`. Group by subtaskTemplateId (or by title if no template): average duration = avg(completedAt − readyAt) or avg(completedAt − createdAt) for DONE/SKIPPED subtasks; BLOCKED count = count where status = BLOCKED, grouped by subtaskTemplateId or departmentId. Existing indexes (e.g. subtaskTemplateId, status, departmentId) support these queries.

If performance demands it later, consider materialized views or cached summary tables only after measuring; not in scope for initial design.

---

## 5. API Impact

- **New endpoints (admin-only):**  
  - Option A: Single summary — `GET /api/admin/workflow-analytics/summary` (or under a dedicated prefix like `GET /api/workflow-analytics/summary`) returning `{ templateMetrics[], departmentMetrics[], bottlenecks }`.  
  - Option B: Separate — e.g. `GET /api/admin/workflow-analytics/templates`, `GET /api/admin/workflow-analytics/departments`, `GET /api/admin/workflow-analytics/bottlenecks`.  

  Recommendation: one summary endpoint to minimize round-trips for the dashboard; optional per-section endpoints if the dashboard later needs lazy loading.

- **Response shapes (representative):**  
  - **Template metrics:** `{ templateId, templateName?, totalExecutions, activeExecutions, completedExecutions, avgCompletionTimeHours?, mostRecentExecutionAt? }`.  
  - **Department metrics:** `{ departmentId, departmentName, ticketsCreated, workflowsStarted, workflowsCompleted, avgWorkflowDurationHours? }`.  
  - **Bottlenecks:** `{ subtaskTemplateId?, title?, departmentId?, avgDurationHours?, blockedCount?, rank? }[]` (e.g. top 10 by duration, top 10 by BLOCKED count).

- **Auth:** All analytics endpoints restricted to `@Roles('ADMIN')`. No change to existing ticket or workflow APIs.

---

## 6. UI Impact

- **New admin page:** `/admin/workflow-analytics` — summary dashboard with three main sections:
  1. **Workflow template analytics** — Table or cards: one row/card per template (or top N) with total executions, active, completed, optional avg completion time, most recent execution. Link to template detail where useful.
  2. **Department workflow metrics** — Table or cards: one row per department with tickets created, workflows started, workflows completed, average workflow duration. Plain numbers; no charts required.
  3. **Bottleneck visibility** — List or table: “Subtasks with longest average duration” and “Subtasks most often BLOCKED” (e.g. top 5–10 each), with subtask template title, department, and metric value.

- **Navigation:** “Workflow Analytics” (or “Workflow Reporting”) added to the Admin section of the sidebar, linking to `/admin/workflow-analytics`.

- **Patterns:** React Query for fetching; existing Tailwind and layout patterns; no new design system. Loading and error states for each section. Optional: last-refreshed timestamp.

---

## 7. Risks

- **Performance:** Aggregations over all tickets/subtasks can be heavy at scale. Mitigation: use Prisma groupBy and indexed fields; limit “top N” for bottlenecks; consider date filters (e.g. last 90 days) to limit scope in a future iteration. No time-series in this stage.
- **Definition consistency:** “Workflows started” and “workflows completed” must align with Stage 7A (and with ticket resolved/closed semantics). Document definitions in API and UI.
- **Average completion time:** Depends on `resolvedAt`/`closedAt` and optionally subtask `completedAt`/`readyAt`. If many tickets lack resolvedAt (e.g. closed without resolve), define clearly what “completion” means and whether duration uses closedAt or resolvedAt.
- **Bottleneck by template vs by title:** Manually added subtasks have no subtaskTemplateId; aggregating by template only shows template-driven subtasks. Decide whether to include “ad-hoc” subtasks (e.g. by title) or only template-based for bottleneck view.
- **Scope creep:** Resist adding charts, date-range pickers, or export in Stage 7B unless explicitly approved; keep to summary metrics and tables/lists.

---

## 8. Test Plan

- **Unit (backend):**  
  - Template metrics: given fixture data (tickets with subtasks from a template in various states), assert total/active/completed and optional avg duration and most recent execution.  
  - Department metrics: given tickets and subtasks by department, assert counts and avg duration.  
  - Bottlenecks: given subtasks with varying duration and BLOCKED counts, assert ordering and top N.

- **Integration / API:**  
  - `GET /api/admin/workflow-analytics/summary` (or equivalent) returns 200 with correct shape when authenticated as ADMIN; 403 when not ADMIN.  
  - Response sections (templates, departments, bottlenecks) are present and structurally correct.

- **Manual / E2E:**  
  - As admin, open `/admin/workflow-analytics`; confirm all three sections render and numbers are plausible.  
  - Confirm sidebar link and that non-admins cannot access the page (redirect or 403).

- **Non-functional:**  
  - Summary endpoint responds within acceptable time under typical data volume (e.g. hundreds of tickets, dozens of templates); optimize queries if needed.

---

## Summary

| Area | Deliverable |
|------|-------------|
| **A. Workflow template analytics** | Per-template: total/active/completed executions; optional avg completion time; most recent execution. |
| **B. Department workflow metrics** | Per department: tickets created, workflows started/completed, avg workflow duration. |
| **C. Bottleneck visibility** | Top subtasks by average duration and by BLOCKED frequency. |
| **D. Admin analytics page** | `/admin/workflow-analytics` dashboard with the three sections above. |
| **Schema** | No new tables; use existing Ticket, Subtask, SubtaskTemplate, SubtaskWorkflowTemplate, TaxonomyDepartment. |
| **API** | New admin-only workflow analytics endpoint(s) (summary or per-section). |
| **Risks** | Query performance; consistent definitions; completion-time and bottleneck scope. |

---

*Mini-spec only. No implementation. No code. No file changes beyond adding this document.*
