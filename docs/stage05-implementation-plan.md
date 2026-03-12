# Stage 5: Dashboard and Reporting Redesign — Implementation Plan

This document translates the Stage 5 mini-spec (`docs/stage05-dashboard-and-reporting-redesign-mini-spec.md`) into a concrete engineering implementation plan. It does **not** prescribe code; it describes what will change, which endpoints and contracts are needed, and in what order. Implementation must preserve Stage 1 visibility and feed correctness, Stage 2 workflow/timing truth, Stage 3 collaboration behavior, and Stage 4 feed/panel polish.

**Rules:**

- Dashboard metrics MUST come from **dedicated summary/reporting endpoints**, not from ticket list queries.
- Dashboards must NOT become duplicate ticket feeds.
- **In Progress** = COUNT WHERE ticket.status = IN_PROGRESS (aligned with the ticket state machine; no explicit list of other statuses).
- **Avg Completion** uses a **default 30-day** reporting window unless the spec explicitly requires otherwise.
- Backend remains the source of truth for all dashboard/reporting metrics; no frontend recomputation of KPI truth.

---

## 1. Dashboard Summary Endpoint Strategy

### 1.1 Approach: Single canonical endpoint with scope from user

Use a **single dashboard summary endpoint**:

- **`GET /api/dashboard/summary`** — Returns KPIs and breakdowns. The backend determines scope automatically from the authenticated user:
  - **ADMIN** → org-wide metrics (no visibility filter).
  - **DEPARTMENT_USER** → department-scoped metrics (Stage 1 visibility applied).
  - **STUDIO_USER** → studio/requester scoped metrics (Stage 1 visibility applied).

- **Studio dashboard location filter:** For STUDIO_USER with multiple allowed locations, the frontend may call:
  - **`GET /api/dashboard/summary?studioId=<id>`** — When the user selects a specific location, backend returns counts and breakdowns restricted to that studio (still within the user’s allowed studios). Without `studioId`, backend returns aggregate over all of the user’s visible tickets (requester + allowed studios).

**Why this approach:** One contract and one endpoint; scope is derived from the authenticated user (and optional `studioId` for studio filter). Avoids maintaining three separate summary endpoints while preserving the same response shapes and visibility rules per role.

**Critical:** All dashboard KPI data MUST come from **`GET /api/dashboard/summary`**. The frontend must **not** derive New / In Progress / Resolved / Avg Completion from `GET /api/tickets` (list) or from `my-summary` ticket array. Existing `my-summary` is user-centric and returns ticket lists; it must not be used as the source of truth for dashboard KPIs.

### 1.2 How Stage 1 visibility governs the data

- **ADMIN:** No visibility filter; counts and breakdowns over all tickets (org-wide).
- **DEPARTMENT_USER:** Apply the same visibility logic as the canonical ticket list (e.g. `TicketVisibilityService.buildWhereClause(actor)`). Only tickets the department user is allowed to see are counted. Same for support-by-type and maintenance-by-location breakdowns.
- **STUDIO_USER:** Apply Stage 1 studio/requester visibility. If `studioId` query is present, restrict to that studio (and ensure it is in the user’s allowed studios). Otherwise aggregate over all of the user’s visible tickets (requester + allowed studios).

### 1.3 What the endpoint returns (by scope)

| Scope | Returns |
|--------|--------|
| **Admin (org-wide)** | `newTickets`, `inProgressTickets`, `resolvedTickets`, `avgCompletionHours` (30-day), `supportByType[]` (e.g. `{ typeId, typeName, count }`), `maintenanceByLocation[]` (e.g. `{ locationId, locationName, count }`). |
| **Department** | Same shape; all counts and arrays scoped to department user’s visibility. |
| **Studio** | `openTickets`, `completedTickets`, optional `avgCompletionHours`; optional `byLocation[]`; when `?studioId=` is provided, counts restricted to that studio. |

### 1.4 Likely backend files/services

- **New module or controller:** `apps/api/src/modules/dashboard/` (e.g. `dashboard.controller.ts`, `dashboard.service.ts`). Or extend an existing “reporting” surface with a dedicated dashboard service that uses the same Prisma/visibility layer.
- **Visibility:** Reuse `TicketVisibilityService.buildWhereClause(actor)` for department and studio scope so counts respect Stage 1.
- **Aggregations:** Dashboard service performs COUNT and AVG over `Ticket` with the appropriate `where` (and time window for avg completion, e.g. last 30 days). Tables: `tickets`, `markets`, `studios`, taxonomy tables for support/maintenance breakdowns.

