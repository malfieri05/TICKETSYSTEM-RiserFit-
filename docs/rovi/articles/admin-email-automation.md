---
slug: admin-email-automation
title: "Email automation (vendor pipeline, admin)"
feature: "Email automation"
roles: [ADMIN]
primary_routes:
  - /admin/email-automation
related_routes:
  - /admin/knowledge-base
  - /admin/system-monitoring
  - /tickets
synonyms:
  - email automation
  - gmail ingest
  - vendor emails
  - order emails
  - delivery emails
  - assembly trigger
  - review queue
  - vendor pipeline
  - inbound email
  - auto ticket email
summary: "Gmail ingest pipeline that turns vendor order/delivery emails into tickets, with an admin review queue."
---

# Email automation (vendor pipeline, admin)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/email-automation.

## What it does
Email automation is a completely separate pipeline from the Postmark
notification emails Rovi sends. This one goes the other direction:
Rovi connects to a Gmail mailbox, ingests inbound vendor email, parses
order confirmations and delivery notices, and optionally creates or
updates tickets to kick off assembly/install work.

## Pipeline stages
1. **Gmail ingest** — a BullMQ `email-ingest` job polls Gmail via
   OAuth, writes raw inbound emails to `inbound_emails`.
2. **Parsing** — order confirmations become `vendor_order_records` with
   `order_line_items`; delivery notices become `delivery_events`.
3. **Assembly matching** — when configured "assembly trigger items"
   arrive at a studio, Rovi can create a maintenance ticket or update
   an existing one so on-site staff get a ready work queue.
4. **Review queue** — any email Rovi is not confident about lands in
   the admin review queue at /admin/email-automation for manual
   approval or dismissal.

## Steps
1. Open /admin/email-automation.
2. Check the **Review queue** tab — each row is an inbound email that
   needs human judgement (unknown vendor, unparseable order, ambiguous
   studio match). Open a row to approve, edit, or dismiss.
3. Switch to the **Config** tab to manage vendor profiles, address
   normalization rules, and assembly trigger items per studio.
4. Use the **Runs** tab to see ingest job history, with retries and
   failures.

## Common pitfalls
- Email automation emails are NOT the same as notification emails.
  Notification delivery health lives at /admin/system-monitoring.
- A Gmail OAuth refresh token is required — Rovi cannot poll Gmail
  without it. Re-authorize if ingest stops.
- The review queue is the single source of truth for unmatched inbound
  emails; items left there never auto-delete.

## Related
- /admin/system-monitoring — BullMQ job health (all workers)
- /admin/knowledge-base — not the same thing; this is vendor ingest,
  KB is RAG content
- /tickets — the tickets this pipeline creates or updates
