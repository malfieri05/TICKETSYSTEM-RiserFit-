# Stage 7A — Workflow Execution Visibility — Implementation Summary

## Files changed

### Backend (API)

| File | Change |
|------|--------|
| `apps/api/src/modules/subtask-workflow/subtask-workflow.service.ts` | Added `getTemplateStats(workflowTemplateId)` with aggregated Prisma queries. |
| `apps/api/src/modules/subtask-workflow/subtask-workflow.controller.ts` | Added `GET templates/:id/stats` route (before `GET templates/:id` for route precedence). |
| `apps/api/src/modules/subtasks/subtasks.service.ts` | Extended `SUBTASK_SELECT` with `dependencyFrom`, `subtaskTemplate`; `findByTicket()` now `orderBy: [{ subtaskTemplate: { sortOrder: 'asc' } }, { createdAt: 'asc' }]`. |

### Frontend (Web)

| File | Change |
|------|--------|
| `apps/web/src/lib/api.ts` | Added `workflowTemplatesApi.getStats(id)`. |
| `apps/web/src/types/index.ts` | Extended `SubtaskStatus` (READY, LOCKED, SKIPPED); extended `Subtask` (department, dependencyFrom, subtaskTemplate); added `WorkflowTemplateStatsDto`. |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Added `useQuery` for `subtasksApi.list(id)` when Subtasks tab active; Workflow Progress section uses list data; display department, status, “Blocked by dependency” when LOCKED; progress uses DONE+SKIPPED; invalidate subtasks list on create/update. |
| `apps/web/src/app/(app)/admin/workflow-templates/[id]/page.tsx` | Added `useQuery` for `workflowTemplatesApi.getStats(id)`; “Usage & execution” section with ticketsUsingTemplate, activeExecutions, completedExecutions. |
| `apps/web/src/components/ui/Badge.tsx` | Added `LOCKED`, `READY`, `SKIPPED` to `subtaskStatusColors`. |
| `apps/web/src/components/tickets/TicketDrawer.tsx` | Use `s.owner.name` (Subtask type uses `name`). |

---

## New endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/subtask-workflow/templates/:id/stats` | ADMIN | Returns `{ ticketsUsingTemplate, activeExecutions, completedExecutions }`. |

---

## Prisma queries used

### Stats (`getTemplateStats`)

1. **Template and subtask template IDs**  
   `subtaskWorkflowTemplate.findUniqueOrThrow`; then `subtaskTemplate.findMany({ where: { workflowTemplateId }, select: { id: true } })` → `templateSubtaskIds`.

2. **ticketsUsingTemplate**  
   `subtask.groupBy({ by: ['ticketId'], where: { subtaskTemplateId: { in: templateSubtaskIds } } })` → count of distinct `ticketId`.

3. **activeExecutions**  
   `subtask.findMany({ where: { subtaskTemplateId: { in: templateSubtaskIds }, isRequired: true, status: { notIn: ['DONE', 'SKIPPED'] } }, select: { ticketId: true }, distinct: ['ticketId'] })` → count of distinct ticketIds (tickets with at least one required subtask not done).

4. **completedExecutions**  
   `ticketsUsingTemplate - activeExecutions` (tickets using template with all required subtasks DONE or SKIPPED).

### Subtasks list (`findByTicket`)

- **Select:** Existing `SUBTASK_SELECT` plus `dependencyFrom: { select: { dependsOnSubtaskId: true } }`, `subtaskTemplate: { select: { sortOrder: true } }`.
- **Order:** `orderBy: [{ subtaskTemplate: { sortOrder: 'asc' } }, { createdAt: 'asc' }]`.

---

## Build status

- **API:** `npm run build` — **success**
- **Web:** `npm run build` — **success**

---

## Manual verification (recommended)

1. **Ticket Workflow Progress**  
   Open a ticket that has workflow subtasks. Go to Subtasks tab. Confirm: list ordered by workflow; department shown; status (READY/LOCKED/DONE/etc.) and “Blocked by dependency” when LOCKED; progress bar uses DONE+SKIPPED.

2. **Workflow template stats**  
   Open Admin → Workflow Templates → a template that has tickets. Confirm “Usage & execution” shows Tickets using template, Active executions, Completed executions (numbers match expectations).

3. **Stats endpoint**  
   `GET /api/subtask-workflow/templates/:id/stats` with ADMIN JWT returns 200 and `{ ticketsUsingTemplate, activeExecutions, completedExecutions }`.

4. **Subtasks endpoint**  
   `GET /api/tickets/:ticketId/subtasks` returns subtasks with `department`, `dependencyFrom`, `subtaskTemplate.sortOrder`, ordered by template sort order.
