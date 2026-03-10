# Stage 25: Ticket Visibility and Feed Reliability — Mini-Spec

## 1. Intent

- Improve **reliability and predictability** of ticket visibility across all list/feed views.
- Eliminate situations where users see **empty or misleading states** (“No tickets yet”) despite tickets existing that should be visible to them.
- Align all ticket feeds with a **clear, role-consistent mental model** while preserving existing architecture (NestJS + TicketVisibilityService + Policy layer + React Query).

## 2. Problem Statement

- Users intermittently see:
  - **Empty feeds** (e.g. “No tickets yet”, “No actionable tickets”) when they expect tickets to appear.
  - **Inconsistent visibility** between views (e.g. ticket appears in `/tickets` but not `/portal`, or vice versa).
- These inconsistencies erode trust in:
  - Role-based visibility (Studio vs Department vs Admin).
  - Studio scope visibility (Stage 23).
  - Actionable queue semantics (READY subtasks, department feeds).
- The system must feel structurally sound and trustworthy; “missing tickets” (even if due to filters or UX) are perceived as correctness bugs.

## 3. Scope

**In scope:**
- Ticket feeds and list views:
  - `/tickets` (global ticket list / operations view).
  - `/inbox` (department/admin actionable queue).
  - `/portal` (Studio “My Tickets” / “By Studio(s)” / Dashboard).
  - `/portal/tickets` (legacy Studio list route still linked from portal dashboard).
- Backend ticket listing logic and visibility:
  - `TicketsService.findAll` (filters, pagination, includeCounts).
  - `TicketVisibilityService` (scope where-clause).
  - Policy-based gating for list operations (`TICKET_LIST_INBOX`).
  - Any controller DTOs / defaults affecting list queries.
- Frontend data and session flow:
  - `AuthProvider` hydration + `/auth/me`.
  - React Query keys and filters passed into `ticketsApi.list`.
  - Cache invalidation after ticket create / comment / status changes / user-scope changes.
- Empty-state rendering semantics (what messages appear when lists are empty).

**Out of scope (for this stage):**
- Changes to ticket schema or visibility rules themselves (role model, TicketVisibilityService semantics).
- Major routing redesign (we’ll only clarify where needed).
- Non-ticket feeds (notifications, reporting dashboards).

## 4. Current System Surfaces Involved

### 4.1 `/tickets` — Global Ticket List

- **File:** `apps/web/src/app/(app)/tickets/page.tsx`
- **Query:**
  - React Query key: `['tickets', filters, viewTab, debouncedSearch]`.
  - Calls `ticketsApi.list({ ...filters, search: debouncedSearch || undefined })`.
  - `filters: TicketFilters` with defaults `{ page: 1, limit: 20 }`.
  - URL search params can seed `ticketClassId`, `studioId`, `marketId`, `maintenanceCategoryId`.
- **View logic:**
  - Local `viewTab: 'active' | 'completed'`.
  - `ACTIVE_STATUSES` vs `COMPLETED_STATUSES` used to filter client-side **unless** `filters.status` is explicitly set.
  - Derived `ticketsByDept` based on `filters.teamId` and requester/owner teams.
  - Final displayed `tickets` = `ticketsByDept` filtered by `viewTab`/status.
  - Empty state:
    - If any non-page/limit filter or `debouncedSearch` is set → “No tickets found” with “Clear filters”.
    - Else → “No tickets yet” + CTA to “New Ticket”.
- **Role assumptions:**
  - Page is visible to all roles (TicketVisibilityService enforces scope).
  - Semantic intent: **operations/global list**, not necessarily “my tickets”.

### 4.2 `/inbox` — Department/Admin Actionable Queue

- **File:** `apps/web/src/app/(app)/inbox/page.tsx`
- **Query:**
  - Only enabled for roles where `canSeeFolders = DEPARTMENT_USER | ADMIN`.
  - Folders: `ticketsApi.inboxFolders()` → topic folders + All count.
  - Tickets: `ticketsApi.list(filters)` with:
    - `actionableForMe: true`.
    - `page`, `limit = 20`.
    - `supportTopicId` when a folder is selected (non-`all`).
- **View logic:**
  - Left sidebar: topic folders with active counts.
  - Main list: one-dimensional actionable queue based on READY subtasks pipeline.
  - Empty state: “No actionable tickets” + explanatory text.
