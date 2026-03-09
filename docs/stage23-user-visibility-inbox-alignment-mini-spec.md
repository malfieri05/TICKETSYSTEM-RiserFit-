# Stage 23: User Visibility & Role-Scoped Inbox Alignment — Step A Mini-Spec (Planning Only)

**Purpose:** Architecture review. No implementation until approved.

**Context:** The system already supports ticket taxonomy, schema-driven forms, workflow templates, subtasks, ticket feed/inbox views, studio portal, ticket conversations, notifications, role-based permissions, and studio location data. This stage aligns **user visibility** and **inbox behavior** with the real operational model—without redesigning the workflow engine, permissions broadly, or adding new architectural layers.

**Constraints:** No workflow engine redesign. No broad permission redesign. No realtime sockets, maps, AI, or vendor logic. Preserve modular monolith; reuse existing visibility and scope patterns; avoid unnecessary schema changes; maintain NestJS + Prisma + React Query patterns.

---

## 1. Intent

Design the cleanest way to manage:

1. **Studio-user visibility across one or more locations** — Admin-managed default location and additional visible studios; clear UX for search/add/remove.
2. **Role-scoped inbox/feed behavior** — Studio users see tickets they submitted + tickets for their allowed locations (with optional filter by location); department users see an inbox scoped to their department with topic-based folders and active counts.
3. **Comment/progress visibility for studio users** — Studio users can view ticket progress and subtasks, comment (non-internal), and receive notifications; they cannot create/complete subtasks or mutate workflow state.
4. **Department-scoped inbox folders by topic** — Department users get an inbox with folders derived from their department’s support topics (e.g. All, New Hire, PAN / Change in Relationship, …), each showing active ticket count.

The outcome is a **planning document** only. Implementation follows after approval.

---

## 2. Scope

**In scope**

- **A. Admin-managed studio visibility**  
  In Admin → Users, allow admins to open a studio user and manage which locations they can see: search and add one or more locations, remove locations, clearly show current allowed locations. User may have one **default/home location** and **additional visible locations**. Reuse existing `User.studioId` (default) and `UserStudioScope` (additional); add Admin UI and, if missing, an API to set default location.

- **B. Studio user ticket visibility**  
  Define and implement (where not already true) the exact visibility rules for `STUDIO_USER`: (1) user sees all tickets they personally submitted; (2) user sees all tickets for locations they are allowed to view (primary studio + scope studios). When the user has multiple visible locations, the feed (portal/tickets list) should support clean **filtering/toggling by location**. Both **active** and **history** (e.g. resolved/closed) tickets must be available within that scope.

- **C. Studio user ticket interaction**  
  Clarify and enforce: studio users **can** view ticket progress/subtasks, comment (non-internal), and receive notifications (comments, subtask completion, ticket completion). They **cannot** create subtasks, complete subtasks, mutate workflow state, or use internal operational controls. Reuse existing comment filtering (`isInternal: false` for studio) and permission guards; document and test.

- **D. Department-level inbox/feed**  
  Department users have an inbox scoped to their department. Design how the inbox derives **folders** and **active counts** from: department, support topics (for that department), and active ticket scope (visibility + status). Example: HR user sees folders like All, New Hire, PAN / Change in Relationship, Resignation / Termination, New Job Posting, Workshop Bonus, Paycom, each with an active count. Folders = department’s support topics (+ optional “All”); counts = tickets in visibility scope with active status and that topic (or all for “All”).

- **E. Clean MVP scope**  
  No workflow engine redesign, no broad permission redesign, no realtime sockets, no maps/AI/vendor logic. Reuse existing patterns; minimal schema change (prefer none).

**Out of scope**

- Redesign of the workflow engine or notification pipeline.
- Broad RBAC/permission model changes beyond what is needed for (A)–(D).
- Real-time features (e.g. WebSockets) for inbox/feed.
- Maps, AI, or external vendor visibility logic.
- New roles or permission matrices beyond the existing ADMIN / DEPARTMENT_USER / STUDIO_USER.

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

