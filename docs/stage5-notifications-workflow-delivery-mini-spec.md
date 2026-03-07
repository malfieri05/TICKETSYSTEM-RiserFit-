# Stage 5: Notifications and Workflow Delivery — Step A Mini-Spec (Planning Only)

**Follows:** [Task Template](task-template.md) Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Engineering Standards](engineering-standards.md). Aligns with “event-driven notifications” and “reliable delivery” from CLAUDE.md §7.

---

## 1. Intent

Implement **reliable workflow notifications** for ticket and subtask events, with emphasis on **“it’s your turn”** when a downstream subtask becomes **READY**. The system must:

- Emit and process the notification events required for workflow (including the new **SUBTASK_BECAME_READY**).
- Notify the **responsible party** when a subtask becomes READY: department-level user(s) for that subtask’s department and/or the subtask’s assigned user.
- Deliver via **in-app** and **email** only in this stage; keep the architecture ready for **Microsoft Teams** later without building Teams integration now.
- Ensure **reliable delivery**: queue/worker, retries with backoff, delivery log, idempotency, no silent failures.
- Support **per-user, per-event-type, per-channel** preferences (schema already supports this; ensure new event type is covered).
- Integrate cleanly with **Stage 4** domain events (workflow initialization, subtask completion, subtask became READY) without changing Stage 1 permissions.

---

## 2. Scope

**In scope**

- **Notification events to support (and ensure wired end-to-end):**
  - **TICKET_CREATED** (existing)
  - **TICKET_ASSIGNED** (existing)
  - **TICKET_STATUS_CHANGED** (existing)
  - **TICKET_RESOLVED** (existing)
  - **SUBTASK_COMPLETED** (existing)
  - **SUBTASK_BECAME_READY** (new) — emitted when a subtask transitions to READY (either at ticket creation for root subtasks, or when `unlockDownstreamIfSatisfied` sets a subtask to READY).
- **Core rule — “it’s your turn”:**
  - When a subtask becomes **READY**, notify:
    - **Department-level users** whose department matches the subtask’s assigned department (via `UserDepartment` / taxonomy department mapping).
    - **Assigned user** if the subtask has an `ownerId`.
  - Deduplicate recipients (one notification per user). Do not notify the actor who caused the unlock (e.g. the user who completed the upstream subtask) if they are also a recipient.
- **Channels for this stage:**
  - **In-app:** create `Notification` record and push via existing SSE channel.
  - **Email:** create `NotificationDelivery` (EMAIL), enqueue dispatch job; existing Postmark path.
  - **Structure for Teams:** keep `DeliveryChannel.TEAMS` and `channelTeams` on preferences; do **not** implement Teams sending or new Teams-specific logic in this stage.
- **Reliability (already partially in place; verify and complete):**
  - Fan-out and dispatch remain **queue/worker** (BullMQ).
  - Retries with backoff on fan-out and dispatch jobs (existing config).
  - **Delivery log:** `NotificationDelivery` with status (PENDING / SENT / FAILED / DEAD_LETTERED), attempt count, timestamps, error message.
  - **Idempotency:** unique `idempotencyKey` per (notification/delivery) so duplicate jobs do not double-send. For email (and future channels), key must include **eventType**, **subtaskId** (when applicable), **userId**, and **channel** to prevent duplicate sends across retries.
  - No silent failures: failed jobs eventually DEAD_LETTERED and visible for admin/monitoring.
- **Notification preferences:**
  - Per user, per event type, per channel (`NotificationPreference`: `eventType`, `channelEmail`, `channelInApp`, `channelTeams`). Schema already exists.
  - Defaults: when no preference row exists for a (userId, eventType), use sensible defaults (e.g. in-app and email on; Teams off). No new preference UI in this stage.
- **Integration with Stage 4:**
  - **TICKET_WORKFLOW_INITIALIZED:** optional; if we emit it when a ticket gets its workflow instantiated, fan-out can treat it as “notify owner” or omit it for now. Not required for “it’s your turn.”
  - **SUBTASK_COMPLETED:** already emitted by `subtasks.service`; no change.
  - **SUBTASK_BECAME_READY:** must be emitted when a subtask’s status is set to READY (in `unlockDownstreamIfSatisfied` after transaction commit, or via a small hook). Payload must include at least: `subtaskId`, `subtaskTitle`, `ticketId`, `departmentId` (for department resolution), `ownerId` (if assigned).
