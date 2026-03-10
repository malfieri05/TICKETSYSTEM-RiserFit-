# Stage 25: Ticket Visibility and Feed Reliability — Implementation Plan

## 1. Implementation Overview

This plan translates the Stage 25 mini-spec into a **minimal, high-confidence set of changes** that improve ticket visibility reliability and predictability without altering the underlying role model, TicketVisibilityService semantics, or policy layer.

The work is organized into six reliability categories:
- **View semantics / copy clarity** — make each page’s purpose explicit so “missing” tickets are understandable, not surprising.
- **Default filter alignment** — ensure default filters and tabs are consistent, predictable, and do not accidentally hide tickets.
- **Empty-state correctness** — distinguish between “no tickets in your scope” and “no tickets match your current filters or view”.
- **Auth/session freshness** — confirm user role/department/studio scopes are always fresh on the client.
- **React Query invalidation coverage** — ensure ticket mutations refresh all relevant feeds.
- **Legacy route alignment** — eliminate inconsistencies between `/portal` and `/portal/tickets`.

High-level order:
1. **Frontend view semantics & empty-state copy** (no behavior changes yet).
2. **Align default filters/tabs with explicit semantics** (frontend-only).
3. **Normalize React Query invalidation for ticket mutations**.
4. **Reinforce auth/session freshness and TicketVisibilityService assumptions (light checks/logging only).**
5. **Add optional lightweight “in-scope ticket count” support for better empty-state messaging** (minimal backend).
6. **Align or deprecate `/portal/tickets` to match new portal semantics.**

Throughout, we preserve backend as the source of truth and avoid architectural rewrites.

## 2. Reliability Issues to Address

Breakdown by category:

### 2.1 View semantics / copy clarity
- Clarify **what each view is meant to show**:
  - `/tickets` → “All tickets in your visibility scope”.
  - `/inbox` → “Actionable tickets with READY subtasks for your departments or assignments”.
  - `/portal?tab=my` → “Tickets you have requested”.
  - `/portal?tab=studio` → “Tickets you have requested for your allowed studios”.
- Ensure headers and short descriptions make this explicit to reduce perceived “missing tickets”.

### 2.2 Default filter alignment
- `/tickets`:
  - `viewTab` (“Active” / “Completed”) implicitly filters by status; align with explicit status concept and ensure transitions between tabs reset conflicting filters.
  - Remove any surprising implicit filters that aren’t obvious in the UI.
- `/inbox`:
  - Keep `actionableForMe=true` but make sure topic folder selection doesn’t layer on hidden defaults.
- `/portal`:
  - My Tickets: always includes `requesterId=user.id` and no hidden status filter beyond what’s shown.
  - By Studio(s): `requesterId=user.id` + optional studio filter from an explicit control.

### 2.3 Empty-state correctness
- Ensure that:
  - “No tickets yet” appears only when there truly are **no tickets** in the user’s visibility scope for that view’s semantics.
  - “No tickets match your current filters” appears when tickets exist in scope, but the user’s filters/search/tab produce an empty result.
  - “No actionable tickets” remains accurate for `/inbox` even when there are tickets, but none with READY subtasks for the user.

### 2.4 Auth/session freshness
- Verify that:
  - `AuthProvider` always hydrates from `/auth/me` and not stale localStorage-only data.
  - After department/studio-scope changes (admin actions), the next login or forced re-auth yields up-to-date `departments` and `scopeStudioIds` for the user.
- Add targeted checks/logging to detect mismatches between client user state and backend reality.

### 2.5 React Query invalidation coverage
- For ticket mutations (create/update/status/assign/comment), ensure we consistently invalidate:
  - Global ticket lists.
  - Actionable `/inbox` list.
  - Studio portal lists.
  - Any other list views that rely on ticket data (e.g. my-summary if applicable).

### 2.6 Legacy route alignment
- Resolve inconsistency between:
  - `/portal?tab=my` (new Studio “My Tickets” view).
  - `/portal/tickets` (legacy list with different defaults and semantics).
- Prefer redirecting `/portal/tickets` into the new tabbed portal to avoid dual semantics for Studio users.

