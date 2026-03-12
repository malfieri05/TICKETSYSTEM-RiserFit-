# Stage 6: Admin Filter and Settings Cleanup — Implementation Plan

This document translates the [Stage 6 mini-spec](stage06-admin-filter-and-settings-cleanup-mini-spec.md) into a concrete engineering implementation plan. Stage 6 is strictly a **cleanup and consistency pass**. No new product features; no changes to Stage 1 visibility logic, Stage 2 state machine/workflow, Stage 3 comments/mentions, Stage 4 feed/panel, or Stage 5 dashboard/reporting metric definitions.

**Constraints:** Prefer removal, renaming, or simplification. Use the standardized filter query parameters below. Consolidate assistant entry points per the documented decision.

---

## Standardized Filter Query Parameters

Ticket list filtering **must** use the following query parameter names consistently (backend and frontend):

| Parameter | Meaning | Backend mapping |
|-----------|---------|-----------------|
| `departmentId` | Taxonomy department (SUPPORT tickets) | `departmentId` on ticket / where clause |
| `ticketClass` | Ticket class (e.g. SUPPORT, MAINTENANCE) | Map to `ticketClassId` in DB |
| `supportTopicId` | Support topic (when ticket class is SUPPORT) | `supportTopicId` on ticket |
| `maintenanceCategoryId` | Maintenance category (when ticket class is MAINTENANCE) | `maintenanceCategoryId` on ticket |
| `studioId` | Studio (location) | `studioId` on ticket |
| `state` | State (market/region) for location filtering | Map to `marketId` in DB; API accepts `state` |

**Do not use:** `dept`, `department`, `teamId`, `location`, `market`, or `marketId` in the **public** filter API or URL. Backend may still use `marketId` internally (schema); the **query parameter name** exposed to the frontend and URLs is `state`.

---

## 1. Admin Ticket Filter Implementation

### 1.1 Filter dimensions and query parameters

- **Department filter** — Single-select dropdown. Options: “All departments” (empty) + taxonomy departments from admin/config. Sends `departmentId` when a department is selected. Resetting to “All” clears `departmentId` (omit from query).
- **Ticket type filter** — Single-select. Options: “All types” (empty) + combined type options (e.g. by ticket class and, when applicable, support topic or maintenance category). Sends one or more of: `ticketClass`, `supportTopicId`, `maintenanceCategoryId` depending on design (see below). “All” clears all type-related params.
- **Location filter** — Single-select or two dropdowns (State + Studio). Sends `studioId` and/or `state` (state maps to market in backend). “All locations” clears `studioId` and `state`.

**Exact query parameter usage:**

- `departmentId` — Taxonomy department ID. Accepted by list endpoint; applied after visibility.
- `ticketClass` — Ticket class value (e.g. SUPPORT, MAINTENANCE) or ID; backend maps to `ticketClassId` for the where clause.
- `supportTopicId` — Support topic ID. Used when filtering by type and ticket is support.
- `maintenanceCategoryId` — Maintenance category ID. Used when filtering by type and ticket is maintenance.
- `studioId` — Studio ID. Filters tickets by studio.
- `state` — State/market identifier (e.g. market ID). Backend maps to `marketId` for the where clause. **Do not** expose `marketId` or `market` in URL or client API.

All other existing list params (e.g. `page`, `limit`, `search`, `statusGroup`, `actionableForMe`) remain unchanged. **Remove or deprecate** use of `teamId` for the ticket list filter bar; use `departmentId` only for department-scoped filtering so it aligns with Stage 1 taxonomy.

### 1.2 Backend

- **Endpoints:** The existing ticket list endpoint (e.g. `GET /api/tickets` or equivalent) must accept the standardized query params: `departmentId`, `ticketClass`, `supportTopicId`, `maintenanceCategoryId`, `studioId`, `state`.
- **TicketFiltersDto:** Add or alias `ticketClass` (map to existing `ticketClassId` if present). Add or alias `state` (map to existing `marketId` for the where clause). Keep accepting `departmentId`, `supportTopicId`, `maintenanceCategoryId`, `studioId`. Remove or deprecate `teamId` from the **primary** filter contract (can remain optional for backward compatibility only if needed; prefer removal so filter bar does not send it).
- **Where clause:** Apply visibility first (`TicketVisibilityService.buildWhereClause(actor)`). Then apply filter params: `departmentId`, `ticketClassId` (from `ticketClass`), `supportTopicId`, `maintenanceCategoryId`, `studioId`, `marketId` (from `state`). Filters refine the visible set only; they do not change visibility logic.
- **Behavior:** Single-select per dimension: one value per param. “All” = omit param. No multi-select in this stage.

