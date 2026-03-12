# Stage 1: Role Visibility and Feed Correctness — Mini-Spec

## 1. Intent

Establish **correct role-based visibility and consistent ticket feed behavior** across the application. This stage focuses on **system correctness and user trust**, not UI polish. Before improving UI or adding new features, we must ensure that:

- Users see the correct tickets based on permissions.
- Feeds behave consistently across roles and entry points.
- Ticket lifecycle states are correctly represented.
- Ticket identification and search are reliable.

---

## 2. Terminology (used consistently in this spec)

- **NEW** — Ticket state: initial state after create; no subtask activity yet.
- **IN_PROGRESS** — Ticket state: work has started; at least one subtask has been started or completed.
- **COMPLETED** — Product term for “work complete.” Stored in the database as **RESOLVED**. In this spec, “completed” (lowercase) in narrative and “COMPLETED” when referring to the conceptual state mean the ticket is resolved (and possibly later CLOSED).
- **Actionable ticket** — A ticket that is actionable for a user under the definition in §9.1: the user has at least one incomplete subtask assigned to them, or the ticket belongs to a department the user is responsible for and contains an incomplete subtask for that department. Used consistently for the Actionable tab and for any API filter `actionableForMe`.
- **Canonical ticket feed** — The single backend feed contract used for all ticket list entry points: Admin Home, Department Home, Studio Home (where a feed is shown), and Actionable. Same endpoint, visibility, deterministic sort, status filter, and pagination; only filter parameters (e.g. `actionableForMe`, folder) differ. See §7.1.

---

## 3. Problem Statement

Today, ticket visibility, feed behavior, and lifecycle semantics are partially implemented and inconsistent:

- **Visibility** must be enforced **server-side** in API queries; client-side filtering alone is not acceptable because it can expose unauthorized data in network responses. Current implementation uses `TicketVisibilityService` at the API layer but is based on **owner’s team** (legacy Team.name) rather than the ticket’s **taxonomy department** (`departmentId`). Visibility should align with admin-configured taxonomy (e.g. SUPPORT → departmentId + supportTopicId).
- **Feeds** differ by route: Admin/Department use `/dashboard` (my-summary + ticket list with client-side open/done grouping); Portal uses `/portal` with tabs (my, studio, dashboard) and separate list queries; Inbox uses `actionableForMe`; Tickets page uses a different filter set and client-side department filter. Sorting, pagination, and “active vs completed” treatment are not canonical.
- **Studio dashboard** (Portal “dashboard” tab) mixes a small **ticket feed** (recent tickets) with stat cards, so it behaves like a feed instead of a clear **data dashboard** (aggregates, trends, at-a-glance metrics).
- **Actionable** tab uses a dedicated query (`actionableForMe=true`) but may not share the same list structure, sorting, or visual treatment as the Home feed.
- **Ticket ID** is the Prisma `id` (CUID); it is not consistently surfaced in list rows or panel headers, and **search by ID** is not defined (search is currently title/description only).
- **Lifecycle** terms (e.g. “completed”) are used informally; the actual states are NEW, TRIAGED, IN_PROGRESS, WAITING_ON_*, RESOLVED, CLOSED. When a ticket becomes RESOLVED/CLOSED and how it leaves “active” feeds needs a single, clear definition.

---

## 4. Current System Issues