## 3. Files / Modules to Modify

### 3.1 Frontend

- **Ticket feeds / views**
  - `apps/web/src/app/(app)/tickets/page.tsx`
  - `apps/web/src/app/(app)/inbox/page.tsx`
  - `apps/web/src/app/(app)/portal/page.tsx`
  - `apps/web/src/app/(app)/portal/tickets/page.tsx`
  - `apps/web/src/components/inbox/InboxLayout.tsx`
  - `apps/web/src/components/tickets/TicketDrawer.tsx` (only if list-related invalidation/UI feedback is needed).
- **Auth / session**
  - `apps/web/src/components/providers/AuthProvider.tsx`
  - `apps/web/src/hooks/useAuth.ts`
- **Query / cache**
  - `apps/web/src/lib/api.ts` (for shared ticket mutation helpers, if introduced).
  - Any mutation hooks that modify tickets:
    - `apps/web/src/app/(app)/tickets/[id]/page.tsx`
    - `apps/web/src/components/tickets/TicketDrawer.tsx`
    - Other ticket mutation surfaces (status transitions, assignment, comment creation).

### 3.2 Backend

- **Tickets / visibility**
  - `apps/api/src/modules/tickets/tickets.service.ts`
    - `findAll`
    - `getMySummary`
    - `getScopeSummary`
    - `getInboxFolders`
  - `apps/api/src/common/permissions/ticket-visibility.service.ts`
    - No behavior change; may add debug logging hooks.
- **Auth / session**
  - `apps/api/src/modules/auth/auth.service.ts` (confirm `issueToken` alignment with `/auth/me`).
  - `apps/api/src/common/cache/user-cache.service.ts` (validate TTL behavior for role/department/scope).
  - `apps/api/src/modules/auth/strategies/jwt.strategy.ts` (no changes expected, possible logging).
- **Optional new helper endpoint**
  - `apps/api/src/modules/tickets/tickets.controller.ts` (if we add an “in-scope ticket count” endpoint).

## 4. Frontend Plan

### 4.1 `/tickets` — Global Ticket List

**What will change:**
- **Header and description:**
  - Add a short description under the header explaining:
    - “All tickets you are allowed to see.”
    - Active vs Completed tab semantics.
- **Tab + filter interaction:**
  - Ensure `viewTab` toggling explicitly drives a **status filter** instead of only client-side filtering:
    - When `viewTab = 'active'`, set `filters.status` to “not in RESOLVED/CLOSED” (or leave status unset and filter client-side consistently).
    - When `viewTab = 'completed'`, set `filters.status` to “RESOLVED/CLOSED” or equivalent.
  - Clear conflicting user-selected `status` filters when switching tabs, or clearly allow them and update UI copy to say “tab is informational only”.
  - Prefer approach: **tab controls which statuses are displayed** and overrides `filters.status` to avoid ambiguous combinations.
- **Empty states:**
  - For empties:
    - If any filters/search are active (status/team/studio/market/category/search), show:
      - “No tickets match your current filters.”
      - Button “Clear filters”.
    - Only show “No tickets yet” when:
      - Filters are at default AND a background “in-scope ticket count” for the user equals 0.
      - Otherwise, we show the “match” empty state.

**What remains unchanged:**
- Core table layout, columns (Title/Created/Progress/Requester), row click → drawer behavior.
- Use of `TicketVisibilityService` and backend list semantics.

### 4.2 `/inbox` — Actionable Queue

**What will change:**
- **Header copy:**
  - Clarify:
    - “Tickets with READY subtasks assigned to you or your departments.”
  - Possibly add a one-line info text near empty state about READY subtasks.
- **Empty state:**
  - Keep “No actionable tickets”, but add a subline:
    - “You may still have tickets without READY subtasks in other views.”
  - Optionally, when `in-scope active tickets > 0` but actionable query is empty, use:
    - “No actionable tickets right now” instead of implying no tickets exist at all.

**What remains unchanged:**
- `actionableForMe` filter, topic folders, and READY-subtask logic in backend.
- List layout and row content (title/status/priority/READY subtasks).

### 4.3 `/portal` — Studio Portal

