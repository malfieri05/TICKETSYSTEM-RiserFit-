# Stage 13: Vendor Dispatch Dashboard — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [CLAUDE.md](../CLAUDE.md), [Stage 12 Maintenance Reporting](stage12-maintenance-reporting-tagging-mini-spec.md), existing ticket list/filters, reporting module.

---

## 1. Intent

Address the client goal to **reduce maintenance costs by batching nearby jobs and grouping similar issues** before dispatching vendors. The client wants to:

- See other plumbing issues nearby when a plumber is going to Newport Beach
- See multiple maintenance issues at the same studio together
- Batch service calls when a district has multiple open issues of the same type

This stage designs the **first version of a Vendor Dispatch Dashboard** that helps internal/admin users **identify open maintenance work that can be grouped efficiently**. It does not implement dispatch execution (no vendor assignment, scheduling, or route optimization).

**Goals:**

- Provide an **internal/admin dashboard** focused on **open** maintenance tickets.
- Support **grouping and browsing** by studio/location, maintenance category, market/district, and “same studio with multiple open issues.”
- Surface **batch work visibility**: multiple open issues at one studio, same-category issues across a market, repeated issues that may justify one trip.
- Keep all logic inside the **ticket domain** (no separate field-service or vendor system).
- Use **filtering and grouping only** — no scheduling engine, no route optimization, no maps in this stage.

**Architectural rules:**

1. **Dispatch stays in the ticket domain** — No separate field-service or vendor management system; dispatch view = filtered and grouped maintenance tickets.
2. **Dispatch is filter- and group-based** — No scheduling or route-optimization engines in this stage.
3. **Operational, not AI-driven** — No AI recommendations, lease intelligence, or external maps/routing APIs.

---

## 2. Scope

**In scope**

- **A. Dispatch Dashboard View**  
  An **internal/admin** dashboard page dedicated to **open maintenance tickets**. Default scope: tickets where `ticketClass` = MAINTENANCE and `status` is open (e.g. NEW, TRIAGED, IN_PROGRESS, WAITING_ON_REQUESTER, WAITING_ON_VENDOR). The dashboard presents grouping views and filters so operators can decide what to batch or dispatch.

- **B. Grouping Views**  
  Support grouping and browsing open maintenance tickets by:
  - **Studio/location** — Group by `studioId`; show studio name, market name, count of open tickets, and a way to drill into the list of tickets (e.g. link to filtered ticket list or expandable row).
  - **Maintenance category** — Group by `maintenanceCategoryId`; show category name, count, and drill-down (e.g. “Plumbing” with 5 open → list those 5).
  - **Market/district** — Group by `marketId`; show market name, count, and drill-down.
  - **Same studio with multiple open issues** — A view or filter that highlights studios that have **more than one** open maintenance ticket (e.g. “Studios with 2+ open issues”), so operators can easily see locations where a single trip could cover multiple jobs.

  Implementation approach: either (1) dedicated dispatch endpoints that return grouped open maintenance tickets (counts + ticket ids or minimal ticket summary per group), or (2) reuse existing **GET /api/tickets** with filters (ticketClassId = MAINTENANCE, status in open set) plus existing or extended **maintenance reporting** endpoints restricted to **open statuses only** (e.g. by-studio, by-category, by-market with `status` filter). “Studios with multiple open issues” can be a variant of by-studio that returns only rows where count ≥ 2, or a separate small endpoint. Drill-down uses **GET /api/tickets** with studioId/maintenanceCategoryId/marketId and status filter.

- **C. Dispatch-Oriented Filters**  
  Support filters across the dashboard:
  - **Open status only** — Restrict to non-resolved, non-closed (default for dispatch view).
  - **Studio** — `studioId`; narrow to one location.
  - **Market** — `marketId`; narrow to one district.
  - **Maintenance category** — `maintenanceCategoryId`; e.g. “Plumbing only.”
  - **Date range** — `createdAfter`, `createdBefore` (e.g. “opened in last 7 days”).
  - **Priority** — Optional; useful to surface URGENT/HIGH when batching.

  All filters already exist on **GET /api/tickets** and on maintenance reporting (Stage 12); ensure dispatch dashboard can pass them (and that any new dispatch-specific endpoints accept the same filter set).

- **D. Batch Work Visibility**  
  Design how the dashboard surfaces:
  - **Multiple open issues at the same studio** — Table or list of studios with open maintenance count; sort or highlight by count descending so “3 open at Studio A” is obvious; click to see the tickets for that studio.
  - **Same-category issues across nearby studios/market** — e.g. “Plumbing in Orange County”: group by market then by category, or filter by market + category and show list; operator sees “5 plumbing tickets in this market” and can open each or link to filtered list.
  - **Repeated maintenance issues** — Reuse or reference Stage 12 “repeat issues” (same studio + same category, count ≥ threshold) but **restricted to open tickets only** so dispatch sees “same location, same category, still open” as a batching cue.

  No new domain concepts; all derived from Ticket + Studio + Market + MaintenanceCategory.