| Area | File(s) | Change |
|------|---------|--------|
| **Visibility** | `apps/api/src/common/permissions/ticket-visibility.service.ts` | Confirm and, if needed, document or adjust STUDIO_USER rules (requesterId OR studioId in [primary + scopeStudioIds]). No behavioral change if already correct. |
| **User cache** | `apps/api/src/common/cache/user-cache.service.ts` | Ensure cache invalidation when admin updates user’s `studioId` or studio scopes (already done for add/remove scope; add for set-default if new endpoint). |
| **Users module** | `apps/api/src/modules/users/users.service.ts`, `users.controller.ts` | Add (if not present) admin-only endpoint to set a user’s **default location** (`studioId`), e.g. `PATCH /users/:id` with `{ studioId: string \| null }` or dedicated `PATCH /users/:id/default-studio`. Existing: `GET /users/:id/studio-scopes`, `POST /users/:id/studio-scopes`, `DELETE /users/:id/studio-scopes/:studioId`. Ensure list response includes `studio` and `studioScopes` (with studio name) for admin context. |
| **Tickets list** | `apps/api/src/modules/tickets/tickets.service.ts` | For STUDIO_USER, apply existing `TicketVisibilityService.buildWhereClause` (already OR requesterId | studioId in allowed). Add optional **filter by single studio** when actor is STUDIO_USER: e.g. `studioId` in `TicketFiltersDto` — when provided and in actor’s allowed set, further restrict to that studio; otherwise unchanged. |
| **Ticket filters DTO** | `apps/api/src/modules/tickets/dto/ticket-filters.dto.ts` | Already has `studioId`. Document that for STUDIO_USER, if `studioId` is set, backend must validate it is in the user’s allowed studios (primary + scope) and apply it; otherwise ignore or 403. |
| **Comments** | `apps/api/src/modules/comments/comments.service.ts` | Already restricts list to `isInternal: false` for STUDIO_USER. No change required; document in spec. |
| **Subtasks / workflow** | `apps/api/src/modules/subtasks/subtasks.service.ts`, workflow endpoints | Ensure STUDIO_USER cannot create/update subtask status or trigger workflow mutations (guard by role). Document; fix only if gaps exist. |
| **Inbox folders** | New or extended module, e.g. `apps/api/src/modules/inbox/` or under `tickets` or `reporting` | New endpoint(s) for department-scoped inbox: e.g. `GET /inbox/folders` or `GET /tickets/inbox-folders` (DEPARTMENT_USER + ADMIN). Returns list of folders: each with `id` (topic id or `"all"`), `label` (e.g. "All", "New Hire"), `activeCount`. Derivation: actor’s department(s) → support topics for that department → for each topic (and "All"), count tickets in visibility scope with status in active set (NEW, TRIAGED, IN_PROGRESS, WAITING_*). Use existing visibility (buildWhereClause) + status filter. |

**Frontend (Next.js, React Query)**

| Area | File(s) | Change |
|------|---------|--------|
| **Admin Users** | `apps/web/src/app/(app)/admin/users/page.tsx` | For **studio users** (role = STUDIO_USER): add a way to “Manage locations” (row expand, modal, or side panel). Show **default location** (current `user.studioId` / `user.studio`) with ability to set/clear; show **additional locations** from `user.studioScopes` (or equivalent) with add/remove. **Search and add:** call existing admin studios list (e.g. `GET /admin/studios` or equivalent) with optional search; on select, call `POST /users/:id/studio-scopes` with `studioId`. **Remove:** call `DELETE /users/:id/studio-scopes/:studioId`. **Set default:** call new `PATCH` for default studio. Ensure list/detail includes studio + studioScopes for admin. |
| **API client** | `apps/web/src/lib/api.ts` | Add/export: get user’s studio scopes, add studio scope, remove studio scope, set default studio (if new). Add inbox folders API (e.g. `inboxApi.folders()` or `ticketsApi.inboxFolders()`). Use existing `adminApi` or `usersApi` as appropriate. |
| **Portal / studio feed** | `apps/web/src/app/(app)/portal/page.tsx`, `apps/web/src/app/(app)/portal/tickets/page.tsx` | When studio user has **multiple** allowed locations: add a **location filter** (dropdown or tabs): “All locations”, “Irvine”, “Austin”, etc. Options = user’s default studio + scope studios (from scope-summary or a small user/me or scope endpoint). On change, call ticket list with `studioId` filter. Preserve active/history (status) behavior. |
| **Inbox (department)** | `apps/web/src/app/(app)/inbox/page.tsx` | Refactor so department users (and optionally ADMIN) see **folders** (e.g. sidebar or tabs): All, then one per support topic for their department. Each folder shows **active count**. Selecting a folder filters the ticket list by `supportTopicId` (or no topic for “All”) and applies existing actionable/visibility scope. Data: `GET /inbox/folders` (or equivalent) for folder list + counts; existing `GET /tickets?actionableForMe=&supportTopicId=&...` for list. |
| **Types** | `apps/web/src/types/index.ts` | Add types for: inbox folder (`id`, `label`, `activeCount`), user studio/scopes payload if not already present. |

**Docs**

