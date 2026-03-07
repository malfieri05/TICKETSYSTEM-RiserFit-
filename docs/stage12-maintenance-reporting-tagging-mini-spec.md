# Stage 12: Maintenance Reporting & Tagging — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [CLAUDE.md](../CLAUDE.md), existing ticket taxonomy (`TicketClass`, `MaintenanceCategory`), reporting module, ticket filters.

---

## 1. Intent

Address the client requirement for **maintenance reporting** as a major operational need. The client wants to track issues such as HVAC, plumbing, electrical, toilet/facility issues, and facility history by location, and to answer questions like:

- How many plumbing issues has Newport Beach had?
- What maintenance issues has this location had over time?
- How many HVAC issues occurred in Orange County this quarter?
- What categories of issues are most common by location or district?

The design should also support **future dispatch optimization** (e.g. group nearby/open issues by type, identify repeated issues by location, clean historical reporting) without implementing dispatch in this stage.

**Goals:**

- Provide **structured maintenance issue classification** for reliable reporting (no freeform-only tagging for this use case).
- Store classification on **tickets** in a way that supports filtering and aggregation.
- Deliver **location-aware maintenance reporting views** (by studio, by market/district, by category, over time, repeat issues).
- Keep all reporting inside the **ticket domain** (no separate facilities management system).
- Use **existing ticket taxonomy and reporting foundations** where possible.

**Architectural rules:**

1. **Maintenance reporting stays in the ticket domain** — No separate facilities or asset system; maintenance = tickets with ticket class MAINTENANCE and structured category.
2. **Tagging is structured** — Issue classification uses admin-configurable categories (e.g. `MaintenanceCategory`), not arbitrary freeform tags alone.
3. **Reporting is location-aware** — Filtering and grouping by studio and market are central; reuse existing `studioId` / `marketId` on `Ticket`.

---

## 2. Scope

**In scope**

- **A. Maintenance Issue Classification**  
  Use the existing **MaintenanceCategory** entity as the structured classification for maintenance issues. Categories are admin-configurable (name, optional description, color, sortOrder). Recommend or document a **standard set** for operations: e.g. Plumbing, HVAC, Electrical, Paint, Furniture, Foundational/Building, Toilet / Restroom, Other. No new table; if admin does not yet have full CRUD for maintenance categories, design for a minimal admin UI to list/create/edit/order categories so the client can maintain the list without code deploys. Classification is **single per ticket** for MVP (one `maintenanceCategoryId` per ticket; tickets already have this field when `ticketClass` is MAINTENANCE).

- **B. Ticket Tagging / Categorization**  
  Maintenance tickets **store** the classification via the existing **Ticket.maintenanceCategoryId** (and **Ticket.ticketClassId** = MAINTENANCE). No new schema. Ensure:
  - Ticket create/update and list/detail APIs already expose `maintenanceCategoryId` and `maintenanceCategory` (name, etc.); confirm and document.
  - Ticket list and reporting filters support **maintenanceCategoryId** and, where useful, **ticketClassId** (e.g. restrict to MAINTENANCE for maintenance-only views). Existing `TicketFiltersDto` already has `maintenanceCategoryId`; reporting may need new or extended endpoints that filter by ticket class + maintenance category.

- **C. Maintenance Reporting Views**  
  Design reporting views for internal/admin users that can answer:
  - **Issue counts by location (studio)** — Count of maintenance tickets grouped by `studioId` (with studio name); optional filter by category, date range, status.
  - **Issue counts by category** — Count of maintenance tickets grouped by `maintenanceCategoryId` (with category name); optional filter by studio, market, date range, status.
  - **Issue counts by district/market** — Count of maintenance tickets grouped by `marketId` (with market name); optional filter by category, date range, status. Reuse existing reporting by-market pattern but scoped to MAINTENANCE tickets when “maintenance reporting” is selected.
  - **Repeat issues at the same location** — Identify studios (or studio + category) that have more than one maintenance ticket (e.g. same studioId + same maintenanceCategoryId with count > 1, or same studioId with total count above a threshold). Definition of “repeat” for MVP: same studio + same maintenance category, count ≥ 2; no temporal “reopened” logic required unless specified.
  - **History by location** — List or timeline of maintenance tickets for a chosen studio (or market) with date range and optional category/status filters; supports “what maintenance issues has this location had over time?”

  Implementation approach: **extend the reporting module** with maintenance-specific endpoints or query params that restrict to tickets where `ticketClass.code === 'MAINTENANCE'` (or `ticketClassId` = MAINTENANCE class id) and apply filters (studioId, marketId, maintenanceCategoryId, date range, status). Reuse existing patterns (groupBy, count, join to studio/market/category for names).

