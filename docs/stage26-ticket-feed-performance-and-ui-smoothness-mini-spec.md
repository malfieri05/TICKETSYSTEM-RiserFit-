# Stage 26: Ticket Feed Performance and UI Smoothness — Mini-Spec

## 1. Intent

- Make ticket feeds and lists feel **fast, stable, and professional** across all roles.
- Reduce perceived latency, visual jitter, and disruptive refetch behavior without changing business rules.
- Introduce **targeted, low-risk performance and UX refinements** on top of the Stage 25 visibility and reliability work.

## 2. Problem Statement

Even with correct visibility and filters (Stage 25), the ticket feeds can still feel:
- **Jittery**: full-table spinners, abrupt content swaps, and list “flashes” on refetch.
- **Heavy**: every filter/search change can trigger a full rerender of the list.
- **Harsh**: mutation-driven invalidation (comments, subtasks, status changes) often forces full list refreshes, even when the user only changed one row.
- **Disorienting**: pagination and search changes can reset scroll and briefly show empty/blank regions.

These issues are primarily **perceived performance and UX smoothness** problems, not raw backend latency problems. The goal is to preserve the current architecture and correctness while making the UI feel:
- consistent,
- predictable,
- stable during updates,
- and visually polished under load.

## 3. Scope

**In scope**
- Ticket feed/list experiences:
  - `/tickets` (global list, Active / Completed tabs)
  - `/inbox` (actionable queue)
  - `/portal?tab=my` (studio “My tickets”)
  - `/portal?tab=studio` (studio “By studio(s)”)
- Shared UI and layout pieces:
  - `InboxLayout` (shared inbox structure)
  - ticket feed row rendering patterns (comment count, progress, metadata)
  - `TicketDrawer` interactions **insofar as they affect perceived feed responsiveness**
- React Query usage patterns:
  - loading state handling
  - pagination behavior
  - filter/search UX
  - mutation invalidation behavior

**Out of scope**
- Backend schema changes.
- Ticket visibility rules (TicketVisibilityService semantics, policy layer).
- Role model or new features.
- Large-scale architectural changes (no new state managers, no rewrite of list APIs).

## 4. Current Feed Surfaces

- **`/tickets`**
  - Server data: paginated ticket list via `ticketsApi.list`.
  - Client filters: search, department filter, Active/Completed tab, plus optional taxonomy filters.
  - Query key: `['tickets', 'list', filters, viewTab, debouncedSearch]`.
  - Renders a classic table with row click → `TicketDrawer` slide-in.

- **`/inbox`**
  - Server data: actionable tickets with `actionableForMe = true`, optional folder (`supportTopicId`), pagination.
  - Query key: `['tickets', 'actionable', filters]`.
  - Uses `InboxLayout` list region with an actionable-focused empty state.

- **`/portal?tab=my`**
  - Server data: tickets where `requesterId = currentUser.id`, search, pagination.
  - Query key: `['tickets', 'portal-my', myFilters, myDebouncedSearch]`.
  - Uses `InboxLayout` with a table-style list component.

- **`/portal?tab=studio`**
  - Server data: tickets where `requesterId = currentUser.id` and optional `studioId`, plus search and pagination.
  - Query key: `['tickets', 'portal-studio', studioFilters, studioDebouncedSearch]`.
  - Uses `InboxLayout` with a table-style list component.

- **Shared UI**
  - `InboxLayout`:
    - Manages header, folders, filters region, list container, empty state, pagination.
    - Consumers plug in the actual row markup.
  - Ticket rows:
    - Combine title, topic/category, requester, location, status, priority, progress, comment count.
  - `TicketDrawer`:
    - Opens from `/tickets` (and potentially other list views) as a slide-in detail + workflow panel.

## 5. Observed / Likely UX and Performance Issues

1. **Refetch jitter and content flashes**
   - Full-table loading spinners replace the table during each refetch, even when data is already present.
   - Filter/search changes cause the list to disappear before new data arrives.
   - Pagination changes can briefly show empty space or a loading block instead of keeping the prior page visible.

2. **Overly broad invalidation and full-list refresh**
   - Mutations (comments, subtasks, transitions, assignments) use a shared invalidation helper that invalidates **all** list surfaces.
   - This is correct but can be visually harsh: lists drop into a loading state or re-render entirely on each mutation, even when only one row changed.

3. **Unnecessary rerenders and object recreation**
   - Filter objects (`filters`, `myFilters`, `studioFilters`) are re-created in state and passed directly into React Query keys without normalization.
   - Supporting props for `InboxLayout` and row components are often composed inline, creating new function/JSX objects on each render.
   - This can lead to extra React Query subscriptions and re-renders beyond what’s strictly needed.

