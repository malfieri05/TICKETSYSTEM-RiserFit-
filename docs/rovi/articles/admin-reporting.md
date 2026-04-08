---
slug: admin-reporting
title: "Admin reporting and CSV export"
feature: "Reporting"
roles: [ADMIN]
primary_routes:
  - /admin/reporting
related_routes:
  - /dashboard
  - /admin/workflow-templates
  - /admin/dispatch
synonyms:
  - reporting
  - admin reporting
  - reports
  - csv export
  - export tickets
  - ticket reports
  - workflow timing
  - dispatch by studio
  - kpi export
  - volume report
summary: "Admin-only reporting with KPI cards, a 30-day volume chart, by-status/priority/category/market breakdowns, and CSV export."
---

# Admin reporting and CSV export

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/reporting.

## What it does
/admin/reporting is the deeper cousin of /dashboard. It shows the same
KPI cards, a 30-day volume chart, and adds several admin-only slices
you can't get from the dashboard:

- **By status / priority / category / market / studio** breakdowns.
- **Average resolution time** across the whole org, with filters.
- **Completion by owner** — who closed the most tickets in the window.
- **Workflow timing** — per-template average duration, per-subtask
  average duration (also on /admin/workflow-templates).
- **Dispatch slices** — tickets grouped into dispatch groups vs loose,
  by-studio dispatch volume, by-category dispatch volume.
- **CSV export** on every supported report.

## Steps
1. Open /admin/reporting.
2. Pick a timeframe from the top (same preset toggle as the dashboard:
   today / 7d / 30d / 90d / all, plus custom).
3. Choose a report from the left rail or scroll through the cards.
4. Click **Export CSV** on any card that supports it. The CSV reflects
   the current filter exactly.
5. Use the workflow timing panel to find the slowest subtask type in
   any given template, then jump to /admin/workflow-templates to fix
   it.

## Common pitfalls
- Reports honor the same visibility rules as /tickets, but admins
  effectively see everything.
- "Completion by owner" only counts owners on tickets that reached
  RESOLVED or CLOSED in the window.

## Related
- /dashboard — role-scoped KPI dashboard (lighter)
- /admin/workflow-templates — where slow subtasks get tuned
- /admin/dispatch — dispatch groups the dispatch slices are built from