### 1.3 Frontend

- **Ticket list hook/API:** Build request params using the standardized names: `departmentId`, `ticketClass`, `supportTopicId`, `maintenanceCategoryId`, `studioId`, `state`. Do not send `teamId`, `marketId`, or `location` for these filters.
- **URL persistence:** When filters are applied, sync to URL query string using the same param names. Example:  
  `?departmentId=...&ticketClass=...&supportTopicId=...&maintenanceCategoryId=...&studioId=...&state=...`  
  On load, read these params and initialize filter state; apply them to the list request so shared/bookmarked URLs show the same filtered view.
- **“All” resets:** Each dropdown has an “All …” option (e.g. “All departments,” “All types,” “All locations”). Selecting it clears the corresponding param(s) and updates the URL (remove that key). “Clear filters” button clears all filter params and search, resets to page 1, and updates the URL.

### 1.4 Alignment with Stage 1

- Filters are **view-layer refinement** only. The backend applies visibility first; then applies these filters to the visible set. No change to `TicketVisibilityService` or to who can see which tickets.

---

## 2. Filter UI Structure

### 2.1 Layout

- **Tickets page** and **Inbox page** (where the same ticket list filters apply) use a single, consistent filter bar.
- **Order and content (left to right):**
  1. **Search input** — Placeholder e.g. “Search tickets or paste ID…”. Updates `search`; debounced; included in URL as `search=...`.
  2. **Department dropdown** — Label “Department”. Options: “All departments” + taxonomy departments. Single-select; sets `departmentId`.
  3. **Type dropdown** — Label “Type”. Options: “All types” + type options (e.g. by ticket class and/or topic/category as defined in §1). Single-select; sets `ticketClass` and/or `supportTopicId`/`maintenanceCategoryId`.
  4. **Location dropdown** — Label “Location”. Options: “All locations” + studios and/or states (or split into State + Studio if two dropdowns). Single-select; sets `studioId` and/or `state`.
  5. **Clear filters button** — Visible when any filter or search is active. On click: clear all filter params and search, set page to 1, update URL.

- **Active/Completed tabs** (Tickets page) and **Inbox-specific controls** (e.g. folder/topic) remain; they are not replaced by this bar. The filter bar sits in the same row or directly below the tabs so the UI is not cluttered.

### 2.2 Consistency

- **Tickets page:** Full filter bar (Search, Department, Type, Location, Clear filters). URL reflects all active filters.
- **Inbox page:** Same filter bar when the Inbox shows a ticket list that supports the same filters (e.g. department, type, location). Same param names and “Clear filters” behavior. Folder/supportTopicId for inbox folders can coexist with the Type filter (document which takes precedence or combine them so there is no duplicate “topic” control).
- **Avoid clutter:** Use compact dropdowns (single line, consistent width). Avoid duplicate controls (e.g. do not show both “Team” and “Department”; only “Department” with `departmentId`).

### 2.3 Responsiveness

- On small viewports, the filter bar can wrap to multiple rows or collapse into a “Filters” control that expands to show the dropdowns. Behavior and param names stay the same.

---

## 3. Location / State Field Cleanup Implementation

### 3.1 Label: “Market” → “State”

- In the **Add Location** (or Add Studio) flow and anywhere the field represents **US state** (or state/region), change the **display label** from “Market” to **“State.”**
- Backend schema and APIs may keep `marketId` and `market` in payloads and responses; only the **user-facing label** in the admin UI (e.g. “Add location,” “Edit studio,” “Select state”) must say “State.”
- **Files to touch:** Admin Locations/Markets page (e.g. `apps/web/src/app/(app)/admin/markets/page.tsx`), Add Studio form, any dropdown or table header that currently says “Market” where the meaning is state. Do not rename DB columns or API keys unless required for the `state` query param (see §1).

