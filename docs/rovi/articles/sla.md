---
slug: sla
title: "SLA thresholds, badges, and breach alerts"
feature: "SLA"
roles: [DEPARTMENT_USER, ADMIN]
primary_routes:
  - /tickets
  - /admin/reporting
related_routes:
  - /dashboard
  - /inbox
  - /admin/system-monitoring
synonyms:
  - sla
  - sla badge
  - sla breached
  - sla at risk
  - response time
  - resolution time
  - sla threshold
  - sla alert
  - overdue ticket
summary: "Every ticket carries an SLA status computed from priority; Rovi alerts owners and admins when a ticket breaches."
---

# SLA thresholds, badges, and breach alerts

**Who can use this:** DEPARTMENT_USER and ADMIN see the badges and
breach alerts. Studio users just see ticket status.
**Where to find it:** the SLA badge renders on every row in /tickets
and in the ticket drawer.

## What it does
Every ticket has an SLA computed from its priority and createdAt. Rovi
exposes it as `sla: OK | AT_RISK | BREACHED | RESOLVED` on every ticket
payload and renders a small colored badge plus a progress bar in the
drawer sidebar.

## Default thresholds (hours)
- **URGENT** — 4 hours
- **HIGH** — 24 hours
- **MEDIUM** — 72 hours
- **LOW** — 168 hours

"At risk" = less than 20% of the window remaining. All four thresholds
are overridable via `SLA_*` env vars on the API.

## Steps
1. Look at any ticket row in /tickets — the SLA badge color tells you
   the state at a glance: green (OK), yellow (AT_RISK), red (BREACHED),
   gray (RESOLVED).
2. Open the drawer to see the SLA progress bar: time remaining, target
   time, and the exact threshold being applied.
3. When a ticket breaches, Rovi fires a `TICKET_SLA_BREACHED`
   notification to the owner and all ADMINs. The notification is
   de-duplicated for 23 hours so one ticket doesn't spam the queue.
4. Use /admin/reporting to see aggregate SLA trends (breaches by
   priority, by category, by studio).

## Common pitfalls
- SLA pauses while the ticket is in WAITING_ON_REQUESTER or
  WAITING_ON_VENDOR? In the current build the SLA clock is based on
  createdAt — it does NOT pause. Tune thresholds instead.
- Raising the priority on a ticket recomputes the SLA immediately and
  may instantly flip it from OK to BREACHED.

## Related
- /tickets — badges everywhere
- /admin/reporting — SLA breakdowns
- /admin/system-monitoring — the stale-ticket cron that fires alerts
