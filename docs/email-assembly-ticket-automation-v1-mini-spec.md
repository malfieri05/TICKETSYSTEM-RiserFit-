# Email-Triggered Assembly Ticket Automation (V1) — Mini-Spec

*Refined for robustness, observability, and extensibility. This feature is the first implementation of a broader **email-triggered operational automation engine**; future triggers may include shipment delays, vendor invoices, equipment failures, onboarding emails, and inventory arrival. The architecture remains modular so additional automation workflows can be added later.*

---

## 1. Feature goal

Automatically create a single, consistent maintenance ticket (“Assembly needed”) when a **delivery confirmation** email indicates that an **assembly-required** item has been delivered to a known studio location. The system must (a) ingest and classify vendor order-related emails from a designated Gmail inbox, (b) link delivery confirmations to prior order confirmations by order number, (c) match delivered items against an admin-configurable assembly-trigger list, (d) resolve the delivery address to a studio, and (e) create the ticket—or send the case to the **manual review queue** only when there is actual uncertainty (no order match, no studio match, low-confidence extraction, ambiguous address, or ticket creation failure). Non-assembly deliveries are logged and marked complete; they do not go to review.

---

## 2. User / business outcome

- **Operations / facilities:** Assembly work is triggered as soon as delivery is confirmed, without manual monitoring of email or creation of tickets.
- **Consistency:** Every qualifying delivery produces one “Assembly needed” maintenance ticket with location, item, vendor, and order number in the description.
- **Traceability:** Every automation decision is logged; raw emails and delivery events are stored for audit and debugging.
- **Safety:** No tickets for non-assembly deliveries; only true uncertainties go to review so the queue stays actionable.

---

## 3. Scope for V1

- **Inbox:** Single Gmail mailbox (service account or delegated). New messages identified by **rolling time window** + **dedupe by `messageId`** (not by “unread”).
- **Email types:** ORDER_CONFIRMATION, DELIVERY_CONFIRMATION, OTHER. Only the first two drive the pipeline.
- **Vendor identification:** Store **vendor domain** (e.g. amazon.com, petra.com, a1american.com) on order/delivery records; **vendor adapters** use the email From/domain to select parsing logic.
- **Order vs delivery state:** Orders and deliveries are tracked separately. Order state: **ORDER_CONFIRMED** (and optionally REVIEW_REQUIRED). Delivery state lives on **delivery_events**: **DELIVERY_RECORDED** → **ASSEMBLY_TRIGGERED** or review. This avoids conflating order lifecycle with delivery lifecycle.
- **Assembly trigger:** Admin list with **match mode** (substring vs exact/fuzzy alias). **Parser confidence scores** (order number, address, items) drive routing: low confidence → review.
- **Concurrency:** **Automation lock** keyed by (orderNumber + vendor) prevents duplicate ticket creation when the job runs in parallel.
- **Ticket:** MAINTENANCE “Assembly” category; metadata **source=email_automation**, **source_order_number=...**. Idempotency via lock + stored reference on ticket.
- **Review queue:** Reasons include **PENDING_ORDER_MATCH** (delivery arrived before order; system will auto-resolve when order is ingested), NO_STUDIO_MATCH, LOW_CONFIDENCE, AMBIGUOUS_ADDRESS, TICKET_CREATE_FAILED, OTHER.
- **Admin tooling:** **Email Pattern Playground** for pasting a raw email and seeing classification, extracted fields, assembly match, and studio match to speed up parser and adapter development.

---

## 4. Explicit non-goals for V1

- Outlook / Microsoft 365; OCR/image parsing; multiple ticket types; real-time push (V1 uses polling); editing tickets from email; user-facing inbox UI. Future automation triggers (invoices, delays, etc.) are out of scope for V1 but the architecture should accommodate them.

---

## 5. End-to-end workflow / event flow