4. **Search debounce UX rough edges**
   - Search inputs rely on `setTimeout` debounce and a separate debounced value, which can result in:
     - delayed updates that feel laggy,
     - multiple quick changes triggering multiple refetches if the debounce is not tightly controlled.

5. **Pagination ergonomics**
   - Pagination changes currently:
     - cause a full list re-render + loading block,
     - rarely preserve context or scroll position.
   - Jumping pages can feel like a full screen change instead of a smooth continuation.

6. **Mutation responsiveness**
   - Comment, subtask, and status updates are strictly server-authoritative and rely on refetch + invalidation.
   - For common “local” operations (e.g. append a comment, flip a subtask status), the UI waits on network before visibly updating the row, which feels slower than necessary even when APIs are fast.

7. **UI polish gaps**
   - No lightweight skeletons or shimmer states in some lists; instead: binary “spinner vs full table.”
   - Counts and progress indicators (comment count, subtask progress) can jump abruptly, especially when multiple lists are invalidated at once.
   - Row layout can slightly shift when conditional elements (e.g. comment bubble) appear/disappear between renders, adding to perceived jitter.

## 6. Root Cause Hypotheses

1. **Binary loading state handling**
   - Use of a single `isLoading` branch that replaces the entire list with a loading block leads to full UI swaps.
   - Lack of `keepPreviousData` / `placeholderData` means React Query clears results while the new request is in flight.

2. **Aggressive global invalidation**
   - The shared `invalidateTicketLists` helper is intentionally conservative for correctness but may be **overly aggressive** in practice.
   - All list surfaces refetch even when the user is only focused on one surface and one ticket.

3. **Filter/params as unstable objects**
   - Query keys use whole filter objects and debounced search values, which:
     - ensures correctness, but
     - can trigger extra fetches/renders because object identity changes frequently.

4. **Lack of optimistic updates where safe**
   - For operations where the local shape of the data is obvious (e.g. append comment, toggle subtask status for a known ticket), the UI always waits for server confirmation before updating.
   - This is safe, but leaves UX improvement room via **guarded optimistic updates** that are rolled back on error.

5. **No explicit scroll or focus management**
   - Pagination and some filter changes do not manage scroll position, causing abrupt jumps.
   - Opening/closing the `TicketDrawer` and navigating back from detail views may re-render lists without preserving scroll, increasing disorientation on large lists.

6. **Row-level rendering not memoized**
   - Ticket rows are often rendered inline within `map`, with inline closures and style objects.
   - Even minor changes at the list level can cause all rows to re-render, rather than only rows whose underlying data changed.

## 7. Files / Modules Likely Involved

- **Frontend list surfaces**
  - `apps/web/src/app/(app)/tickets/page.tsx`
  - `apps/web/src/app/(app)/inbox/page.tsx`
  - `apps/web/src/app/(app)/portal/page.tsx` (tabs `my` and `studio`)

- **Shared layout and interactions**
  - `apps/web/src/components/inbox/InboxLayout.tsx`
  - `apps/web/src/components/tickets/TicketDrawer.tsx`
  - Potential shared ticket row markup if factored (or row sections within the above pages).

- **Data / query utilities**
  - `apps/web/src/lib/api.ts` (React Query invalidation helper, tickets API)
  - Any future shared ticket-list hooks/utilities introduced in Stage 26.

- **Supporting hooks**
  - `apps/web/src/hooks/useAuth.ts`
  - `apps/web/src/hooks/useNotifications.ts` (for perceived header/inbox integration smoothness).

## 8. Proposed Improvement Strategy

1. **Stabilize loading behavior with `keepPreviousData` and partial loading UI**
   - For all paginated ticket lists:
     - Use React Query’s `keepPreviousData: true` where appropriate so previous page data remains visible while new data loads.
     - Replace full-table loading spinners with:
       - top-level “Fetching…” indicator, or
       - row-level skeletons that **do not clear the entire table**.

2. **Differentiate “initial load” vs “refetch”**
   - On first load of each view:
     - It’s acceptable to show a centered loading state.
   - On subsequent filter/search/pagination changes:
     - Keep existing data visible, overlay a subtle progress indicator, and avoid blank-table flashes.

3. **Tighten query keys and parameter normalization**
   - Ensure filters/search inputs are normalized (e.g. remove undefined keys, stable object shapes) before being included in query keys.
   - Where possible, use **primitive query parameters** (page, search, folder id, tab) in keys instead of entire filter objects, to reduce unnecessary fetch churn.

4. **Scoped invalidation and optional optimistic updates**
   - Retain `invalidateTicketLists` as the **safe default** but:
     - For clearly local-only mutations (e.g. comment append on current ticket):
       - Consider optimistic updates on the **detail view** while deferring list invalidation or making it less aggressive (e.g. only invalidate the relevant list key).
     - For subtasks and status changes:
       - Prefer accurate list data, but consider:
         - optimistic status transition in the detail/ticket drawer,
         - **delayed / batched** list invalidation when multiple operations occur in quick succession.

