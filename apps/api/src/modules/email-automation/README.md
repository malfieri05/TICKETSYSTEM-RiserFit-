# Email Automation (Assembly Ticket from Delivery Emails)

This module is the first implementation of a broader **email-triggered operational automation engine**. Future triggers may include shipment delays, vendor invoices, equipment failures, and inventory arrival.

## What it does

- **Ingests** vendor order-related emails from a designated Gmail inbox (rolling time window, dedupe by `messageId`).
- **Classifies** each email as ORDER_CONFIRMATION, DELIVERY_CONFIRMATION, or OTHER (base parser + optional vendor adapters).
- **Order path:** Extracts order number, address, line items; creates `vendor_order_records` or sends to review (LOW_CONFIDENCE).
- **Delivery path:** Links delivery confirmations to orders; matches line items against an admin-configurable assembly-trigger list; resolves address to a studio.
- **Ticket creation:** When delivery matches an order, assembly trigger, and a single studio, creates one MAINTENANCE "Assembly needed" ticket with metadata. Idempotency and lock (orderNumber + vendor) prevent duplicates.
- **Review queue:** PENDING_ORDER_MATCH (delivery before order), NO_STUDIO_MATCH, LOW_CONFIDENCE, AMBIGUOUS_ADDRESS, TICKET_CREATE_FAILED, etc. Auto-resolution runs when a matching order is later ingested.

## Config (Admin)

- **Gmail:** `GMAIL_CREDENTIALS_JSON` or `GMAIL_CREDENTIALS_PATH`; optional `GMAIL_DELEGATED_USER` for domain-wide delegation.
- **Admin UI:** Config (label, poll window, assembly category, system requester, confidence thresholds, isEnabled), assembly trigger list (match mode), normalized addresses (refresh from studios), review queue, inbound emails (list/detail/reprocess), event log, **Email Pattern Playground** (paste raw email, preview classification + extraction + assembly/studio match).

## Runbook

- **Ingest not running:** Ensure `isEnabled` is true in config; check Gmail credentials env vars; confirm worker process is running and EMAIL_INGEST queue is registered; check logs for "Gmail credentials not configured" or API errors.
- **Review queue growing:** Normal for PENDING_ORDER_MATCH until order emails arrive; for other reasons, check assembly trigger list and normalized addresses (refresh); use Playground to test parsing.
- **Lock stuck:** Locks expire after 5 minutes and are purged on each ingest run; if a process crashed while holding a lock, the next run will delete expired rows and allow ticket creation to retry.

## Key files

- `services/gmail-ingest.service.ts` — Poll Gmail, store raw emails.
- `services/email-classifier.service.ts` — Classification by rules + adapters.
- `services/order-extractor.service.ts` / `delivery-extractor.service.ts` — Extraction with confidence scores.
- `services/email-automation-orchestrator.service.ts` — Order and delivery paths; auto-resolution.
- `services/assembly-trigger.service.ts` / `address-matching.service.ts` — Assembly list and studio resolution.
- `services/automation-lock.service.ts` — Lock by (orderNumber + vendor); purge expired.
- `services/assembly-ticket-create.service.ts` — Create ticket and set delivery status.
