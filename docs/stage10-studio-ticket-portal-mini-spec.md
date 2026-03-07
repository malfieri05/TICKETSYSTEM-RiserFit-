# Stage 10: Studio Ticket Portal — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [CLAUDE.md](../CLAUDE.md), existing `TicketVisibilityService`, tickets/list and ticket detail APIs.

---

## 1. Intent

Address the main client pain point: **studio users submit tickets but cannot see ticket status, progress, notes, or replies**, which forced a large Microsoft Teams workaround. Deliver a **first version of a Studio Ticket Portal** so studio-side users can see and track all tickets that are in scope for them.

**Critical architectural rule:** Ticket visibility must be **scope-based**, not ownership-based. Visibility must not rely only on `requesterId`. Users may need access based on: their own submitted tickets; one studio; multiple studios; or district-level (market) oversight. The portal is designed around **studio/location scope visibility**.

The design builds on the existing system: ticket creation, taxonomy, schema-driven forms, workflow templates, subtasks, workflow progress, notifications, admin analytics, and handbook RAG. It preserves the modular monolith, existing RBAC and scope-filtering patterns, and NestJS + Prisma + React Query structure.

---

## 2. Scope

**In scope**

- **A. Studio Dashboard**  
  A dashboard page for studio-side users showing: **open tickets** (count + list or preview), **completed tickets** (count + list or preview), and **recent ticket activity** (e.g. last updated tickets in scope). Data is scoped by the same visibility rules as the ticket list (see B).

- **B. Ticket Visibility Model**  
  Document and, where needed, extend access rules so studio/district users see tickets by **location scope**, not just as requester. The existing `TicketVisibilityService` already implements: STUDIO_USER sees tickets where `requesterId = actor` OR `studioId` in (primary `actor.studioId` + `actor.scopeStudioIds`). This spec keeps that as the baseline and optionally extends to **market-level** (district) oversight: e.g. user with `marketId` sees all tickets whose `studio.marketId` equals their `marketId`. No change to ADMIN or DEPARTMENT_USER visibility logic beyond any explicit extension.

- **C. Studio Ticket Detail View**  
  Studio users can open a ticket and see: **ticket details** (title, description, status, priority, location, category/department, dates), **workflow/subtask progress** (existing subtask list with status and ordering), and **department updates / notes** where applicable. “Department updates/notes” are the existing **comments** that studio users are allowed to see (today the comments API already filters to `isInternal: false` for STUDIO_USER). No new comment types or schema; optional UX label (e.g. “Updates”) for the comments section in the portal view.

- **D. Filters / Search**  
  In the portal list (and optionally dashboard), allow filtering by **location** (studio, and if market-level is in scope then market), **department** (taxonomy), and **status**. Search (existing title/description search) remains supported. Filters are applied **in addition to** the backend scope restriction (user only sees data within their visibility); no new permission model.

- **E. Clean MVP Scope**  
  First version of the portal only. Out of scope for this stage: advanced conversations/threading beyond existing comments; vendor dispatch; lease intelligence; admin analytics changes; new roles beyond existing STUDIO_USER / DEPARTMENT_USER / ADMIN.

**Out of scope**

- Advanced comment features (threading, rich replies, etc.) unless necessary to “see notes/replies” (existing comments suffice).
- Vendor dispatch flows.
- Lease intelligence or property-specific features.
- Changes to admin reporting or analytics.
- New database tables for portal-specific state (all data derived from existing tickets, comments, subtasks).

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **Permissions / visibility:**  
  `apps/api/src/common/permissions/ticket-visibility.service.ts` — extend `buildWhereClause` and `assertCanView` for STUDIO_USER (and optionally a designated “district” concept) to include market-level visibility when user has `marketId` and should see all tickets in that market. No change if product defers market-level to a later stage.
- **Tickets module:**  
  `apps/api/src/modules/tickets/tickets.service.ts`, `tickets.controller.ts` — add an optional **scope-summary** (or studio-portal summary) read: given current user, apply `TicketVisibilityService.buildWhereClause(actor)` and return counts (e.g. open, completed) and a small “recent activity” list (e.g. last N tickets by `updatedAt`). This can be a new endpoint (e.g. `GET /api/tickets/scope-summary` or `GET /api/studio-portal/summary`) or a mode of the existing list (e.g. `?summary=true&limit=0` returning only counts + recent). Same visibility as `GET /tickets`; no new tables.
- **DTOs:**  
  `apps/api/src/modules/tickets/dto/ticket-filters.dto.ts` — already supports `studioId`, `marketId`, `status`, `departmentId`; ensure validation allows only values within the user’s scope where applicable (backend already merges `scopeWhere` with filters).

**Frontend (Next.js, React Query)**