| Area | Current Issue |
|------|----------------|
| **Department visibility** | Visibility is driven by **owner’s team** (User → Team.name mapped from Department enum). Tickets are not filtered by the ticket’s **taxonomy** `departmentId` (TaxonomyDepartment). So a user can see tickets “in” their department by virtue of ownership/team, not by “this ticket type belongs to my department” per admin config. |
| **Feed consistency** | `/dashboard` uses `my-summary` (orderBy: status asc, updatedAt desc) and shows open/done split with client-side hide. `/tickets` uses `findAll` (orderBy: priority desc, createdAt desc) with client-side team and active/completed filter. Portal “my”/“studio” use `useTicketListQuery` with different params. Inbox uses `actionableForMe=true` and folder (supportTopicId). No single canonical sort/filter/pagination contract. |
| **Studio dashboard** | Portal “dashboard” tab shows stat cards (open, resolved, closed) plus “Recent tickets” list — i.e. a hybrid of stats and feed. The correct role of a studio dashboard (metrics/summary vs actionable list) is not defined; ticket feeds appear both here and under “my”/“studio” tabs. |
| **Actionable** | Uses same API (`findAll` with `actionableForMe=true`) but different page/layout (Inbox). Whether it uses the same feed component and same sort/filter/pagination as Home is implementation-dependent; spec should require alignment. |
| **Ticket ID** | Stored as CUID; not guaranteed to appear in list row or panel header; search does not support “find by ID”. Copy-to-clipboard for ID not specified. |
| **Lifecycle wording** | “Completed” is used in UI and counts to mean RESOLVED + CLOSED; “open”/“active” = not in [RESOLVED, CLOSED]. State machine uses RESOLVED/CLOSED (no COMPLETED enum). Spec should formalize this. |
| **Completed handling** | Ticket becomes RESOLVED only after resolution gate (all required subtasks DONE or SKIPPED). No explicit “completion confirmation” step in UI; RESOLVED → CLOSED is a separate transition. How RESOLVED/CLOSED tickets exit “active” feeds and where they are accessible is implied by filters but not codified. |

---

## 5. Desired Behavior

- **Visibility:** Users see only tickets they are allowed to see. Visibility is **enforced at the API query layer**; the backend determines the allowed ticket set from the authenticated user, and the client only displays tickets returned by the API. Client-side filtering alone is **not acceptable** (it can expose unauthorized data in network responses). Department-based visibility should align with the ticket’s responsible department (taxonomy) and the user’s assigned department(s). **Admin roles retain global visibility** (no visibility filter for ADMIN).
- **Feeds:** One **canonical ticket feed** behavior (deterministic sort, filter semantics, pagination, active vs completed treatment) used everywhere a ticket list is shown: Admin Home, Department Home, Studio Home (where a feed is appropriate), and Actionable.
- **Studio dashboard:** Clearly defined as either (a) a **data dashboard** (metrics, charts, no primary ticket list) with feeds living only under dedicated “My tickets” / “By studio” tabs, or (b) a hybrid with a single, canonical feed section. No duplicate, inconsistent feed logic.
- **Actionable:** Same feed component and API contract as Home; only the filter differs (actionable = **actionable tickets** per §9.1). Same sorting, pagination, and ID display.
- **Ticket ID:** Canonical structure defined (internal DB id vs display ID; prefix e.g. T-1042 if used). Shown consistently in list rows and ticket panel header; search by ID (exact, and optionally prefix); **copy-to-clipboard affordance in the ticket panel header** (required).
- **Lifecycle:** Single, written definition of states and transitions with **explicit triggers**: NEW → IN_PROGRESS when first subtask is started or completed; IN_PROGRESS → COMPLETED (stored as RESOLVED) automatically when final required subtask is completed. Tickets with no subtask activity remain NEW; once any subtask has activity, ticket is IN_PROGRESS. Completed handling: ticket leaves active feeds immediately; **completed tickets have a dedicated, clearly exposed UI location** (Completed tab / History view) so they do not “disappear”; never in active feeds. Specified unambiguously.

---

## 6. Role and Visibility Model

### 6.1 Visibility enforcement (mandatory)

Ticket visibility **must** be enforced **server-side in API queries**. Client-side filtering alone is **not acceptable**, because it can expose unauthorized data through network responses.

- **Department visibility is enforced at the API query layer.** The backend applies a visibility predicate (e.g. `TicketVisibilityService.buildWhereClause(actor)`) to every ticket list and get-by-id query. Only tickets that pass this predicate are returned.
- **The backend determines the allowed ticket set based on the authenticated user.** The API does not return tickets outside that set. The client never receives tickets the user is not allowed to see.
- **The client only displays the tickets returned by the API.** Any client-side filtering (e.g. tabs, local search) is for UX only and operates on an already-scoped result set. The client must not rely on client-side filtering to enforce visibility.
- **Admin roles retain global visibility.** ADMIN users see all tickets; no visibility predicate is applied for them (empty where clause for list, no 403 on get-by-id).

### 6.2 Roles (existing)