### 3.2 Searchable state selector

- **Component:** Implement or reuse a **searchable select** (combobox) for state selection. Closed: shows selected state name or “Select state”. Open: input at top; list of states below; typing filters the list.
- **State list:** Use a **static list of US states** (all 50) as the source. Store in a frontend constant (e.g. `US_STATES` with `{ id, name }` or `{ value, label }`). If the product uses “markets” in the DB that correspond to states, the component can map market id/name from API to this list for display, or show the static list and map selection to the correct market when creating/editing a studio.
- **Behavior when typing:** As the user types, filter the list by name (e.g. “Cal” → “California”). Case-insensitive; match from start or contains. Arrow keys and Enter select; Escape closes. Single selection only.
- **Persistence:** Selected state is stored in form state and submitted as `marketId` (or equivalent) to the backend when creating/updating a studio. No backend schema change required; only UI label and interaction.

### 3.3 Where to apply

- **Add Location / Add Studio form:** Replace the current market dropdown (if non-searchable) with the searchable state selector. Label the field “State.”
- **Other admin forms** that assign a “market” or “state” to an entity use the same label “State” and the same searchable selector where appropriate.

---

## 4. Assistant Surface Removal

**Decision:** Keep the **global assistant widget** (bottom-right chat). **Remove** the full-page Assistant route and its nav entry. **Redirect** `/assistant` to `/dashboard`.

### 4.1 Remove `/assistant` route

- **Action:** Remove the page component and route for `/assistant`.
- **File(s):** Delete or repurpose `apps/web/src/app/(app)/assistant/page.tsx` (or the entire `assistant` directory under the app router). The route `/assistant` must no longer render that page.

### 4.2 Remove “Assistant” nav item

- **Action:** Remove the sidebar entry that links to `/assistant`.
- **File:** `apps/web/src/components/layout/Sidebar.tsx`. In the admin “Content / Tools” group, remove the item `{ href: '/assistant', label: 'Assistant', icon: BookOpen }`. Do not add a replacement link to the widget (the widget is always visible; no nav needed).

### 4.3 Keep widget functional

- **Action:** No changes to the global assistant widget (e.g. `AiChatWidget`). It remains mounted where it is (e.g. layout), so users can still open the chat from the bottom-right. Ensure no code depended on the `/assistant` page for config or state.

### 4.4 Redirect `/assistant` → `/dashboard`

- **Action:** Add a redirect so that any request to `/assistant` (or `/assistant/*`) returns a redirect to `/dashboard`.
- **Implementation:** In the Next.js app router, add a route or middleware that redirects `assistant` and `assistant/*` to `dashboard`. For example: a minimal `apps/web/src/app/(app)/assistant/page.tsx` that only performs `redirect('/dashboard')`, or a redirect in `next.config.js`, or a middleware rule. Document the chosen approach in the codebase so future changes do not reintroduce the full page.

### 4.5 Update links to `/assistant`

- **Action:** Search the codebase for references to `/assistant` (e.g. `href="/assistant"`, `router.push('/assistant')`, links in Knowledge Base or help text). Remove or update them: either remove the link or point to a different destination (e.g. dashboard or a “use the assistant widget” hint). No link should point to the removed full-page experience.
- **Likely files:** Sidebar (already covered), any admin Knowledge Base page that says “Assistant” with a link, any footer/header links, any docs or in-app copy that says “go to Assistant.”

### 4.6 Files likely affected

- `apps/web/src/app/(app)/assistant/page.tsx` — Remove or replace with redirect-only.
- `apps/web/src/components/layout/Sidebar.tsx` — Remove Assistant nav item.
- `apps/web/src/app/(app)/layout.tsx` (or parent layout) — Confirm widget is still rendered; add redirect for `/assistant` if done in layout.
- Any file that imports or links to `/assistant` (grep for `assistant`, `'/assistant'`).
- `apps/web/src/app/(app)/admin/knowledge-base/page.tsx` — Update copy/link that references “Assistant” if it points to the page.

---

## 5. Naming and Terminology Cleanup