- **E. Clean MVP Scope**  
  First version of the dispatch dashboard only. **Out of scope for this stage:** actual vendor assignment, scheduling calendars, route optimization, maps integration, cost modeling, AI reasoning. Optional: export list of open maintenance tickets (CSV) for the current filter/view.

**Out of scope**

- Vendor assignment or vendor master data.
- Scheduling or calendar UI/API.
- Route optimization or “nearby” distance computation (e.g. no maps API).
- Cost or pricing logic.
- AI-driven batching recommendations.
- Lease or property intelligence.

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **Reporting or new dispatch module**  
  Option A — Extend **reporting**: Add endpoints (or query params) that restrict existing maintenance reporting to **open statuses only** (e.g. `status` in [NEW, TRIAGED, IN_PROGRESS, WAITING_ON_REQUESTER, WAITING_ON_VENDOR]). Add optional endpoint or param for “studios with multiple open issues” (by-studio where count ≥ 2).  
  Option B — New **dispatch** module (e.g. `apps/api/src/modules/dispatch/`) with a small service that builds “open maintenance” where clause and reuses grouping logic (by studio, by category, by market, studios-with-multiple).  
  Recommendation: **Option A** to avoid scope creep; add `status` filter to existing maintenance reporting endpoints (they already accept optional status) and ensure default or explicit “open only” for dispatch. Add one optional endpoint **GET /api/reporting/maintenance/open-by-studio** (or reuse by-studio with status=open set) and document “studios with 2+ open” as a filter or client-side filter on by-studio response. If reporting currently does not restrict to open, add a query param `openOnly=true` for dispatch use.

- **Tickets module**  
  No change required if **GET /api/tickets** already supports ticketClassId, status, studioId, marketId, maintenanceCategoryId, createdAfter, createdBefore, priority. Dashboard will call this for drill-down lists.

**Frontend (Next.js, React Query)**

- **New dispatch dashboard page**  
  `apps/web/src/app/(app)/admin/dispatch/page.tsx` (or under `admin/reporting` as a tab “Dispatch”) — New page: title “Vendor Dispatch” or “Dispatch Dashboard”; filters (studio, market, maintenance category, date range, priority, open-only implied); grouping views: **By studio** (table: studio name, market, open count; link or expand to ticket list), **By category** (category name, open count; link to ticket list), **By market** (market name, open count; link to ticket list), **Studios with multiple open issues** (table of studios where open count ≥ 2). Drill-down: link to **GET /api/tickets** with appropriate filters (e.g. `ticketClassId=MAINTENANCE&studioId=…&status=…`). Use existing ticket list API and, if added, open-only maintenance reporting endpoints.

- **API client and types**  
  `apps/web/src/lib/api.ts` — Add methods for dispatch-specific endpoints (if any), e.g. open-by-studio or reuse maintenance reporting with `status`/`openOnly` params. Types for grouped open maintenance response.

- **Navigation**  
  `apps/web/src/components/layout/Sidebar.tsx` — Add “Dispatch” or “Vendor Dispatch” under Admin section, linking to the new dashboard (ADMIN only).

Exact file list will be finalized in Step B.

---

## 4. Schema Impact

**No new tables and no new columns.**

- **Open maintenance** — Derived from existing `Ticket` with `ticketClass` = MAINTENANCE and `status` in open set. No new fields.
- **Grouping** — Uses existing `studioId`, `marketId`, `maintenanceCategoryId`. No schema change.
- **Batch visibility** — “Studios with multiple open” and “same category in market” are computed from existing data (groupBy + count, filter open).

---

## 5. API Impact

- **GET /api/tickets**  
  Already supports ticketClassId, status, studioId, marketId, maintenanceCategoryId, createdAfter, createdBefore, priority. **No change.** Dispatch dashboard uses this for drill-down (filter ticketClassId = MAINTENANCE, status in open set, plus optional studio/market/category/date/priority).

- **Maintenance reporting (Stage 12)**  
  Endpoints already accept optional **status** (and date range, studio, market, category). If they do not yet restrict to “open only,” add optional query param **openOnly=true** (or multiple status values) so the same by-studio, by-category, by-market, repeat-issues endpoints can return **open maintenance only** for the dispatch dashboard. Response shapes stay the same; only the underlying where clause adds status filter.

- **Optional new endpoint**  
  **GET /api/reporting/maintenance/open-by-studio** (or equivalent) — Same as by-studio but restricted to open statuses; optional “minCount=2” to return only studios with at least 2 open issues. Alternatively, document that client calls existing by-studio with `status=NEW&status=TRIAGED&…` (if API supports multiple status) or `openOnly=true`, then filters rows with count ≥ 2 for “studios with multiple open” view. Prefer reusing existing endpoints with params over new routes.

