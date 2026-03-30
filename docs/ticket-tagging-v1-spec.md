# Ticket tagging (operational labels) — v1 mini-spec & implementation plan

**Status:** Draft for review (no code)  
**Audience:** Product + engineering  
**Scope:** Freeform, shared, lightweight tags on tickets — production-safe v1.

---

### 1. Objective

Add **custom operational tags** to tickets so internal teams can label work with short, human-readable context (e.g. “waiting on quote”, “landlord-related”) **without** replacing categories, status, or taxonomy. Tags are **shared** with everyone who can see the ticket, **fast** to add from the main ticket feed, and **auditable**. **Studio users** may **see** tags but **must not** create them.

---

### 2. Recommended Product Model

- A ticket has **many** tags in v1 (each attachment is one label string).
- Tags are **not** a parallel category system: they do not drive workflows, SLAs, or reporting taxonomies in v1.
- Tags are **public to the ticket audience** (same spirit as non-internal comments): not private notes.
- **v1 lifecycle:** **create-only** — no edit, no delete, no rename. Mistakes are addressed in v2 (or by adding a corrective tag like “superseded — see comment”).
- **Duplicates:** The **same normalized label** must **not** be attached twice to the same ticket (deterministic UX, less noise).
- **Normalization (single definition, system-wide):** Apply exactly one function everywhere (service, tests, any future tooling):  
  `labelNormalized = input.trim().replace(/\s+/g, ' ').toLowerCase()`  
  Use **`labelNormalized`** for deduplication, Tag lookup, and find-or-create. **Do not** introduce alternate normalizers (no separate “display normalize” vs “storage normalize”).
- **Storage vs display (v1):** **`Tag.name` stores `labelNormalized` only** (not the raw input). **UI displays that stored string as-is** (lowercase normalized text) — no title-casing or extra formatting in v1 (deterministic, simplest).

**Bias check:** This matches the stated preferences (many-per-ticket, create-only, shared, no duplicate junk). We **intentionally** do not build a full “every user who could list the ticket” notification fan-out in v1 (see §5) to avoid blast radius and engineering cost; v1 aligns with **comment-like stakeholders** plus a visibility safety filter.

---

### 3. Data Model Recommendation

**Existing schema (already in Prisma):**

- `Tag` — global row per distinct label (`name` **unique**), optional `color` (unused for ad-hoc v1).
- `TicketTag` — composite PK `(ticketId, tagId)`, `createdAt` only today.

**Recommended v1 approach — reuse and extend (minimal new tables):**

1. **`Tag`**
   - Continue to represent the **label string** for the whole product (one row per unique normalized label).
   - **Find-or-create** on add: compute `labelNormalized` via the **exact** function in §2 → lookup by `Tag.name === labelNormalized` → create `Tag` if missing with `name = labelNormalized`, `color = null`.
   - **DB integrity:** **`Tag.name` MUST remain UNIQUE at the database level** (Prisma `@unique` / Postgres UNIQUE on `tags.name`). This is the **authoritative** guard against duplicate global Tag rows under concurrency (not application-only checks).
   - Max length is enforced on **raw `input`** before normalization (see §8); if normalized length still exceeds the cap, reject with **`INVALID_TAG_INPUT`**.

2. **`TicketTag`** — extend with audit fields:
   - Add **`createdByUserId`** (FK → `User`, required on **new** rows; nullable for migration if any historical rows exist — likely none in production).
   - Keep **`createdAt`**.
   - Composite PK `(ticketId, tagId)` already prevents duplicate **same** tag on same ticket.

3. **No separate “freeform shadow table” in v1** unless product later wants labels that must **not** appear in the global `Tag` dictionary. Reusing `Tag` keeps queries simple and enables future “tag autocomplete across tickets” without migration.

**Optional index:** `(ticketId)` on `ticket_tags` if not already present for list hydration.