- **Role assumptions:**
  - Only Department users and Admins **should** see actionable queue semantics.
  - This is an **inbox of work to do**, not a global catalogue.

### 4.3 `/portal` — Studio Portal

- **File:** `apps/web/src/app/(app)/portal/page.tsx`
- **Tabs (via `?tab=` query):**
  - `tab=my`:
    - React Query key: `['portal', 'my-tickets', myFilters, myDebouncedSearch]`.
    - `myFilters: { page, limit=20, requesterId: user.id }`.
    - Uses `InboxLayout` with table-based list.
  - `tab=studio`:
    - Key: `['portal', 'by-studio', studioFilters, studioDebouncedSearch]`.
    - `studioFilters: { page, limit=20, requesterId: user.id, studioId?: selected }`.
    - Allows filter by allowed studios (from `scopeSummary`) and search.
  - `tab=dashboard`:
    - Uses `ticketsApi.scopeSummary()` (backend Scope Summary) → open/completed counts + recent tickets + allowedStudios.
- **Empty states:**
  - My Tickets: “No tickets yet” message for the Studio user’s submissions.
  - By Studio(s): “No tickets for this location yet”.
  - Dashboard: “No recent tickets” when summary has no entries.
- **Role assumptions:**
  - Intended for `STUDIO_USER` as their primary home; Admin/Department typically ignore this view.

### 4.4 `/portal/tickets` — Legacy Studio List

- **File:** `apps/web/src/app/(app)/portal/tickets/page.tsx`
- **Query:**
  - Similar to Studio-portal lists:
    - React Query key: `['tickets', filters, debouncedSearch]`.
    - Filters: `status`, `departmentId`, `studioId`, `search`.
  - No `requesterId` filter by default; implicitly expected to be scoped by visibility.
- **Empty states:**
  - Mirrors generic table empty logic: “No tickets found” vs “No tickets yet” depending on filters.
- **Role assumptions:**
  - Historically “My Tickets” for Studio users; now partially replaced by `/portal` tabs.

## 5. Observed / Likely Failure Modes

1. **Role/view mismatch:**
   - Studio users landing on `/tickets` or `/inbox` expecting “my tickets”, but feeds are:
     - Scoped by visibility only (not requesterId).
     - Further filtered by department/actionable semantics.
   - Users interpret “No tickets yet” as **no tickets exist**, not “no tickets match this role/view”.

2. **Implicit filters causing invisible tickets:**
   - `/tickets`:
     - `viewTab` imposes implicit status sets on top of any server-side `status` filter.
     - `teamId` (department) filter applied via users list, not taxonomy.
     - Pagination and `TicketFilters` may narrow to 20 items in a way users don’t recognize.
   - `/inbox`:
     - `actionableForMe=true` and subtasks READY filter drastically reduce eligible tickets.
     - Topic folder filter (`supportTopicId`) can easily result in empties.
   - `/portal`:
     - `requesterId=user.id` means Studio users won’t see tickets others opened, even if they can see them by scope (might be perceived as a bug).

3. **Stale / mismatched user context:**
   - `AuthProvider` hydrates from `/auth/me` but prior bugs in `issueToken` caused stale departments/studio scopes to persist.
   - If user’s departments or studio scopes are stale, TicketVisibilityService and department/actionable queries yield unexpected empties.

4. **React Query cache interactions:**
   - Shared keys like `['tickets', filters, ...]` used in multiple views can serve cached data when filters or viewTab semantics change but the key is not sufficiently distinct.
   - Invalidation after mutations (create, comment, status change) is partial:
     - Some views invalidate `['tickets']` broadly, others invalidate narrower keys; potential for stale counts or missing items until reload.

5. **Ambiguous empty states:**
   - Messages like “No tickets yet” do not indicate whether:
     - There are truly no tickets in scope.
     - Filters/search are excluding them.
     - The current view (e.g. actionable, my-tickets) is intentionally narrower.

## 6. Root Cause Hypotheses

1. **View semantics vs user expectations (UX confusion, not code bug):**
   - `/tickets` is a global/ops view; Studio users expect a personal inbox.
   - `/inbox` only shows tickets with READY subtasks for their department/ownership; users may think it shows “all tickets in my department”.

2. **Hidden default filters causing apparent data loss:**
   - `viewTab` status filtering in `/tickets` hides historical/completed tickets on the default `active` tab.
   - `requesterId=user.id` in `/portal` hides tickets the Studio user can see but did not create.