- **D. Filtering**  
  Support filters consistently across list and reporting:
  - **Location (studio)** — `studioId`; already on Ticket and in filters.
  - **Category** — `maintenanceCategoryId` for maintenance; already in ticket filters.
  - **Date range** — `createdAt` and optionally `resolvedAt` / `closedAt` (e.g. createdAfter, createdBefore, or a generic date range); reporting and list already support or can accept date params.
  - **Status** — `status`; already supported.
  - **Market/district** — `marketId`; already on Ticket and in filters.

  All filters apply on top of existing visibility/scope where applicable (e.g. reporting may be admin-only or role-restricted).

- **E. Clean MVP Scope**  
  First version of maintenance reporting only. **Out of scope for this stage:** vendor dispatch logic, lease intelligence, AI reasoning, external BI tools, multi-category-per-ticket (e.g. “plumbing + electrical” on one ticket). Optional: CSV/export for maintenance-only result sets for “clean historical maintenance reporting.”

**Out of scope**

- Vendor dispatch or optimization logic (design only supports future use).
- Lease or property intelligence.
- AI-driven insights or external BI integration.
- New ticket domain entities (e.g. assets, locations beyond Studio/Market).
- Freeform tags as the primary classification for maintenance reporting (structured category is primary).

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **Reporting module**  
  `apps/api/src/modules/reporting/reporting.service.ts` — Add maintenance-specific methods, e.g.: maintenance tickets count/group by studio (with studio name), by maintenance category (with category name), by market (restricted to MAINTENANCE), repeat-issues aggregation (studio + maintenanceCategoryId with count ≥ 2), and optional “history by location” (list maintenance tickets for a studio/market with filters). Each method restricts to tickets where ticket class is MAINTENANCE (join or filter on `ticketClassId` or `ticketClass.code`).  
  `apps/api/src/modules/reporting/reporting.controller.ts` — Add GET endpoints for maintenance reporting (e.g. `GET /reporting/maintenance/by-studio`, `by-category`, `by-market`, `repeat-issues`, optional `history` or reuse list with query params). Accept query params: studioId, marketId, maintenanceCategoryId, status, dateFrom, dateTo (or createdAfter/createdBefore).  
  DTOs or query validation for date range and filters as needed.

- **Admin module (optional)**  
  If maintenance categories are currently read-only from config: `apps/api/src/modules/admin/admin.service.ts` and controller — Add or extend list/create/update (and optional delete/deactivate) for **MaintenanceCategory** so admins can manage the classification list (e.g. Plumbing, HVAC, Electrical, …) without code changes. If already fully manageable, document only.

- **Tickets module**  
  No schema change. Confirm ticket list and detail already return `maintenanceCategory` and filters accept `maintenanceCategoryId`; add or adjust only if something is missing for the reporting UI (e.g. include in CSV export for maintenance).

**Frontend (Next.js, React Query)**

- **Admin reporting page**  
  `apps/web/src/app/(app)/admin/reporting/page.tsx` (or a dedicated maintenance reporting view) — Add a **Maintenance** section or tab: charts/tables for issue counts by studio, by category, by market; repeat-issues table (studio + category with count ≥ 2); optional “History by location” (e.g. select studio or market, date range, then list or table of maintenance tickets). Use new reporting API endpoints. Filters: location (studio), category, market, date range, status.