- Update `CLAUDE.md` (or stage docs) to reference Stage 23 and the new visibility/inbox behavior once implemented.

Exact file list and method names will be finalized in Step B.

---

## 4. Schema Impact

**Target: no schema changes.**

- **Studio visibility:** Existing `User.studioId` (default/home location) and `UserStudioScope` (userId, studioId, grantedBy, grantedAt) already support “one default + additional locations.” JWT and `TicketVisibilityService` already use `actor.studioId` and `actor.scopeStudioIds` (from `UserStudioScope`). No new tables or columns required.
- **Department inbox folders:** Derived from existing `TaxonomyDepartment`, `SupportTopic` (departmentId), and `Ticket` (departmentId, supportTopicId, status). Counts are computed in queries; no new persistence.

If product later requires “default” to be explicitly separate from “primary studio” (e.g. for display order only), a single optional column could be added (e.g. `defaultStudioId`) and kept in sync with `studioId` for MVP; the spec prefers **no** schema change and treating `User.studioId` as the default.

---

## 5. API Impact

**Existing endpoints (reuse as-is or with minor extensions)**

- `GET /tickets` — Already applies `TicketVisibilityService.buildWhereClause(actor)`. For STUDIO_USER, when query param `studioId` is provided and equals one of the actor’s allowed studios, restrict `where` to that `studioId` (in addition to visibility). Otherwise ignore `studioId` for studio users or validate and 403 if out of scope. No change to response shape.
- `GET /tickets/scope-summary` — Already uses visibility; returns openCount, completedCount, recentTickets. Optional: extend to return `allowedStudios: { id, name }[]` for studio users so the frontend can build the location filter without an extra user/me call.
- `GET /users/:id`, `GET /users` — For admin, ensure response includes `studioId`, `studio` (id, name), and `studioScopes` (array of { studioId, studio: { id, name } }) so Admin UI can show and manage locations.
- `GET /users/:id/studio-scopes` — Exists; returns list of scopes with studio info. Keep.
- `POST /users/:id/studio-scopes` — Body `{ studioId }`. Keep; invalidate user cache.
- `DELETE /users/:id/studio-scopes/:studioId` — Keep; invalidate user cache.
- `GET /admin/studios` — Exists (e.g. `listStudios`). Use for admin “search and add location” (optionally add query param for search by name).

**New or extended endpoints**

- **Set default location (admin):** `PATCH /users/:id` with body `{ studioId: string | null }` (admin-only), or `PATCH /users/:id/default-studio` with body `{ studioId: string | null }`. Updates `User.studioId`; invalidate user cache. If `UserStudioScope` is used to also represent “default” in some implementations, document that `studioId` is the canonical default and scope list is “additional only.”
- **Inbox folders (department):** `GET /inbox/folders` or `GET /tickets/inbox-folders` (DEPARTMENT_USER, ADMIN). Returns `{ folders: { id: string, label: string, activeCount: number }[] }`. Derivation: actor’s departments → support topics for those departments (from taxonomy); for each topic and for “All”, count tickets where visibility holds and status in (NEW, TRIAGED, IN_PROGRESS, WAITING_ON_REQUESTER, WAITING_ON_VENDOR). Id for “All” can be `"all"` or null; for topics use `supportTopicId`. Order: All first, then topics by sortOrder/name.

**Comments and subtasks**

- No new comment or subtask endpoints. Existing behavior: studio users receive only non-internal comments in list responses; they cannot post internal notes. Subtask create/update and workflow transitions remain guarded by role (DEPARTMENT_USER or ADMIN).

---

## 6. UI Impact

**A. Admin → Users → Studio user: locations**

- For each user with role STUDIO_USER, expose “Locations” or “Manage locations.”
- Show **default/home location**: current studio name (or “None”); control to set/clear (dropdown or search of studios).
- Show **additional locations**: list of studio names with “Remove” per row; “Add location” opens search/select (studios list); add calls POST studio-scopes.
- Clearly label “Default location” vs “Additional locations” so admins understand the model.
- After any change, invalidate queries so list/detail reflects new data; ensure backend invalidates user cache so next JWT load gets new scope.

**B. Studio user: portal / feed and location filter**

- When the studio user has more than one allowed location (default + at least one scope, or multiple scopes), show a **location filter** (tabs or dropdown): “All”, then one option per allowed studio (by name).
- Default selection: “All” (no `studioId` filter) or “Default location” (filter by `user.studioId`).
- Changing selection calls `GET /tickets` (or scope-summary if only counts) with `studioId` when a single location is selected.
- **Active vs history:** Existing behavior (e.g. status filter or separate “Completed” view) retained; both active and history remain available within the chosen location scope.