**What will change:**
- **Header/tab semantics (already partly wired):**
  - Ensure the descriptions used in `InboxLayout` match:
    - My Tickets: “Tickets you have requested, across all locations.”
    - By Studio(s): “Tickets you have requested, grouped by your allowed locations.”
  - Consider adding a one-line hint for Studio users that `/tickets` shows all tickets within their visibility scope (if they should be aware).
- **Empty states:**
  - My Tickets:
    - When list empty and **global in-scope count > 0** (e.g. others opened tickets they can see), show:
      - “You haven’t requested any tickets yet. To see all tickets for your studios, use the Tickets view.”
  - By Studio(s):
    - When empty but there are My Tickets in other studios, adjust copy accordingly.
- **React Query filter defaults:**
  - Confirm:
    - My Tickets never sets unexpected `status` filters by default.
    - By Studio(s) only applies studio and search filters that are visible in UI.

**What remains unchanged:**
- Use of `requesterId=user.id` as the semantics for both My Tickets and By Studio(s).
- Dashboard’s scope summary and recent activity behavior.

### 4.4 `/portal/tickets` — Legacy Studio List

**What will change:**
- Implement a **redirect layer**:
  - For `STUDIO_USER`:
    - Redirect `/portal/tickets` to `/portal?tab=my`.
    - If `studioId` present in query string, map to a studio filter in `/portal?tab=studio` instead.
  - For other roles:
    - Either:
      - Redirect to `/tickets` (global list), or
      - Leave as is but update copy to reflect that it’s a specialized view (less likely needed).
- Add a small banner or direct removal of “Back to dashboard” if the route is no longer first-class.

**What remains unchanged:**
- Existing list implementation can be retained as fallback (only reachable by admin if necessary) but not primary path for Studio users.

### 4.5 Shared Components (`InboxLayout`, etc.)

**What will change:**
- Add optional props to `InboxLayout` for:
  - `emptyMode: 'none' | 'noTickets' | 'noMatches' | 'noActionable'` to standardize supported empty-state patterns.
  - Or pass an explicit `emptyStateVariant` string and keep actual rendering local to each page.
- Optionally: allow a **secondary caption** at top describing semantics, reused across views.

**What remains unchanged:**
- Layout structure (folders / filters / list / pagination) and styling.

## 5. Backend Plan

### 5.1 In-scope ticket count helper (optional but recommended)

Goal: enable frontend to distinguish between “no tickets exist in scope” vs “filters/tab produce no matches”.

**Approach:**
- Add a lightweight endpoint, e.g.:
  - `GET /tickets/in-scope-count`
  - Returns `{"total": number}` representing **total tickets in the user’s TicketVisibilityService scope**, without additional filters.
- **Implementation:**
  - In `TicketsService`:
    - Reuse `visibility.buildWhereClause(actor)` to compute scopeWhere.
    - `const total = this.prisma.ticket.count({ where: scopeWhere });`
  - In `tickets.controller.ts`:
    - Secure endpoint with same `TICKET_LIST_INBOX` policy or a dedicated capability (if desired), but semantically it’s “list-like”.
  - No new schema changes; just a count.

### 5.2 Existing list response shaping

No major changes planned:
- Maintain `_count` fields (comments, subtasks, attachments).
- Ensure:
  - `includeCounts` default remains `true` for feed views (current behavior).
  - Any new frontend semantics (status groupings, actionable filters) line up with existing `where` clauses and do not require additional backend logic.

### 5.3 Auth/session hydration reinforcement

- Confirm:
  - `AuthService.issueToken` collects full `departments` and `studioScopes` when generating login response.
  - `/auth/me` returns exactly what `JwtStrategy.validate` would produce.
- Add **non-invasive logging** for Stage 25:
  - Log warnings when:
    - A `DEPARTMENT_USER` has no departments but hits `/inbox`.
    - A `STUDIO_USER` has no `studioId` and no `scopeStudioIds`.
  - This can be toggled by an env flag and removed after debugging.

## 6. Query / Cache Plan

### 6.1 Standardize React Query keys

