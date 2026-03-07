# Stage 6: Inbox / Notification Center / Operational UI — Step A Mini-Spec (Planning Only)

**Follows:** [Task Template](task-template.md) Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Engineering Standards](engineering-standards.md). Aligns with “department inbox/feed routing” and existing notification/actionable backend from Stage 5.

---

## 1. Intent

Implement the **operational UI layer** for notifications and actionable work so that:

- Users have a clear **in-app notification center** to see, manage, and act on notifications (list, unread/read, mark read, mark all read, and navigate to the right ticket/subtask context).
- **Department-level users** have a dedicated **actionable queue** view that surfaces tickets where they have at least one READY subtask (by department or assignment), with enough context to understand what needs attention, which subtask is ready, who is responsible, and what happened recently.

The UI consumes existing backend capabilities (notification list/read, tickets with `actionableForMe=true`, subtask list per ticket) and does not redesign backend architecture. Implementation stays modular and production-clean; no Teams integration or heavy analytics in this stage.

---

## 2. Scope

**In scope**

- **Notification center UI**
  - **List of notifications:** Paginated list (existing GET `/api/notifications`); support optional unread-only filter in the UI (query param already supported by API where applicable; if not, add only if needed for UX).
  - **Notification timestamps:** Each notification item must display `createdAt` as **relative time** (e.g. “2 minutes ago”, “1 hour ago”).
  - **Unread/read state:** Display clearly (e.g. dot, weight, background); unread count in header/bell (already present).
  - **Mark as read:** Single notification (existing PATCH `/api/notifications/:id/read`); **optimistic read:** clicking a notification should **immediately** mark it read in the UI while the API call runs in the background.
  - **Mark all as read:** Existing POST `/api/notifications/read-all`; button in notification center (already present on current page).
  - **Link to context:** Each notification links to the correct ticket; when the notification has **subtask context** (e.g. SUBTASK_BECAME_READY with `metadata.subtaskId`), the link should take the user to the ticket detail and, where feasible, highlight or scroll to that subtask (e.g. deep link `/tickets/[id]#subtask-{id}` or query `?subtask=id` and scroll/focus on ticket page).
- **Actionable queue UI (department-level users)**
  - **Dedicated surface:** A clear “Actionable” or “My queue” / “Inbox” view for department users (and optionally admin) that lists tickets where the user has at least one READY subtask (existing backend: GET `/api/tickets?actionableForMe=true`).
  - **Per-ticket context:** For each ticket in the queue, the UI should make it easy to see:
    - **What ticket needs attention:** Ticket title, ID or key, status, priority (existing list payload).
    - **Which subtask is ready:** Each actionable ticket **must** display the **READY subtask title(s)** so users clearly see what work needs to be done. Data from backend **readySubtasksSummary** when `actionableForMe=true` (N+1 mitigation).
    - **Department/user responsible:** Subtask’s department (or owner) from subtask list or list payload.
    - **What happened most recently:** Use ticket `updatedAt` or last activity; no new backend required unless we want “last event” explicitly (optional; can defer).
  - **Navigation:** Clicking a row or ticket opens the ticket detail (and optionally focuses the READY subtask).
- **Integration**
  - Reuse existing API: `notificationsApi.list`, `markRead`, `markAllRead`; `ticketsApi.list({ actionableForMe: true })`; `subtasksApi.list(ticketId)`.
  - Notification center and actionable queue are reachable from the app shell (sidebar/nav). Current sidebar has “Notifications”; add an “Actionable” / “My queue” entry for department users (and optionally admin).
- **Modularity**
  - Notification center: can live as the existing `/notifications` page with any enhancements (unread filter, subtask deep link).
  - Actionable queue: new route (e.g. `/inbox` or `/actionable`) and a dedicated component or page that fetches and renders the queue; shared components (e.g. ticket row, empty state) where it makes sense.

**Out of scope (explicit)**

- **Backend redesign:** No change to notification or ticket/subtask API contracts beyond optional, minimal additions (e.g. optional `unreadOnly` on GET notifications if not already present; or lightweight ready-subtask summary on list only if needed for performance).
- **Teams integration:** Not in this stage.
- **Heavy analytics dashboards:** No new reporting or analytics UI.
- **Permission logic changes:** Visibility and `actionableForMe` remain server-driven; UI only displays what the backend returns.

---

## 3. Files to Change

