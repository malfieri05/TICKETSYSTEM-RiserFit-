---
slug: inbox-actionable
title: "Actionable inbox"
feature: "Inbox"
roles: [DEPARTMENT_USER, ADMIN]
primary_routes:
  - /inbox
related_routes:
  - /tickets
  - /notifications
  - /dashboard
synonyms:
  - inbox
  - actionable
  - actionable queue
  - actionable inbox
  - actionable notifications
  - my queue
  - ready subtasks
  - topic folders
summary: "Queue of actionable work: READY subtasks, mentions, and assignments — scoped to you."
---

# Actionable inbox

**Who can use this:** DEPARTMENT_USER and ADMIN. Not available to studio users.
**Where to find it:** open /inbox.

## What it does
The Actionable inbox is a focused queue of work Rovi is asking *you*
personally to do right now: READY subtasks you own, tickets assigned to
you that haven't been triaged, @mentions you haven't answered, and other
items tracked in your `notification_deliveries`.

For department users, the inbox is split into **topic folders** (All plus
one folder per support topic your department handles) with live active
counts so you can drain the highest-priority topic first.

## Steps
1. Open /inbox from the sidebar.
2. Pick a topic folder (or **All**) — active counts update as you work.
3. Click any row to open the ticket drawer in place, just like the main
   feed. The row shows the READY subtask (or notification type) that
   put the ticket on your queue.
4. Complete the subtask, answer the mention, or move the ticket forward;
   the row drops off the queue automatically.
5. Use "Mark as read" on any row to clear a stale notification without
   opening the ticket (optimistic — the count updates instantly).

## Common pitfalls
- Only DEPARTMENT_USER and ADMIN roles see /inbox in the sidebar. Studio
  users should use /portal and /notifications instead.
- If a subtask you expected doesn't appear, check whether its dependencies
  in the workflow template are complete — LOCKED subtasks don't show up
  in Actionable until they transition to READY.

## Related
- /tickets — full ticket feed
- /notifications — every notification, including non-actionable
- /admin/workflow-templates — configure subtask dependencies (admin)