---

## 2. KPI Metric Aggregation Plan

### 2.1 New Tickets

- **Definition (canonical):** **New Tickets = COUNT WHERE ticket.status = NEW.** The ticket state machine already guarantees that NEW means no subtask work has started. Do **not** perform subtask joins or activity checks.
- **Implementation:** Backend counts tickets where `status === 'NEW'`. Single table: `tickets`; no join to `subtasks`.
- **Tables/fields:** `tickets.status`.
- **Result shape:** Integer `newTickets` in dashboard summary response.

### 2.2 In Progress Tickets

- **Definition (canonical):** **In Progress = COUNT WHERE ticket.status = IN_PROGRESS.** This keeps the KPI aligned with the ticket state machine and prevents divergence from feed status logic. Do not use an explicit list of other statuses (e.g. TRIAGED, WAITING_ON_REQUESTER, WAITING_ON_VENDOR).
- **Implementation:** Backend counts tickets where `status === 'IN_PROGRESS'` only.
- **Tables/fields:** `tickets.status`.
- **Result shape:** Integer `inProgressTickets` in dashboard summary response.

### 2.3 Resolved Tickets

- **Definition:** Tickets in status RESOLVED or CLOSED. Single “Resolved” count (combined) unless product explicitly splits them.
- **Implementation:** Count tickets where `status in ['RESOLVED','CLOSED']`.
- **Tables/fields:** `tickets.status`.
- **Result shape:** Integer `resolvedTickets` in dashboard summary response.

### 2.4 Avg Completion

- **Definition:** Average of (resolvedAt − createdAt) for tickets that are resolved (status RESOLVED or CLOSED and resolvedAt set), over a **30-day window** (resolvedAt within last 30 days). Result in hours (or hours + display string).
- **Implementation:** Backend: `WHERE status IN ('RESOLVED','CLOSED') AND resolved_at IS NOT NULL AND resolved_at >= (now() - 30 days)`; compute AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600). Return null if no such tickets; frontend shows “—” or “No data.”
- **Tables/fields:** `tickets.resolvedAt`, `tickets.createdAt`, `tickets.status`.
- **Result shape:** `avgCompletionHours: number | null` in dashboard summary. Frontend does not recompute; displays backend value or “—” when null.
- **Default window:** 30 days. Spec does not require a different window; implementation uses 30 days.

### 2.5 Aggregation summary

- All four KPIs are **backend-derived**. Frontend receives a single summary DTO and renders cards; no client-side aggregation from ticket lists.
- No-data: when avg has no qualifying tickets, backend returns `avgCompletionHours: null`; frontend shows “—” or “No data.”
- Visibility: for department and studio scope, all counts and averages are computed over the same ticket set that passes Stage 1 visibility for the current user.

---

## 3. Admin Dashboard Implementation Plan

### 3.1 Naming and navigation

- **Rename “My Dashboard” to “Dashboard”** in:
  - `apps/web/src/app/(app)/dashboard/page.tsx` — page title/header: use `"Dashboard"` only (no “My Dashboard”, no “Dashboard — {displayName}”).
  - `apps/web/src/components/layout/Sidebar.tsx` — nav label for the dashboard link used by admin and department users: change from “My Dashboard” to “Dashboard” (e.g. `label: 'Dashboard'` for the item with `href: '/dashboard'`).
- Admin and department users both see the same nav label “Dashboard”; the **page** they land on may differ by role (see §4): admin sees org-wide dashboard, department sees department-scoped dashboard. Routing: both can use `/dashboard`; frontend calls the same **`GET /api/dashboard/summary`** and the backend returns the appropriate scope based on the authenticated user.

### 3.2 Remove from admin dashboard page

- **Remove the secondary “My Tickets” panel** — The entire “Recent tickets” block (list of up to 5 tickets with “View all tickets →”). Delete the section that renders `recentTickets` and the “View all tickets” button. Do not replace it with another ticket list on the dashboard. A single “View tickets” or “Open tickets” link in the header or nav is sufficient.
- **Remove “My Tickets by Category”** — The “By category” section that uses `summary?.byCategory` and renders `CategoryBar` components. Remove the block and any `byCategory`-driven UI.