1. **Ingest:** Poll Gmail by **rolling time window** (e.g. last N hours). **Dedupe by `messageId`** in DB; do not rely on “unread.” Store raw email; optionally `historyId`.
2. **Classify:** Base rules + regex + **vendor adapters** (selected by **vendor domain** from From address). Output: ORDER_CONFIRMATION | DELIVERY_CONFIRMATION | OTHER. Low classification confidence → OTHER, optionally review.
3. **Order confirmation path:** Extract vendor, **vendor domain**, order number, shipping address, line items. Extraction returns **confidence scores** (orderNumberConfidence, addressConfidence, itemConfidence). If any key score is below threshold → create review item (LOW_CONFIDENCE) and do not create order. Otherwise: normalise address; create **vendor_order_records** with state **ORDER_CONFIRMED** and **order_line_items**. Then **auto-resolution:** find any review items with reason **PENDING_ORDER_MATCH** and order number matching this order; for each, re-run delivery pipeline (match order, assembly, studio, create ticket or re-queue).
4. **Delivery confirmation path:** Extract order number, vendor domain; confidence scores. Low confidence → review (LOW_CONFIDENCE). Look up order by (orderNumber, vendor).
   - **No order match:** Create **delivery_events** row (no orderId yet) and a **review item** with reason **PENDING_ORDER_MATCH**. When an order confirmation for this order number is later ingested, the system will attempt auto-resolution (see step 3). This ensures out-of-order emails are not lost.
   - **Order found:** Create or update **delivery_events** with orderId, **deliveryTimestamp**, **deliverySource**, **deliveryStatus** = DELIVERY_RECORDED. Check line items against assembly-trigger list (matchMode).
     - **No assembly match:** Log event; set delivery_events.deliveryStatus to COMPLETE (or similar). Do **not** send to review.
     - **Assembly match:** Acquire **automation lock** (orderNumber + vendor). If lock held by another run, skip and log. Otherwise: resolve address to studio via normalized table. No match or ambiguous → review (NO_STUDIO_MATCH / AMBIGUOUS_ADDRESS). Match → create ticket (source=email_automation, source_order_number), idempotency check, then set delivery_events.deliveryStatus = ASSEMBLY_TRIGGERED, release lock. On ticket create failure → review (TICKET_CREATE_FAILED), release lock.
5. **Reprocess email:** Admin triggers reprocess of a stored email; pipeline re-runs for that email (classification, extraction, order or delivery path). Essential for testing and parser iteration.

---

## 6. Required data model changes

### 6.1 Raw email store

- **`inbound_emails`:** id, `messageId` (Gmail id, unique), `threadId`, `historyId` (optional), subject, fromAddress, receivedAt, bodyPlain, bodyHtml (optional), raw reference if stored externally, classification, classificationConfidence, processedAt, createdAt. Index: messageId (unique), receivedAt, processedAt.

### 6.2 Order records

- **`vendor_order_records`:** id, `orderNumber`, `vendorIdentifier`, **`vendorDomain`** (e.g. amazon.com, petra.com; used by adapters to select parsing logic), `shippingAddressRaw`, `shippingAddressNormalized`, `emailId` (FK), **`state`** enum: **ORDER_CONFIRMED | REVIEW_REQUIRED**, updatedAt, createdAt. Index: (orderNumber, vendorIdentifier), state.
- **`order_line_items`:** id, `orderId` (FK), `itemName`, `quantity`, sortOrder, createdAt. Enables per-line assembly matching and clear audit of which item triggered automation.

### 6.3 Delivery events (new)

- **`delivery_events`:** id, **`orderId`** (FK, nullable when PENDING_ORDER_MATCH), **`emailId`** (FK), **`deliveryTimestamp`** (from email or parsed date), **`deliverySource`** (e.g. carrier or “email”), **`deliveryStatus`** enum: **DELIVERY_RECORDED | ASSEMBLY_TRIGGERED | COMPLETE_NO_ASSEMBLY | REVIEW_REQUIRED**, createdAt, updatedAt. Tracks delivery confirmations independently from order lifecycle. One delivery event per delivery email; when order is missing, orderId is null until auto-resolution or manual link. Index: orderId, emailId, deliveryStatus.

### 6.4 Normalized studio addresses

- **`studio_address_normalized`:** id, `studioId` (FK), `normalizedAddress` (Street→St, lowercase, punctuation stripped, state abbreviations, suite/unit consistent), createdAt. Populated from Studio.formattedAddress. Matching uses this table only.

### 6.5 Assembly-trigger list