- **ADMIN:** Full access; can see and manage all tickets. Global visibility; no server-side visibility filter.
- **DEPARTMENT_USER:** Sees tickets that are “in” their department(s) and/or assigned to them; can transition status, assign, etc., per policy. Visibility enforced in API query.
- **STUDIO_USER:** Sees tickets they requested or that belong to their allowed studio(s); read-only for status/assignment (cannot transition ticket status or create/update subtasks). Visibility enforced in API query.

### 6.3 Department-based visibility (desired)

- **Classification:** A ticket is classified by:
  - **SUPPORT:** `departmentId` + `supportTopicId` (TaxonomyDepartment + SupportTopic).
  - **MAINTENANCE:** `maintenanceCategoryId` (no departmentId on ticket; department may be inferred from workflow/assignment if needed).
- **Responsible department:** For SUPPORT tickets, the ticket’s **department** is `ticket.departmentId` (TaxonomyDepartment). For MAINTENANCE, responsibility may be per-workflow or per-subtask department; the spec assumes we define “department scope” for MAINTENANCE (e.g. via subtask templates/departments) so that visibility can be consistent.
- **User’s departments:** User has zero or more **taxonomy departments** (e.g. from `TaxonomyDepartment` or a user–department association). This may currently be approximated by Team (Department enum → Team.name); Stage 1 should align visibility with **ticket.departmentId** and user’s allowed taxonomy departments where possible.
- **Rule:** A user may see a ticket if:
  - They are ADMIN, or
  - (DEPARTMENT_USER) The ticket’s responsible department is in the user’s department set, or they are the owner, or (existing) they have scope over the ticket’s studio, or
  - (STUDIO_USER) They are the requester or the ticket’s studio is in their allowed studios.
- **Enforcement:** All of the above is enforced **only** at the API query layer; the client only displays what the API returns.

### 6.4 Current vs desired (summary)

- **Current:** Visibility by owner’s team (Team.name) + owner self + studio scope; ticket.departmentId not used for visibility.
- **Desired:** Visibility by ticket’s responsible department (ticket.departmentId for SUPPORT) plus existing owner/requester/studio rules; ADMIN unchanged. Implementation may require user–taxonomy-department association and/or mapping from Team to TaxonomyDepartment.

---

## 7. Ticket Feed Canonical Behavior

### 7.1 Canonical feed query contract (single backend contract)

All feeds use **one backend query contract**. Admin Home, Studio Home, Department Home, and the Actionable tab all use the **same backend logic**; only **filter parameters** change (e.g. `actionableForMe`, `status`, `supportTopicId`). There is no separate “dashboard list” vs “inbox list” implementation path.

**Base ticket query**

- **Endpoint:** Single list endpoint (e.g. `GET /api/tickets`) for all feed entry points.
- **Inputs:** Authenticated user (from JWT/session); query params: `page`, `limit`, `status`, `actionableForMe`, `supportTopicId`, `departmentId`, `studioId`, `marketId`, `priority`, `search`, etc.

**Visibility filtering**

- Applied first, using the authenticated user. Backend builds a `where` clause (e.g. via `TicketVisibilityService.buildWhereClause(actor)`). ADMIN gets no visibility restriction; DEPARTMENT_USER and STUDIO_USER get role-appropriate restrictions. Only tickets in the allowed set are considered.

**Sorting order (deterministic)**

- **Canonical order:** One defined sort for all feeds. Recommendation: **primary** `updatedAt` descending (most recently updated first), **secondary** `createdAt` descending. All entry points (Admin Home, Studio Home, Department Home, Actionable) use this same order.
- **Determinism:** If the primary (and secondary) sort fields are identical for two tickets, a **tiebreaker** sort MUST be applied so that ordering is stable across pages and refreshes. Example: **primary** `created_at` DESC, **secondary** `ticket_id` DESC (or `id` DESC if using internal ID). Without a tiebreaker, pagination can yield duplicate or missing rows when many tickets share the same `updatedAt`/`createdAt`. The canonical feed query contract MUST specify a fully deterministic sort (e.g. `orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]`).

**Status filtering**