### 5.1 Search-and-cleanup pass

Run a **search-and-replace or manual cleanup** across the codebase (and any static copy) for the following. Prefer removal or replacement; do not leave conflicting wording.

| Target | Action |
|--------|--------|
| **"My Dashboard"** | Replace with **"Dashboard"** everywhere (sidebar, page title, breadcrumbs, tooltips). Stage 5 already fixed many; verify no remaining instances. |
| **"By Market"** | Replace with **"By Location"** in reporting and any chart/axis labels. Backend route names may stay (e.g. `by-market`); frontend label must be “By Location.” |
| **"blocked"** (lowercase) | Remove or reword. Do not use for subtask status. Use timing-based wording (e.g. “Longest-running,” “Steps exceeding target”) where analytics are concerned. |
| **"BLOCKED"** (uppercase) | Remove from UI and user-facing copy. Stage 2 removed BLOCKED from subtask model; no status badge or filter for BLOCKED. |
| **"required subtask"** | Remove. Stage 2 removed the required-subtask concept. Exception: keep “required” for **form validation** (e.g. “Name is required”). |
| **"optional subtask"** | Remove. Same as above; no optional/required subtask distinction in UI or copy. |

### 5.2 Where to apply

- **Frontend:** All user-facing and admin-facing text: labels, placeholders, empty states, table headers, tooltips, report section titles, workflow analytics labels.
- **Backend:** Error messages and any user-facing strings that mention blocked or required subtasks.
- **Verification:** After changes, grep for `My Dashboard`, `By Market`, `blocked`, `BLOCKED`, `required subtask`, `optional subtask` and fix or document any remaining intentional uses.

---

## 6. Role-Based UX Consistency Pass

### 6.1 Standardized labels

Use the same label for the same concept everywhere (admin, department, studio):

| Concept | Standard label | Where |
|---------|----------------|-------|
| **Location** | “Location” (or “State” / “Studio” when that is the specific dimension) | Filter bar, admin Locations page, reporting “By Location,” studio dashboard. Do not use “Market” for admin and “Location” for studio. |
| **Department** | “Department” | Filter bar, user admin, visibility copy. Avoid “Team” for the same concept unless legacy Team is still documented and distinct. Prefer a single “Department” filter backed by taxonomy. |
| **Ticket type** | “Type” or “Ticket type” | Filter bar, create form, reporting. Use “Support topic” or “Maintenance category” only when the UI is specifically about that dimension; for the general “type” filter, “Type” is consistent. |

### 6.2 Where to align

- **Tickets page vs Inbox:** Same filter bar labels (Department, Type, Location).
- **Admin Locations page:** “State” for the state/market dimension; “Studio” for the specific location; “Location” as the section or page concept where appropriate.
- **Reporting:** “By Location” (not “By Market”); “By department” or “By type” as already consistent.
- **Portal (studio user):** “Location” or “Studio” consistently with the rest of the app; no “Market” in user-facing labels if the meaning is state/studio.

---

## 7. Filter and Control Cleanup

### 7.1 Remove or replace

- **Toggles referencing BLOCKED:** Remove any toggle, filter, or option that implies “blocked” subtask status (e.g. “Show blocked only”). If a timing-based alternative exists (e.g. “Longest-running”), use that instead; otherwise remove.
- **Filters referencing required subtasks:** Remove options like “Required only” or “Optional subtasks.” Stage 2 removed the required concept; no such filter.
- **Duplicate department/team filters:** If both “Team” and “Department” exist and filter the same dimension, remove “Team” and keep “Department” (taxonomy `departmentId`). Document that department filter options come from taxonomy.
- **Controls that no longer map to the domain:** Remove or hide any control that has no effect (e.g. a view option that does not change the query) or that conflicts with the current data model (e.g. status option for BLOCKED).

### 7.2 Workflow analytics and reporting

- Replace or remove any “Most blocked subtask types” (or similar) with timing-based language (e.g. “Longest-running subtask types,” “Steps exceeding target”).
- Ensure no table header, tooltip, or section title implies “required” or “optional” subtasks. Use only timing and completion semantics.

### 7.3 Implementation