**C. Studio user: ticket detail interaction**

- **Can:** View ticket, view subtasks (read-only progress), view comments (non-internal), add comment (non-internal), receive notifications (comments, subtask completion, ticket completion). UI already hides internal comments for studio; ensure comment compose does not show “Internal note” for STUDIO_USER.
- **Cannot:** Create subtask, change subtask status, trigger status transitions, assign, use internal controls. Buttons/controls for these are hidden or disabled for STUDIO_USER (existing or add guards).

**D. Department user: inbox with topic folders**

- **Inbox page** (`/inbox`): Left (or top) **folders**: “All” plus one entry per support topic for the user’s department(s). Example (HR): All, New Hire, PAN / Change in Relationship, Resignation / Termination, New Job Posting, Workshop Bonus, Paycom.
- Each folder shows **active count** (badge or number). “All” = total active in scope; each topic = active count for that `supportTopicId`.
- Selecting a folder filters the ticket list: same visibility and actionable semantics as today, plus `supportTopicId` when a topic folder is selected. List API already supports `supportTopicId` filter.
- Folders and counts come from `GET /inbox/folders` (or equivalent). List from `GET /tickets?actionableForMe=true&supportTopicId=...` (and existing params).

**E. Consistency**

- Feed (main ticket list), portal ticket list, and inbox all respect the same visibility rules; only the **filtering** (location for studio, topic for department inbox) and **counts** (inbox folders) are new or clarified.

---

## 7. Risks

- **User cache:** Changing a user’s default studio or scope must invalidate the user cache so the next request gets updated `studioId` and `scopeStudioIds`. Already done for add/remove scope; must do the same for set-default. Risk: stale scope until next login or cache TTL. Mitigation: invalidate on every admin update.
- **Studio user sees wrong tickets:** If frontend sends a `studioId` outside the user’s allowed set, backend must reject or ignore it. Mitigation: validate `studioId` against `actor.studioId` and `actor.scopeStudioIds` when applying filter for STUDIO_USER.
- **Department inbox folders:** If a department has many topics, the folder list can get long. Mitigation: MVP uses existing support topic list (no new UX for collapsing); optional later: collapse/expand or “More” for large departments.
- **Zero-count topics:** Topics with zero active tickets can still appear as folders with “0”. Acceptable for MVP; keeps list consistent with taxonomy.
- **Multiple departments:** A DEPARTMENT_USER can have multiple departments. Design: inbox folders aggregate support topics from all of the user’s departments (union), and “All” counts tickets in scope across all those departments. Folder list = union of topics from each department, deduplicated by topic id, with counts per topic.

---

## 8. Test Plan

**Unit (backend)**

- `TicketVisibilityService`: STUDIO_USER with one studio, multiple studios (primary + scope), no studio; assert where clause includes requesterId and studioId in allowed set.
- Tickets `findAll`: For STUDIO_USER, when `studioId` filter is in allowed set, result set is restricted to that studio; when `studioId` is not in allowed set, return 403 or ignore and apply only visibility (document chosen behavior and test).
- Inbox folders service: Given a department user with one department, assert folder list includes “All” and each support topic for that department; assert active counts use visibility + status filter. Multi-department user: folders are union of topics; counts correct.
- Users: `setDefaultStudio` (or PATCH) updates `User.studioId` and invalidates cache; only ADMIN can call.

**Integration / API**

- As STUDIO_USER: GET /tickets returns only own + allowed-location tickets; GET /tickets?studioId=<allowed> returns subset; GET /tickets?studioId=<not-allowed> returns 403 or same as no filter (per design).
- As DEPARTMENT_USER: GET /inbox/folders returns folders with labels and counts; GET /tickets?actionableForMe=true&supportTopicId=<id> returns tickets in scope for that topic.
- As ADMIN: PATCH user default studio and POST/DELETE studio-scopes; GET user includes studio and studioScopes.

**Manual / E2E**

- Admin: Open Users, open a studio user, set default location, add two locations, remove one; confirm list shows correct default and additional locations; log in as that user and confirm ticket list reflects scope.
- Studio user (multiple locations): Open portal/tickets, select “All” then a specific location; confirm list updates; confirm active and completed (or history) both work.
- Studio user: Open a ticket; confirm can comment, cannot see “Internal” option, cannot create subtask or change subtask status.
- Department user: Open Inbox; confirm folders (All + department topics) with counts; select a topic folder; confirm list filters by topic and counts match.

---

*End of mini-spec. For architecture review only; do not implement until approved.*