### 3.3 Add KPI cards (admin only)

- **Source of data:** `GET /api/dashboard/summary`. Backend returns org-wide metrics when user is ADMIN. Do not use `my-summary` for admin dashboard KPIs.
- **Four cards:** New Tickets, In Progress, Resolved, Avg Completion. Each card displays one value from the summary response; no client-side computation.
- **Component:** Reuse or create a small **StatCard** (or equivalent) component consistent with Stage 4 polish. Same layout as current dashboard stat cards (icon, label, value, optional sub); values come from the new summary endpoint.

### 3.4 Add Support Tickets by Type and Maintenance Tickets by Location

- **Support Tickets by Type:** Backend returns `supportByType`: array of `{ typeId, typeName, count }` (e.g. by support topic or ticket class for support tickets). Frontend renders a small breakdown (e.g. horizontal bars or list) with label “Support Tickets by Type.” If schema does not distinguish support vs maintenance, use “Tickets by Type” and group by category/support topic/maintenance category as appropriate.
- **Maintenance Tickets by Location:** Backend returns `maintenanceByLocation`: array of `{ locationId, locationName, count }` (studio and/or market). Frontend label: “Maintenance Tickets by Location.” If no support/maintenance split, use “Tickets by Location” and group by studio/market.
- **Data:** Live/current counts (active tickets or all visible tickets depending on product choice); backend derives from same visibility rules as list.

### 3.5 Expected file/component changes

- **`apps/web/src/app/(app)/dashboard/page.tsx`** — Major restructure: (1) Header title set to “Dashboard”. (2) Remove recent tickets panel and “My Tickets by Category” and “Breakdown by Status” (or retain status breakdown only if it aligns with NEW/IN_PROGRESS/RESOLVED and is driven by summary endpoint). (3) Fetch from **`GET /api/dashboard/summary`** (backend returns org-wide for ADMIN) and render four KPI cards + Support by Type + Maintenance by Location. (4) No ticket list; optional single link to “Tickets” or “Inbox.”
- **`apps/web/src/components/layout/Sidebar.tsx`** — Change dashboard nav label from “My Dashboard” to “Dashboard” for default and department nav items.
- **New or shared component:** A reusable card for KPI (and optionally a small bar/list for by-type and by-location) so department and studio dashboards can reuse. Preserve Stage 4 polish (spacing, typography, subtle depth).

### 3.6 Preserving summary-only structure

- The admin dashboard page must **not** fetch a full ticket list for display. It may fetch only the dashboard summary payload. Any “View tickets” link navigates to `/tickets` or `/inbox`, where the canonical feed lives. No duplicate feed on the dashboard.

---

## 4. Department Dashboard Plan

### 4.1 Summary-only structure

- Department users who open “Dashboard” see a **summary-only** view: KPI cards and optional small breakdowns, no ticket list. Same visual pattern as admin dashboard but data scoped to the user’s visibility.

### 4.2 Visibility and data source

- **Endpoint:** `GET /api/dashboard/summary`. When the authenticated user is DEPARTMENT_USER, the backend applies Stage 1 visibility (e.g. `TicketVisibilityService.buildWhereClause(actor)`) to all aggregations. Only tickets the department user can see are counted.
- **Response shape:** Same as admin scope (newTickets, inProgressTickets, resolvedTickets, avgCompletionHours, supportByType, maintenanceByLocation) with counts/arrays scoped to visible tickets.

### 4.3 Role-appropriate KPI cards

- Same four cards as admin: New Tickets, In Progress, Resolved, Avg Completion. Values are department-scoped. Optional: add an “Actionable” count card if the backend exposes it (count of tickets actionable for the current user per Stage 1 definition). Implementation can add that in a follow-up.

### 4.4 Future-readiness for department timing

- The dashboard service and response contract should be designed so that **department-level timing/workflow stats** (e.g. average completion time for the user’s department) can be added later without changing the endpoint. Either add optional fields to the summary response later or document a separate “department timing” endpoint for a future phase. This stage does not implement department timing; only the structure is future-ready.

### 4.5 Frontend/backend surfaces