**Disagreement note:** If marketing later demands “same spelling, different tickets shouldn’t share Tag row,” that would argue for `TicketOperationalTag(ticketId, label, …)` without `Tag`. For v1, **shared `Tag` rows** are a feature (dedupe + future reporting), not a bug.

---

### 4. Authorization / Visibility Rules

**Who can create tags**

- **Allowed:** `ADMIN`, `DEPARTMENT_USER`, and any internal role that today may **comment** on tickets (non–studio, active user) — implement as a **single new capability**, e.g. `ticket.add_tag`, evaluated in **service layer** (not controller).
- **Denied:** `STUDIO_USER` — `403` on `POST` tag endpoints.

**Who can view tags**

- Any user who **can view the ticket** under existing **`TicketVisibilityService`** / policy (`TICKET_VIEW` + list scoping) sees the ticket’s tags on API responses (list + detail).
- Studio users: **read tags** wherever ticket is readable; **never** create.

**Permission derivation**

- **Create:** Role-based (`ticket.add_tag`) **and** must pass the same “can this actor access this ticket?” check used for comment create (load ticket, run visibility / policy). If they cannot view the ticket, they cannot tag it.
- **Read:** Derived entirely from existing ticket visibility — **no** per-tag ACL.

**v1 edit/delete**

- **None.** Tags are immutable after creation.
- **Scope lock (v1):** **No** `PATCH`, `PUT`, or `DELETE` endpoints for tags or tag–ticket links. Implementers must not add mutation routes “for convenience” during build; any change requires a new spec/version.

**Structured errors (API body, alongside HTTP status)**

| Code | HTTP | When |
|------|------|------|
| `INVALID_TAG_INPUT` | 400 | Empty or whitespace-only after trim; failed length/character rules; normalization yields empty |
| `TAG_LIMIT_REACHED` | 400 | Ticket already has **max tags** (see §8); enforced **only** in service layer |
| `TAG_ALREADY_EXISTS_ON_TICKET` | 409 | Same `labelNormalized` already linked to this ticket (`(ticketId, tagId)` conflict) |
| `FORBIDDEN_TAG_CREATION` | 403 | Studio user or actor lacks `ticket.add_tag` / cannot access ticket |
| `TICKET_NOT_FOUND` | 404 | Ticket id does not exist or is not visible to actor (use same semantics as other ticket routes) |

---

### 5. Notification Behavior

**Event**

- New **`NotificationEventType`:** **`TICKET_TAG_ADDED`** — must follow the **existing enum convention** (`TICKET_*`, `COMMENT_ADDED`, past tense / event style); **do not** introduce alternate prefixes or casing.
- Emit via existing **`DomainEventsService.emit`** using the **same** post-commit pattern as **`COMMENT_ADDED`** (no new bus, no parallel worker).

**Mandatory reuse (no duplication)**

- **MUST** extend the existing **`notification-fanout.processor.ts`** (`FANOUT_RULES`, `buildNotificationContent`, recipient resolution, **`recipientIds.delete(actorId)`**, preference lookup, dispatch enqueue).
- **MUST** use the same **SSE** path (**`pushTicketUpdate`**) already used for ticket-related notifications — **no** parallel SSE channel or duplicate “tag notification” system.

**Payload shape (illustrative)**

- `ticketId`, `actorId`, `tagId`, `tagLabel` (**equals stored normalized name**), `ticketTitle` (or resolved in fan-out), `requesterId`, `ownerId` (for rules), timestamps as elsewhere.

**Recipient rule (v1 — pragmatic)**

- **Primary:** Same **stakeholder set** as **`COMMENT_ADDED`**: **requester, owner, watchers** (see `FANOUT_RULES` / comment behavior in `notification-fanout.processor.ts`).
- **Exclude actor:** Keep existing **`recipientIds.delete(actorId)`** so the creator does not get a self-notification.
- **Visibility safety:** For each candidate recipient, run the same **`canUserViewTicket`** (or equivalent) check used for sensitive events, and **drop** recipients who cannot view the ticket — **defense in depth** (handles edge cases where role/watcher data is stale).