- **`assembly_trigger_items`:** id, `keywordOrPhrase`, `displayName` (optional), **`matchMode`**: SUBSTRING | EXACT_OR_FUZZY_ALIAS, isActive, sortOrder, createdAt, updatedAt.

### 6.6 Extraction confidence and review queue

- **Extraction output:** Extractor services return structured data plus **orderNumberConfidence**, **addressConfidence**, **itemConfidence** (e.g. 0–1). Threshold in config; below threshold → do not create order or delivery record; create review item with reason LOW_CONFIDENCE and attach extracted payload for manual correction or reprocess.
- **`email_automation_review_items`:** id, emailId, orderId (nullable), deliveryEventId (nullable), **reason** enum: **PENDING_ORDER_MATCH | NO_STUDIO_MATCH | LOW_CONFIDENCE | AMBIGUOUS_ADDRESS | TICKET_CREATE_FAILED | OTHER**, extractedPayload (JSON; include confidence scores), status (PENDING | RESOLVED | DISMISSED), resolvedAt, resolvedBy, createdAt, updatedAt. **PENDING_ORDER_MATCH** is used when a delivery email arrives before the order confirmation; auto-resolution runs when the matching order is later stored.

### 6.7 Automation events, idempotency, and lock

- **`email_automation_events`:** eventType, emailId, orderId, deliveryEventId (nullable), payload, createdAt.
- **`email_automation_ticket_created`:** orderNumber, vendorIdentifier, ticketId, createdAt. Unique on (orderNumber, vendorIdentifier) for idempotency.
- **Ticket metadata:** On created ticket, store **source=email_automation**, **source_order_number=...** (formResponse or tag).
- **Automation lock:** A simple lock keyed by **(orderNumber + vendor)** (e.g. row in a small `email_automation_locks` table or Redis key with TTL). Acquire before attempting ticket create for that order; release after create or on failure. Prevents duplicate ticket creation when the cron runs overlapping or multiple workers process the same order.

---

## 7. Recommended services / modules / architecture

- **Placement:** Module inside existing NestJS app: **`email-automation/`**. Structure supports future automation triggers (e.g. invoice handler, delay detector) as additional flows within the same module or sibling modules.
- **Vendor adapter directory:** Vendor-specific parsing lives in a dedicated directory so the base parser stays generic and adapters override only when needed.
  - **Example structure:**
    ```
    email-automation/
      adapters/
        base.parser.ts       # common patterns, regex, fallbacks
        amazon.adapter.ts
        petra.adapter.ts
        a1.adapter.ts
      services/
        gmail-ingest.service.ts
        email-classifier.service.ts
        order-extractor.service.ts   # selects adapter by vendorDomain
        delivery-extractor.service.ts
        ...
    ```
  - **Adapter selection:** From the inbound email, derive **vendor domain** (e.g. from From address: user@amazon.com → amazon.com). The extractor (order or delivery) looks up an adapter registered for that domain; if found, use it; otherwise use the base parser. Adapters implement a common interface (e.g. extractOrder, extractDelivery) and return structured data plus **confidence scores**.