- **Frontend:** Same `/dashboard` route can be used. When user is DEPARTMENT_USER, the app calls **`GET /api/dashboard/summary`** (same endpoint); the backend returns department-scoped data and the frontend renders the same layout (four cards + by type + by location). One dashboard page component; no role-based endpoint URL—scope is determined by the backend from the authenticated user.
- **Backend:** `dashboard.service.ts` (or equivalent) implements a single summary method (e.g. `getSummary(actor, query?)`) that determines scope from `actor.role` (and optional `studioId` for STUDIO_USER), applies visibility when role is DEPARTMENT_USER or STUDIO_USER, and returns New, In Progress, Resolved, Avg Completion, support by type, maintenance by location (or studio-shaped response for STUDIO_USER).

---

## 5. Studio Dashboard Plan

### 5.1 Location name at top

- The studio dashboard (Portal “dashboard” tab) must show the **location name** clearly at the top. If the user has a single allowed studio, show that studio name (e.g. “Dashboard — {Studio Name}” or “Overview — {Studio Name}”). If the user has multiple allowed studios, show “All my locations” or the selected location name when a filter is active.

### 5.2 Summary-only structure and no duplicate feed

- The Portal dashboard tab must **not** render a full ticket list. It shows only summary cards and optional small breakdowns. Ticket lists remain on the “My tickets” and “By studio” tabs. Any “recent activity” preview must be limited to a very small N (e.g. 3–5) with a clear “View all” link to the feed tab, and must not behave as a primary feed (Stage 5 spec: no duplicate feed). Prefer **no** recent-tickets block on studio dashboard to keep it strictly summary-only.

### 5.3 Multi-location filter/toggle

- When the studio user has **multiple allowed studios**, the dashboard must offer a **location filter** (e.g. dropdown or tabs: “All my locations” | “Studio A” | “Studio B”). Summary cards and any by-location breakdown reflect the selected location. Default: “All my locations” (or product default). Filter state can be URL query (e.g. `?studioId=...`) or component state; when `studioId` is set, frontend calls **`GET /api/dashboard/summary?studioId=...`** and backend returns counts for that studio only (still within user’s allowed studios).

### 5.4 Cards and breakdowns

- **Cards:** Open tickets (count), Completed tickets (count). Optional: Avg Completion for the user’s visible set (30-day window). No “New” / “In Progress” split required for studio if product keeps it simple; “Open” = not RESOLVED/CLOSED is sufficient.
- **Breakdowns:** Optional “By location” (when multiple studios) so the user can see distribution. Data from **`GET /api/dashboard/summary`** (e.g. `byLocation[]` in the response when scope is studio).

### 5.5 Likely files/components

- **`apps/web/src/app/(app)/portal/page.tsx`** — The `activeTab === 'dashboard'` block is restructured: (1) Show location name at top; (2) If multiple allowed studios, render location filter (dropdown/tabs); (3) Fetch **`GET /api/dashboard/summary`** with optional `?studioId=...` for the location filter; (4) Render summary cards (open, completed, optional avg) and optional by-location breakdown; (5) Remove or minimize “Recent activity” so it is not a duplicate feed (or remove entirely for strict summary-only).
- **Backend:** Single endpoint **`GET /api/dashboard/summary`**. When user is STUDIO_USER, apply Stage 1 studio/requester visibility; if `studioId` query is present, restrict to that studio and validate it is in the user’s allowed studios.

### 5.6 Difference from admin/department

- Admin and department dashboards show **New / In Progress / Resolved / Avg Completion** and **Support by Type** / **Maintenance by Location**. Studio dashboard shows **Open / Completed** (and optional avg) and optional **By location**; no “Support by Type” unless product decides to expose a simplified type breakdown for studio users. Studio dashboard is scoped to requester + allowed studios and is the only one with an explicit **location filter** in the UI.

---

## 6. Reporting Page Redesign Plan

### 6.1 Replace “By Market” with “By Location”

- **Frontend:** In `apps/web/src/app/(app)/admin/reporting/page.tsx`, change the section title from “By Market” to **“By Location.”** The data can still come from the same backend endpoint (e.g. `GET /api/reporting/by-market`); the UI label and any axis/label text must say “By Location.” If the backend is renamed, use `by-location` or alias `by-market` to “location” in the API client.
- **Backend (optional):** Add an alias route `GET /api/reporting/by-location` that returns the same shape as `by-market` (e.g. `locationId`, `locationName`, `count`) so that “location” is the contract name. Or keep `by-market` and only change the frontend label to “By Location” and map `marketName` to display as location name.
- **Response shape:** Keep or define as array of `{ locationId?, locationName, count }` (or marketId/marketName); frontend displays as “By Location.”

