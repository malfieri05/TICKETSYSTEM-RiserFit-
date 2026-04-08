---
slug: notifications
title: "Notifications center and delivery channels"
feature: "Notifications"
roles: [STUDIO_USER, DEPARTMENT_USER, ADMIN]
primary_routes:
  - /notifications
related_routes:
  - /inbox
  - /tickets
synonyms:
  - notifications
  - notification center
  - notification preferences
  - email notifications
  - teams notifications
  - in-app notifications
  - sse notifications
  - notification delivery
  - unread notifications
summary: "See every notification Rovi has delivered to you, and control your email/Teams/in-app preferences."
---

# Notifications center and delivery channels

**Who can use this:** everyone.
**Where to find it:** open /notifications.

## What it does
The Notifications center is your full history of everything Rovi has sent
you: ticket created, assigned, reassigned, status changed, resolved,
comment added, you were @mentioned, a subtask assigned to you, a subtask
completed, an attachment added, or an SLA breach warning.

Notifications are tracked end-to-end — they're **not** best-effort.
Rovi writes a delivery row per channel (email, Teams, in-app SSE), retries
failed sends with exponential backoff (5 attempts), and dead-letters the
job to an admin queue if it still fails.

## Steps
1. Open /notifications from the sidebar (bell icon).
2. Filter by unread, type, or ticket to narrow the list.
3. Click a notification to jump to the related ticket.
4. Mark-read is optimistic — the UI updates instantly and syncs in the
   background. "Mark all read" clears the whole pane.
5. Open the **Preferences** tab to enable or mute channels per event
   type. You can, for example, keep @mentions in Teams but disable
   assignment emails.

## Delivery channels
- **Email** (Postmark) — default for all events.
- **Microsoft Teams** — sent as an Adaptive Card to the configured
  incoming webhook. Dev mode logs the payload when no webhook is set.
- **In-app (SSE)** — live-pushed via Server-Sent Events and shown as a
  toast plus unread-count badge.

## Common pitfalls
- If you're not getting notifications, check the Preferences tab first —
  a channel may be muted for that event type.
- Admins can inspect failed deliveries and retry them from
  /admin/system-monitoring.

## Related
- /inbox — actionable subset (staff only)
- /admin/system-monitoring — notification queue health (admin)
