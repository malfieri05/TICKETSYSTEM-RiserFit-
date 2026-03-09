# Stage 23 — Step B: Implementation Plan

**Do not implement until ready.** This document specifies exact files, endpoints, components, query logic, and guard changes for Stage 23 (User Visibility & Role-Scoped Inbox Alignment).

---

## 1. Exact Files to Modify

### Backend (NestJS, Prisma)

| # | File path | Modification |
|---|-----------|--------------|
| 1 | `apps/api/src/modules/users/users.controller.ts` | Add `PATCH /users/:id/default-studio` (admin-only) for setting default studio. Body `{ studioId: string \| null }`. Place before any generic `:id` patch to avoid route conflicts. |
| 2 | `apps/api/src/modules/users/users.service.ts` | Add `setDefaultStudio(targetUserId: string, studioId: string \| null, requestingUser: RequestUser)`: validate ADMIN, update `User.studioId`, call `this.userCache.invalidate(targetUserId)`, return updated user fragment (e.g. `{ id, studioId, studio }`). |
| 3 | `apps/api/src/modules/tickets/tickets.controller.ts` | Add `GET /tickets/inbox-folders` **before** `GET /tickets/:id`. Add `@Roles(Role.DEPARTMENT_USER, Role.ADMIN)` and `getInboxFolders(@CurrentUser() user)` delegating to `ticketsService.getInboxFolders(user)`. Add `@Roles(Role.DEPARTMENT_USER, Role.ADMIN)` to `PATCH /tickets/:id/status` (transitionStatus). |
| 4 | `apps/api/src/modules/tickets/tickets.service.ts` | (a) In `findAll`, after building `scopeWhere`, if `actor.role === 'STUDIO_USER'` and `filters.studioId` is set: build allowed set `[actor.studioId, ...actor.scopeStudioIds].filter(Boolean)`; if `filters.studioId` is not in that set, throw `ForbiddenException('You may only filter by a location you are allowed to view')`. (b) Add `getInboxFolders(actor: RequestUser)`: implement folder derivation and counts (see §4). |
| 5 | `apps/api/src/modules/tickets/dto/ticket-filters.dto.ts` | No structural change. Add JSDoc: "For STUDIO_USER, studioId must be one of the user's allowed studios (primary + scope) or request returns 403." |
| 6 | `apps/api/src/common/permissions/ticket-visibility.service.ts` | No logic change. Add a short JSDoc above `buildWhereClause` clarifying STUDIO_USER: "Sees tickets where requesterId = self OR studioId in (primary studio + scope studios)." |
| 7 | `apps/api/src/modules/admin/admin.service.ts` | Optional: add optional `nameSearch?: string` to `listStudios(marketId?: string, nameSearch?: string)` and apply `name: { contains: nameSearch, mode: 'insensitive' }` when provided. (If not done, frontend filters client-side.) |
| 8 | `apps/api/src/modules/admin/admin.controller.ts` | Optional: add `@Query('search') search?: string` to `listStudios` and pass to service. |

**No new backend files.** Inbox folders live in `TicketsService` and `TicketsController`.

### Frontend (Next.js)