**Gap (documented):** Users who can **see** the ticket in a department inbox but are **not** requester, owner, or watcher **will not** receive tag notifications in v1. Expanding to “all viewers” requires a deliberate v2 design (query or denormalized audience). **Product sign-off:** Accept v1 parity with comments, or prioritize v2 fan-out.

**Channels**

- Reuse existing **fan-out → notification record → dispatch** pipeline (email, Teams, in-app) and **preferences** keyed by `eventType` (`TICKET_TAG_ADDED` defaults like other ticket events).
- **SSE:** Same **`pushTicketUpdate`** invocation as today for in-band ticket updates (identical to comment flow).

**Title/body (v1 copy)**

- Example: “Tag added” / `{actorName} added tag “{label}” to “{ticketTitle}”.`

---

### 6. API / Backend Plan

**Endpoints (NestJS, `apps/api`)**

- `POST /api/tickets/:ticketId/tags`  
  - Body: `{ label: string }` (raw user input; server applies §2 normalization + find-or-create `Tag`).  
  - Auth: JWT.  
  - Returns: created junction + tag display fields (or full ticket tag DTO).  
  - Errors: use **structured `code`** values from §4 table with the HTTP statuses listed there.
- **Prohibited (v1):** No `PATCH`, `PUT`, or `DELETE` on `/tags` or tag junction resources.

- **Read path:** Extend existing ticket **list** and **detail** serializers to include `tags: { id, name, createdAt, createdBy?: { id, name } }[]` (shape to match frontend needs; avoid N+1 — use `include` or batch).

**Service ownership**

- **`TicketsService`** or dedicated **`TicketTagsService`** injected into tickets module: **all** authorization, normalization, find-or-create, transaction, audit, and `domainEvents.emit` live here. Controllers stay thin.

**Single Prisma transaction (mandatory)**

- All **database mutations** for one “add tag” operation MUST run inside **one** `prisma.$transaction` callback, so they commit or roll back **together**:
  1. Re-check preconditions inside txn: actor still allowed (or pass checks before txn and rely on stable ticket id).  
  2. **Enforce max tags per ticket** with a **count query inside the same transaction** → if over limit, abort txn and return **400** with **`TAG_LIMIT_REACHED`** (**never** rely on the frontend for this).  
  3. Resolve `Tag`: find by `name = labelNormalized`; if missing, **`create`**; on **`P2002`** (unique on `Tag.name`) from a concurrent creator, **catch, re-query Tag by `name`, continue** (race-safe find-or-create).  
  4. Insert **`TicketTag`** with `createdByUserId`; on unique violation **`(ticketId, tagId)`** → **409** **`TAG_ALREADY_EXISTS_ON_TICKET`**.  
  5. **`auditLog`** persistence (if stored in DB).  
  6. Update **`ticket.updatedAt`** if product matches comment behavior.  
- **After** the transaction **commits successfully**, call **`domainEvents.emit({ type: 'TICKET_TAG_ADDED', ... })`** **once**, mirroring **`comments.service.ts`** (emit after DB work succeeds). Do not enqueue fan-out inside the SQL transaction; **do not** add a second notification pipeline.

**Transaction order (reference)**

1. Open `$transaction`.  
2. Count tags / enforce limit → **`TAG_LIMIT_REACHED`**.  
3. Find-or-create `Tag` with race handling (**`P2002`** → re-fetch).  
4. Insert `TicketTag` → **`TAG_ALREADY_EXISTS_ON_TICKET`** on conflict.  
5. Audit + ticket touch.  
6. Commit → then **`emit(TICKET_TAG_ADDED)`**.

**Prisma migration**

- Add `TICKET_TAG_ADDED` to `NotificationEventType` enum.  
- Add `createdByUserId` to `ticket_tags` (+ FK, index).  
- Backfill: if no rows, all NOT NULL; if rows exist, nullable + backfill script optional.

**Workers**

- **No new queue** and **no parallel notification subsystem**: extend only the existing **notification fan-out** consumer (`FANOUT_RULES`, `buildNotificationContent`, branches on `eventType`).

