# Stage 1: Role Visibility and Feed Correctness — Implementation Plan

This document translates the [Stage 1 mini-spec](stage01-role-visibility-and-feed-correctness-mini-spec.md) into concrete engineering steps. Execution order is given in §8; verification is in §9. **Do not implement code until this plan is approved and assigned.**

---

## 1. Backend Visibility Alignment

**Objective:** Enforce ticket visibility at the API query layer only; align department visibility with ticket taxonomy (`ticket.departmentId`) and user’s taxonomy departments; ADMIN retains global visibility.

**Where `TicketVisibilityService` is currently used**

- **`apps/api/src/common/permissions/ticket-visibility.service.ts`** — Defines `buildWhereClause(actor)` and `assertCanView(ticket, actor)`. Current logic: ADMIN → no restriction; DEPARTMENT_USER → owner self, **owner’s team name** (from `Department` enum → `TEAM_NAME` map), or scope studios; STUDIO_USER → requester self or studio in allowed set.
- **List queries:** `TicketsService.findAll()` (line ~557) builds `scopeWhere = this.visibility.buildWhereClause(actor)` and merges it with filters via `AND: [scopeWhere, filterWhere]`. Used by `GET /api/tickets`.
- **Get-by-id:** Policy layer only. `TicketsService.findById()` does **not** call the visibility service directly; it fetches the ticket then calls `this.policy.evaluate(TICKET_VIEW, actor, ticket)`. The ticket view rule in **`apps/api/src/policy/rules/ticket.policy-rules.ts`** calls `helpers.visibility.assertCanView(ticket, subject)`. So get-by-id visibility is enforced via **policy + `assertCanView`**, which uses the same visibility rules (owner, owner’s team, studio scope).
- **Other consumers:** `PolicyService` injects `TicketVisibilityService` for ticket/subtask/comment rules. `SubtasksService`, `CommentsService` use it for scope. `getMySummary`, `getScopeSummary`, `getInboxFolders` all use `this.visibility.buildWhereClause(actor)`.

**Endpoints that must apply visibility**

- **List:** `GET /api/tickets` — already uses `buildWhereClause` in `TicketsService.findAll`. Ensure no list endpoint bypasses it.
- **Get-by-id:** `GET /api/tickets/:id` — already uses policy `TICKET_VIEW` which calls `assertCanView`. Ensure the ticket fetch includes any fields `assertCanView` needs (e.g. `owner.team.name` for DEPARTMENT_USER; after change, possibly `ticket.departmentId` and user’s department IDs).
- **My-summary / scope-summary / inbox-folders:** Already use `buildWhereClause`; keep them in sync with the new visibility logic.

**ADMIN bypass**

- In `TicketVisibilityService.buildWhereClause(actor)`, when `actor.role === Role.ADMIN`, return `{}`. No change needed.
- In `assertCanView`, when ADMIN, return immediately. No change needed.

**Department visibility: from owner-team to taxonomy**

- **Current:** DEPARTMENT_USER sees tickets where they are owner, or **owner’s team name** is in `actor.departments` (enum) mapped to legacy team names (e.g. HR, Operations, Marketing), or ticket’s studio is in `actor.scopeStudioIds`.
- **Desired:** DEPARTMENT_USER sees tickets where they are owner, or **ticket.departmentId** is in the set of taxonomy departments the user belongs to, or ticket’s studio is in scope. User’s departments are already loaded as `user.departments` (from `UserDepartment` → `TaxonomyDepartment`); ensure JWT/validate provides taxonomy department **IDs** or **codes** so visibility can use `ticket.departmentId` (TaxonomyDepartment id) against user’s department IDs.
- **Implementation steps:**
  1. In `ticket-visibility.service.ts`, for DEPARTMENT_USER, add a condition: `ticket.departmentId` in `actor`’s taxonomy department IDs (e.g. from `actor.departmentIds` or derived from `actor.departments`). Keep owner-self and scope-studio conditions.
  2. Replace or supplement the “owner’s team name” condition with “ticket’s responsible department is in user’s departments.” If the schema uses `TaxonomyDepartment` and User has `departments: TaxonomyDepartment[]`, use `ticket.departmentId` and `actor.departments.map(d => d.id)` (or equivalent).
  3. Update `assertCanView` to allow view when ticket.departmentId is in user’s department set (and ensure `findById` / policy path include `ticket.departmentId` and, if still needed for fallback, `owner.team.name` until migration is complete).