- **Submodules:** GmailIngestService, EmailClassifierService, OrderExtractorService (base + **adapters/**), DeliveryExtractorService (base + adapters), AssemblyTriggerService, AddressMatchingService, **DeliveryEventService** (create/update delivery_events, status transitions), **AutomationLockService** (acquire/release by orderNumber+vendor), EmailAutomationOrchestrator, ReprocessEmailService.
- **Ticket creation:** Reuse TicketsService.create; system requester; metadata source=email_automation, source_order_number. Called only after lock acquired and idempotency check.

---

## 8. Parsing and matching strategy

- **Classification:** Rules + regex + **vendor adapters** (selected by **vendor domain**). Each adapter can contribute classification hints. Confidence threshold; below → OTHER and optionally review.
- **Order number / address / line items:** **Base parser** handles common patterns; **vendor adapters** override for known domains (amazon.com, petra.com, a1american.com, etc.). Return **orderNumberConfidence**, **addressConfidence**, **itemConfidence**. Low score → review (LOW_CONFIDENCE) with payload; do not create order.
- **Assembly match:** Per line item, evaluate against assembly_trigger_items using matchMode (SUBSTRING vs EXACT_OR_FUZZY_ALIAS). Log which rule and line item triggered.
- **Studio match:** Normalise address; compare to studio_address_normalized only. Single clear match → use; zero or multiple → review.

---

## 9. Admin configuration needs

- Gmail connection (label, poll time window); assembly category; system requester; **confidence thresholds** (e.g. min orderNumberConfidence, addressConfidence, itemConfidence to avoid review).
- Assembly-trigger list: CRUD + match mode.
- Normalized studio addresses: build/refresh from Studio.formattedAddress.
- Review queue: List by reason (include **PENDING_ORDER_MATCH**); resolve/dismiss; reprocess email from list or detail.
- **Email Pattern Playground:** See §14.

---

## 10. Failure cases / edge cases

- **Delivery before order (out-of-order):** Delivery email arrives, no order found → create **delivery_events** (orderId null), create review item with reason **PENDING_ORDER_MATCH**. When order confirmation for that order number is later ingested, **auto-resolution** runs: find PENDING_ORDER_MATCH items for this order number, re-run delivery logic (match order, assembly, studio, ticket create). System does not lose the event.
- **Low-confidence extraction:** Any key confidence below threshold → review (LOW_CONFIDENCE); do not create order or delivery record until resolved or reprocessed.
- **Item does not match assembly list:** Log; set delivery_events.deliveryStatus = COMPLETE_NO_ASSEMBLY. Do not send to review.
- **Duplicate emails:** Dedupe by messageId; process once; reprocess is explicit admin action.
- **Parallel job runs:** **Automation lock** (orderNumber + vendor) ensures only one ticket create per order; duplicate attempts skip and log.
- **Ticket create fails:** Review (TICKET_CREATE_FAILED); release lock; store payload for manual create.

---

## 11. Idempotency / duplicate-prevention strategy

- **Per email:** One row per messageId; process once; reprocess is explicit.
- **Per order:** One canonical vendor_order_records per (orderNumber, vendor). State ORDER_CONFIRMED or REVIEW_REQUIRED.
- **Per delivery:** One **delivery_events** row per delivery email; status transitions DELIVERY_RECORDED → ASSEMBLY_TRIGGERED or COMPLETE_NO_ASSEMBLY or REVIEW_REQUIRED.
- **Per ticket create:** **Automation lock** (orderNumber + vendor) + check `email_automation_ticket_created` (and/or ticket with source_order_number). If already created, skip and log; release lock.
- **Ticket payload:** source=email_automation, source_order_number=... on ticket for visibility.

---

## 12. Security considerations

- Gmail credentials encrypted; admin-only config, review queue, and Playground; PII in raw emails—restrict access and retention; rate limits for Gmail API. Automation lock scope is per (orderNumber, vendor) and short-lived to avoid abuse.

---

## 13. Suggested API endpoints / internal boundaries

- **Internal:** Orchestrator and services; no public “process email” API. Lock service and delivery event service used only internally.
- **Admin:** config, assembly-items (CRUD + matchMode), normalized-addresses (list/refresh), review-queue (list, resolve, dismiss), emails (list, detail, reprocess), **email-pattern-playground** (POST: body = raw email text; response = classification + extracted fields + assembly match + studio match), events (list).
- **Cron/Job:** Ingest + process (time window, dedupe by messageId).

---

## 14. UI surfaces needed in admin

- **Email Automation** section: **Config**, **Assembly trigger list** (match mode), **Normalized addresses** (view/refresh), **Review queue** (filter by reason, including PENDING_ORDER_MATCH), **Event log**, **Inbound emails** (list + detail + **Reprocess**).
- **Email Pattern Playground:** A small admin tool that allows admins or developers to **paste a raw email** (subject + body) and run the pipeline in “dry run” or preview mode. The UI shows:
  - **Classification result** (ORDER_CONFIRMATION | DELIVERY_CONFIRMATION | OTHER) and confidence
  - **Extracted order number** and orderNumberConfidence
  - **Extracted address** and addressConfidence
  - **Extracted line items** and itemConfidence
  - **Assembly-trigger match** (which rules matched, which line items)
  - **Studio match** (which studio, if any, the address resolved to)
  This dramatically speeds up parser iteration and vendor adapter development without reprocessing live emails or waiting for cron runs.

---

## 15. Acceptance criteria

- When a delivery email matches an order, item matches assembly list (matchMode), and address resolves to one studio → one MAINTENANCE “Assembly needed” ticket is created with studio, description (vendor, order number, item), and metadata **source=email_automation**, **source_order_number=...**. A **delivery_events** row exists with deliveryStatus = ASSEMBLY_TRIGGERED. No duplicate ticket for same order (enforced by lock + idempotency check).
- If item does not match assembly list: log; delivery_events.deliveryStatus = COMPLETE_NO_ASSEMBLY; do not send to review.
- Review queue reasons include **PENDING_ORDER_MATCH** (delivery before order); when order is later ingested, system attempts auto-resolution.
- Low-confidence extraction (order number, address, or items below threshold) → review (LOW_CONFIDENCE); no order or delivery record created until resolved.
- Order state: ORDER_CONFIRMED (or REVIEW_REQUIRED). Delivery state on **delivery_events**: DELIVERY_RECORDED → ASSEMBLY_TRIGGERED | COMPLETE_NO_ASSEMBLY | REVIEW_REQUIRED.
- New messages: rolling time window + dedupe by messageId (not “unread”).
- Admin can reprocess a stored email and use **Email Pattern Playground** to test parsing without affecting live data.
- **Automation lock** (orderNumber + vendor) prevents duplicate ticket creation during parallel job execution.
- Raw emails, delivery_events, and automation events are stored and queryable. Vendor domain is stored and used for adapter selection.

---

## 16. Recommended phased implementation plan

- **Phase 1 — Data model:** inbound_emails (messageId, historyId), vendor_order_records (state, **vendorDomain**), order_line_items, **delivery_events** (orderId, emailId, deliveryTimestamp, deliverySource, deliveryStatus), studio_address_normalized, assembly_trigger_items (matchMode), email_automation_review_items (reasons including **PENDING_ORDER_MATCH**), email_automation_events, email_automation_ticket_created, **email_automation_locks** (or equivalent for lock). Config: category, requester, poll window, **confidence thresholds**.
- **Phase 2 — Gmail ingest:** Poll by time window, dedupe by messageId, store raw.
- **Phase 3 — Classifier and extractors:** Base parser + **adapters/** directory; **vendor domain** extraction and adapter selection; **confidence scores** on extraction output; LOW_CONFIDENCE routing to review. Order path → ORDER_CONFIRMED + **auto-resolution** for PENDING_ORDER_MATCH. Delivery path → **delivery_events** (DELIVERY_RECORDED) and assembly/studio/ticket flow.
- **Phase 4 — Assembly list and studio matching:** AssemblyTriggerService (matchMode); normalized addresses; AddressMatchingService.
- **Phase 5 — Ticket creation and lock:** AutomationLockService (orderNumber + vendor); acquire before create, release after; idempotency check; set delivery_events.deliveryStatus = ASSEMBLY_TRIGGERED; on failure → REVIEW_REQUIRED, release lock.
- **Phase 6 — Pending-order-match and auto-resolution:** When order is stored, find review items with PENDING_ORDER_MATCH and matching order number; re-run delivery pipeline for those; create/link delivery_events and clear or resolve review items.
- **Phase 7 — Admin UI:** Config, assembly list, normalized addresses, review queue (with PENDING_ORDER_MATCH), reprocess, event log, **Email Pattern Playground** (paste raw email, show classification + extracted fields + assembly match + studio match).
- **Phase 8 — Hardening:** Error handling, retries, alerts, docs. Document that this module is the first of a broader email-triggered automation engine.

---

## 17. Risks / unknowns / open questions

- Dependency on normalized address quality and refresh process. Vendor adapter coverage (start with one or two domains; add adapters per vendor). Confidence thresholds may need tuning per vendor. Lock TTL or cleanup to avoid stuck locks if process crashes. Future automation triggers (invoices, delays, etc.) will reuse ingest and classifier but add new event types and actions; keeping adapters and pipeline modular is important.