---

### 7. Frontend / Feed UI Plan (`apps/web`)

**Canonical feed columns**

- Update **`CANONICAL_FEED_HEADERS`** / **`TicketTableRow`** so order is:  
  **ID | Title | Created | Tags | Status | Priority | Progress | Requester | Comments**  
  (Tags **between** Created and Status, per product request.)

- Adjust **`FEED_COLGROUP_WIDTHS`** (and any sibling layouts: inbox, portal if they share the same row component) so the table still fits; slightly narrow Title or Created if needed.

**Tags cell behavior**

- **Display:** Chips or compact pills; label text = **`Tag.name`** (normalized string, displayed as-is per §2).  
- **Overflow:** After **N** tags (e.g. 3) or fixed max width, show “+k more” with **tooltip** or **popover** listing all (avoid row height explosion).  
- **Empty:** Em dash or subtle “—” for no tags.

**Add flow (authorized users only)**

- Default: small **“+”** control (button) visible only if `ticket.add_tag` equivalent on client (derive from `user.role !== 'STUDIO_USER'` and same rules as backend).  
- Click **+** → **inline** text input + **Save** / **Cancel**; stop row click propagation so opening the drawer does not fire.  
- **Save:** optimistic optional (v1 can be pessimistic for simplicity); on success, apply **the same cache strategy as after adding a comment**: invalidate (or update) **ticket feed / list** queries **and** **ticket detail / drawer** queries (e.g. shared React Query keys for `['tickets','list']`, ticket-by-id, and any comment-thread key if the app batches invalidations — **mirror the comment mutation’s `invalidateQueries` / SSE handler path** so tags and comments stay consistent).  
- **SSE:** On **`ticket_update`** events (existing payload), perform the **same client-side invalidation/refetch** already used when comments arrive — **no** separate listener solely for tags.  
- **Loading:** Disable Save during request.  
- **Errors:** Map **`code`** from API (`TAG_ALREADY_EXISTS_ON_TICKET`, `TAG_LIMIT_REACHED`, `INVALID_TAG_INPUT`, `FORBIDDEN_TAG_CREATION`, `TICKET_NOT_FOUND`); toast or inline; **401** via existing API layer.

**Ticket drawer / detail**

- **v1:** **Read-only** tag list in drawer for parity (same data as feed). **Optional:** duplicate “+ add” in drawer in v1 only if cheap; **scope boundary** default is **feed-first** to ship faster (see §9).

**Studio user UI**

- Show tags read-only; **hide** the **+** control entirely.

---

### 8. Validation Rules

| Rule | v1 value |
|------|----------|
| Empty / whitespace-only | After **trim**, length **0** → **400** **`INVALID_TAG_INPUT`** (before normalization is unnecessary if trim-empty). Whitespace-only inputs become empty after trim → same error. |
| Max label length | Measure on **raw `input`** before normalization: **80** chars max; exceed → **400** **`INVALID_TAG_INPUT`**. |
| After normalization | `labelNormalized` must be **non-empty** and ≤ **80** chars; else **400** **`INVALID_TAG_INPUT`**. |
| Normalization | **Exactly** `input.trim().replace(/\s+/g, ' ').toLowerCase()` — **only** this; `Tag.name` = result. |
| Max tags per ticket | **20** (constant). Enforced **in the service layer inside the Prisma transaction** (count query). Exceeded → **400** + **`TAG_LIMIT_REACHED`**. |
| Rate limit | Optional: per-user per-minute cap (reuse global throttling if present). |

---

### 9. Scope Boundaries / Non-Goals

| In v1 | Out of v1 |
|-------|-----------|
| Add tag from feed | Tag management admin screen |
| Many tags per ticket | Tag colors, icons, hierarchies |
| Global `Tag` dictionary via find-or-create | Private / per-user tags |
| Notifications to comment-like stakeholders | Notify every possible ticket viewer |
| Read tags on list + detail | Edit / delete / rename tags |
| Studio read-only | Studio create |
| Audit `createdBy` / `createdAt` | Full tag history table |