3. **TicketVisibilityService + filters intersection:**
   - `where: AND[scopeWhere, filterWhere]`:
     - If `TicketVisibilityService.buildWhereClause` yields a strict scope and filters (e.g. `studioId`, `marketId`, `ticketClassId`) further narrow the search, legitimate tickets outside the compound match are omitted.
     - Studio users with incorrect `scopeStudioIds` or `studioId` filters see empties.

4. **Stale user attributes:**
   - If departments or studio scopes cached in the frontend or in `UserCacheService` fall out of sync after admin changes, queries relying on them (actionable queue, TicketVisibilityService) return nothing.

5. **React Query caching and optimistic UI:**
   - Local optimistic updates (e.g. comments, read status) don’t fully re-fetch ticket lists; `_count`-driven badges may lag until a manual refresh.

## 7. Files / Modules Likely Involved

- **Frontend:**
  - `apps/web/src/app/(app)/tickets/page.tsx`
  - `apps/web/src/app/(app)/inbox/page.tsx`
  - `apps/web/src/app/(app)/portal/page.tsx`
  - `apps/web/src/app/(app)/portal/tickets/page.tsx`
  - `apps/web/src/components/inbox/InboxLayout.tsx`
  - `apps/web/src/components/providers/AuthProvider.tsx`
  - `apps/web/src/hooks/useAuth.ts`
  - `apps/web/src/hooks/useNotifications.ts` (for cache-related effects, less central).
- **Backend:**
  - `apps/api/src/modules/tickets/tickets.service.ts`
    - `findAll`, `getMySummary`, `getScopeSummary`, `getInboxFolders`.
  - `apps/api/src/common/permissions/ticket-visibility.service.ts`
  - `apps/api/src/modules/tickets/dto/ticket-filters.dto.ts`
  - `apps/api/src/modules/auth/auth.service.ts` (`issueToken`)
  - `apps/api/src/modules/auth/strategies/jwt.strategy.ts`
  - `apps/api/src/common/cache/user-cache.service.ts`

## 8. Proposed Investigation Findings

(These are the outcomes we expect to confirm with targeted code tracing and logging.)

1. **Visibility is primarily correct at the backend layer.**
   - `TicketVisibilityService` correctly enforces:
     - Studio scope (default + `UserStudioScope`).
     - Role permissions (Studio vs Department vs Admin).
   - The majority of “missing tickets” are due to **additional frontend filters** or view semantics.

2. **Each view currently has different, implicit defaults:**
   - `/tickets`: status tab + team filter + optional search; global within visibility.
   - `/inbox`: actionable-for-me with department + READY subtasks; very narrow by design.
   - `/portal?tab=my`: requester-only view; consistent but narrower than overall visibility.
   - `/portal?tab=studio`: requester-only + studio filter; narrowest for location-based views.

3. **Empty states conflate “no data” with “no matching data”.**
   - Several views do not distinguish:
     - “System contains zero tickets in your scope.”
     - “Your current filters/tab hide tickets that do exist.”

4. **React Query keys are mostly correct but invalidation is incomplete.**
   - Keys include filter objects, which prevents obvious cache collisions.
   - However, some mutations invalidate only `['tickets']` instead of more specific keys; this can lead to views using stale or partially updated lists until the next refetch interval or navigation.

5. **Legacy `/portal/tickets` may be out of sync with new `/portal` tabs.**
   - It applies a different default filter set (no `requesterId` constraint), so Studio users can see a different set of tickets compared to `/portal?tab=my`.
   - Users moving between these views can see apparent inconsistencies even though both are “correct” to their own rules.

## 9. Recommended Fix Strategy

1. **Clarify and standardize view semantics:**
   - `/portal?tab=my`:
     - Explicitly documented and labeled as “Tickets you have requested”.
   - `/portal?tab=studio`:
     - “Tickets you have requested for your allowed locations”.
   - `/tickets`:
     - “All tickets within your visibility scope” (ops list).
   - `/inbox`:
     - “Tickets with READY subtasks assigned to you or your departments”.
   - Add short, consistent descriptions in headers/empty states to reflect these semantics.

2. **Audit and align default filters:**
   - Ensure all views:
     - Start with **unambiguous defaults** (e.g. no hidden department or status filters beyond the chosen tab).
     - Reset filters clearly when users switch tabs or context (e.g. `viewTab` change clears `status`).
   - Consider adding minimal server-side default equivalents where appropriate (explicit `status` sets for actionable lists) to keep backend and frontend assumptions aligned.