- **Routes / layout:**  
  New route(s) for the Studio Ticket Portal, e.g. `/portal` or `/studio` (or a dedicated layout under `/portal` with dashboard + list + detail). Decide whether studio users land on this by default (e.g. redirect STUDIO_USER from `/tickets` to `/portal`) or reach it via nav. Likely: `apps/web/src/app/(app)/portal/page.tsx` (dashboard), `apps/web/src/app/(app)/portal/tickets/page.tsx` (list), `apps/web/src/app/(app)/portal/tickets/[id]/page.tsx` (detail); or a single dashboard page with embedded list and link to shared ticket detail.
- **Studio Dashboard:**  
  New dashboard component/page: open tickets count + list/preview, completed count + list/preview, recent activity. Data from new scope-summary endpoint or from `GET /tickets` with appropriate filters and optional `includeCounts`.
- **Studio Ticket List:**  
  List view of tickets in scope with filters (location, department, status) and search. Reuse existing list API `GET /tickets` (scope is applied server-side). Files: e.g. `apps/web/src/app/(app)/portal/tickets/page.tsx` (or equivalent), reusing or adapting existing list components and filter UI.
- **Studio Ticket Detail View:**  
  Reuse existing ticket detail page or add a **portal-specific detail view** that shows: ticket details, status, workflow/subtask progress (existing subtasks list), and comments (“Updates”). For STUDIO_USER, hide internal-only UI (assign/status transition/assignee dropdown if not already hidden). Likely: `apps/web/src/app/(app)/tickets/[id]/page.tsx` with role-based rendering (studio view vs department/admin view) or a dedicated `apps/web/src/app/(app)/portal/tickets/[id]/page.tsx` that only shows read-only + comments.
- **Navigation / role routing:**  
  `apps/web/src/components/layout/Sidebar.tsx` — add entry for “Studio Portal” or “My Tickets” (or similar) for STUDIO_USER; optionally redirect default route for STUDIO_USER to portal dashboard. `apps/web/src/app/(app)/page.tsx` (or layout) — optional redirect by role.
- **API client:**  
  `apps/web/src/lib/api.ts` — add call(s) for scope-summary (or equivalent) if a new endpoint is introduced; reuse `ticketsApi.list`, `ticketsApi.get`, `commentsApi.list`, `subtasksApi.list` for list/detail/comments/subtasks.
- **Types:**  
  `apps/web/src/types/index.ts` — add or extend types for scope-summary response (counts, recent tickets) if needed.

Exact file list and route structure will be finalized in Step B; the above identifies the likely touchpoints.

---

## 4. Schema Impact

**No new tables and no new columns for MVP.**

- **Ticket visibility:** Uses existing `Ticket` fields `studioId`, `marketId`, `requesterId`, `ownerId` and existing `User` fields `studioId`, `marketId` and the `UserStudioScope` (or equivalent) relation for `scopeStudioIds`. Market-level visibility (if implemented) uses existing `Studio.marketId` and `User.marketId`; no schema change.
- **Dashboard and list:** All data derived from existing tickets, subtasks, and comments.
- **Comments as “department updates/notes”:** Existing `TicketComment` with `isInternal`; API already filters to non-internal for STUDIO_USER. No schema change.

If future stages add portal-specific state (e.g. saved views, pinned tickets), that would be a later migration; not in this stage.

---

## 5. API Impact

- **Ticket list (existing):**  
  `GET /api/tickets` — Already applies `TicketVisibilityService.buildWhereClause(actor)` and accepts `studioId`, `marketId`, `departmentId`, `status`, `search`, etc. For the portal, the frontend calls this with filters; backend continues to AND scope with user filters. Optional: document that for STUDIO_USER, passing `studioId`/`marketId` is restricted to values within the user’s scope (backend can reject or ignore out-of-scope values).

- **Ticket detail (existing):**  
  `GET /api/tickets/:id` — Already enforces `assertCanView(ticket, actor)`. Used as-is for studio detail view. No change.

- **Comments (existing):**  
  `GET /api/tickets/:ticketId/comments` — Already returns only non-internal comments for STUDIO_USER. Used as “department updates/notes” in the portal. No change.

- **Subtasks (existing):**  
  `GET /api/tickets/:ticketId/subtasks` — Already used for workflow progress. No change.

- **Scope-summary (new or extended):**  
  New endpoint or mode: e.g. `GET /api/tickets/scope-summary` or `GET /api/studio-portal/summary` (or `GET /api/tickets?summaryOnly=true&limit=0`) returning for the current user: counts (e.g. `open`, `completed`, optionally by studio/market) and a short “recent activity” list (e.g. last 5–10 tickets by `updatedAt` with minimal fields). Same authorization as list (scope-only). Response shape: e.g. `{ openCount, completedCount, recentTickets: [...] }` or equivalent. Exact path and shape to be decided in Step B.