- **Temporary bridge:** If some users have no taxonomy-department association yet, keep a fallback: if user has legacy team (Team.name) and ticket has no departmentId or no match, fall back to “owner’s team name” match so existing users still see expected tickets. Document the bridge and plan to remove it once all users have taxonomy departments.

**Files / services likely involved**

- `apps/api/src/common/permissions/ticket-visibility.service.ts` — main changes to `buildWhereClause` and `assertCanView`.
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts` — ensure `RequestUser` exposes taxonomy department IDs (or codes) for visibility.
- `apps/api/src/policy/rules/ticket.policy-rules.ts` — no change to flow; ensure ticket shape passed to `assertCanView` includes `departmentId` (and owner/team if bridge remains).
- `apps/api/src/modules/tickets/tickets.service.ts` — ensure `findById` select includes fields required by `assertCanView`; list already uses visibility via `buildWhereClause`.
- Optional: `apps/api/src/common/permissions/ticket-visibility.service.spec.ts` — extend tests for taxonomy-based visibility and ADMIN bypass.

---

## 2. Canonical Ticket Feed Query

**Objective:** Single backend query contract for all feed entry points (Admin Home, Department Home, Studio Home, Actionable). Same endpoint, visibility, filters, **deterministic sort**, and pagination; only query parameters differ.

**Current state**

- **Service:** `TicketsService.findAll()` in **`apps/api/src/modules/tickets/tickets.service.ts`** builds the ticket list. It applies `TicketVisibilityService.buildWhereClause(actor)`, then user-supplied filters (status, departmentId, supportTopicId, studioId, etc.), then **actionableForMe** (subtask filter). Order today: `orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]`. No status filter for “active only” by default; no tiebreaker for determinism.
- **Controller:** **`apps/api/src/modules/tickets/tickets.controller.ts`** exposes `GET /tickets` and forwards query params via `TicketFiltersDto` to `findAll`.
- **DTO:** **`apps/api/src/modules/tickets/dto/ticket-filters.dto.ts`** — has `status`, `actionableForMe`, `page`, `limit`, etc. No explicit “active only” vs “completed only” in DTO; status is optional.

**Convergence**

- All feed entry points (Admin/Department Home, Studio feed, Actionable) must call the **same** `GET /api/tickets` with the same contract. No separate “dashboard list” or “inbox list” path; only **parameter** differences (e.g. `actionableForMe=true`, `status`, `supportTopicId`).
- **Admin Home / Department Home / Studio Home:** Use `GET /api/tickets` with visibility (implicit), optional status/departmentId/studioId, and **canonical sort + pagination**. No second endpoint for “my summary tickets” as the main feed; my-summary can remain for **counts and small preview** only; the main feed must be the canonical list.

**Canonical filters**

- **Active tickets:** `status notIn ['RESOLVED', 'CLOSED']`. Implement by accepting a reserved value for “active” in the API (e.g. `status=active`) or by a separate query param (e.g. `activeOnly=true`) that injects `status: { notIn: ['RESOLVED', 'CLOSED'] }` into the where clause. Document which approach is canonical.
- **Completed tickets:** `status in ['RESOLVED', 'CLOSED']`. Similarly, either `status=completed` or `completedOnly=true`, or client sends `status=RESOLVED` and/or `status=CLOSED` depending on design.
- **Actionable tickets:** Handled in §3; when `actionableForMe=true`, add the actionable predicate to the same `findAll` where clause.

**Canonical sorting rules**

- **Primary:** `updatedAt` descending (most recently updated first). Spec recommends this; current code uses `priority` then `createdAt`. Change to canonical: `updatedAt` desc, then `createdAt` desc.
- **Tiebreaker:** When `updatedAt` and `createdAt` are equal, sort by `id` descending so ordering is deterministic. Prisma: `orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]`.

**Pagination rules**

- Page-based: `page` (1-based), `limit` (e.g. 20 or 25; server cap 100). Response: `{ data, total, page, limit, totalPages }`. Already in place; ensure all feed callers use the same `page`/`limit` and that no caller uses a different pagination pattern.

**Backend files most likely to change**

- `apps/api/src/modules/tickets/tickets.service.ts` — `findAll`: change orderBy to canonical + tiebreaker; add status filter handling for “active only” / “completed only” if not already driven by `status` param; keep visibility and actionable filter in one place.
- `apps/api/src/modules/tickets/dto/ticket-filters.dto.ts` — add or document params for active/completed if using something like `activeOnly`/`completedOnly` or reserved status values.
- `apps/api/src/modules/tickets/tickets.controller.ts` — ensure query params and DTO align with canonical contract (no branching to a different service method for “feed” vs “inbox”).

---

## 3. Actionable Filtering

**Objective:** Implement the actionable definition (mini-spec §9.1) in one place and use it whenever `actionableForMe=true`. Actionable = user has at least one **incomplete** subtask assigned to them, OR ticket belongs to a department the user is responsible for and contains an incomplete subtask for that department.

**Current state**

- In `TicketsService.findAll()`, when `actionableForMe` is true (and role is DEPARTMENT_USER or ADMIN), the code adds a filter: tickets with at least one **READY** subtask that is either in the user’s department (by `department.code` in `departmentCodes`) or assigned to the user. So the current logic is “READY + (department match OR ownerId = me)”. Spec defines actionable as **incomplete** subtask (not DONE/SKIPPED); READY is one incomplete state. Align: either treat “incomplete” as “status not in [DONE, SKIPPED]” (includes READY, IN_PROGRESS, BLOCKED) or keep READY-only and document that READY is the only “actionable” subtask status for the queue. Spec says “incomplete” — so include at least READY; if product intent is “ready to work,” READY-only may be acceptable but must match spec wording (incomplete = not DONE/SKIPPED).
- **READY subtask logic:** Subtask status READY = not yet started; IN_PROGRESS/BLOCKED = in progress. For “actionable,” spec: “incomplete subtask assigned to me or for my department.” Implement: filter tickets where there exists a subtask with status not in [DONE, SKIPPED] AND (ownerId = actor.id OR (ticket’s department in user’s departments AND subtask’s department matches ticket’s department or user’s department)). Simplify to match current pattern: “at least one subtask with status READY (or all incomplete statuses if spec is literal) that is assigned to me or belongs to my department.”
- **Department assignment:** User’s departments from `actor.departments` (TaxonomyDepartment); subtask has `departmentId`; ticket has `departmentId`. “Ticket belongs to a department the user is responsible for” → ticket.departmentId in user’s department IDs. “Incomplete subtask for that department” → subtask.departmentId matches that department (or ticket’s department). Use same department resolution as visibility (taxonomy department IDs).
- **User assignment:** Subtask.ownerId = actor.id; status not DONE/SKIPPED (or READY only if product decision).
- **Implementation of `actionableForMe=true`:** In `findAll`, when `actionableForMe` is true, add the AND clause as today but ensure: (1) definition matches §9.1 exactly (incomplete = not DONE/SKIPPED, or READY-only if clarified); (2) department check uses taxonomy department (ticket.departmentId / subtask.departmentId and user’s taxonomy departments); (3) no duplicate logic elsewhere — this is the only place that defines “actionable” for the API.
- **Actionable tab:** Must use the same `GET /api/tickets` with `actionableForMe=true` (and optional `supportTopicId` for folder). Confirm frontend Inbox/Actionable page calls `ticketsApi.list({ ...params, actionableForMe: true })` and does not apply a different client-side filter.

**Files**

- `apps/api/src/modules/tickets/tickets.service.ts` — actionable predicate in `findAll`; optional attachment of `readySubtasksSummary` for Actionable tab already present; ensure predicate aligns with mini-spec §9.1 and uses taxonomy departments.

---

## 4. Frontend Feed Standardization

**Objective:** Use one canonical feed component (or one abstraction) for all ticket list surfaces so structure, sort, pagination, and Ticket ID display are consistent.

**Current components that render ticket lists**

- **`apps/web/src/app/(app)/tickets/page.tsx`** — Main tickets page; uses `useTicketListQuery('list', listParams)` and renders **`TicketTableRow`** from **`@/components/tickets/TicketRow.tsx`** in a table. Has Active/Completed tabs (viewTab); filters and search.
- **`apps/web/src/app/(app)/inbox/page.tsx`** — Inbox (Actionable); uses `useTicketListQuery('actionable', listParams)` and renders a **card/list of rows** (custom markup with ticket title, link to `/tickets/[id]`), not the same table as tickets page.
- **`apps/web/src/app/(app)/portal/page.tsx`** — Portal with tabs “my” / “studio” / “dashboard”; “my” and “studio” use `useTicketListQuery('portal-my', ...)` and `useTicketListQuery('portal-studio', ...)` and render **`PortalTicketTableRow`** from **`TicketRow.tsx`** inside **`InboxLayout`**. Dashboard tab shows stats + “Recent activity” (small list from scope summary), not the full canonical feed.
- **`apps/web/src/app/(app)/dashboard/page.tsx`** — Admin/Department dashboard; uses **`ticketsApi.mySummary()`** and renders tickets from `summary.tickets` with a local **`TicketRow`** component and client-side open/done split and “hide completed” toggle. **Does not** use `GET /api/tickets` or `useTicketListQuery` for the main list; order is `status asc, updatedAt desc` from my-summary. So dashboard is a **different** data path and a different row component.

**Surfaces that must use the canonical feed component**

- **Admin Home / Department Home:** Today this is the **dashboard** page. Either (a) replace the dashboard’s ticket list with a feed that uses `useTicketListQuery` and the same table/row component as the tickets page, or (b) keep dashboard as “metrics + small preview” and make “Home” feed a separate view (e.g. under “Tickets” or “My tickets”) that uses the canonical feed. Spec says “Admin Home, Department Home, Studio Home (feed), and Actionable” use the same feed. So: the **main ticket list** on Admin/Department Home must come from the same API and same component as the rest.
- **Studio feed:** Portal “my” and “studio” tabs — already use `InboxLayout` + `PortalTicketTableRow` and `useTicketListQuery`. Align so the **row component and table structure** match the admin feed (same columns, including Ticket ID); same API (`GET /api/tickets` with same sort/filters).
- **Actionable tab:** Inbox page — currently uses a different layout (card list). Change to use the **same** feed component as the tickets page (table with same row type) or the same `InboxLayout` + table row as Portal, so that only the **data** differs (actionableForMe=true), not the layout. Confirm feed layout matches “admin feed layout standard” (same columns, Ticket ID, status, etc.).

**Legacy variations to remove or refactor**

- **Dashboard ticket list:** Remove or reduce to a small “recent N” preview with link to full feed. Do not keep a full ticket list on dashboard that uses my-summary and a different order/component. If dashboard is “metrics only,” remove the full list; if “hybrid,” the list section must use the canonical feed (same `useTicketListQuery` + same row/table as tickets page).
- **Inbox actionable list:** Replace custom card list with the shared table/row component used on tickets page and portal so that layout and columns (including Ticket ID) are identical.
- **Portal “my”/“studio”:** Already table-based; ensure they use the same `TicketTableRow`/row contract and same API params (canonical sort, status filter for active/completed) as the tickets page.

**Confirmation**

- After implementation, Admin Home (or main ticket list), Department Home, Studio feed (my/studio tabs), and Actionable tab all render tickets via the same feed component (or same table + row abstraction) and the same list API with only parameter differences. Feed layout (columns, Ticket ID, status, priority, etc.) matches the admin feed layout standard.

**Files likely involved**

- `apps/web/src/app/(app)/tickets/page.tsx` — reference implementation for table + `TicketTableRow`.
- `apps/web/src/app/(app)/inbox/page.tsx` — switch to table + shared row component; use same `useTicketListQuery` pattern with `actionableForMe: true`.
- `apps/web/src/app/(app)/portal/page.tsx` — ensure portal table rows and API params align with canonical feed (sort, status, pagination).
- `apps/web/src/app/(app)/dashboard/page.tsx` — either remove full list and use “recent” only with link to feed, or replace list with canonical feed component + `useTicketListQuery`.
- `apps/web/src/components/tickets/TicketRow.tsx` — single source for table row (and portal row if unified); add Ticket ID column if missing.
- `apps/web/src/components/inbox/InboxLayout.tsx` — layout shell; ensure it receives the same ticketList structure across pages.
- `apps/web/src/hooks/useTicketListQuery.ts` — already shared; ensure all callers pass params that trigger canonical API behavior (status for active/completed, actionableForMe for Actionable).

---

## 5. Studio Dashboard Correction

**Objective:** Align studio dashboard with spec Option A: dashboard = metrics/summary; feeds live under “My tickets” / “By studio” tabs. No full ticket feed on the dashboard view.

**Changes**

- **Remove full ticket feed from dashboard view:** The Portal “dashboard” tab currently shows stat cards (open count, completed count) plus a “Recent activity” list (e.g. last 10 updated tickets). Spec: “any ‘recent’ list is a small, clearly labeled preview (e.g. ‘Last 5 updated’) with a link to the full feed.” So: do **not** show a full paginated feed on the dashboard tab. Keep a small “Recent activity” (e.g. 5–10 items) with a clear label and a link to the full feed (e.g. “My tickets” or “By studio” tab).
- **Keep dashboard focused on metrics:** Stats (open, completed), optional location filter for studios, optional charts. No duplicate feed logic.
- **Feeds under tabs:** “My tickets” and “By studio” tabs already host the feed; ensure they use the canonical feed (see §4). Dashboard tab does not host a second feed.

**Files**

- `apps/web/src/app/(app)/portal/page.tsx` — dashboard tab content: ensure “Recent activity” is limited and has a link to the full feed; remove any full list or pagination from dashboard tab.

---

## 6. Ticket ID Improvements

**Objective:** Consistent Ticket ID display in feed rows and ticket panel header; search by ID; optional copy-to-clipboard in panel header.

**Display in feed rows**

- Every ticket list row (canonical feed) must show the Ticket ID in a consistent format. Today `TicketTableRow` does not show `id`; it shows title, createdAt, comment/subtask counts, requester. Add a column (or first column) for Ticket ID. Use the **canonical display format** (e.g. short CUID slice like `ticket.id.slice(0, 8)` or a display number like T-1042 if implemented). Same format in all surfaces that use the feed component.
- **Files:** `apps/web/src/components/tickets/TicketRow.tsx` — add prop for display ID and render it; ensure all call sites (tickets page, portal, inbox after standardization) pass the ID.

**Display in ticket panel header**

- Ticket detail (drawer or full page) must show the Ticket ID in the header. Current code: **`TicketDrawer.tsx`** shows “Ticket #{ticket.id?.slice(0, 8)}”; **`apps/web/src/app/(app)/tickets/[id]/page.tsx`** shows “Ticket #{ticket.id.slice(0, 8)}”. Standardize on one format and ensure both use the same canonical display value (and that the panel header is the “ticket panel header” referred to in the spec).

**Search behavior for ticket ID**

- Backend: Today `findAll` search is title + description (and optional title-only). Add support for **search by ID**: when `search` param looks like an ID (e.g. exact CUID, or T-xxxx pattern), include in the where clause a condition that matches `id` (exact or prefix). Exact: `id: search` or `id: { equals: search }`. Prefix: `id: { startsWith: search }` if needed. Ensure visibility is still applied; search by ID must not return tickets the user cannot see.
- **Files:** `apps/api/src/modules/tickets/tickets.service.ts` — in `findAll`, when building filterWhere, if `search` is present and matches ID pattern, add `OR` with `id` (and optionally display number field if added). `ticket-filters.dto.ts` — no change required if reusing `search`; document that search can be ID or text.

**Copy-to-clipboard in ticket panel header**

- Add a button or icon in the ticket panel header that copies the canonical Ticket ID (or shareable link) to the clipboard. Required by spec. Implement in both the drawer header and the full-page ticket header so behavior is consistent.
- **Files:** `apps/web/src/components/tickets/TicketDrawer.tsx`; `apps/web/src/app/(app)/tickets/[id]/page.tsx`.

---

## 7. Lifecycle and Feed Alignment

**Objective:** Active vs completed are defined by status; resolved/closed tickets leave active feeds immediately and are only accessible in Completed/History view; UI labels align with backend status.

**Definition of active vs completed**

- **Active:** `status notIn ['RESOLVED', 'CLOSED']`.
- **Completed:** `status in ['RESOLVED', 'CLOSED']`. In product language this is “completed”; in DB it is RESOLVED (and CLOSED). Use these definitions in all API filters and UI labels.

**Removal of resolved tickets from active feeds**

- Any feed that shows “active” tickets must pass a status filter so the API returns only tickets with status not in [RESOLVED, CLOSED]. Implement via query param (e.g. `status=active` or `activeOnly=true`) so the backend applies `status: { notIn: ['RESOLVED', 'CLOSED'] }`. Default for “Home” and “Actionable” should be active-only unless the user switches to Completed. No client-only “hide completed” that could show completed tickets in the payload; server must not return them for active-only requests.

**Completed tickets accessible in Completed/History views**

- Provide a dedicated view (Completed tab or History) that requests tickets with `status in [RESOLVED, CLOSED]` (or equivalent param). Ensure the UI exposes this view clearly (mini-spec §12.2) so users do not think tickets “disappeared.” Implementation: e.g. “Completed” tab on tickets page or a dedicated “History” route that calls `GET /api/tickets` with status filter for RESOLVED/CLOSED. Same canonical feed component and same endpoint; only status filter differs.

**UI labels vs backend status**

- Use “Active” / “Open” for not RESOLVED/CLOSED and “Completed” / “Resolved” / “History” for RESOLVED/CLOSED in labels. Ensure any badge or count that says “completed” uses the same status set as the API so numbers and lists are consistent.

**Files**

- Backend: `tickets.service.ts` — status filter for active/completed in `findAll`; my-summary and getScopeSummary already use open vs completed status sets; keep aligned.
- Frontend: tickets page (Active/Completed tabs); ensure tab “Completed” triggers API with completed status filter and that there is a single, obvious place to see completed tickets. Dashboard/my-summary counts should use same definitions.

---

## 8. Implementation Order

Recommended order for engineers:

1. **Backend visibility correction** — Update `TicketVisibilityService` and any JWT/RequestUser shape so department visibility uses taxonomy (`ticket.departmentId`); keep ADMIN bypass; add bridge if needed. Verify list and get-by-id with each role.
2. **Canonical ticket query refactor** — In `TicketsService.findAll`, implement canonical sort (updatedAt desc, createdAt desc, id desc), status filter for active/completed, and pagination contract. Ensure single endpoint serves all feed entry points.
3. **Actionable filter alignment** — Align actionable predicate in `findAll` with mini-spec §9.1 (incomplete subtask, department/user assignment); ensure taxonomy departments used; confirm Actionable tab calls same endpoint with `actionableForMe=true`.
4. **Frontend feed component standardization** — Unify ticket list UI: same table/row component for tickets page, portal (my/studio), and Inbox (Actionable); dashboard either metrics-only or one canonical feed section. Remove legacy list paths that use different API or component.
5. **Ticket ID improvements** — Add Ticket ID to feed rows; ensure panel header shows ID; implement search-by-ID in backend; add copy-to-clipboard in panel header.
6. **Dashboard corrections** — Studio dashboard: no full feed on dashboard tab; small “Recent activity” + link to feed. Admin/Department dashboard: align with canonical feed or metrics-only per spec.
7. **Lifecycle/feed cleanup** — Ensure active feeds never return RESOLVED/CLOSED unless requested; add or expose Completed/History view clearly; align UI labels with backend status.

---

## 9. Verification Checklist

Run after implementation. Mark each item when verified.

- [ ] **Admin visibility:** As ADMIN, list tickets and get-by-id for any ticket; no 403; list returns tickets across all departments/studios.
- [ ] **Department user visibility:** As DEPARTMENT_USER, list only shows tickets in scope (owner, ticket’s department in user’s departments, or scope studio); get-by-id for in-scope ticket returns 200, for out-of-scope returns 403.
- [ ] **Studio user visibility:** As STUDIO_USER, list only shows requested tickets or tickets for allowed studios; get-by-id for in-scope returns 200, for out-of-scope returns 403.
- [ ] **List vs get-by-id authorization:** No ticket is returned by list or get-by-id if the user is not allowed to see it; 403 on get-by-id when out of scope.
- [ ] **Actionable filtering correctness:** With `actionableForMe=true`, only tickets with at least one incomplete (or READY) subtask for my department or assigned to me; no other tickets in list.
- [ ] **Deterministic feed ordering:** Same actor and params return tickets in same order across requests; when many tickets share same updatedAt/createdAt, order is stable (tiebreaker by id).
- [ ] **Pagination stability:** Page 2 does not duplicate or omit rows from page 1; total and totalPages consistent.
- [ ] **Ticket ID search:** Searching by full ticket ID (or display ID) returns that ticket when in scope; search does not rely only on title/description.
- [ ] **Completed ticket behavior:** Resolved/closed tickets do not appear in active-only feed; they appear in Completed/History view; get-by-id still works for completed tickets when in scope.
- [ ] **Dashboard behavior:** Studio dashboard tab shows metrics and small “Recent activity” with link to full feed; no full paginated feed on dashboard. Admin/Department dashboard either metrics-only or one canonical feed section; no duplicate feed logic.
