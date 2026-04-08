---
slug: dashboard
title: "Dashboard (KPIs, date range, volume chart)"
feature: "Dashboard"
roles: [DEPARTMENT_USER, ADMIN, STUDIO_USER]
primary_routes:
  - /dashboard
related_routes:
  - /admin/reporting
  - /tickets
  - /portal
synonyms:
  - dashboard
  - kpi
  - kpis
  - date range
  - timeframe
  - today 7d 30d 90d
  - ticket volume
  - avg response time
  - avg resolution time
  - support by type
  - maintenance by location
summary: "Role-scoped KPI dashboard with presets (today/7d/30d/90d/all), custom date range, and 30-day ticket volume chart."
---

# Dashboard (KPIs, date range, volume chart)

**Who can use this:**
- ADMIN and DEPARTMENT_USER see the full dashboard at /dashboard.
- STUDIO_USER sees the same numbers scoped to their studio(s) inside
  /portal → Dashboard tab (no separate /dashboard route for them).

**Where to find it:** open /dashboard.

## What it does
The Dashboard is a role-scoped summary powered by GET /dashboard/summary.
It applies the exact same visibility filters as the ticket feed, so the
numbers you see always match the tickets you can actually open.

## KPI cards (admin / department user)
- **New tickets** in the selected window.
- **In progress** right now.
- **Resolved / closed** in the selected window.
- **Average response time** (first non-requester comment or status change).
- **Average resolution time** (created → resolved).
- **Support by type** — breakdown by support topic.
- **Maintenance by location** — breakdown by studio.

For studio users (inside /portal) the cards collapse to **Open vs
Completed**, average completion time, and a by-location breakdown when
they have more than one allowed studio.

## Timeframe control
The Timeframe card (top-left) controls the date range for every other
card on the page.

1. Pick a preset with the toggle: **today / 7d / 30d / 90d / all**.
2. Or switch to **Custom** and type start and end dates — the inputs
   use the accent color to show you're outside a preset, and a day-count
   badge tells you how many days are in the window.
3. Click **Reset** to return to the default 30-day preset.
4. The live pulse dot next to "Date Range" confirms the cards are
   following the timeframe in real time.

## Ticket volume chart
The right-hand Ticket Volume card renders a 30-day line chart of created
vs resolved tickets. Its card height is locked to the left column so
the top row of the dashboard always stays visually balanced.

## Common pitfalls
- "Avg response time" only counts the **first** non-requester comment or
  status change — repeat comments don't reset it.
- Studio users don't see a global dashboard — always send them to /portal.

## Related
- /admin/reporting — deeper admin-only reports and CSV export
- /tickets — drill into the underlying tickets