- **readyAt on Subtask:** When a subtask transitions to READY, set `readyAt = now()`. Enables future SLA monitoring and escalation rules. Apply in both: (1) `unlockDownstreamIfSatisfied` when setting status to READY, and (2) ticket create when instantiating workflow subtasks with initial status READY.
- **Fan-out safety limit:** The fan-out processor must enforce a **max recipients limit per event** (e.g. 200). If the computed recipient set exceeds the limit, cap it (e.g. take first 200) and log a warning to prevent runaway notification storms.
- **Idempotency key for notification email:** Use a key that includes **eventType**, **subtaskId** (when applicable; empty string for non-subtask events), **userId**, and **channel** so duplicate sends across retries are prevented. Format example: `{eventType}_{ticketId}_{subtaskId|''}_{userId}_{channel}_{occurredAt}` or similar, ensuring uniqueness per logical “send.”

**Out of scope (explicit)**

- **Full notifications UI** (e.g. inbox, preference toggles in UI). Only backend events, fan-out, delivery, and existing minimal in-app list/read APIs.
- **Microsoft Teams integration** (sending to Teams). Only keep schema and structure ready.
- **Changes to Stage 1 permissions** (RBAC, visibility). Notification recipient resolution is additive (department membership, subtask owner); no change to who can see tickets or perform actions.
- **New queues or queue topology.** Use existing `notification-fanout` and `notification-dispatch` (and dead-letter) only.

---

## 3. Files to Change

| Area | File(s) | Change |
|------|---------|--------|
| **Prisma schema** | `apps/api/prisma/schema.prisma` | Add `SUBTASK_BECAME_READY` to enum `NotificationEventType`. Add `readyAt DateTime?` on `Subtask`. Migration. |
| **Domain event types** | `apps/api/src/modules/events/domain-event.types.ts` | Add `SubtaskBecameReadyPayload` and extend `DomainEventPayload` union; ensure `DomainEvent.type` can be `SUBTASK_BECAME_READY`. |
| **Domain events service** | `apps/api/src/modules/events/domain-events.service.ts` | No change (already accepts any `NotificationEventType` and enqueues by type). |
| **Subtask workflow service** | `apps/api/src/modules/subtask-workflow/subtask-workflow.service.ts` | In `unlockDownstreamIfSatisfied`, when setting a subtask to READY, also set `readyAt: new Date()`. Optionally return IDs of subtasks that became READY so caller can emit events. |
| **Subtask service** | `apps/api/src/modules/subtasks/subtasks.service.ts` | After the transaction that calls `unlockDownstreamIfSatisfied`, determine which subtask(s) were set to READY (e.g. return from workflow service or query). For each, emit `SUBTASK_BECAME_READY` via `DomainEventsService` with payload: subtaskId, subtaskTitle, ticketId, departmentId, ownerId. |
| **Ticket create (workflow instantiation)** | `apps/api/src/modules/tickets/tickets.service.ts` | After instantiating workflow subtasks, for each subtask created with status READY, emit `SUBTASK_BECAME_READY` (same payload shape) so “it’s your turn” fires for initial READY subtasks as well. |
| **Fan-out processor** | `apps/api/src/workers/processors/notification-fanout.processor.ts` | Add `SUBTASK_BECAME_READY` to `FANOUT_RULES`: recipients = `departmentUsers` + `subtaskOwner`. Implement `departmentUsers` (see above). Enforce **max recipients per event** (e.g. 200): if recipient set exceeds limit, cap and log warning. Build **idempotency key** for each delivery as `{eventType}_{ticketId}_{subtaskId|''}_{userId}_{channel}_{occurredAt}`. Add `buildNotificationContent` for SUBTASK_BECAME_READY. |
| **Dispatch processor / channels** | `apps/api/src/workers/processors/notification-dispatch.processor.ts`, `apps/api/src/modules/notifications/channels/email.channel.ts` | No change required for new event type (dispatch is notification-agnostic). Verify idempotency key usage for email. |
| **Notifications service** | `apps/api/src/modules/notifications/notifications.service.ts` | No change; `createAndDeliver` already accepts eventType and metadata. |
| **Queue constants** | `apps/api/src/common/queue/queue.constants.ts` | No change unless job options need tuning for new event type. |
| **Seed / defaults** | Optional: `apps/api/prisma/seed.ts` or migration | Optional: seed default `NotificationPreference` rows for `SUBTASK_BECAME_READY` (e.g. channelInApp true, channelEmail true) for existing users if desired; or rely on “no row = default” in fan-out. |

**Not changed**

- Stage 1 permission or visibility logic.
- Teams channel implementation (only schema/structure remains).
- Full notifications or inbox UI.
- Event emission for other existing events (only add SUBTASK_BECAME_READY and wire ticket-create READY subtasks).

---

## 4. Schema impact

- **Enum:** `NotificationEventType` — add one value: **SUBTASK_BECAME_READY**. Requires a Prisma migration (add enum value).
- **Subtask table:** Add nullable **readyAt** (DateTime). Set when status transitions to READY (workflow unlock or ticket create). Enables future SLA and escalation.
- **Tables:** No other new tables. `NotificationPreference` already keyed by `(userId, eventType)`; new event type will use same table with default behavior when no row exists.
- **Notification / NotificationDelivery:** No schema change; existing columns support any event type and channel.