- **Authorization**  
  Dispatch dashboard and any dispatch-specific or open-only reporting calls remain **ADMIN only** (or same as maintenance reporting).

---

## 6. UI Impact

- **Dispatch Dashboard**  
  New admin page (e.g. `/admin/dispatch`): header “Vendor Dispatch” or “Dispatch Dashboard”; subheading that this view shows **open maintenance tickets** for batching. Filter bar: Studio, Market, Maintenance category, Date range (created), Priority (optional). All views show only open tickets.

- **Grouping views**  
  - **By studio** — Table: Studio name, Market, Open count. Sort by count descending. Row click or “View tickets” links to ticket list filtered by that studio + MAINTENANCE + open status.
  - **By category** — Table: Category name, Open count. Link to ticket list filtered by that category + MAINTENANCE + open status.
  - **By market** — Table: Market name, Open count. Link to ticket list filtered by that market + MAINTENANCE + open status.
  - **Studios with multiple open** — Table of studios where open count ≥ 2 (Studio, Market, Open count, optional category breakdown). Emphasize “batch opportunity”; link to tickets for that studio.

- **Batch work visibility**  
  - “Multiple issues at same studio” is the “Studios with multiple open” view.
  - “Same category across market” is achieved by filtering By category + by Market (or By market then drill by category).
  - “Repeated issues” (same studio + same category, open) can be a small table or badge: reuse repeat-issues logic with **open only** (and optional threshold); link to ticket list for that studio + category.

- **No new global layout**  
  Dispatch is one new admin page; sidebar gets one new link under Admin. No maps, no calendar, no vendor assignment UI.

---

## 7. Risks

- **Terminology** — “Dispatch” may imply assigning a vendor or sending a work order; clarify in UI that this is a **planning/batching view** only (identify work to group; actual dispatch is manual or future stage).
- **Open status set** — Ensure consistent definition of “open” (e.g. exclude RESOLVED and CLOSED only; include WAITING_ON_VENDOR so work waiting on vendor is still visible for batching). Document in API and UI.
- **Performance** — Grouping open maintenance by studio/category/market is the same pattern as Stage 12; if reporting is fast, dispatch views will be. If needed, add index or limit to “studios with multiple” result set.
- **Overlap with reporting** — Maintenance reporting (Stage 12) shows all statuses by default; dispatch shows open only. Avoid duplicating logic; prefer shared endpoints with a status or openOnly parameter.

---

## 8. Test Plan

- **Open-only scope**  
  - With only open maintenance tickets in DB, dispatch views show correct counts.  
  - After resolving some tickets, dispatch counts decrease; maintenance reporting (all statuses) counts unchanged or as expected.

- **Grouping**  
  - By studio: each row matches manual count of open MAINTENANCE tickets for that studio.  
  - By category: same for category.  
  - By market: same for market.  
  - Studios with multiple open: only studios with count ≥ 2 appear; count matches.

- **Filters**  
  - Apply studio, market, category, date range, priority; confirm grouped counts and drill-down ticket list match.

- **Drill-down**  
  - “View tickets” or row click opens ticket list (or in-app list) with correct filters (ticketClassId=MAINTENANCE, status in open set, studio/market/category as selected). Ticket list returns only in-scope tickets.

- **Authorization**  
  - Dispatch page and open-only reporting calls restricted to ADMIN (or intended role).  
  - DEPARTMENT_USER without access gets 403 or does not see Dispatch link.

- **Regression**  
  - Maintenance reporting (Stage 12) still works with no status filter (all statuses).  
  - General ticket list and other reporting unchanged.

---

*End of Step A mini-spec. Implementation in Step B after architecture review.*

---

## Implementation Summary (Step B)

**Constraints followed:** No new dispatch module; all logic in `apps/api/src/modules/reporting`. Dispatch = open maintenance only (`ticketClass.code = 'MAINTENANCE'`, `status NOT IN ('RESOLVED','CLOSED')`). No schema changes.

### Files changed