### 6.2 Workflow / subtask completion timing section

- **Add** a new section on the reporting page: **Workflow / subtask completion timing**.
  - **Backend:** New endpoint(s) or extend reporting: e.g. `GET /api/reporting/workflow-timing` or `GET /api/workflow-analytics/timing-by-workflow` that returns per-workflow and per-step averages. Shape: list of workflows; each workflow has `workflowId`, `workflowName`, `avgTicketCompletionHours`, `steps[]` with `stepId`/`stepName`, `avgSubtaskCompletionHours` (completedAt − availableAt), optional `avgActiveWorkHours` (completedAt − startedAt). Use 30-day window for averages.
  - **Frontend:** A **workflow selector** (dropdown or tabs) to switch between workflows. Below it, a **fixed-size analytics container** (see §6.3). Content: workflow name, then a list of steps with their average completion time (and optional active work time). All metrics backend-derived; no frontend computation.

### 6.3 Fixed-size analytics container and internal scroll

- The workflow timing section must use a **fixed height or max-height** container (e.g. `max-h-[400px]` or `height: 400px`) so that when the user switches workflows (different number of steps), the page layout does not jump. **Internal scroll:** `overflow-y: auto` on the content area inside the container so long step lists scroll inside the box. The outer card/section size stays constant.

### 6.4 Remove “Most blocked subtask types”

- **Workflow analytics page:** The current “Longest-running subtask types” section is **timing-based** and is acceptable. Ensure the section title and any copy do **not** use the word “blocked.” If anywhere in the app there is a section titled “Most blocked subtask types” or similar, remove that section or rename to a timing-based label (e.g. “Longest-running subtask types” or “Steps exceeding target”). No BLOCKED status in the data or UI.
- **Reporting page:** If the reporting page currently has a “blocked” subsection, remove it. Stage 5 spec: remove “Most blocked subtask types” everywhere.

### 6.5 Backend reporting data needed

- **By location:** Existing `getByMarket()` (or new `getByLocation()`) — same data, label “By Location”; optionally include studio in addition to market so “location” can be studio or market.
- **Workflow timing:** New or extended endpoint that returns workflow list and per-workflow, per-step average completion time (and optionally active work time). Depends on `subtasks.availableAt`, `subtasks.startedAt`, `subtasks.completedAt` (Stage 2) and workflow template / subtask template linkage.

### 6.6 Frontend widgets/cards to change

- **Reporting page:** (1) Rename “By Market” section to “By Location”; (2) Add workflow timing section with selector and fixed-size scrollable box; (3) Remove any “Most blocked” block. Existing KPI cards (Total, Open, Resolved, Avg Resolution), volume chart, By Status, By Priority, By Category, resolution time by category, completion by owner remain; ensure status breakdown uses NEW/IN_PROGRESS/RESOLVED semantics and no BLOCKED.

---

## 7. Workflow Analytics Plan

### 7.1 Average completion time by workflow

- **Metric:** For each workflow template (or workflow type), average ticket completion time = AVG(resolvedAt − createdAt) for tickets that used that workflow and are resolved, over 30-day window (or all time if product prefers). Backend: group by workflow (e.g. via ticket → workflow template association or ticket class); compute AVG.
- **Where it belongs:** **Workflow Analytics page** (admin): table or cards showing workflow name, total/active/completed counts, avg completion time. **Reporting page:** workflow timing section can show the same metric in the workflow selector view (per workflow).

### 7.2 Average subtask completion time by workflow step

- **Metric:** Per step (subtask template or order): AVG(completedAt − availableAt) for subtasks in that step that have both availableAt and completedAt. Exclude NULLs. Optional: AVG(completedAt − startedAt) as “active work time” per step.
- **Where it belongs:** **Reporting page** workflow timing section (per workflow, list of steps with avg completion and optional active work time). **Workflow Analytics page** can show the same step-level timing in a dedicated table or section.

### 7.3 Department timing and bottleneck

- **Department timing:** Average completion time (ticket or subtask) grouped by department. Implement on **Workflow Analytics page** and/or reporting when the backend exposes department-scoped timing. Same metric definitions (§2); grouping by department.
- **Bottleneck:** **Timing-based only.** Identify subtask types or steps with (a) completion time exceeding a defined target, or (b) high cycle time (completedAt − availableAt) relative to baseline. **Workflow Analytics page** keeps “Longest-running subtask types” (or “Steps exceeding target”) using only avg duration; no BLOCKED. Remove any “blocked” wording.