- **API client and types**  
  `apps/web/src/lib/api.ts` — Add methods for new maintenance reporting endpoints.  
  `apps/web/src/types/index.ts` — Add or extend types for maintenance reporting responses (by-studio, by-category, by-market, repeat-issues, history).

- **Ticket list/detail**  
  Ensure maintenance category is visible in list and detail when ticket is MAINTENANCE (likely already present); no structural change unless a filter dropdown for “Maintenance category” is missing in a view that needs it.

Exact file list will be finalized in Step B.

---

## 4. Schema Impact

**No new tables and no new columns for MVP.**

- **Classification** — Uses existing **MaintenanceCategory** (id, name, description, color, sortOrder, isActive). Tickets already have **maintenanceCategoryId** and **ticketClassId** (MAINTENANCE).
- **Location** — Uses existing **Ticket.studioId** and **Ticket.marketId** (and Studio, Market).
- **Reporting** — All aggregations and lists are derived from existing Ticket (+ ticketClass, maintenanceCategory, studio, market). No reporting-specific tables.

If the product later adds “multiple categories per ticket” or “maintenance sub-types,” that would be a separate schema change; not in this stage.

---

## 5. API Impact

- **Existing ticket APIs**  
  **GET /api/tickets** — Already supports `maintenanceCategoryId`, `studioId`, `marketId`, `status`, `createdAfter`, `createdBefore` in filters. No change to contract; ensure behavior is documented for maintenance-only filtering (e.g. combine with ticketClassId if needed).  
  **GET /api/tickets/:id** — Already returns maintenanceCategory; no change.

- **Existing reporting APIs**  
  **GET /api/reporting/by-market**, **by-category**, etc. — Remain as-is for general reporting. New endpoints are maintenance-specific so that existing dashboards are unchanged.

- **New maintenance reporting endpoints (design)**  
  - **GET /api/reporting/maintenance/by-studio** — Query params: marketId?, maintenanceCategoryId?, status?, createdAfter?, createdBefore?. Response: list of { studioId, studioName, marketId?, marketName?, count } for MAINTENANCE tickets, optionally filtered.  
  - **GET /api/reporting/maintenance/by-category** — Query params: studioId?, marketId?, status?, createdAfter?, createdBefore?. Response: list of { maintenanceCategoryId, maintenanceCategoryName, count }.  
  - **GET /api/reporting/maintenance/by-market** — Query params: maintenanceCategoryId?, status?, createdAfter?, createdBefore?. Response: list of { marketId, marketName, count } for MAINTENANCE tickets.  
  - **GET /api/reporting/maintenance/repeat-issues** — Query params: marketId?, createdAfter?, createdBefore?. Response: list of { studioId, studioName, maintenanceCategoryId, maintenanceCategoryName, count } where count ≥ 2 (or configurable threshold).  
  - **GET /api/reporting/maintenance/history** (or reuse **GET /api/tickets** with filters) — Query params: studioId or marketId, maintenanceCategoryId?, status?, createdAfter?, createdBefore?, limit, page. Response: paginated list of maintenance tickets (same shape as ticket list) for “history by location.”  
  Exact paths and response shapes to be finalized in Step B; auth remains admin/internal only for reporting.

- **Admin taxonomy**  
  If maintenance category CRUD is added: **GET /api/admin/config/ticket-taxonomy** already returns maintenanceCategories. Optional **POST/PATCH /api/admin/maintenance-categories** (or under existing admin prefix) for create/update; not required if categories are seeded and managed via migration/seed only.

---

## 6. UI Impact