- **Identify:** Grep for “blocked,” “BLOCKED,” “required subtask,” “optional subtask,” “Team” (in filter context), and review each occurrence.
- **Remove or replace:** Delete redundant controls; rename labels; update copy. No new domain logic.

---

## 8. Implementation Order

Execute in the following order to respect dependencies and avoid broken navigation or half-updated filters.

1. **Assistant route removal and redirect**
   - Remove or replace `/assistant` page with redirect to `/dashboard`.
   - Add redirect for `/assistant` and `/assistant/*` to `/dashboard`.
   - Verify widget still works.

2. **Navigation cleanup**
   - Remove “Assistant” from sidebar (Content / Tools).
   - Update any in-app links that pointed to `/assistant`.

3. **Admin filter query parameter standardization**
   - Backend: Update ticket list DTO to accept `state` (map to `marketId`) and `ticketClass` (map to `ticketClassId`); deprecate/remove `teamId` from primary filter contract.
   - Frontend types: Align `TicketFilters` (or equivalent) with standardized params: `departmentId`, `ticketClass`, `supportTopicId`, `maintenanceCategoryId`, `studioId`, `state`. Remove or stop using `teamId`/`marketId` for the filter bar.
   - Ensure list API and hook send/receive the standardized param names; URL persistence uses the same names.

4. **Filter UI updates**
   - Tickets page: Implement filter bar (Search, Department, Type, Location, Clear filters) with single-select and URL sync using standardized params. Remove legacy “Team” dropdown if present.
   - Inbox page: Apply same filter bar and param names where the list supports the same filters.
   - “Clear filters” clears all and updates URL.

5. **State selector component**
   - Add or update searchable state selector (static US states list; type-to-filter).
   - Use in Add Location/Add Studio form; label “State.”

6. **Location/state label cleanup**
   - Rename “Market” to “State” in admin Locations/Add Studio and anywhere the field means state.
   - Ensure “Market” does not appear in user-facing labels where state is intended.

7. **Naming cleanup pass**
   - Search and fix “My Dashboard,” “By Market,” “blocked,” “BLOCKED,” “required subtask,” “optional subtask” per §5.
   - Align status and lifecycle wording with NEW/IN_PROGRESS/RESOLVED and Stage 2.

8. **Outdated control removal**
   - Remove toggles/filters for BLOCKED and required subtasks; remove duplicate Team/Department filter; fix workflow analytics/reporting copy per §7.

9. **Final UI consistency pass**
   - Role-based label check (location, department, ticket type) per §6.
   - Quick regression: Stage 1–5 behaviors unchanged; filters only refine view; visibility unchanged.

---

## 9. Verification Checklist

Use this checklist before considering Stage 6 complete.

- [ ] **Admin filters** — Ticket list (Tickets and Inbox) has Department, Type, and Location filters using **only** the standardized params: `departmentId`, `ticketClass`, `supportTopicId`, `maintenanceCategoryId`, `studioId`, `state`. No `teamId`, `marketId`, or `market` in URL or API for these filters.
- [ ] **Filters persist via URL** — Changing a filter updates the URL; reloading or sharing the URL restores the same filtered view. “Clear filters” clears all and removes filter params from URL.
- [ ] **State selector** — Add Location/Add Studio uses a searchable state control; typing filters the list; label is “State.” List includes intended states (e.g. 50 US states).
- [ ] **“Market” not shown for state** — No user-facing label “Market” where the meaning is state; “State” is used instead.
- [ ] **Assistant nav item removed** — Sidebar no longer has an “Assistant” link to `/assistant`.
- [ ] **`/assistant` redirect** — Visiting `/assistant` (or `/assistant/...`) redirects to `/dashboard`; no 404.
- [ ] **No BLOCKED or required-subtask references** — No UI or user-facing copy that implies BLOCKED subtask status or required/optional subtasks (except form validation “required fields”).
- [ ] **Stage 1–5 unchanged** — Visibility logic, ticket state machine, comment/mention behavior, feed/panel polish, and dashboard/reporting metric definitions are unchanged. Filters only refine the list over the visible set.

---

## Document history

- Created for Stage 6 implementation. Standardized filter params and assistant removal decision per product requirements. No code written in this phase.