### 7.4 Split: dashboard vs reporting vs workflow analytics page

- **Dashboard (admin/department):** Top KPIs (New, In Progress, Resolved, Avg Completion) and breakdowns (Support by Type, Maintenance by Location). No workflow-step-level timing; no bottleneck table.
- **Reporting page:** Volume, by status, by priority, by category, **by location**, resolution time, completion by owner, and **workflow/subtask completion timing** section (workflow selector + fixed-size box with step timing).
- **Workflow Analytics page:** Workflow template analytics (total/active/completed, avg completion), department workflow metrics, and **bottleneck** (longest-running or exceeding-target) subtask types. All timing-based.

### 7.5 Likely files/services

- **Backend:** `apps/api/src/modules/reporting/reporting.service.ts` (by-market → by-location alias or rename; new workflow timing method); `apps/api/src/modules/workflow-analytics/workflow-analytics.service.ts` (bottlenecks already timing-based; ensure no “blocked” in labels or logic). New dashboard module for admin/department/studio summary.
- **Frontend:** `apps/web/src/app/(app)/admin/reporting/page.tsx` (By Location label, workflow timing section, remove blocked); `apps/web/src/app/(app)/admin/workflow-analytics/page.tsx` (ensure bottleneck section uses timing-only language).

---

## 8. Data Contract / Response Shape Plan

### 8.1 Dashboard summary (admin / department)

- **Response:**  
  `{ newTickets: number, inProgressTickets: number, resolvedTickets: number, avgCompletionHours: number | null, supportByType: { typeId: string, typeName: string, count: number }[], maintenanceByLocation: { locationId: string, locationName: string, count: number }[] }`
- **Backend-derived only.** Frontend does not compute these from ticket lists.  
- **No-data:** When there are no resolved tickets in the 30-day window, `avgCompletionHours` is `null`; frontend shows “—” or “No data.”  
- **30-day default** for avg completion: resolvedAt within last 30 days.

### 8.2 Studio summary (same endpoint, studio scope)

- **Response:**  
  `{ openTickets: number, completedTickets: number, avgCompletionHours?: number | null, byLocation?: { locationId: string, locationName: string, count: number }[] }`  
  Returned by **`GET /api/dashboard/summary`** when user is STUDIO_USER. When `?studioId=` is present, counts are for that studio only.

### 8.3 Support-by-type and maintenance-by-location

- **supportByType:** Array of `{ typeId, typeName, count }`. typeName is display label (e.g. support topic name or category name). Count = number of support (or all) tickets in that type visible to the actor.  
- **maintenanceByLocation:** Array of `{ locationId, locationName, count }`. locationName can be studio name or market name. Count = number of maintenance (or all) tickets at that location.  
- If schema does not distinguish support vs maintenance, use “Tickets by Type” and “Tickets by Location” with the same shape.

### 8.4 Workflow timing section

- **Response (example):**  
  `{ workflows: { workflowId: string, workflowName: string, avgTicketCompletionHours: number | null, steps: { stepId: string, stepName: string, avgSubtaskCompletionHours: number | null, avgActiveWorkHours?: number | null }[] }[] }`  
  Frontend receives this and renders workflow selector + step list; no client-side averaging.  
- **No-data:** Missing or null averages show as “—” in the UI.

### 8.5 Bottleneck data

- **Response (existing or adjusted):** e.g. `{ longestSubtasks: { subtaskTemplateId: string, title: string, avgDurationHours: number }[] }`. Purely timing-based (avg completion time); no “blocked” field or label.

### 8.6 Location-based reporting (By Location)

- **Response:** Array of `{ locationId?: string, locationName: string, count: number }` (or marketId/marketName). Backend can keep by-market internally; frontend labels as “By Location.”

### 8.7 Rules

- All metric values are **backend-derived**. Frontend displays only what the API returns.  
- **30-day default** for average completion (resolvedAt in last 30 days) unless spec says otherwise.  
- No-data and empty arrays are handled: null/undefined → “—”; empty array → “No data” or hide section.

---

## 9. Frontend Information Architecture Plan

### 9.1 Admin dashboard