- Ensure that each surface uses **distinct, descriptive keys**:
  - Global tickets list: `['tickets', 'list', filters, viewTab, search]` (add `'list'` for clarity).
  - Inbox actionable: `['tickets', 'actionable', filters]`.
  - Portal my tickets: `['tickets', 'portal-my', filters, search]`.
  - Portal by studio: `['tickets', 'portal-studio', filters, search]`.
  - My summary (if used): `['tickets', 'my-summary', params]`.

### 6.2 Centralize invalidation for ticket mutations

- Introduce helper utility (e.g. `invalidateTicketLists(queryClient)`) that:
  - Invalidates:
    - `['tickets']` (wildcard).
    - `['tickets', 'list']`.
    - `['tickets', 'actionable']`.
    - `['tickets', 'portal-my']`.
    - `['tickets', 'portal-studio']`.
    - Any other ticket-related caches (my-summary, dashboards).
- Use this helper in:
  - Ticket create mutations.
  - Ticket update (title/description/priority) mutations.
  - Status transition mutations.
  - Assignment mutations.
  - Comment create mutations (since feeds show `_count.comments` and latest updatedAt).

## 7. Route / UX Alignment Plan

- **`/portal/tickets`**
  - Implement route-level redirect logic in `portal/tickets/page.tsx`:
    - For Studio users:
      - If query has `studioId`, redirect to `/portal?tab=studio&studioId=...`.
      - Else redirect to `/portal?tab=my`.
    - For Department/Admin:
      - Redirect to `/tickets` (global list).
  - Optionally display a short message if redirected (e.g. toast or subtle banner in `/portal`).

- **Role-based expectations**
  - Sidebar items already distinguish:
    - Studio: `My Tickets`, `By Studio(s)`, `Dashboard`, `Notifications`.
    - Department/Admin: `Home`, `Inbox`, `Tickets`, etc.
  - Ensure any explanatory copy added to views reaffirms:
    - Studio users have personal queues.
    - Department/Admin views are operational/inbox-style.

## 8. Empty-State Strategy

Define **view-specific empty-state rules**:

### 8.1 `/tickets`

- If `filters` and `search` are both at defaults AND `inScopeTotal === 0`:
  - Show: “No tickets yet” + “Create your first ticket…” + “New Ticket” button.
- If `filters` or `search` are non-default:
  - Show: “No tickets match your current filters.” + “Clear filters” button.

### 8.2 `/inbox`

- If actionable query is empty:
  - Always show: “No actionable tickets right now.”
  - Subtext: “Tickets without READY subtasks may still exist in other views.”
  - Optionally, if `inScopeTotal === 0`, add: “There are currently no tickets in your scope.”

### 8.3 `/portal?tab=my`

- If no tickets for `requesterId=user.id` AND `inScopeTotal === 0`:
  - Show: “No tickets yet” with brief explanation.
- If no tickets for `requesterId=user.id` BUT `inScopeTotal > 0`:
  - Show: “You haven’t requested any tickets yet.” + hint that other tickets may exist in `/tickets`.

### 8.4 `/portal?tab=studio`

- If no tickets for selected studio(s) AND `inScopeTotal === 0`:
  - “No tickets yet for your studios.”
- If other studios or My Tickets contain items:
  - “No tickets for this location yet.” + keep “All my studios” option obvious.

### 8.5 `/portal/tickets` (post-alignment)

- Ideally no custom empty state; route should redirect so users experience only the canonical portal views.

## 9. Testing Plan

### 9.1 Manual Testing

- **Studio User**
  - Create multiple tickets across one or more studios.
  - Verify:
    - `/portal?tab=my` shows only tickets they requested.
    - `/portal?tab=studio` with various studio selections shows the expected subsets.
    - `/tickets` shows all visible tickets for the same user scope (including ones they didn’t request if allowed).
    - Empty-state messages match each situation described above.

- **Department User**
  - With assigned departments:
    - `/inbox` shows actionable tickets (READY subtasks).
    - `/tickets` shows all tickets within department scopes.
    - Switching filters/search does not produce misleading “No tickets yet” messages.
  - Change department assignment (admin action) and re-login:
    - Confirm views reflect new department.