---

### 10. Architecture / Module Ownership Recommendation

| Area | Owner |
|------|--------|
| Prisma schema + migration | `apps/api/prisma` |
| Tag create + list hydration | `TicketsModule` or sub-service `TicketTagsService` colocated |
| Policy / capability | `policy/` — new `ticket.add_tag`; wire in `ticket.policy-rules.ts` |
| Domain event + enum | `events/domain-events.service.ts`, Prisma `NotificationEventType` |
| Fan-out + SSE + templates | `workers/processors/notification-fanout.processor.ts`, `notifications/` |
| API routes | `tickets.controller.ts` (nested resource) or `ticket-tags.controller.ts` under same module |
| Shared types | `packages/types` or `apps/web` types mirroring API DTOs |
| Feed UI | `TicketRow.tsx`, `TicketFeedLayout`, pages using `TicketTableRow` |

**Do not** duplicate visibility logic — always delegate to **`TicketVisibilityService`** / existing ticket access checks.

---

### 11. Rollout / Regression Safety

- Ship behind **no feature flag** if scope is small; optional **`TAGS_V1_ENABLED`** env if ops wants kill switch.
- **Database:** Migration is additive (new enum value + column).  
- **API:** List/detail responses gain `tags` array — ensure **backward compatible** for old clients (extra field).  
- **Performance:** Eager-load tags in list query with a **single** joined query or batched load; cap tags per ticket + overflow UI to protect payload size.  
- **Regression:** Run existing ticket list E2E / smoke; verify studio user cannot POST; verify notifications don’t double-fire (idempotency keys include `tagId` + `occurredAt`).

---

### 12. Risks / Tradeoffs

| Risk | Mitigation |
|------|------------|
| Global `Tag` table fills with junk strings | Length limit + later admin “merge tags” v2 |
| Notification noise | Stakeholder-only v1; prefs for `TICKET_TAG_ADDED` |
| Feed column width | Overflow +N, responsive truncation |
| Duplicate “similar” labels (“Vendor”, “vendor ”) | Normalization rules documented; training |
| N+1 on list | Prisma `include` tags with limit or separate batched query by ticket ids |

---

### 13. Acceptance Criteria

1. **ADMIN** / **DEPARTMENT_USER** can add a tag from the feed; tag appears for all viewers of that ticket.  
2. **STUDIO_USER** sees tags but **cannot** add (no +, API **403**).  
3. Duplicate normalized label on same ticket is **rejected** with **`TAG_ALREADY_EXISTS_ON_TICKET`** (409) and clear client copy.  
4. New tag triggers **in-app notification** (and email/Teams per prefs) for **requester, owner, watchers** minus **actor**, with visibility filter applied.  
5. SSE / client refresh path causes ticket list to update without full page reload (same pattern as comments).  
6. Ticket **audit log** records tag addition with actor and label.  
7. No regression: existing columns, sorting, filters, and drawer behavior unchanged aside from new column.  
8. **400/403/404/409** failures return **`code`** values from §4 (`INVALID_TAG_INPUT`, `TAG_LIMIT_REACHED`, etc.).

---

### 14. Verification Plan

1. **Unit:** Normalization + dedupe logic; service rejects studio user; rejects duplicate.  
2. **Integration:** `POST` tag → single DB transaction commits Tag/TicketTag/audit/ticket touch; then domain event fires; fan-out job processed.  
3. **Concurrency:** Two parallel creates of the same **new** global tag both succeed (one wins insert, other hits **`P2002`** and re-queries).  
4. **Fan-out:** Recipient set matches comment rules; actor excluded; inactive users skipped; **only** existing processor path used.  
5. **Manual:** Feed UI — add, cancel, overflow, error states; studio login — read-only; cache refresh matches comments.  
6. **Load smoke:** List 50 tickets with tags — acceptable response time (no N+1).  

---

*End of document.*