- **Route:** `/dashboard` (when user is ADMIN).  
- **Content:** Header “Dashboard.” Four KPI cards: New Tickets, In Progress, Resolved, Avg Completion. Two breakdown sections: Support Tickets by Type (or Tickets by Type), Maintenance Tickets by Location (or Tickets by Location). Optional single link: “View tickets” → `/tickets`.  
- **Removed:** Recent tickets panel, “My Tickets by Category,” any “Breakdown by Status” that is driven by client-side aggregation from a ticket list.  
- **Data:** Single request to **`GET /api/dashboard/summary`** (backend returns org-wide for ADMIN); no ticket list fetch for the dashboard.

### 9.2 Department dashboard

- **Route:** `/dashboard` (when user is DEPARTMENT_USER).  
- **Content:** Same layout as admin (four cards + by type + by location) but data from **`GET /api/dashboard/summary`** (backend returns department-scoped for DEPARTMENT_USER). Summary-only; no ticket list.  
- **Removed:** Same as admin (no recent tickets, no “My Tickets by Category”).

### 9.3 Studio dashboard

- **Route:** `/portal` with tab “dashboard”.  
- **Content:** Location name at top. If multiple studios: location filter (All | Studio A | Studio B). Cards: Open, Completed, optional Avg Completion. Optional by-location breakdown. No duplicate feed; no large recent-tickets list (or remove recent activity entirely).  
- **Data:** **`GET /api/dashboard/summary`** with optional `?studioId=...` for location filter when user has multiple studios.

### 9.4 Reporting page

- **Sections (order):** KPI row (Total, Open, Resolved, Avg Resolution) → Volume chart → By Status, By Priority, By Category, **By Location** (renamed from By Market) → Resolution time by category → Completion by owner → **Workflow / subtask completion timing** (workflow selector + fixed-size scrollable box).  
- **Removed:** Any “Most blocked subtask types” block.  
- **Reusable:** StatCard, HorizontalBar, and the new workflow-timing box (fixed height, internal scroll) can be shared. Preserve Stage 4 polish (spacing, typography, borders/shadows) on cards.

### 9.5 Workflow analytics page

- **Sections:** Workflow template analytics table, Department workflow metrics table, Longest-running subtask types (or “Steps exceeding target”) — timing only, no “blocked” wording.  
- **Shared:** Same metric definitions and backend contracts as reporting workflow timing; optional shared hooks or API client for workflow timing data.

### 9.6 Stage 4 polish

- Dashboard and reporting cards/widgets should reuse the same visual language as Stage 4: subtle elevation, consistent padding, clear typography hierarchy. No broad redesign; only structure and data source change. Ticket feed and ticket panel are unchanged by Stage 5.

---

## 10. Implementation Order

1. **Backend: dashboard summary endpoint**  
   Implement **`GET /api/dashboard/summary`** with scope determined from the authenticated user (ADMIN → org-wide, DEPARTMENT_USER → department-scoped, STUDIO_USER → studio/requester scoped; optional `?studioId=` for studio location filter). Correct KPI aggregation: New (ticket.status = NEW), In Progress (ticket.status = IN_PROGRESS), Resolved (RESOLVED + CLOSED), Avg Completion (30-day window). Apply Stage 1 visibility for department and studio scope. Implement supportByType and maintenanceByLocation (or tickets by type / by location) in the same or related service.

2. **Backend: KPI metric aggregation**  
   Ensure New (COUNT WHERE ticket.status = NEW; no subtask joins), In Progress (COUNT WHERE ticket.status = IN_PROGRESS), Resolved (RESOLVED + CLOSED), and Avg Completion (resolvedAt − createdAt, 30-day) are implemented and tested. No BLOCKED; no required-subtask logic.

3. **Frontend: admin dashboard restructure**  
   Replace dashboard page content: title “Dashboard”; fetch **`GET /api/dashboard/summary`**; render four KPI cards and Support by Type + Maintenance by Location; remove Recent tickets panel and “My Tickets by Category.” Update sidebar label to “Dashboard.”

4. **Frontend: department dashboard**  
   When user is DEPARTMENT_USER, fetch **`GET /api/dashboard/summary`** (same endpoint; backend returns department-scoped data) and render same layout as admin. Reuse same dashboard page; no role-based endpoint URL.