- **Admin reporting**  
  Add a **Maintenance** section (or sub-page) to the existing admin reporting area. Include:
  - **By location (studio)** — Table or bar chart: studio name, market name, count; filters for category, market, date range, status.
  - **By category** — Table or bar chart: maintenance category name, count; filters for studio, market, date range, status.
  - **By market/district** — Table or bar chart: market name, count; filters for category, date range, status.
  - **Repeat issues** — Table: studio, category, count (only rows with count ≥ 2); supports “identify repeated issues by location.”
  - **History by location** — Dropdown or selector for studio (or market); date range; optional category/status; then table or list of maintenance tickets (link to ticket detail). Answers “what maintenance issues has this location had over time?”

- **Filters**  
  All views support filters: location (studio), category (maintenance category), market, date range, status. Use existing dropdowns/controls where possible (studios, markets, maintenance categories from taxonomy).

- **Ticket list/detail**  
  When ticket is MAINTENANCE, show maintenance category name prominently in list and detail (likely already present). No new pages; reporting is the main UI addition.

- **No new roles**  
  Access to maintenance reporting follows existing admin/reporting access (e.g. ADMIN or REPORTING role if present; otherwise ADMIN only).

---

## 7. Risks

- **Performance** — Grouping and counting over tickets with date/studio/category filters must stay fast at scale. Use existing indexes (studioId, marketId, maintenanceCategoryId, createdAt, ticketClassId); add compound index only if profiling shows need (e.g. ticketClassId + studioId + createdAt).
- **Definition of “repeat”** — MVP uses “same studio + same maintenance category, count ≥ 2.” If the client means “same issue reopened” or “same asset,” that would require additional data (e.g. resolved then reopened, or asset id); out of scope for this stage but document the MVP definition.
- **Maintenance category list** — If categories are not yet manageable by admin, operations may depend on seed data or migrations to add Plumbing, HVAC, etc.; design for admin CRUD in this stage to avoid code deploys for new categories.
- **Overlap with general reporting** — Keep general by-category (legacy categoryId) and by-market reporting unchanged; maintenance views are additive and explicitly scoped to MAINTENANCE tickets.

---

## 8. Test Plan

- **Classification and tagging**  
  - Create/update a MAINTENANCE ticket with maintenanceCategoryId; confirm it appears in list and detail and in maintenance reporting by-category and by-studio.  
  - Filter ticket list by maintenanceCategoryId and studioId; confirm only matching maintenance tickets returned.

- **Maintenance reporting endpoints**  
  - **by-studio** — With no filters, returns all studios with MAINTENANCE ticket counts; with maintenanceCategoryId filter, counts drop to only that category; with date range, only tickets in range.  
  - **by-category** — Returns all maintenance categories with counts; filters by studio/market/date narrow results.  
  - **by-market** — Returns markets with MAINTENANCE ticket counts; matches by-market logic scoped to MAINTENANCE.  
  - **repeat-issues** — Returns only studio+category combinations with count ≥ 2; verify with seeded data.  
  - **history** — Returns paginated maintenance tickets for given studio (or market) and filters.

- **Filters**  
  - Each view: apply location, category, date range, status; confirm counts and lists update correctly and match direct ticket query.

- **Regression**  
  - General reporting (by-status, by-priority, by-category legacy, by-market) unchanged.  
  - Ticket create/update/list/detail unchanged except for any explicit addition of maintenance category in export or filter UI.

- **Authorization**  
  - Maintenance reporting endpoints restricted to admin (or intended role); studio users do not have access.

---

*End of Step A mini-spec. Implementation in Step B after architecture review.*

---

## Implementation Summary (Stage 12 Complete)

### Files changed

**Backend**
- `apps/api/src/modules/reporting/dto/maintenance-report-filters.dto.ts` — **New.** Optional query params: studioId, marketId, maintenanceCategoryId, status, createdAfter, createdBefore.
- `apps/api/src/modules/reporting/reporting.service.ts` — Added `maintenanceWhere(filters)` (ticketClass.code = MAINTENANCE + filters); `getMaintenanceByStudio`, `getMaintenanceByCategory`, `getMaintenanceByMarket`, `getMaintenanceRepeatIssues`. Repeat threshold from `MAINT_REPEAT_THRESHOLD` (default 2).
- `apps/api/src/modules/reporting/reporting.controller.ts` — Four new routes under `maintenance/*` with `@Roles(Role.ADMIN)`:
  - `GET maintenance/by-studio`
  - `GET maintenance/by-category`
  - `GET maintenance/by-market`
  - `GET maintenance/repeat-issues`