---

## 5. Risks

- **Department resolution:** Mapping from `Subtask.departmentId` (TaxonomyDepartment) to “users in that department” must align with how `UserDepartment` stores department (e.g. enum `Department` vs taxonomy `code`). Need a consistent mapping (e.g. TaxonomyDepartment.code to role/department used in UserDepartment) so department-level users are correctly identified. **Mitigation:** Document the mapping; add a unit or integration test that asserts “subtask with department X notifies users in department X.”
- **Emit after transaction:** Emitting `SUBTASK_BECAME_READY` must happen **after** the transaction that sets the subtask to READY commits, so the fan-out job sees committed data. Emit from `subtasks.service` after `$transaction` completes, or from a small post-commit hook. **Mitigation:** No emit inside the same transaction; keep domain event emit after transaction success.
- **Initial READY at ticket create:** When creating a ticket with a workflow, multiple subtasks may be READY initially. Emitting one `SUBTASK_BECAME_READY` per such subtask could cause a burst of notifications. **Mitigation:** Acceptable for Stage 5; optional future: batch or “workflow started” single notification. Out of scope for this mini-spec.
- **Idempotency for SUBTASK_BECAME_READY:** Same (ticketId, subtaskId, user, channel) could theoretically be enqueued twice if retries or duplicate events occur. **Mitigation:** Idempotency key for email delivery must include event type + ticket + subtask + user + timestamp or similar so duplicate events do not double-send.

---

## 6. Test plan

- **Unit / integration:**
  - **Fan-out rule for SUBTASK_BECAME_READY:** Given a payload with `subtaskId`, `departmentId`, `ownerId`, assert that the fan-out processor adds to recipients: (1) users in that department (via UserDepartment/taxonomy), and (2) the assigned user if `ownerId` is set. Assert actor is excluded. Assert preference check (channelInApp, channelEmail) is applied for the new event type.
  - **Notification content:** For SUBTASK_BECAME_READY, assert `buildNotificationContent` returns a title/body that includes “your turn” or equivalent and subtask/ticket context.
  - **Emit from subtasks.service:** After a status update that causes `unlockDownstreamIfSatisfied` to set a subtask to READY, assert that `DomainEventsService.emit` is called once (or N times for N newly READY subtasks) with type `SUBTASK_BECAME_READY` and payload containing subtaskId, ticketId, departmentId, ownerId.
  - **Emit at ticket create:** When creating a ticket with a workflow that has root subtasks (READY), assert that `SUBTASK_BECAME_READY` is emitted for each such subtask.
- **E2E (optional but recommended):**
  - Create a workflow (A → B), create a ticket, complete A; assert that the user(s) who should be notified for B (department or assignee) receive an in-app notification (and optionally email) for SUBTASK_BECAME_READY.
- **Regression:**
  - Existing notification tests (e.g. SUBTASK_COMPLETED, TICKET_ASSIGNED) still pass; no change to their fan-out or delivery paths.
  - Permission tests unchanged; no new permission logic.

---

**Summary:** This mini-spec adds **SUBTASK_BECAME_READY** and wires “it’s your turn” notifications through the existing queue-based pipeline, with in-app and email only, preferences respected, and no Teams implementation or full notifications UI. Schema: one enum value + `readyAt` on Subtask; all other changes in event emission and fan-out rules.

---

## Step B — Implementation summary (completed)

- **Prisma:** Added `SUBTASK_BECAME_READY` to `NotificationEventType`; added `readyAt DateTime?` on `Subtask`. Migration: `20260307200000_stage5_notifications_readyat`.
- **Domain events:** Added `SubtaskBecameReadyPayload` and extended `DomainEventPayload` in `domain-event.types.ts`.
- **Subtask workflow:** `unlockDownstreamIfSatisfied` sets `readyAt: now` when setting status to READY and returns `string[]` of subtask IDs that became READY. `instantiateForTicket` sets `readyAt` for initially READY subtasks.
- **Subtasks service:** After the update transaction, emits `SUBTASK_BECAME_READY` for each ID returned from `unlockDownstreamIfSatisfied`.
- **Tickets service:** After ticket create, queries READY subtasks and emits `SUBTASK_BECAME_READY` for each.
- **Fan-out processor:** Added `SUBTASK_BECAME_READY` (departmentUsers + subtaskOwner); max 200 recipients per event; idempotency key `{eventType}_{ticketId}_{subtaskId|''}_{userId}_EMAIL_{occurredAt}`; "It's your turn" content.
- **Tests:** `unlockDownstreamIfSatisfied` return + readyAt; ticket create emits SUBTASK_BECAME_READY for initial READY subtasks.