- **Active:** `status notIn ['RESOLVED', 'CLOSED']`.
- **Completed:** `status in ['RESOLVED', 'CLOSED']`.
- Feeds may pass `status` (or equivalent) to request active-only, completed-only, or all. The same status filter semantics apply for every entry point.

**Pagination pattern**

- Page-based: `page` (1-based) and `limit` (e.g. 20 or 25, server-side cap e.g. 100). Same `page`/`limit` semantics for Admin Home, Studio Home, Department Home, and Actionable. Response includes `total`, `totalPages`, `data`.

**Parameter-only differences by entry point**

- **Admin Home / Department Home / Studio Home (feed):** Same base query + visibility + sort + status + pagination; optional filters (e.g. studioId, departmentId) may be set by context.
- **Actionable tab:** Same base query + visibility + sort + status + pagination, plus **only** `actionableForMe=true` (filtering to **actionable tickets** per §9.1) and optionally `supportTopicId` for folder. No different backend path.

### 7.2 Single canonical behavior (summary)

All ticket list UIs that present a **feed** (Admin Home, Department Home, Studio Home feed, Actionable) MUST use this contract:

- **API:** Same list endpoint with the same query contract (visibility, sort, status, pagination). Only filter params differ.
- **Sort order:** One canonical, **deterministic** choice (e.g. `updatedAt` desc, then `createdAt` desc, then `id` desc as tiebreaker).
- **Pagination:** Same `page`/`limit` pattern and caps.
- **Active vs completed:** Server-side status filter; no client-only “hide completed” that substitutes for API filtering.
- **Filtering:** Actionable = same API with `actionableForMe=true` (and optional folder). **Actionable tickets** are those that satisfy the definition in §9.1. No separate actionable-only backend logic that changes shape or order.

### 7.3 Shared feed component

- **Requirement:** The same **feed component** (or a single abstraction that renders the canonical list) should be used for: Admin Home feed, Department Home feed, Studio Home feed (if a list is shown there), and Actionable list. Only the **initial query params** (and optionally a “mode” for actionable vs all) differ. This avoids duplicated logic and ensures consistent structure and visual treatment (including Ticket ID display).

### 7.4 Loading and refresh

- Pagination or “load more” behavior must be defined (e.g. infinite scroll vs page buttons) and consistent. SSE or polling for list refresh (if used) should not change sort/filter semantics.

---

## 8. Studio Dashboard Correction

### 8.1 Role of the studio dashboard

- The **studio dashboard** (Portal “dashboard” tab for studio users) should be defined as either:
  - **Option A — Data dashboard:** A screen that shows **aggregate metrics and summaries** (e.g. my requested tickets: open vs resolved; by studio; by status). It does **not** host the primary ticket feed; the feed lives under “My tickets” / “By studio” tabs. Any “recent” list is a small, clearly labeled preview (e.g. “Last 5 updated”) with a link to the full feed.
  - **Option B — Hybrid:** The dashboard is the main landing view and includes one **canonical feed section** (same component and API as Home/Actionable), plus optional stat cards above it. No second, divergent feed logic.

Recommendation: **Option A** so that “dashboard” = metrics/summary and “my/studio” = feeds. If Option B is chosen, the feed section must still use the canonical feed behavior.

### 8.2 What belongs on the studio dashboard

- Counts/summaries: e.g. open, resolved, closed (or by status).
- Optional: simple charts or breakdowns (e.g. by studio, by topic).
- Optional: short “recent activity” list (fixed small N) with link to full feed.
- No duplicate, full ticket list that competes with the canonical feed under another tab.

---

## 9. Actionable Tab Consistency

### 9.1 Definition of “actionable” (canonical)

An **actionable ticket** is defined precisely for feed filtering. A ticket is **actionable** for a user when **either** of the following is true:

1. **The user has at least one incomplete subtask assigned to them** on that ticket.  
   (Subtask status is not DONE or SKIPPED; the subtask is assigned to the current user.)

2. **The ticket belongs to a department the user is responsible for, and the ticket contains at least one incomplete subtask for that department.**  
   (The ticket’s responsible department is in the user’s department set, and there exists at least one subtask for that ticket that is incomplete and scoped to that department — e.g. READY or IN_PROGRESS, not DONE/SKIPPED.)