**Frontend**
- `apps/web/src/lib/api.ts` — Added `reportingApi.maintenanceByStudio`, `maintenanceByCategory`, `maintenanceByMarket`, `maintenanceRepeatIssues` (each accept optional filter params).
- `apps/web/src/app/(app)/admin/reporting/page.tsx` — Added Maintenance section (visible when `user?.role === 'ADMIN'`): filter row (location/studio, market, maintenance category, status, date range); four views (Issues by studio, Issues by category, Issues by market, Repeat issues). Uses `adminApi.getTicketTaxonomy` and `adminApi.listMarkets` for filter options.

### New reporting queries

- **Maintenance base filter:** `ticketClass: { code: 'MAINTENANCE' }` plus optional studioId, marketId, maintenanceCategoryId, status, createdAt range.
- **by-studio:** `groupBy(['studioId'])` on maintenance where; resolve studio + market names.
- **by-category:** `groupBy(['maintenanceCategoryId'])` on maintenance where; resolve category names.
- **by-market:** `groupBy(['marketId'])` on maintenance where; resolve market names.
- **repeat-issues:** `groupBy(['studioId', 'maintenanceCategoryId'])` with studioId and maintenanceCategoryId not null; filter rows where `_count._all >= MAINT_REPEAT_THRESHOLD`; resolve studio and category names.

### API endpoints

- **GET /api/reporting/maintenance/by-studio** — Query: studioId?, marketId?, maintenanceCategoryId?, status?, createdAfter?, createdBefore?. Response: `{ studioId, studioName, marketId?, marketName?, count }[]`. ADMIN only.
- **GET /api/reporting/maintenance/by-category** — Same query. Response: `{ maintenanceCategoryId, maintenanceCategoryName, count }[]`. ADMIN only.
- **GET /api/reporting/maintenance/by-market** — Same query. Response: `{ marketId, marketName, count }[]`. ADMIN only.
- **GET /api/reporting/maintenance/repeat-issues** — Same query. Response: `{ studioId, studioName, maintenanceCategoryId, maintenanceCategoryName, count }[]` (only studio+category with count ≥ threshold). ADMIN only.

### UI additions

- **Admin Reporting → Maintenance section** (ADMIN only): heading “Maintenance” with Wrench icon; filter bar (All locations, All markets, All categories, All statuses, date range); four panels: Issues by studio (horizontal bars), Issues by category (horizontal bars), Issues by market (horizontal bars), Repeat issues (table: Studio, Category, Count).

### Build status

- **API:** `npm run build` — success.
- **Web:** `npm run build` — success.

### Manual verification checklist

- [ ] **Maintenance tickets in reporting** — Create/maintain MAINTENANCE tickets with maintenanceCategoryId and studioId/marketId; open Admin → Reporting as ADMIN; confirm Maintenance section shows counts in by-studio, by-category, by-market.
- [ ] **Filters** — Change location, market, category, status, date range; confirm all four maintenance views update and counts match filtered expectations.
- [ ] **Repeat issues** — With MAINT_REPEAT_THRESHOLD=2, create at least 2 maintenance tickets for the same studio + same maintenance category; confirm they appear in Repeat issues table.
- [ ] **MAINT_REPEAT_THRESHOLD** — Set env to 3; confirm only studio+category with count ≥ 3 appear in repeat-issues (or run API with threshold and verify).
- [ ] **General reporting unchanged** — By Status, By Priority, By Category, By Market, Resolution time, Completion by owner, Export CSV still work for non-maintenance data.
- [ ] **Authorization** — As DEPARTMENT_USER, call GET /api/reporting/maintenance/by-studio → 403. As ADMIN, all four maintenance endpoints return 200.
