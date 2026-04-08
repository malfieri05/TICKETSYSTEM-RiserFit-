---
slug: admin-workflow-templates
title: "Workflow templates (admin)"
feature: "Workflow templates"
roles: [ADMIN]
primary_routes:
  - /admin/workflow-templates
  - /admin/workflow-templates/new
related_routes:
  - /tickets/new
  - /admin/dispatch
  - /admin/reporting
synonyms:
  - workflow template
  - workflow templates
  - subtask templates
  - template manager
  - workflow analytics
  - auto subtasks
  - subtask workflow
  - workflow editor
  - subtask dependencies
summary: "Define subtask workflow templates that auto-expand on matching tickets, plus per-template duration analytics."
---

# Workflow templates (admin)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/workflow-templates.

## What it does
Workflow templates are reusable playbooks. When a new ticket is created
with a context (ticket class + support topic OR maintenance category)
that matches an **active** template, Rovi automatically attaches the
template's subtasks to the ticket — with the right owners, departments,
and dependencies — so the workflow starts instantly.

The same page also hosts **workflow analytics**: a dashboard-style panel
that shows the average completion time per subtask for a selected
template. Use it to spot the slowest step in a recurring workflow.

## Steps (create a template)
1. Open /admin/workflow-templates.
2. Click **New Template** or go to /admin/workflow-templates/new.
3. Pick the ticket context: class first (Maintenance or Support), then
   the department/support topic or maintenance category it should match.
4. Add subtask templates in order: title, assignee (user, department,
   or leave unassigned), required vs optional, and sort order.
5. Add dependencies between subtasks when one must finish before another
   becomes READY (e.g. "Order parts" must DONE before "Install parts"
   becomes READY).
6. Toggle **Is active** on, save — the template is live for all new
   matching tickets from this moment forward.

## Steps (edit a template)
1. Open /admin/workflow-templates and click the template row.
2. Update name, activation, subtasks, or dependencies.
3. Save. Changes apply to **future** tickets only — existing tickets
   keep the subtasks they were created with.

## Workflow analytics panel
The list page includes an analytics card at the top. Pick a template
from the dropdown to see one row per subtask template with: subtask
name, assigned department, assigned user, and average duration (from
`availableAt` → `completedAt`). Click the **Avg. duration** header to
sort ascending or descending; a reset button clears sort.

## Common pitfalls
- Inactive templates never apply, even if the context matches.
- Editing a template does NOT retro-actively change existing tickets.
- Circular dependencies are rejected — save will error if you try.

## Related
- /tickets/new — create a ticket that may trigger a template
- /admin/dispatch — dispatch groups (may be built from completed work)
- /admin/reporting — company-wide ticket metrics (admin)