- This definition MUST be used **everywhere** actionable filtering is applied. There is **one source of truth**; UI and backend must not drift:
  - **API `actionableForMe` logic:** The list endpoint (e.g. `GET /api/tickets?actionableForMe=true`) MUST apply exactly this definition. No separate or ad-hoc “actionable” logic elsewhere in the backend.
  - **Actionable tab:** The Actionable tab MUST request the same API with `actionableForMe=true`. The tab shows only what the API returns; no additional client-side “actionable” filter that could diverge.
  - **Home feed filtering:** If the Home feed (or any other view) ever shows an “actionable” subset (e.g. a widget or filtered list), it MUST use the same API parameter `actionableForMe=true` and MUST NOT apply a different client-side or backend definition of “actionable.”  
  Any other place that filters by “actionable” (counts, badges, etc.) MUST derive from the same backend logic so the definition stays consistent.
- The **list presentation** (component, sort, pagination, Ticket ID display) for the Actionable tab MUST match the **canonical ticket feed**; only the predicate (actionable vs all visible) differs.

### 9.2 Same component and API

- Actionable tab uses the **same feed component** as Home.
- API: same `GET /api/tickets` with `actionableForMe=true` and optional `supportTopicId` (inbox folder). Same sort, limit, page.
- Visual logic (rows, status badges, priority, Ticket ID) identical to Home; only the data set is restricted to actionable tickets.

---

## 10. Ticket Identification Improvements

### 10.1 Canonical ticket ID structure

**Internal DB identifier**

- The **internal ticket identifier** is the primary key of the ticket record. Current schema uses a **CUID** (e.g. `clxx1234abcd...`). Alternative implementations may use a **UUID** or **numeric primary key**. The internal ID is used in API payloads, URLs, and foreign keys. It is stable and unique.

**Display ticket ID shown to users**

- A **display ticket ID** is the value shown to users in the UI (list rows, panel header, search results). It must be consistent across the app.
- **Option A — Use internal ID (short form):** Display ID = shortened internal ID (e.g. first 8 characters of CUID) for readability. Example: `clxx1234`.
- **Option B — Prefixed display number:** Display ID = a human-friendly identifier, e.g. **T-1042**, where `T` is a fixed prefix and `1042` is a numeric sequence (per market, per tenant, or global). Requires a stored or computed “display number” and a defined format (e.g. `T-{number}`).
- The spec must **define one canonical choice** for the project (Option A or B). If Option B is chosen, the structure (prefix, scope of the number, uniqueness) must be documented.

**Prefix (if used)**

- If display IDs use a prefix (e.g. **T-1042**), the prefix and format are canonical: e.g. `T-` + zero-padded numeric. All list rows and the ticket panel header use the same format. Search and copy-to-clipboard use the same display value.

### 10.2 Ticket ID search behavior

- **Exact match:** The list/search API MUST support finding a ticket by **exact** display ID or internal ID (e.g. user pastes full ID or selects from history). If display ID is T-1042, search for `T-1042` or the internal CUID must return that ticket.
- **Prefix match (optional):** If useful (e.g. user types `T-10`), the API MAY support prefix match on the display ID or internal ID so that results narrow as the user types. Behavior (exact vs prefix) must be documented.
- Search by ID MUST work without relying on title/description; the backend applies ID match (and visibility) so only authorized tickets are returned.

### 10.3 Copy-to-clipboard in ticket panel header

- The **ticket panel header** (ticket detail view) MUST provide a **copy-to-clipboard** affordance for the ticket ID. Example: an icon or button that copies the canonical display ticket ID (or the full internal ID, or a shareable link) to the clipboard. One consistent behavior across the app.
- This is **required** so users can reliably reference or share the ticket ID (e.g. in chat or email).

---

## 11. Ticket Lifecycle State Definitions

### 11.1 States (schema)