- **Admin**
  - Validate all three major views:
    - `/tickets`, `/inbox`, `/portal?tab=...` (if permitted).
  - Ensure semantics and empty states read clearly and no tickets disappear unexpectedly.

- **Filters & Pagination**
  - For each role, combine:
    - Status filters.
    - Department/team filters.
    - Studio filters.
    - Search.
  - Verify that:
    - Tickets appear/disappear in understandable ways.
    - Empty states correctly distinguish no-tickets vs no-matches.

- **Mutation Flows**
  - Create a ticket; verify all relevant lists update after mutation.
  - Add comments; ensure comment counts and order update.
  - Change status/assignment; ensure lists reorder/refresh as expected.

### 9.2 Automated Testing

- **Backend unit/integration tests**
  - Add tests for `TicketsService`:
    - New `getInScopeCount(actor)` (if implemented).
    - Confirm `findAll` remains correct with various filters.
  - Optionally test `TicketVisibilityService.buildWhereClause` for typical role/scenario combinations.

- **Frontend tests**
  - Add unit tests for any shared helper logic (e.g. `isDefaultFilters()` used to decide empty-state copy).
  - If test harness is available, add integration/e2e tests that:
    - Navigate to key views.
    - Set filters.
    - Assert presence/absence of expected empty state messages.

## 10. Risks / Edge Cases

- **Overcorrecting filters:**
  - Forcing status filters from tabs could surprise existing power users.
  - Mitigation: document new behavior and ensure UI clearly shows what statuses are in view.

- **Performance of scope-count endpoint:**
  - Poorly implemented counts could slow down views.
  - Mitigation: use simple `count` queries with same `scopeWhere`, no joins beyond existing indexes.

- **Redirect loops:**
  - Misconfigured `/portal/tickets` redirection logic could create loops.
  - Mitigation: thoroughly test role-based redirects; keep logic simple and explicit.

- **Stale caches after key changes:**
  - If not all relevant React Query keys are invalidated, some views may still lag.
  - Mitigation: centralize invalidation, cross-check keys used in all ticket list views.

## 11. Implementation Order

1. **View semantics & copy updates**:
   - Adjust headers/descriptions in `/tickets`, `/inbox`, `/portal`.
   - No behavior changes yet.
2. **Default filter alignment**:
   - Normalize tab-to-status behavior in `/tickets`.
   - Confirm `/portal` tabs do not apply hidden filters.
3. **Empty-state logic updates**:
   - Introduce helper functions to determine when to show “no tickets yet” vs “no matches”.
   - Apply to `/tickets`, `/portal`, `/inbox`.
4. **Backend in-scope count endpoint (if used)**:
   - Implement `GET /tickets/in-scope-count`.
   - Wire basic use into frontend empty-state decisions.
5. **React Query key normalization and shared invalidation helper**:
   - Update keys.
   - Update all ticket mutations to call shared invalidation.
6. **Auth/session logging (temporary)**:
   - Add targeted warnings for suspicious department/studio scope states.
   - Remove or behind flag after verification.
7. **Legacy route alignment**:
   - Implement `/portal/tickets` redirects.
8. **Regression + UX pass**:
   - Test flows across roles and adjust copy as needed.

## 12. Definition of Done

- All ticket feeds (`/tickets`, `/inbox`, `/portal?tab=my`, `/portal?tab=studio`) have:
  - Clear semantics in header/description.
  - Predictable default filters/tabs.
  - Correct, role-consistent visibility aligned with backend.
- Empty states:
  - Correctly distinguish “no tickets in scope” vs “no tickets match current filters” vs “no actionable tickets”.
  - No observed cases of “No tickets yet” when tickets clearly exist in the user’s reasonable scope for that view.
- Auth/session:
  - After department or studio scope changes and re-login, users see updated tickets and inboxes without stale behavior.
- React Query:
  - Ticket creates/updates/status changes/assignment/comments trigger visible updates in all relevant lists without full-page reloads.
- `/portal/tickets`:
  - No longer presents conflicting semantics; redirects or copy aligned with `/portal` tabs.
- No production performance regressions on ticket list endpoints (verified via basic load tests or profiling).