| # | File path | Modification |
|---|-----------|--------------|
| 9 | `apps/web/src/lib/api.ts` | Add to `usersApi`: `listStudioScopes: (userId: string) => api.get<StudioScopeItem[]>(`/users/${userId}/studio-scopes`)`, `addStudioScope: (userId: string, studioId: string) => api.post(`/users/${userId}/studio-scopes`, { studioId })`, `removeStudioScope: (userId: string, studioId: string) => api.delete(`/users/${userId}/studio-scopes/${studioId}`)`, `setDefaultStudio: (userId: string, studioId: string \| null) => api.patch(`/users/${userId}/default-studio`, { studioId })`. Add `ticketsApi.inboxFolders: () => api.get<InboxFoldersResponse>('/tickets/inbox-folders')`. Extend `scopeSummary` response type (or add optional `allowedStudios` in types) if implementing scope-summary extension. |
| 10 | `apps/web/src/types/index.ts` | Add `StudioScopeItem { studioId: string; studio: { id: string; name: string }; grantedAt?: string }`. Add `InboxFolder { id: string; label: string; activeCount: number }`. Add `InboxFoldersResponse { folders: InboxFolder[] }`. Ensure `User` includes `studio?: { id: string; name: string } \| null` and `scopeStudioIds?: string[]` (already present). Add `supportTopicId?: string` to `TicketFilters` if missing. |
| 11 | `apps/web/src/app/(app)/admin/users/page.tsx` | For each row where `u.role === 'STUDIO_USER'`: add an "Actions" cell with a "Locations" (or "Manage locations") button. On click, open a modal (or inline expand) that: (1) Shows "Default location" with current `u.studio` (or "None"); dropdown or searchable select to set/clear default (call `adminApi.listStudios()` or equivalent for options; on change call `usersApi.setDefaultStudio(u.id, value)`). (2) Shows "Additional locations" list from `usersApi.listStudioScopes(u.id)` (display `studio.name`), each with Remove button calling `usersApi.removeStudioScope(u.id, studioId)`. (3) "Add location" button: open search/select of studios (from `adminApi.listStudios()`), on select call `usersApi.addStudioScope(u.id, studioId)`. Invalidate `['users']` and optionally `['users', u.id]` after mutations. |
| 12 | `apps/web/src/app/(app)/portal/page.tsx` | If scope-summary is extended with `allowedStudios`, use it; otherwise fetch studios from a new source (e.g. extend scope-summary in backend). When `allowedStudios` (or equivalent) has length > 1: render a location filter (tabs or dropdown) with "All" and one option per studio (id + name). Default selection "All". Store selected `studioId` in state (null = All). Pass `studioId` into the link to "View all" (e.g. `/portal/tickets?studioId=...`) so portal/tickets can read it. |
| 13 | `apps/web/src/app/(app)/portal/tickets/page.tsx` | Read `studioId` from URL searchParams (e.g. `useSearchParams().get('studioId')`). Include `studioId` in `filters` passed to `ticketsApi.list()`. When studio user has multiple locations, show the same location filter (All + studios) at top; options come from scope-summary `allowedStudios` or a dedicated endpoint. Ensure status filter and other filters still work. |
| 14 | `apps/web/src/app/(app)/inbox/page.tsx` | Refactor layout: (1) Fetch `ticketsApi.inboxFolders()` (only when user is DEPARTMENT_USER or ADMIN). (2) Render a folder list (sidebar or horizontal tabs): "All" plus one item per folder from response (`folder.label`, `folder.activeCount`). (3) Selected folder id in state (e.g. `selectedFolderId: string \| 'all'`). (4) When `selectedFolderId === 'all'`, call `ticketsApi.list({ actionableForMe: true, page, limit })`; when topic folder, call `ticketsApi.list({ actionableForMe: true, supportTopicId: selectedFolderId, page, limit })`. (5) List and pagination unchanged except for the added `supportTopicId`. Hide folder UI for STUDIO_USER (inbox may redirect or show empty state for them per product; spec says department inbox). |
| 15 | `apps/web/src/components/layout/Sidebar.tsx` | No change required unless "Inbox" visibility should be DEPARTMENT_USER+ only; if so, conditionally show "Actionable" nav item only when `user.role === 'DEPARTMENT_USER' || user.role === 'ADMIN'`. |
| 16 | `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Ensure "Internal note" checkbox and any subtask create/update controls are hidden or disabled when `user?.role === 'STUDIO_USER'` (likely already the case; verify and document). |
| 17 | `apps/web/src/components/tickets/TicketDrawer.tsx` | Same as [id]/page: ensure internal note and subtask mutate controls are hidden for STUDIO_USER. |
| 18 | `CLAUDE.md` or `docs/` | Add a short bullet under "Current State" or "Stage 23" describing: admin-managed studio visibility, studio location filter on portal, department inbox folders with topic counts, and that studio users cannot create/update subtasks or transition status. |

---

## 2. Exact New Endpoints

| Method | Path | Roles | Description | Request body | Response |
|--------|------|-------|-------------|--------------|----------|
| `PATCH` | `/api/users/:id/default-studio` | ADMIN | Set user's default (home) location. | `{ studioId: string \| null }` | 200 + `{ id, studioId, studio: { id, name } \| null }`. |
| `GET` | `/api/tickets/inbox-folders` | DEPARTMENT_USER, ADMIN | Return inbox folders with active counts for the actor's department(s). | — | `{ folders: { id: string, label: string, activeCount: number }[] }` |

**Existing endpoints to extend or guard**

- `GET /api/tickets` — Already accepts `studioId`. **Change:** When caller is STUDIO_USER and `studioId` is present, validate it is in `[actor.studioId, ...actor.scopeStudioIds]`; if not, return **403** with message `You may only filter by a location you are allowed to view`.
- `GET /api/tickets/scope-summary` — **Optional extension:** Add to response for STUDIO_USER: `allowedStudios: { id: string, name: string }[]` (primary studio if set + scope studios with names) so portal can build location filter without an extra request.
- `PATCH /api/tickets/:id/status` — **Change:** Add `@Roles(Role.DEPARTMENT_USER, Role.ADMIN)` so STUDIO_USER receives 403.

**Existing endpoints used as-is**

- `GET /api/users/:id/studio-scopes` — Returns `{ studioId, studio: { id, name }, grantedAt }[]`.
- `POST /api/users/:id/studio-scopes` — Body `{ studioId: string }`.
- `DELETE /api/users/:id/studio-scopes/:studioId` — No body.
- `GET /api/admin/studios` — Optional: add query `search` for name filter.

---

## 3. Exact UI Components to Add

| Component | Location | Purpose |
|-----------|----------|---------|
| **ManageLocationsModal** (or inline **ManageLocationsPanel**) | In `apps/web/src/app/(app)/admin/users/page.tsx` (or `apps/web/src/components/admin/ManageLocationsModal.tsx`) | Modal/slide-over opened when admin clicks "Locations" for a studio user. Contains: (1) Default location select (current studio name + dropdown of all studios + "None"); (2) List of additional locations from `listStudioScopes` with Remove per row; (3) "Add location" opening a searchable list of studios (from `adminApi.listStudios()`); (4) Close/Cancel and optional Save if any batch pattern is used. |
| **LocationFilter** (portal) | Used in `portal/page.tsx` and/or `portal/tickets/page.tsx` | Tabs or `<Select>` with option "All" (value `''` or `'all'`) and one option per studio in `allowedStudios` (value `studio.id`). On change, set state/URL and refetch ticket list with `studioId` when not All. |
| **InboxFolderList** (or inline in inbox page) | In `apps/web/src/app/(app)/inbox/page.tsx` | Sidebar or horizontal tab list: one item per `folder` from `inboxFolders()` (folder.id, folder.label, folder.activeCount). Selected state drives `supportTopicId` in list request. "All" folder has `id: 'all'` and no supportTopicId. |

No new shared component library files are required if the above are implemented inline or as local components in the listed pages.

---

## 4. Query Logic for Inbox Folder Counts

**Location:** `TicketsService.getInboxFolders(actor: RequestUser)`.

**Steps:**

1. **Restrict to DEPARTMENT_USER and ADMIN.** If `actor.role !== Role.DEPARTMENT_USER && actor.role !== Role.ADMIN`, return `{ folders: [] }` or throw ForbiddenException (controller already guards with `@Roles`).

2. **Resolve department IDs.** Actor has `departments: Department[]` (enum: HR, OPERATIONS, MARKETING). Map to taxonomy department IDs:
   - `departmentCodes = actor.departments` (string[]).
   - Query: `TaxonomyDepartment.findMany({ where: { code: { in: departmentCodes }, isActive: true }, select: { id: true }, orderBy: { sortOrder: 'asc' } })` → `departmentIds: string[]`.

3. **Build folder list (All + topics).** Query support topics for those departments:
   - `SupportTopic.findMany({ where: { departmentId: { in: departmentIds }, isActive: true }, select: { id: true, name: true, sortOrder: true }, orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }] })` → dedupe by id if needed → ordered list of `{ id, label: name, sortOrder }`.

4. **Build visibility where clause.** Reuse existing:
   - `scopeWhere = this.visibility.buildWhereClause(actor)` (same as ticket list).

5. **Active status set.**  
   `activeStatuses = ['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR']`.

6. **Count for "All".**  
   `whereAll = scopeWhere is empty ? { status: { in: activeStatuses } } : { AND: [scopeWhere, { status: { in: activeStatuses } }] }`.  
   `allCount = prisma.ticket.count({ where: whereAll })`.

7. **Count per topic.** For each support topic from step 3:
   - `whereTopic = scopeWhere is empty ? { status: { in: activeStatuses }, supportTopicId: topic.id } : { AND: [scopeWhere, { status: { in: activeStatuses }, supportTopicId: topic.id }] }`.
   - `topicCount = prisma.ticket.count({ where: whereTopic })`.

8. **Optional: actionable filter.** If inbox is defined as "actionable" only (READY subtasks for my department/me), then add the same AND clause used in `findAll` when `actionableForMe=true` to `whereAll` and `whereTopic`. Spec says "inbox scoped to their department" and "active ticket scope" — recommend using **visibility + active status** only for folder counts (simpler and matches "active count" as open tickets in scope). If product requires counts to reflect only actionable tickets, add the `subtasks.some(READY + department/owner)` condition to the where clauses.

9. **Response shape.**  
   - Folders array: first element `{ id: 'all', label: 'All', activeCount: allCount }`, then for each topic `{ id: topic.id, label: topic.name, activeCount: topicCount }`.  
   Return `{ folders }`.

**Performance:** One query for departments, one for topics, one count for "All", N counts for N topics. Can be improved later with a single grouped count (e.g. `groupBy: ['supportTopicId']` plus one total count) if needed.

---

## 5. Permission Guard Changes

| Location | Current | Change |
|----------|---------|--------|
| **PATCH /api/tickets/:id/status** | No `@Roles` — any authenticated user can call | Add `@Roles(Role.DEPARTMENT_USER, Role.ADMIN)` so STUDIO_USER receives 403. |
| **GET /api/tickets/inbox-folders** | N/A (new) | Add `@Roles(Role.DEPARTMENT_USER, Role.ADMIN)`. |
| **PATCH /api/users/:id** (new) | N/A | Add `@Roles(Role.ADMIN)` (and ensure controller uses `RolesGuard`). |
| **POST /api/tickets/:ticketId/subtasks** | No controller-level role guard; service throws for STUDIO_USER | No controller change required; service already throws `ForbiddenException` for STUDIO_USER. |
| **PATCH /api/tickets/:ticketId/subtasks/:subtaskId** | No controller-level role guard; service throws for STUDIO_USER | No controller change required. |
| **GET /api/tickets** | No role restriction | No new guard; add **validation inside service** for STUDIO_USER when `filters.studioId` is set: if not in allowed set, throw `ForbiddenException`. |
| **Comments** | Service already filters `isInternal: false` for STUDIO_USER and blocks internal create | No change. |
| **Assign** | Already `@Roles('DEPARTMENT_USER', 'ADMIN')` | No change. |

**Summary:** Add `@Roles(Role.DEPARTMENT_USER, Role.ADMIN)` to `PATCH /tickets/:id/status` and to `GET /tickets/inbox-folders`; add `@Roles(Role.ADMIN)` to `PATCH /users/:id/default-studio`. Add in-service validation in `findAll` for STUDIO_USER + `studioId` filter. No change to subtask or comment guards.

---

*End of Step B implementation plan. Proceed to implementation only when ready.*