3. **Harden Auth + visibility context:**
   - Reconfirm:
     - `AuthService.issueToken` returns full, current user (departments, scopes).
     - `/auth/me` is always called on app load to hydrate `AuthProvider`.
   - Add logging or simple tracing around:
     - When studio scopes or departments change.
     - When TicketVisibilityService’s `buildWhereClause` is computed for each role.

4. **Improve empty state messaging and detection:**
   - When a list is empty:
     - Check whether *any* tickets exist in the user’s visibility scope without filters (lightweight count endpoint).
   - If global-in-scope > 0 but current list=0:
     - Show “No tickets match your current filters” rather than “No tickets yet”.
   - Reserve “No tickets yet” only for the case where the **unfiltered visibility scope is empty** or where a view is intentionally narrowed (e.g. actionable queue with no READY items).

5. **Normalize React Query invalidation semantics:**
   - After any ticket-level mutation (create/assign/status/comment):
     - Invalidate `['tickets']` *and* any feed-specific keys we use in practice:
       - `['tickets', 'actionable', ...]`, `['portal', 'my-tickets', ...]`, `['portal', 'by-studio', ...]`, `['tickets', filters, ...]`.
   - Introduce small helper functions for invalidation in shared utilities to avoid scattering keys.

6. **Deprecate or realign `/portal/tickets`:**
   - Option 1: redirect `/portal/tickets` to `/portal?tab=my` with appropriate studio filter if needed.
   - Option 2: make it clearly a “Historical tickets” view, with matching filters and explanations.
   - This mini-spec leans toward redirecting to avoid dual semantics for Studio users.

## 10. Risks / Edge Cases

- **Over-filtering risk:** introducing additional filters or defaults can accidentally hide tickets further if not carefully audited.
- **Performance:** adding visibility-scope counts for empty-state messaging must be done with efficient count queries; avoid N+1 or heavy joins.
- **User confusion during transition:** tightening semantics or changing empty messages may initially surprise users; we must update copy and possibly handbook docs to match.
- **Legacy links:** external links/bookmarks to `/portal/tickets` may persist; redirects must be robust and role-aware.

## 11. Test Plan

1. **Role-based smoke tests:**
   - Studio, Department, Admin:
     - Create multiple tickets (Support + Maintenance) at different studios.
     - Verify visibility across `/tickets`, `/inbox`, `/portal?tab=my`, `/portal?tab=studio`.

2. **Filter edge cases:**
   - Apply combinations of:
     - Status tabs (`active` / `completed`).
     - Department/team filters.
     - Studio filters.
     - Search strings.
   - Confirm empties are accompanied by “No tickets match your current filters” rather than “No tickets yet” when there are tickets in scope.

3. **Studio scope changes:**
   - Admin grants/removes studio scopes from a Studio user.
   - Confirm:
     - `/portal?tab=studio` reflects new locations after a reload.
     - `/tickets` and `/inbox` visibility reflect new scopes.

4. **Department changes:**
   - Admin reassigns a Department user’s department.
   - Confirm actionable queue and `/tickets` views reflect the new department after re-login or `/auth/me` hydration.

5. **Mutation + cache behavior:**
   - After creating a ticket, adding comments, changing status:
     - Confirm all relevant feeds update within a single navigation/refresh cycle (no manual hard refresh required).

6. **Legacy route behavior:**
   - Navigate to `/portal/tickets` directly:
     - Confirm redirect or aligned behavior per final decision.

## 12. Acceptance Criteria

- For each view, semantics and scope are:
  - **Clearly defined in copy** (headers/descriptions).
  - **Consistent with backend query behavior**.
- Users **never see “No tickets yet” when there are tickets within their visibility scope** that would naturally belong in that view.
- Switching between `/tickets`, `/inbox`, `/portal?tab=my`, and `/portal?tab=studio`:
  - Produces consistent, explainable differences in ticket sets, with no apparent “missing tickets”.
- Auth and visibility:
  - Department assignments and studio scopes are reflected in ticket feeds after re-login or `/auth/me` hydration without stale data.
- React Query:
  - After ticket mutations, all relevant lists show up-to-date data without requiring a full browser reload.
- No significant performance regressions on list endpoints (verified via basic load tests or profiling where feasible). 