- **NEW** — Initial state after create. No subtask activity yet.
- **TRIAGED** — Reviewed/classified, not yet in progress.
- **IN_PROGRESS** — Work has started; at least one subtask has been started or completed.
- **WAITING_ON_REQUESTER** — Blocked on requester input.
- **WAITING_ON_VENDOR** — Blocked on external vendor.
- **RESOLVED** — Work complete (conceptually **COMPLETED**); all required subtasks DONE or SKIPPED. In schema this is `RESOLVED`; in product language this is the “completed” state unless the ticket is later CLOSED.
- **CLOSED** — Terminal; no further transitions.

(Where the spec or UI says **COMPLETED**, it refers to the ticket being “work complete” — represented as **RESOLVED** in the database. “Completed” in counts/UI may mean RESOLVED + CLOSED.)

### 11.2 Explicit ticket state transitions (triggers)

**NEW → IN_PROGRESS**

- **Trigger:** Occurs when the **first subtask** is marked **started** (e.g. status → IN_PROGRESS) or **completed** (e.g. status → DONE or SKIPPED).
- **Rule:** Tickets with **no** subtask activity (no subtask started or completed) **remain NEW**. As soon as any subtask has activity (started or completed), the ticket is considered in progress and transitions to **IN_PROGRESS** (if not already TRIAGED or a later state). Implementation may do this automatically on subtask status change or via a single state machine that considers subtask state.

**IN_PROGRESS → COMPLETED (RESOLVED)**

- **Trigger:** Occurs **automatically** when the **final required subtask** is completed (i.e. when the last required subtask reaches DONE or SKIPPED and the resolution gate is satisfied).
- **Rule:** No manual “mark resolved” is required for the ticket to leave active work; the system transitions the ticket to RESOLVED (COMPLETED) when the last required subtask is completed. Optional: a separate “confirm resolution” or “close” step (RESOLVED → CLOSED) may remain manual.

**Once any subtask has activity, the ticket is IN_PROGRESS**

- If the ticket is still NEW or TRIAGED and any subtask is started or completed, the ticket MUST be treated as IN_PROGRESS for display and feed purposes (and the stored status should reflect IN_PROGRESS per the transition above).

### 11.3 Other transitions (existing state machine)

- NEW → TRIAGED, CLOSED  
- TRIAGED → IN_PROGRESS, CLOSED  
- IN_PROGRESS → WAITING_ON_REQUESTER, WAITING_ON_VENDOR, RESOLVED  
- WAITING_ON_* → IN_PROGRESS, RESOLVED, CLOSED  
- RESOLVED → CLOSED, IN_PROGRESS (re-open)  
- CLOSED → (none)

Only `ticket-state-machine.ts` (and code that calls it) may perform status transitions. No ad-hoc status updates elsewhere. The automatic NEW → IN_PROGRESS and IN_PROGRESS → RESOLVED transitions are implemented within this constraint (e.g. triggered by subtask completion handlers that call the state machine).

### 11.4 Subtasks and resolution gate

- A ticket can transition to **RESOLVED** only if every **required** subtask (isRequired = true) is in status **DONE** or **SKIPPED**. Optional subtasks do not block RESOLVED. When the last required subtask is completed, the ticket transitions to RESOLVED automatically (see 11.2).

### 11.5 How feeds treat states

- **Active / open:** Status not in `[RESOLVED, CLOSED]`. These are the tickets that appear in “active” or “open” views and counts.
- **Completed / done:** Status in `[RESOLVED, CLOSED]`. These appear in “completed” or “resolved” views and counts.
- Feeds that show “only active” tickets MUST filter with `status: { notIn: ['RESOLVED', 'CLOSED'] }` (or equivalent) server-side. Feeds that show “completed” use the inverse. Combined “all” feeds may show both, with optional client-side grouping (e.g. Open / Completed sections) but same underlying sort (e.g. updatedAt desc).

---

## 12. Completed Ticket Handling

### 12.1 When the final subtask completes

When the **final required subtask** is completed (last required subtask reaches DONE or SKIPPED):