| File | Change |
|------|--------|
| `apps/api/src/modules/reporting/dto/dispatch-filters.dto.ts` | **New.** DTO: studioId, marketId, maintenanceCategoryId, createdAfter, createdBefore, priority. |
| `apps/api/src/modules/reporting/reporting.service.ts` | Added `buildOpenMaintenanceWhere(filters)` and four methods: `getDispatchByStudio`, `getDispatchByCategory`, `getDispatchByMarket`, `getDispatchStudiosWithMultiple`. |
| `apps/api/src/modules/reporting/reporting.controller.ts` | Added four GET routes under `reporting/dispatch/*`, each `@Roles(Role.ADMIN)`, query params via `DispatchFiltersDto`. |
| `apps/web/src/lib/api.ts` | Added `reportingApi.dispatchByStudio`, `dispatchByCategory`, `dispatchByMarket`, `dispatchStudiosWithMultiple` (all accept optional filter params). |
| `apps/web/src/components/layout/Sidebar.tsx` | Added admin item "Vendor Dispatch" → `/admin/dispatch`. |
| `apps/web/src/app/(app)/admin/dispatch/page.tsx` | **New.** Vendor Dispatch page: filters (studio, market, maintenance category, date range, priority), four sections (by studio, by category, by market, studios with multiple), row click → ticket list with filters. |
| `apps/web/src/app/(app)/tickets/page.tsx` | Initialize filters from URL search params (ticketClassId, studioId, marketId, maintenanceCategoryId) once on mount; Clear filters includes these keys. |
| `packages/types/index.ts` | Extended `TicketFilters` with `ticketClassId`, `maintenanceCategoryId`. |

### New endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reporting/dispatch/by-studio` | ADMIN | Open maintenance counts grouped by studio; optional query: studioId, marketId, maintenanceCategoryId, createdAfter, createdBefore, priority. |
| GET | `/api/reporting/dispatch/by-category` | ADMIN | Open maintenance counts grouped by maintenanceCategoryId. Same query params. |
| GET | `/api/reporting/dispatch/by-market` | ADMIN | Open maintenance counts grouped by marketId. Same query params. |
| GET | `/api/reporting/dispatch/studios-with-multiple` | ADMIN | Same grouping by studio, only rows where count ≥ 2. Same query params. |

### Prisma queries used

- **buildOpenMaintenanceWhere:** `TicketWhereInput` with `ticketClass: { code: 'MAINTENANCE' }`, `status: { notIn: ['RESOLVED','CLOSED'] }`, plus optional studioId, marketId, maintenanceCategoryId, priority, createdAt range.
- **getDispatchByStudio:** `prisma.ticket.groupBy({ by: ['studioId'], where, _count })`; then resolve studio names (and market names) via `studio.findMany` / `market.findMany`.
- **getDispatchByCategory:** `prisma.ticket.groupBy({ by: ['maintenanceCategoryId'], where, _count })`; resolve names via `maintenanceCategory.findMany`.
- **getDispatchByMarket:** `prisma.ticket.groupBy({ by: ['marketId'], where, _count })`; resolve names via `market.findMany`.
- **getDispatchStudiosWithMultiple:** Same groupBy by studioId with same where; filter rows with `_count._all >= 2`; resolve studio/market names as in by-studio.

### UI additions

- **Vendor Dispatch** (`/admin/dispatch`): Title "Vendor Dispatch". Filter bar: Studio, Market, Maintenance category, Date range (From/To), Priority, Clear filters. Four sections:
  - **Open Issues by Studio** — Rows: studio name, market name, open count; click → `/tickets?ticketClassId=<MAINTENANCE_ID>&studioId=...`
  - **Open Issues by Category** — Rows: category name, open count; click → `...&maintenanceCategoryId=...`
  - **Open Issues by Market** — Rows: market name, open count; click → `...&marketId=...`
  - **Studios With Multiple Open Issues** — Rows: studio name, market name, count (≥ 2); click → `...&studioId=...`
- **Sidebar:** Admin → "Vendor Dispatch" link.
- **Tickets page:** Reads `ticketClassId`, `studioId`, `marketId`, `maintenanceCategoryId` from URL on load (e.g. from dispatch drill-down); Clear filters resets these as well.

### Build status

- `apps/api`: `npx tsc --noEmit` ✅
- `apps/web`: `npx tsc --noEmit` ✅

### Manual verification checklist

- [ ] As ADMIN, open `/admin/dispatch`. Page loads with title "Vendor Dispatch" and four sections.
- [ ] With no open maintenance tickets, all sections show "No open maintenance tickets" / "No studios with 2+ open issues".
- [ ] Create/open some MAINTENANCE tickets (not RESOLVED/CLOSED). By-studio, by-category, by-market show correct counts; studios with 2+ appear in "Studios With Multiple Open Issues".
- [ ] Apply filters (studio, market, category, date range, priority). Counts update; Clear filters resets them.
- [ ] Click a row in "By Studio". Navigate to `/tickets` with ticketClassId and studioId; ticket list is filtered to that studio and maintenance class.
- [ ] Click a row in "By Category" / "By Market". Same behavior with maintenanceCategoryId / marketId.
- [ ] As non-ADMIN (e.g. DEPARTMENT_USER), dispatch links return 403; sidebar does not show "Vendor Dispatch" (if guarded by role).
- [ ] Tickets page: open `/tickets?ticketClassId=...&studioId=...` directly; list loads with those filters; Clear filters clears them.