5. **Frontend: studio dashboard (Portal)**  
   Fetch **`GET /api/dashboard/summary`** with optional `?studioId=...` for location filter; show location name at top; add location filter when multiple studios; render open/completed (and optional avg) cards; remove or minimize recent activity so dashboard is summary-only.

6. **Reporting: By Market → By Location**  
   Rename UI “By Market” to “By Location”; optionally add by-location API alias. Ensure response shape is documented for frontend.

7. **Reporting: workflow timing section**  
   Backend: add workflow timing endpoint (per-workflow, per-step avg completion and optional active work time). Frontend: add workflow selector and fixed-size analytics box with internal scroll; render step list and averages.

8. **Workflow analytics: ensure timing-only bottleneck**  
   Verify “Longest-running subtask types” (or equivalent) uses only timing; remove any “blocked” wording. No code changes to BLOCKED (already removed in Stage 2); only copy/labels.

9. **Final: naming, empty states, no-data**  
   Sidebar “Dashboard” label; “By Location” everywhere in reporting; empty states and “—” for null avg completion; 30-day window documented and used consistently.

---

## 11. Verification Checklist

- [ ] **Admin dashboard:** Header is “Dashboard” (not “My Dashboard”). Four KPI cards visible: New Tickets, In Progress, Resolved, Avg Completion. Support Tickets by Type and Maintenance Tickets by Location (or Tickets by Type / by Location) present. No “Recent tickets” panel; no “My Tickets by Category.”
- [ ] **No duplicate feed:** No dashboard (admin, department, or studio) renders a full ticket list as primary content. Ticket lists only on Tickets, Inbox, Portal My/Studio tabs.
- [ ] **Department dashboard:** Summary loads with department-scoped visibility; same four KPIs and breakdowns; data matches visible tickets only.
- [ ] **Studio dashboard:** Location name shown at top; when user has multiple locations, location filter works and summary updates; no duplicate feed.
- [ ] **“By Location”:** Reporting page section previously “By Market” is now labeled “By Location”; data still displays correctly.
- [ ] **Workflow timing box:** Workflow selector present; analytics container has fixed height/max-height and internal scroll when step list is long; switching workflows does not cause layout jump.
- [ ] **“Most blocked” removed:** No section titled “Most blocked subtask types” or similar; bottleneck/longest-running is timing-based only.
- [ ] **In Progress semantics:** In Progress count reflects ticket.status = IN_PROGRESS only (aligned with ticket state machine).
- [ ] **Avg Completion:** Uses 30-day default window; backend returns null when no data; frontend shows “—” or “No data.”
- [ ] **Stage 1–4 unchanged:** Visibility and feed correctness (Stage 1), workflow/timing and resolution gate (Stage 2), comments/mentions/replies (Stage 3), feed/panel polish (Stage 4) behave as before. No regressions on ticket list, panel, or reporting elsewhere.

---

## 12. Outdated Elements Removal Map

| Element | Location | Action |
|--------|----------|--------|
| **“My Dashboard”** | Sidebar nav label (`Sidebar.tsx`: `label: 'My Dashboard'` for dashboard link). Dashboard page header that appends user name. | Change nav label to **“Dashboard”**. Page header to **“Dashboard”** only. |
| **Secondary “My Tickets” panel** | `dashboard/page.tsx`: “Recent tickets” block with list of tickets and “View all tickets →”. | **Remove** entire block. Do not replace with another ticket list. |
| **“My Tickets by Category”** | `dashboard/page.tsx`: Section “My Tickets by Category” and `summary?.byCategory` / CategoryBar. | **Remove** section and any byCategory-based UI. |
| **“By Market”** | `admin/reporting/page.tsx`: Section title “By Market” and any axis/label. API client or backend route name. | **Rename** UI to **“By Location”**. Optionally add by-location API alias. |
| **“Most blocked subtask types”** | Any reporting or workflow analytics section with this (or similar) title or copy. | **Remove** or **rename** to timing-based only (e.g. “Longest-running subtask types”). No BLOCKED in data or labels. |
| **Outdated status language** | Any dashboard or reporting copy that implies BLOCKED subtask status or “required” subtasks, or that conflicts with NEW / IN_PROGRESS / RESOLVED. | **Remove** or **replace** with Stage 2 semantics (no BLOCKED; all subtasks participate in completion). |

---

*End of Stage 5 Implementation Plan. Implementation must follow this plan and the Stage 5 mini-spec; do not implement code in the planning phase.*