1. **Ticket state becomes COMPLETED (RESOLVED).** The ticket’s status is set to RESOLVED. The ticket is now in the “completed” state (conceptually COMPLETED; stored as RESOLVED). `resolvedAt` is set; domain event `TICKET_RESOLVED` is emitted; notifications are sent per existing rules.
2. **Ticket leaves active feeds immediately.** Any feed that shows “active” tickets uses the filter `status notIn ['RESOLVED', 'CLOSED']`. As soon as the ticket is RESOLVED, it no longer appears in those feeds. There is no delay or extra step; the transition is immediate from the user’s perspective.
3. **Optional completion animation on client.** The client MAY show a brief completion animation or toast (e.g. “Ticket completed”) when the user’s action completes the last required subtask and the ticket transitions to RESOLVED. This is optional and does not affect the server behavior.
4. **Ticket remains accessible in completed/history views.** The ticket is not deleted or moved. It remains in the same table with status RESOLVED. It appears in:
   - **List views** that show “Completed” or “All” (with status filter or tab for RESOLVED/CLOSED).
   - **Get by ID** for any user who has visibility to that ticket (same visibility rules as for active tickets).
   - Any “history” or “completed tickets” section that queries for status in [RESOLVED, CLOSED].

### 12.2 Completed ticket location (where they appear)

- **Completed tickets immediately leave active feeds.** As soon as status is RESOLVED (or CLOSED), the ticket is excluded from any feed that shows “active” tickets only. There is no delay.
- **Completed tickets must have a dedicated location in the UI.** The app MUST provide a **clearly exposed** place where completed tickets live permanently — e.g. a **Completed** tab or **History** view (or equivalent) that lists tickets with `status in [RESOLVED, CLOSED]`. Get-by-ID continues to work for any user with visibility. If this view is not clearly exposed, users will think completed tickets “disappeared”; the UI MUST guarantee that users can always find their completed tickets in one obvious, dedicated location.
- **Completed tickets must never appear again in active ticket feeds.** Active feeds MUST use the server-side filter `status notIn ['RESOLVED', 'CLOSED']`. A completed ticket must not reappear in “My tickets,” “Department Home,” “Studio Home,” or “Actionable” when those views are showing active tickets only. Re-opening (RESOLVED → IN_PROGRESS) is the only way a ticket re-enters active feeds, and that is an explicit state change.

### 12.3 Summary (unambiguous)

- **Trigger:** Final required subtask completed → ticket status becomes RESOLVED (COMPLETED).
- **Active feeds:** Ticket is excluded immediately (server-side status filter); completed tickets never appear in active-only feeds.
- **Client:** May show optional completion animation; does not change server state.
- **Access later:** Ticket is always accessible via **Completed or History view** and get-by-ID with same visibility rules.
- **RESOLVED vs CLOSED:** RESOLVED = work complete (re-open allowed). CLOSED = terminal, typically after requester confirmation or time in RESOLVED.

---

## 13. Data / Query Considerations

- **Performance:** Visibility and filter clauses must be index-friendly. Existing indexes on `tickets` (status, owner_id, requester_id, studio_id, market_id, department_id, etc.) should be used; add indexes if new filters (e.g. by ticket.departmentId for visibility) are introduced.
- **Pagination:** Stick to one approach (offset/limit or cursor). Offset/limit is already in use; keep `limit` capped (e.g. 100) server-side.
- **Counts:** “My summary” and dashboard counts (open, resolved, closed) should use the same visibility and status filters as the canonical feed so numbers are consistent.
- **Search by ID:** If implemented as prefix match on `id`, ensure it is efficient (e.g. index on `id`; CUIDs are not prefix-searchable in a B-tree in a meaningful way, so “exact ID” search is the primary; prefix can be `id startsWith` if needed).

---

## 14. Risks and Edge Cases

- **Migration of visibility:** Moving from “owner’s team” to “ticket’s department” may change which tickets some users see. Requires clear mapping of users to taxonomy departments and a migration/communication plan.
- **Studio users:** They cannot transition status; ensuring they still see only their allowed studios and requesters’ tickets is unchanged. No regression there.
- **Actionable empty state:** If a user has no READY subtasks, Actionable is empty; that’s correct. No need to show non-actionable tickets there.
- **Re-open:** RESOLVED → IN_PROGRESS is allowed; re-opened tickets re-enter “active” feeds and resolution timestamps may need to be cleared (already done in current code).

---

## 15. Verification Plan

