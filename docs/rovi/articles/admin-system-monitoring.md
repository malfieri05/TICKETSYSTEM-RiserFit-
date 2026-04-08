---
slug: admin-system-monitoring
title: "System monitoring (queues, health, dead-letter)"
feature: "System monitoring"
roles: [ADMIN]
primary_routes:
  - /admin/system-monitoring
related_routes:
  - /admin/knowledge-base
  - /admin/email-automation
  - /notifications
synonyms:
  - system monitoring
  - health
  - queues
  - bullmq
  - dead letter
  - failed jobs
  - retry job
  - notification retries
  - worker health
  - redis health
summary: "Admin health panel: BullMQ queues, dead-lettered jobs, notification delivery status, and retry actions."
---

# System monitoring (queues, health, dead-letter)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/system-monitoring.

## What it does
System monitoring is the admin health panel. It reports:

- **DB + Redis health** — up/down, latency, pool usage.
- **BullMQ queues** — waiting, active, delayed, and failed counts for
  every worker (notification-fanout, notification-dispatch, stale-ticket,
  email-ingest, invite-email, knowledge-ingestion).
- **Dead-lettered jobs** — the retry-exhausted graveyard. Every row has
  a "Retry" action that re-enqueues the job.
- **Notification deliveries** — per-channel SENT / FAILED counts, with a
  table of recent failures so you can see exactly which email or
  Teams webhook misbehaved.

## Steps
1. Open /admin/system-monitoring.
2. Scan the top status bar — green means all good, yellow means a
   queue is backing up, red means a queue is failing.
3. Click any queue card to drill into its job list. Click a failed job
   to see the error message and stack trace.
4. Retry a dead-lettered job from its row action, or clear the whole
   dead-letter list if you're recovering from a known outage.
5. Use the Notifications tab to inspect recent delivery failures and
   resend a specific notification if needed.

## Common pitfalls
- If notifications stop arriving org-wide, check Redis health first —
  the notification-fanout and notification-dispatch queues both
  depend on Upstash being reachable.
- Stale-ticket alerts are de-duplicated for 23 hours; repeatedly
  changing a ticket's SLA doesn't spam the owner.

## Related
- /admin/knowledge-base — ingestion queue for RAG documents
- /admin/email-automation — Gmail ingest job history
- /notifications — the user-facing notification center