5. **Row-level memoization and prop hygiene**
   - Extract ticket row markup into small, standalone components that:
     - receive **primitive props** (ids, strings, numbers, flags),
     - use `React.memo` where beneficial.
   - Avoid creating new inline style objects and anonymous functions in row `map` calls when not necessary.

6. **Improve pagination UX**
   - On page changes:
     - Maintain scroll position (either restore to top deterministically or preserve where the user was if that feels better in testing).
     - Use `keepPreviousData` so the list does not fully disappear.
   - Provide subtle UI cues when data is still loading for the next page (e.g. dimming pagination buttons, small “Loading page…” text).

7. **Smooth search and filter interactions**
   - Standardize search debounce:
     - Use a single, shared debounce hook with a consistent delay (e.g. 300ms).
   - Consider triggering search on:
     - blur or Enter, if we want fewer intermediate fetches, or
     - controlled debounce with clear user feedback that results are updating.

8. **UI polish: skeletons and stable layout**
   - Introduce simple skeleton row components within `InboxLayout`:
     - fixed height rows with grey bars for text and badges.
   - Ensure conditional elements (e.g. comment bubble) reserve consistent horizontal space when present/absent to minimize layout shift:
     - e.g. align metadata into a fixed-width region, or use flex gaps that don’t cause entire rows to reflow.

## 9. Safe Optimizations vs Risky Optimizations

**Safe (preferred)**
- Applying `keepPreviousData` on paginated queries where page/filters are the primary keys.
- Distinguishing initial load from in-place refetch to avoid clearing existing data.
- Adding lightweight skeletons and loading indicators inside `InboxLayout`.
- Normalizing filter/search inputs before passing them into query keys.
- Row extraction + memoization where props are stable and simple.
- Scoped invalidation where the affected ticket list is unambiguous (e.g. only `['tickets', 'portal-my', …]` for a requester-only operation).

**Risky (to avoid or gate heavily)**
- Broad optimistic updates on shared lists where visibility rules are complex (e.g. actionable inbox).
- Introducing new global state managers or cross-cutting caches beyond React Query.
- Client-side “prediction” of visibility or counts that diverges from backend truth.
- Complex animation frameworks or heavy transition libraries that could hurt performance more than they help.
- Changing backend pagination semantics or query shapes purely for UX without strong justification.

## 10. Test Plan

**Manual UX verification**
- **/tickets**
  - Change filters, tab (Active/Completed), and search rapidly:
    - Confirm list content does not disappear; previous rows remain until new data is ready.
    - Ensure loading indicators are subtle and do not cause major layout shifts.
  - Page between multiple pages:
    - Verify the list transitions feel smooth, without blank flashes.
    - Confirm scroll behavior is predictable (e.g. reset to top consistently).
- **/inbox**
  - Switch between folders and pages:
    - Verify actionable tickets update smoothly and ready subtasks are always accurate.
    - Ensure no aggressive spinners replace the list when changing folders.
- **/portal?tab=my** and **/portal?tab=studio**
  - Use search and studio filters:
    - Confirm debounced search feels responsive and does not cause stutter.
    - Verify empty and loading states clearly communicate what’s happening without feeling jarring.

**Mutation responsiveness tests**
- On any list surface:
  - Add a comment, complete a subtask, change ticket status, and reassign a ticket.
  - Confirm:
    - The primary detail view updates immediately (or optimistically where implemented).
    - Relevant lists reflect changes without full flicker or heavy reload feel.
    - Comment counts and progress indicators update smoothly.

**Performance checks**
- Use browser dev tools:
  - Monitor React Profiler for unnecessary rerenders on list changes.
  - Inspect Network tab to ensure:
    - Query requests are not duplicated unnecessarily for the same interaction.
    - Mutation flows only trigger the minimum expected refetches.

## 11. Acceptance Criteria

- Ticket feed/list views feel **noticeably smoother**:
  - No full blank-table flashes on common interactions (filter/search/page/mutation).
  - Loading indicators are present but **non-disruptive**.
- Perceived responsiveness of:
  - comments,
  - subtasks,
  - status/assignment changes
  is improved without compromising correctness.
- Pagination across all ticket feeds behaves predictably:
  - prior data is preserved while new data loads,
  - scroll behavior is consistent.
- React Query usage is:
  - standardized across list views,
  - free of obvious redundant fetches and unnecessary rerenders.
- No changes to:
  - TicketVisibilityService semantics,
  - role model,
  - backend schemas.
- All changes remain **minimal, incremental, and reversible**, with clear isolation in the relevant list/view components and shared helpers.