1. **Visibility:** Confirm visibility is enforced at the API query layer only; client receives only the allowed ticket set. As each role (ADMIN, DEPARTMENT_USER, STUDIO_USER), call list and get-by-id for tickets in/out of scope; assert 200 with correct subset or 403 as appropriate. Verify ADMIN retains global visibility (no visibility filter). After any visibility change, re-run and confirm department-based rules.
2. **Feed consistency:** For the same actor and equivalent filters, call the list API from “contexts” that drive Admin Home, Department Home, Portal feed, and Actionable; assert same sort order, page size, and filter semantics (only actionable filter differs for Actionable).
3. **Studio dashboard:** Confirm dashboard tab content matches chosen option (A or B); no duplicate feed logic.
4. **Actionable:** Confirm same feed component and API contract; only `actionableForMe` and folder differ. Verify the **same** actionable definition (§9.1) is used in API `actionableForMe`, Actionable tab, and any Home or other “actionable” filtering (no drift).
5. **Ticket ID:** Confirm ID appears in list row and panel header; if search-by-ID is implemented, verify exact (and optional prefix) match.
6. **Lifecycle:** Verify explicit triggers: NEW → IN_PROGRESS when first subtask is started/completed; IN_PROGRESS → RESOLVED automatically when final required subtask completes. Verify RESOLVED/CLOSED tickets excluded from active feeds immediately and included in completed/history views.
7. **Completed-ticket location:** Verify the UI exposes a **dedicated, clearly visible** Completed tab or History view where completed tickets live; confirm users can find completed tickets and do not perceive them as “disappeared.”

---

## 16. Acceptance Criteria

- [ ] **Visibility enforcement:** Ticket visibility is enforced at the API query layer only; the backend determines the allowed ticket set from the authenticated user; the client only displays tickets returned by the API (no reliance on client-side filtering for authorization). Admin roles retain global visibility. Department visibility rules are documented; either (a) aligned with ticket’s taxonomy department (ticket.departmentId) and user’s departments, or (b) the gap and migration path are documented and accepted for a follow-up.
- [ ] **Canonical feed:** Single backend query contract (base query, visibility filtering, **deterministic** sort order with tiebreaker, status filtering, pagination). Admin Home, Studio Home, Department Home, and Actionable tab all use the **same backend logic** with only filter parameters changed (e.g. actionableForMe, status, folder). One documented sort order (with tiebreaker for stable pagination), pagination, and active/completed definition; same feed component where applicable.
- [ ] **Studio dashboard:** The role of the studio dashboard (data dashboard vs hybrid) is defined; ticket feeds are not duplicated inconsistently; any “recent” list is clearly scoped and links to the canonical feed.
- [ ] **Actionable:** **Actionable ticket** is defined per §9.1 and used **everywhere** — API `actionableForMe` logic, Actionable tab, and any Home-feed or other “actionable” filtering. Single source of truth; no UI/backend drift. Actionable tab uses the same feed component and list API as Home, with only `actionableForMe` (and folder) differing.
- [ ] **Ticket ID:** Canonical ticket ID structure is defined (internal DB id; display ID; prefix e.g. T-1042 if used). Ticket ID is displayed consistently in list and panel header; search by ID (exact, and optionally prefix) is supported; **copy-to-clipboard affordance in the ticket panel header** is implemented.
- [ ] **Lifecycle:** States and transitions are documented with **explicit triggers**: NEW → IN_PROGRESS (first subtask started/completed); IN_PROGRESS → COMPLETED (stored as RESOLVED) when final required subtask completes. Tickets with no subtask activity remain NEW; once any subtask has activity, ticket is IN_PROGRESS. “Active” = not RESOLVED/CLOSED; “completed” = RESOLVED/CLOSED. Completed-ticket behavior: leaves active feeds immediately; never appears again in active feeds; **UI guarantees a dedicated, clearly exposed location** (Completed tab / History view) so completed tickets do not “disappear”; optional client animation; specified and verified.
- [ ] **No regression:** Existing API contracts and permissions (policy layer, visibility service) remain in place unless explicitly changed by this stage; performance and index usage are considered.

**Implementation plan:** Concrete engineering steps, file-level guidance, implementation order, and verification checklist are in a separate document: [Stage 1 Implementation Plan](stage01-implementation-plan.md).