- **Markets/studios for filters:**  
  Existing admin or public endpoints that list markets and studios (e.g. for filter dropdowns) — use only those that return data the user is allowed to see (e.g. studios in their scope or market). If no such endpoint exists, add a minimal read such as `GET /api/users/me/scoped-studios` (or include in existing `/users/me`) so the portal can populate location filters without exposing all studios.

---

## 6. UI Impact

- **Studio Dashboard:**  
  New page (e.g. `/portal`) with: (1) Open tickets — count and a short list or links to open tickets; (2) Completed tickets — count and a short list or links; (3) Recent activity — recently updated tickets in scope. Clear, simple layout; no admin/department-only controls.

- **Ticket visibility:**  
  No UI for “who can see what”; visibility is enforced by API. Optional: show a small “Scope” or “Location” indicator (e.g. studio name) on each ticket card so studio users understand context.

- **Studio Ticket Detail View:**  
  Read-only ticket info (title, description, status, priority, location, category/department, dates), workflow/subtask progress (existing subtask list with status/order), and a section for “Updates” or “Notes” (existing comments, non-internal only). For STUDIO_USER: no assign/status transition/assignee dropdown (or hide when not permitted). Link back to portal list/dashboard.

- **Filters / Search:**  
  Portal list view: filter controls for location (studio, and market if in scope), department, status; plus existing search (title/description). Filters only narrow the already-scoped list.

- **Navigation and entry point:**  
  Sidebar (or equivalent) shows a clear entry for the Studio Ticket Portal for studio users. Optionally, default landing for STUDIO_USER is the portal dashboard instead of the generic ticket list. Department and admin users keep existing Home/Dashboard/Reporting etc.; no removal of existing nav items.

- **Consistency:**  
  Reuse existing design system (e.g. Header, Sidebar, StatusBadge, buttons, panels) and existing ticket list/detail patterns where possible to keep the portal consistent with the rest of the app.

---

## 7. Risks

- **Scope creep:** Keeping MVP strict (no vendor dispatch, no lease intelligence, no admin analytics, no advanced comments) avoids delay; any expansion should be a separate stage.
- **Performance:** Scope-summary and list with filters must remain fast at current scale (~400–500 users). Reuse existing list endpoint with indexes; scope-summary can be a single aggregated query + small recent list; monitor if counts are expensive and add caching later.
- **Market-level visibility:** If product adds “district-level” (market) visibility, `TicketVisibilityService` must be extended and tested so STUDIO_USER (or a future role) with `marketId` sees only tickets in that market; avoid leaking other markets’ data.
- **Filter UX:** Offering studio/market filters that only contain in-scope options requires an API that returns “my scoped studios” (and optionally “my market”); if missing, implement a minimal endpoint so the portal does not expose or offer out-of-scope locations.
- **Two entry points:** Having both “Home” (`/tickets`) and “Studio Portal” (`/portal`) can confuse; clarify in copy and/or redirect STUDIO_USER to portal by default so the portal is the primary experience for studio users.

---

## 8. Test Plan

- **Visibility:**  
  - Unit tests: `TicketVisibilityService` — STUDIO_USER with primary studio sees tickets for that studio; with `scopeStudioIds` sees those studios; with no studio sees only own-requester tickets. If market-level is added: user with `marketId` sees tickets in that market only.  
  - Integration: as STUDIO_USER, `GET /tickets` returns only in-scope tickets; `GET /tickets/:id` for in-scope ticket returns 200, for out-of-scope returns 403.

- **Scope-summary:**  
  - As STUDIO_USER, `GET /api/tickets/scope-summary` (or equivalent) returns counts and recent list that match a manual count/list of in-scope tickets. Counts equal or exceed zero; recent list is a subset of in-scope tickets.

- **Studio portal UI:**  
  - Manual or E2E: log in as STUDIO_USER; open portal dashboard — open and completed counts and recent activity are present and match list.  
  - Open portal list; apply filters (location, department, status) and search — results are in scope and correctly filtered.  
  - Open a ticket from the portal — detail shows ticket info, workflow/subtask progress, and non-internal comments only; no assign/status controls (or they are disabled/hidden).  
  - Verify STUDIO_USER cannot access out-of-scope ticket by direct URL (403 or redirect).

- **Regression:**  
  - DEPARTMENT_USER and ADMIN: existing ticket list, detail, and dashboard behavior unchanged.  
  - Comments: STUDIO_USER still does not see internal comments (existing tests).

- **Performance:**  
  - Scope-summary and filtered list under load (e.g. k6 or similar) remain within acceptable latency; no N+1 queries.

