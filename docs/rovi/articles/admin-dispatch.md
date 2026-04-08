---
slug: admin-dispatch
title: "Vendor dispatch and dispatch groups (admin)"
feature: "Vendor dispatch"
roles: [ADMIN]
primary_routes:
  - /admin/dispatch
related_routes:
  - /tickets
  - /admin/workflow-templates
  - /admin/reporting
  - /locations
synonyms:
  - dispatch
  - vendor dispatch
  - dispatch groups
  - dispatch group
  - dispatch map
  - dispatch recommendations
  - group tickets
  - batch dispatch
  - facilities dispatch
  - maintenance dispatch
summary: "Group open maintenance tickets by studio/category, review map recommendations, and batch them to a vendor."
---

# Vendor dispatch and dispatch groups (admin)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/dispatch.

## What it does
Vendor dispatch is the workspace for batching related open maintenance
tickets into a single dispatch — one call to a plumber or HVAC tech for
three tickets at two nearby studios instead of three separate calls.

The page has three parts:

- **Ticket feed** — open maintenance tickets you're allowed to see, with
  the same ticket drawer as /tickets.
- **Locations map** — a Leaflet map of the studios with open tickets.
  The pin stays aligned on the left side when the ticket drawer is
  open so you never lose sight of the selected studio.
- **Dispatch groups panel** — create a new group, see in-flight groups,
  and open a specific group at /admin/dispatch/groups/{id}.

## Steps (create a dispatch group)
1. Open /admin/dispatch.
2. Filter the ticket feed by category (e.g. Plumbing) and optionally by
   market or studio.
3. Select the tickets you want to batch using the row checkboxes.
4. Click **Create dispatch group**, give it a name and assigned vendor
   (or pick an existing dispatch group template), and save.
5. You are sent to /admin/dispatch/groups/{id} where you can add notes,
   attach vendor quotes, mark the group as sent, and close it when the
   work is done — each action is audit-logged.

## Recommendations
The page also shows Rovi's dispatch recommendations: clusters of tickets
by studio and category that look like good candidates to batch. Accept a
recommendation to pre-populate a new group, or dismiss it.

## Common pitfalls
- A ticket can only belong to one active dispatch group at a time.
- Closing a dispatch group does NOT resolve the underlying tickets —
  you still need to mark the tickets RESOLVED via the drawer.
- Studio users and department users cannot open /admin/dispatch.

## Related
- /admin/workflow-templates — configure subtask templates per category
- /admin/reporting — dispatch-focused slices and CSV export
- /locations — per-studio profile pages