| Area | File(s) | Change |
|------|---------|--------|
| **Notification center** | `apps/web/src/app/(app)/notifications/page.tsx` | Ensure list shows unread/read state, mark read (single + all), and link to ticket; add **subtask deep link** when notification metadata includes `subtaskId` (e.g. link to `/tickets/[id]#subtask-{subtaskId}` or `?subtask=...` and scroll/focus on ticket detail page). Add optional unread-only filter if API supports it and UX warrants it. |
| **Notification types / API** | `apps/web/src/lib/api.ts`, `apps/web/src/types/*` (if present) | Ensure notification type includes optional `metadata` (e.g. `subtaskId`) so the UI can build the correct link. |
| **Ticket detail page** | `apps/web/src/app/(app)/tickets/[id]/page.tsx` | If deep link or query param (e.g. `?subtask=id` or hash `#subtask-id`) is used, read it and scroll/focus the corresponding subtask section so “link to subtask context” works. |
| **Actionable queue – route** | `apps/web/src/app/(app)/inbox/page.tsx` (or `actionable/page.tsx`) | New page: fetch `ticketsApi.list({ actionableForMe: true, limit, page })`; for each ticket (or first N) optionally fetch `subtasksApi.list(ticketId)` to show READY subtasks; render list with ticket title, status, priority, READY subtask(s), department/owner, and “last updated” or similar; link each row to `/tickets/[id]`. |
| **Actionable queue – API usage** | `apps/web/src/lib/api.ts` | Ensure `ticketsApi.list` accepts `actionableForMe?: boolean` in params (and types). Add to `TicketFilters` if missing. |
| **Sidebar / nav** | `apps/web/src/components/layout/Sidebar.tsx` | Add “Actionable” / “My queue” / “Inbox” entry for users with role DEPARTMENT_USER (and optionally ADMIN), linking to the new actionable route. Show only when applicable (e.g. department user or admin). |
| **Shared UI (optional)** | `apps/web/src/components/...` | Optional: extract a small “TicketRow” or “ActionableTicketCard” for the actionable list; or keep inline in the inbox page for simplicity. Empty state for “No actionable tickets.” |
| **Backend (minimal, only if needed)** | `apps/api/src/modules/notifications/` | If GET notifications does not support `unreadOnly`, add query param and filter in `findForUser`. (Current service may not; confirm and add only if needed for notification center filter.) |
| **Backend (N+1 mitigation)** | `apps/api/src/modules/tickets/` | When `actionableForMe=true`, return **readySubtasksSummary** per ticket (e.g. `{ id, title }[]` for READY subtasks matching the same department/owner filter) so the UI does not fetch subtasks per ticket. |

**Not changed**

- Stage 5 notification or queue backend logic (only optional, small additions as above).
- Auth or RBAC.
- Other app routes (tickets list, ticket detail, admin, etc.) except the ticket detail page for subtask deep link.

---

## 4. Schema impact

- **None** for this stage. All data is already available from existing `notifications`, `tickets`, and `subtasks` APIs. Optional backend tweaks (e.g. `unreadOnly` on notifications, or lightweight ready-subtask summary on ticket list) do not require schema or migrations.

---

## 5. Risks

- **N+1 on actionable queue:** Add **readySubtasksSummary** when `actionableForMe=true` so one list call suffices (implemented in backend).
- **Deep link to subtask:** Ticket detail page may not have a stable DOM id or section for each subtask. **Mitigation:** Ensure subtask list on ticket page renders with `id={"subtask-"+subtask.id}` (or similar) and scroll into view when `?subtask=...` or hash is present.
- **Role-based nav:** Sidebar must show “Actionable” only to DEPARTMENT_USER (and optionally ADMIN) so STUDIO_USER does not see an empty or irrelevant queue. **Mitigation:** Use existing `user.role` (and optionally `user.departments`) when rendering nav items.

---

## 6. Test plan

- **Notification center**
  - **Manual / E2E:** Open notification center; verify list, unread indicator, mark one as read, mark all as read; click a notification that has `ticketId` and confirm navigation to ticket; if metadata includes `subtaskId`, confirm link goes to ticket and (where implemented) subtask is focused or scrolled into view.
  - **Unit (optional):** Component test that a notification with `metadata.subtaskId` renders a link with the correct href (e.g. `/tickets/xyz#subtask-abc`).
- **Actionable queue**
  - **Manual / E2E:** As department user, open actionable queue; verify only tickets with at least one READY subtask appear (or backend filter is applied); verify each row shows ticket and READY subtask context; click row and confirm navigation to ticket detail.
  - **Unit (optional):** Inbox page or component: given mock list of tickets and subtasks, renders ticket titles and READY subtask labels correctly.
- **Nav**
  - **Manual:** As DEPARTMENT_USER, sidebar shows “Actionable” (or chosen label); as STUDIO_USER, it does not. Admin behavior per product choice (show or hide).
- **Regression**
  - Existing tickets list, ticket detail, and notifications list (without new filters) still work; no change to backend permission or visibility logic.

---

**Summary:** Stage 6 adds a **notification center** (with subtask deep link and optional unread filter) and an **actionable queue** UI for department users, using existing APIs. No schema changes; optional small backend additions only if needed for UX or performance. Implementation remains modular and production-clean.