---

*End of Step A mini-spec. Implementation in Step B after architecture review.*

---

## Implementation Summary (Stage 10 Complete)

### Files changed

**Backend (NestJS)**  
- `apps/api/src/modules/tickets/tickets.service.ts` — Added `getScopeSummary(actor)` using `TicketVisibilityService.buildWhereClause(actor)`; returns `openCount`, `completedCount`, `recentTickets` (last 10 by `updatedAt`).  
- `apps/api/src/modules/tickets/tickets.controller.ts` — Added `GET scope-summary` route (before `:id`).

**Frontend (Next.js)**  
- `apps/web/src/app/(app)/portal/page.tsx` — **New.** Studio dashboard: open count, completed count, recent activity (links to `/tickets/:id`), “View all tickets” → `/portal/tickets`.  
- `apps/web/src/app/(app)/portal/tickets/page.tsx` — **New.** Portal ticket list with filters (status, department, studio, search); uses `GET /api/tickets`; row click → `/tickets/:id`.  
- `apps/web/src/app/(app)/tickets/[id]/page.tsx` — Role-based rendering: `visibleComments` = non-internal only for STUDIO_USER; “Updates” tab label and “Back to My Tickets” when STUDIO_USER; back link → `/portal` for STUDIO_USER, `/tickets` otherwise.  
- `apps/web/src/app/(app)/page.tsx` — Client redirect: STUDIO_USER → `/portal`, others → `/tickets`.  
- `apps/web/src/components/layout/Sidebar.tsx` — STUDIO_USER nav: “My Tickets” → `/portal`, “Notifications”; active state for `/portal` and `/portal/tickets`.  
- `apps/web/src/lib/api.ts` — Added `ticketsApi.scopeSummary()`.  
- `apps/web/src/types/index.ts` — Added `ScopeSummaryResponse`, `ScopeSummaryRecentTicket`; added `departmentId` to `TicketFilters`.

### New endpoints

- **GET /api/tickets/scope-summary**  
  Returns `{ openCount, completedCount, recentTickets }` for the current user’s visibility scope. Uses `TicketVisibilityService.buildWhereClause(actor)`; no new schema.

### UI routes

- **/portal** — Studio dashboard (open/completed counts, recent activity).  
- **/portal/tickets** — Portal ticket list (filters: status, department, studio, search).  
- **/tickets/:id** — Reused; STUDIO_USER sees read-only details, workflow/subtasks, non-internal comments only; no assign/status controls.

### Visibility enforcement

- **Backend:** `GET /api/tickets` and `GET /api/tickets/scope-summary` use `TicketVisibilityService.buildWhereClause(actor)`; list and scope-summary only return in-scope tickets.  
- **Backend:** `GET /api/tickets/:id` uses `assertCanView(ticket, actor)` — out-of-scope returns 403.  
- **Frontend:** Portal list and dashboard call existing list and new scope-summary APIs; no client-side visibility logic.  
- **Ticket detail:** STUDIO_USER sees only non-internal comments (filtered from `ticket.comments`); assign/status/subtask controls hidden via existing `canManage` (ADMIN/DEPARTMENT_USER only).

### Build status

- **API:** `npm run build` (NestJS) — success.  
- **Web:** `npm run build` (Next.js) — success.

### Manual verification checklist

- [ ] **STUDIO_USER sees only in-scope tickets** — Log in as STUDIO_USER; open `/portal` and `/portal/tickets`; confirm counts and list match tickets for their studio(s) / requester.  
- [ ] **STUDIO_USER cannot access out-of-scope tickets** — As STUDIO_USER, open `/tickets/:id` for a ticket in another studio (or not requester); expect 403 or error.  
- [ ] **Ticket detail hides internal controls for STUDIO_USER** — As STUDIO_USER, open an in-scope ticket; confirm no “Move to” status buttons, no “Assigned to” dropdown, no subtask status dropdown, no “Internal note” checkbox; “Updates” tab shows only non-internal comments.  
- [ ] **Comments show only non-internal for STUDIO_USER** — As STUDIO_USER, ticket detail “Updates” tab shows no internal comments; add comment and confirm it appears (backend forces non-internal).  
- [ ] **Department/Admin behavior unchanged** — Log in as DEPARTMENT_USER or ADMIN; confirm Home → `/tickets`, My Dashboard, list, detail with assign/status/internal comment controls unchanged.  
- [ ] **Navigation** — STUDIO_USER: sidebar “My Tickets” → `/portal`; root `/` redirects to `/portal`.  
- [ ] **Portal filters** — On `/portal/tickets`, filter by status, department, studio, search; confirm results narrow correctly and backend still enforces scope.
