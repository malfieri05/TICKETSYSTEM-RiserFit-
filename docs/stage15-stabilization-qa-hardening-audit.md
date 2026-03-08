# Stage 15: Stabilization / QA / Hardening Pass — Step A Audit & Hardening Plan

**Status:** Planning only. No code changes or implementation in this stage.

**Scope:** Audit the system (ticket taxonomy, schema-driven forms, workflow templates/engine, notifications, admin workflow editor, workflow execution visibility, workflow analytics, workflow editor UX, handbook RAG, studio portal, ticket conversations, maintenance reporting, vendor dispatch) and produce a prioritized hardening plan for client validation and production readiness.

---

## 1. Overall assessment

The codebase is a coherent modular monolith with clear module boundaries (tickets, comments, subtasks, workflow, reporting, AI, auth). Role-based access is applied at the controller level and via a dedicated `TicketVisibilityService` for ticket list/detail. Several areas need verification or hardening:

- **Permissions:** Ticket visibility logic is centralized and tested, but `assertCanView` for DEPARTMENT_USER has an **incomplete branch** (department-teammate view is not enforced on single-ticket fetch). Comments and subtasks do not consistently enforce “can view this ticket” before allowing list/create/update.
- **Reporting:** General reporting (summary, volume, by-status, by-category, by-market, resolution-time, completion-time, export) and dispatch (open maintenance only) are implemented. Reporting is **not scoped by user** — DEPARTMENT_USER sees org-wide aggregates. Workflow analytics and dispatch are ADMIN-only.
- **E2E flows:** Workflow instantiation, subtask unlock, portal scope-summary, and handbook RAG are present; they need explicit E2E verification.
- **UX:** Naming and navigation are mostly consistent; some admin vs studio paths and label choices should be reviewed for clarity.
- **Code quality:** A few spots look like deferred fixes (e.g. comment in `assertCanView`) or missing checks (comment/subtask endpoints not verifying ticket visibility). No major architectural debt; targeted fixes will suffice.

**Verdict:** The system is **feature-complete for the described scope** but should undergo the recommended P0/P1 hardening and a structured test pass before client demo or production use.

---

## 2. End-to-end flows to verify

Manual verification should cover:

| Flow | What to verify |
|------|----------------|
| **Studio user creates support ticket** | Create ticket with ticketClass=SUPPORT, department + support topic; form schema loads; ticket created; workflow template (if any) instantiates; subtasks appear with correct READY/LOCKED; studio user sees ticket in portal. |
| **Studio user creates maintenance ticket** | Create ticket with ticketClass=MAINTENANCE, maintenance category; form schema; workflow template instantiates; ticket appears in portal and (for open status) in dispatch views. |
| **Workflow template instantiates correctly** | Create ticket that matches a workflow template (SUPPORT or MAINTENANCE); confirm subtasks and dependencies are created; initial READY subtasks have no unsatisfied dependencies; LOCKED subtasks have correct dependency set. |
| **Subtasks unlock correctly** | Mark a subtask DONE/SKIPPED; confirm downstream subtasks that only depended on it become READY and get `readyAt`; notifications for SUBTASK_BECAME_READY fire as expected. |
| **Ticket portal visibility** | As STUDIO_USER: scope-summary shows only scoped tickets; portal ticket list matches; cannot see tickets outside primary studio or scope-granted studios. |
| **Ticket conversations** | As STUDIO_USER: add non-internal reply; as DEPARTMENT_USER/ADMIN: add internal note and studio-visible reply; confirm STUDIO_USER only sees non-internal comments; notifications respect isInternal (requester not notified for internal). |
| **Handbook RAG** | Admin uploads PDF/text; ingestion job runs; document appears in knowledge base; handbook chat (studio or configured role) returns answers with sources; deactivated document excluded from search. |
| **Maintenance / dispatch** | Dispatch dashboard shows only open maintenance tickets; filters (studio, market, category, date, priority) apply; by-studio, by-category, by-market, studios-with-multiple counts match manual expectation; drill-down to ticket list with correct query params. |
| **Reporting** | Summary, volume, by-status, by-priority, by-category, by-market, resolution-time, completion-time, CSV export return without error; numbers are consistent with DB for a small test dataset. |
| **Workflow analytics** | ADMIN only; templates, departments, bottlenecks endpoints return; counts and durations are consistent with underlying subtask/ticket data. |

---

## 3. Permissions / visibility audit

### 3.1 Backend

| Area | ADMIN | DEPARTMENT_USER | STUDIO_USER | Notes |
|------|--------|------------------|-------------|--------|
| **Ticket list** | All tickets | Visibility: owner=self, owner in my department(s), or ticket in scope studios | Visibility: requester=self or ticket in primary/scope studios | Implemented via `TicketVisibilityService.buildWhereClause`. |
| **Ticket detail (findById)** | Any | Same visibility; **assertCanView** does **not** implement “owner in my department” — only ownerId=self and scopeStudioIds | Requester or studio scope | **Gap:** DEPARTMENT_USER who can see a ticket in list (via department) may get 403 on direct findById if they are not owner and ticket studio is not in scopeStudioIds. |
| **Ticket modify (update, status, assign)** | Any | **canModify** only if ownerId === actor.id | Only if requesterId === actor.id | Department users can view teammate-owned tickets but cannot change status/assign; intentional “assignee drives workflow” but should be explicit in product docs. |
| **Comments list** | All comments for ticket | All comments | Only non-internal (isInternal: false) | **Gap:** Comments module does **not** check that actor can view the ticket; only that ticket exists. Direct call to GET /tickets/:id/comments could leak non-internal comments for out-of-scope ticket. |
| **Comment create** | Allowed if ticket exists | Allowed if ticket exists | Allowed; isInternal forced false | **Gap:** No check that actor can view ticket; could post comment to ticket they cannot open in UI. |
| **Subtasks** | Full access | Full access (STUDIO_USER cannot create) | List/update only (no create) | Subtask list/update do not re-verify ticket visibility; rely on user having reached ticket detail. |
| **Workflow templates** | ADMIN only | — | — | Controller @Roles('ADMIN'). |
| **Workflow analytics** | ADMIN only | — | — | Controller @Roles(Role.ADMIN). |
| **Reporting (summary, volume, by-*, export)** | Yes | Yes | No (sidebar hides; controller allows ADMIN + DEPARTMENT_USER) | **Scope:** No per-user filtering; DEPARTMENT_USER sees org-wide totals. |
| **Dispatch** | ADMIN only | — | — | Four dispatch endpoints @Roles(Role.ADMIN). |
| **Handbook / Knowledge base** | Ingest, toggle, delete, list | — | Handbook chat only (if wired) | AI ingest/toggle/delete/list are ADMIN. |
| **Studio portal (scope-summary)** | N/A (not studio) | N/A | Uses same visibility buildWhereClause | Correct. |
| **Agent / tool-calling** | Full | Full (if allowed) | Typically restricted or N/A | Depends on route guards; tool-router checks canManageTickets. |

### 3.2 Frontend

- **Sidebar:** Admin section and “Vendor Dispatch” only when `user?.role === 'ADMIN'`; “Actionable” when department/admin; studio users get portal nav. Consistent.
- **Tickets list/detail:** No server-side role check on frontend; backend enforces visibility. Safe.
- **New ticket:** Owner dropdown and workflow context (department/topic/category) shown only for ADMIN/DEPARTMENT_USER; studio sees appropriate taxonomy. Consistent.
- **Dispatch page:** Only linked for ADMIN; API returns 403 for non-ADMIN. Good.
- **Reporting page:** Linked for ADMIN (and possibly DEPARTMENT_USER from nav); if DEPARTMENT_USER can open it, they see org-wide data — confirm product intent.

### 3.3 Summary of permission risks

- **P0:** DEPARTMENT_USER **assertCanView** path for “owner in my department” is unimplemented (comment in code); may cause 403 on ticket detail for tickets they see in list.
- **P1:** Comments **findByTicket** and **create** do not verify actor can view ticket; could leak or allow writing to out-of-scope tickets via direct API.
- **P2:** Reporting for DEPARTMENT_USER is org-wide; document whether this is intentional and whether any future “department-scoped” reporting is required.

---

## 4. Reporting / analytics audit

### 4.1 General reporting (ReportingService)

- **getSummary, getVolumeByDay, getByStatus, getByPriority, getByCategory, getByMarket:** No `where` clause; counts all tickets. Correct for “org-wide” reporting.
- **getResolutionTimeByCategory, getCompletionTimeByOwner:** Raw SQL / Prisma over full table; no scope. Consistent.
- **exportTicketsCsv:** Exports all tickets; no scope. Matches other reporting.
- **Data correctness:** Relies on Prisma/Postgres; no obvious logic errors. Risk: very large exports could be slow or memory-heavy (consider streaming or pagination in future).

### 4.2 Dispatch (Stage 13)

- **buildOpenMaintenanceWhere:** Restricts to `ticketClass.code = 'MAINTENANCE'` and `status NOT IN ('RESOLVED','CLOSED')`; applies studioId, marketId, maintenanceCategoryId, priority, createdAfter/Before. Correct.
- **getDispatchByStudio, getDispatchByCategory, getDispatchByMarket:** groupBy with that where; names resolved from Studio/Market/MaintenanceCategory. Correct.
- **getDispatchStudiosWithMultiple:** Same where, groupBy studioId, filter count ≥ 2. Correct.
- **Scope:** No user-level scope; dispatch is ADMIN-only and intended as operational view over all open maintenance.

### 4.3 Workflow analytics

- **getTemplates:** Counts executions per template (tickets that have subtasks from that template); active = has required subtask not DONE/SKIPPED; completed = total - active; avg completion time from ticket resolvedAt/closedAt. Logic is sound.
- **getDepartments, getBottlenecks:** Similar aggregation over subtasks/templates. No user scope; ADMIN-only.
- **Risk:** Large datasets could make these queries heavy; consider indexes and/or limits if needed.

### 4.4 Maintenance reporting (Stage 12)

- **Current state:** There is **no** separate “maintenance reporting” that shows all maintenance tickets (any status) grouped by studio/category/market. Only:
  - General reporting (all tickets, any class),
  - Dispatch (open maintenance only).
- If the product required “all maintenance by studio/category/market” (e.g. for historical or mixed status views), that would be a gap; otherwise dispatch + general reporting may suffice.

### 4.5 Repeat-issue logic

- No “repeat issues” (e.g. same studio + same category, count ≥ N) endpoint or UI was found in the reporting module. If Stage 12 or dispatch spec called for “repeat issues” view, it is missing and should be added or explicitly descoped.

---

## 5. UX consistency audit

### 5.1 Naming and labels

- **“Home” vs “My Tickets”:** Studio users see “My Tickets” (portal); others see “Home” (tickets list). Clear.
- **“Vendor Dispatch”** in sidebar; page title “Vendor Dispatch.” Consistent.
- **“Reporting”** vs **“Workflow Analytics”:** Both under Admin; different pages. Consider clarifying in UI (e.g. “Org Reporting” vs “Workflow Analytics”) if users confuse them.
- **“Actionable”** (inbox): Shown to department/admin; label may be unclear to new users — consider tooltip or short description.
- **Ticket detail back button:** “Back to tickets” vs “Back to My Tickets” depending on role. Good.

### 5.2 Ticket detail tabs

- Comments, Subtasks, Attachments, History. Labels are standard.
- **Internal vs studio-visible:** Ticket detail shows “Reply to studio” vs “Internal note” (or equivalent); ensure labels are obvious so studio users don’t try to post internal.

### 5.3 Forms and validation

- New ticket form: taxonomy-driven (ticket class, department/topic or maintenance category); validation on backend. Frontend should disable submit until required fields are set; confirm error messages are clear.
- Workflow template editor: Multi-step; confirm required fields and error feedback are clear.

### 5.4 Rough edges (candidates for P2)

- **Dispatch drill-down:** Opens ticket list with query params; ticket list initializes filters from URL. Confirm default “Active” tab and any status filter align with “open maintenance” (e.g. no accidental completed filter).
- **Handbook:** If handbook chat is studio-only, ensure studio users don’t see main “AI Assistant” that might use different RAG scope.
- **Portal vs tickets:** Studio users rarely see “Home” or full ticket list; ensure all entry points (e.g. from notifications) send them to portal when appropriate.

### 5.5 Inconsistencies

- **Admin section density:** Many admin links (Categories, Markets & Studios, Users, Workflow Templates, Workflow Analytics, Reporting, Vendor Dispatch, Knowledge Base). Consider grouping (e.g. “Reporting” submenu: Reporting, Dispatch, Workflow Analytics) to reduce clutter.
- **Empty states:** Verify key list/dashboard views have clear empty states and one primary action (e.g. “Create ticket”, “Upload document”).

---

## 6. Code architecture / maintainability audit

### 6.1 Strengths

- **Modular monolith:** Clear modules (auth, users, tickets, comments, subtasks, attachments, notifications, events, workers, reporting, admin, workflow, workflow-analytics, AI, agent). No circular dependency observed.
- **Visibility:** `TicketVisibilityService` single place for ticket scope; used by tickets service for list and detail.
- **Workflow:** `SubtaskWorkflowService` owns template resolution and instantiation; unlock logic in one place.
- **Events:** Domain events → queue → fan-out and dispatch; idempotency and retries documented.

### 6.2 Areas to tighten

- **TicketVisibilityService.assertCanView:** DEPARTMENT_USER branch for “owner in my department” is a comment only; never checks `owner.team.name` vs actor’s departments. Either implement (e.g. include `owner.team.name` in ticket select and compare) or remove the branch and document that department users only see by ownerId or scopeStudioIds.
- **Comments:** CommentsService does not inject or use TicketVisibilityService. Before listing or creating comments, call visibility.assertCanView(ticket, actor) (after loading ticket). Same pattern could apply to subtasks if desired for defense-in-depth.
- **Reporting:** No service-layer injection of visibility; reporting is intentionally org-wide for current roles. If department-scoped reporting is ever required, a shared “reporting scope” helper could be added later.

### 6.3 Duplication and conditionals

- **Role checks:** Repeated `user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER'` and similar on frontend. Consider a small `usePermissions()` or constants (e.g. `canManageTickets(role)`).
- **Ticket list select:** TICKET_LIST_SELECT vs TICKET_LIST_SELECT_LIGHT; TICKET_DETAIL_SELECT extends list. Structure is clear; no major duplication.

### 6.4 Fragile or “patchy” spots

- **assertCanView** empty branch (see above).
- **Comment create:** No ticket visibility check (see above).
- **findByTicket:** No ticket visibility check.
- **Subtask create (manual):** Checks ticket exists and actor is not STUDIO_USER; does not check ticket visibility. Lower risk (only department/admin can create) but could be hardened.

### 6.5 Test coverage

- **TicketVisibilityService:** Unit tests present (buildWhereClause, assertCanView, canModify).
- **TicketsService:** Mocked visibility in tests.
- **Workflow instantiation:** Covered in subtask-workflow and ticket tests.
- **Comments, reporting, dispatch:** Not fully audited here; recommend at least integration tests for permission and count correctness.

---

## 7. Risk areas / likely bugs

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DEPARTMENT_USER gets 403 on ticket detail for a ticket they see in list (teammate-owned, same department) | High | High | Implement or clarify assertCanView department path (P0). |
| Comment list/create without ticket visibility | Medium | Medium | Add assertCanView in comments service (P1). |
| Direct URL to /tickets?ticketClassId=... with invalid id | Low | Low | Backend ignores unknown ticketClassId or returns empty; document behavior. |
| Export CSV very large | Low | Medium | Add limit or streaming later (P2). |
| Workflow analytics slow on large data | Low | Low | Add indexes or pagination if needed (P2). |
| Studio user sees “AI Assistant” vs “Handbook” confusion | Low | Low | UX copy and nav (P2). |
| Repeat-issue or “all maintenance” reporting missing | Spec-dependent | Medium | Confirm with product; add or descope (P1/P2). |

---

## 8. Recommended hardening tasks (prioritized)

### P0 — Must fix before client demo / serious use

1. **Fix or clarify DEPARTMENT_USER assertCanView**
   - **Option A:** Implement: include `owner.team.name` (or owner’s department) in ticket select where needed; in assertCanView for DEPARTMENT_USER, if ticket.ownerId !== actor.id and ticket.studioId not in scopeStudioIds, allow view if ticket.owner.team.name is in actor’s department team names.
   - **Option B:** If product rule is “department users only see tickets they own or in scope studios,” remove the incomplete branch and document; ensure findAll where clause matches (no “owner in my department” condition).
2. **Verify E2E: department user can open ticket they see in list**
   - After P0.1, run: department user with teammate-owned ticket in list → open ticket detail → must succeed (no 403).

### P1 — Should fix soon

3. **Comments: enforce ticket visibility**
   - In CommentsService.create and findByTicket, after loading the ticket, call TicketVisibilityService.assertCanView(ticket, actor). Inject TicketVisibilityService into CommentsService (or TicketsService and pass ticket + actor). If ticket is not visible, throw ForbiddenException.
4. **Optional: Subtask list/create**
   - For defense-in-depth, ensure subtask list and manual create also verify ticket visibility (e.g. load ticket and assertCanView). Lower priority than comments.
5. **Reporting scope and “maintenance reporting”**
   - Document that general reporting is org-wide for ADMIN and DEPARTMENT_USER. If “maintenance-only” (all statuses) or “repeat issues” was in scope, add endpoints or document as future work.
6. **Manual test plan**
   - Execute the E2E flows in §2 with at least one role per type (ADMIN, DEPARTMENT_USER, STUDIO_USER); record any 403 or wrong data.

### P2 — Polish / cleanup

7. **Frontend permission helpers**
   - Extract `canManageTickets(role)`, `canSeeReporting(role)`, etc. to avoid repeated string checks.
8. **Admin nav grouping**
   - Group Reporting, Vendor Dispatch, Workflow Analytics under a “Reporting” or “Analytics” submenu if it improves clarity.
9. **Empty states and primary actions**
   - Review key pages (portal, dispatch, reporting, workflow templates) for clear empty state copy and one primary CTA.
10. **Export CSV**
    - If export can be large, add a reasonable limit (e.g. 10k rows) or document that very large exports may time out; consider async export later.
11. **Workflow analytics performance**
    - If templates or ticket volume grow large, add DB indexes or limit result set; monitor query time.

---

## 9. Suggested test plan

### 9.1 Unit / integration (backend)

- **TicketVisibilityService:** Extend tests so that DEPARTMENT_USER with department match on owner’s team is allowed (if that rule is implemented) or explicitly test that only ownerId and scopeStudioIds apply.
- **CommentsService:** Add tests: create/findByTicket when actor cannot view ticket → 403 (after P1 fix).
- **Reporting:** Snapshot or assert counts for a seeded dataset (summary, by-status, dispatch by-studio) to guard against regressions.
- **Workflow:** Instantiation and unlock tests already present; add one integration test: create ticket → complete subtask → assert downstream READY.

### 9.2 E2E (manual or Playwright)

- **Studio:** Login as STUDIO_USER → create support ticket → create maintenance ticket → open each from portal → add comment → verify no internal option.
- **Department:** Login as DEPARTMENT_USER → open ticket list → open ticket owned by teammate (if scope allows) → open ticket detail (no 403) → add internal note and studio-visible reply → transition subtask.
- **Admin:** Login as ADMIN → reporting summary/volume/export → dispatch filters and drill-down → workflow analytics → knowledge base upload and handbook chat.
- **Permissions:** As STUDIO_USER, attempt GET /api/reporting/summary and GET /api/reporting/dispatch/by-studio (expect 403 for dispatch if guarded); as DEPARTMENT_USER, attempt dispatch (403).

### 9.3 Smoke

- After any deployment: login as each role, load dashboard/portal, open one ticket, post one comment, run one report.

---

## 10. Suggested release readiness verdict

- **After P0:** Ready for **internal/client demo** provided E2E flows are run and documented. DEPARTMENT_USER ticket detail 403 issue must be resolved.
- **After P1:** Ready for **limited production** (e.g. pilot) with the understanding that reporting is org-wide and that comment visibility is enforced.
- **After P2:** Ready for **broader production** with clearer UX and documented limits (export, analytics scale).

**Recommendation:** Complete P0 and the E2E verification in §2 before any client-facing demo. Complete P1 before pilot or production. Treat P2 as iterative polish and performance.

---

*End of Stage 15 Step A audit.*

---

## Implementation Summary (Step B — P0/P1 Hardening)

**Completed:** P0 and P1 fixes from the audit. No new features, no schema changes, no reporting or dispatch changes.

### Files changed

| File | Change |
|------|--------|
| `apps/api/src/common/permissions/ticket-visibility.service.ts` | Implemented DEPARTMENT_USER “owner in my department” check in `assertCanView`: allow view when `ticket.owner?.team?.name` is in actor’s department team names. Extended ticket type to include `owner?.team?.name`. |
| `apps/api/src/common/permissions/ticket-visibility.service.spec.ts` | Added tests: DEPARTMENT_USER can view ticket owned by teammate in same department; DEPARTMENT_USER cannot view when owner is in different department. Updated `makeTicket` to support `owner.team.name`. |
| `apps/api/src/modules/tickets/tickets.service.ts` | `TICKET_DETAIL_SELECT`: override `owner` to include `team: { select: { name: true } }` so `findById` passes owner team name to `assertCanView`. |
| `apps/api/src/modules/comments/comments.module.ts` | Import `PermissionsModule`. |
| `apps/api/src/modules/comments/comments.service.ts` | Injected `TicketVisibilityService`. In `create()` and `findByTicket()`: load ticket with `requesterId`, `ownerId`, `studioId`, `owner.team.name`; call `this.visibility.assertCanView(ticket, actor)` before proceeding. Throw `ForbiddenException` when actor cannot view. |
| `apps/api/src/modules/comments/comments.service.spec.ts` | **New.** Tests: comment creation throws `ForbiddenException` when user cannot view ticket; comment listing throws `ForbiddenException` when user cannot view ticket; listing throws `NotFoundException` when ticket does not exist. |
| `apps/api/src/modules/subtasks/subtasks.module.ts` | Import `PermissionsModule`. |
| `apps/api/src/modules/subtasks/subtasks.service.ts` | Injected `TicketVisibilityService`. In `create()` and `findByTicket()`: load ticket with visibility fields, call `this.visibility.assertCanView(ticket, actor)`. `findByTicket(ticketId, actor)` now takes `actor`. |
| `apps/api/src/modules/subtasks/subtasks.controller.ts` | `findAll` passes `@CurrentUser()` to `findByTicket(ticketId, user)`. |

### Logic added

- **P0 — assertCanView (DEPARTMENT_USER):** After `ownerId === actor.id` and before `scopeStudioIds`, added: if `teamNames.length > 0 && ticket.owner?.team?.name && teamNames.includes(ticket.owner.team.name)` then return (allow view). Matches `buildWhereClause` (owner.team.name in teamNames).
- **P1 — Comments:** Before listing or creating comments, ticket is loaded with `requesterId`, `ownerId`, `studioId`, `owner.team.name`; `assertCanView(ticket, actor)` is called; on failure `ForbiddenException` is thrown.
- **P1 — Subtasks:** Same pattern for `create` and `findByTicket`: load ticket with visibility fields, `assertCanView(ticket, actor)`, throw if forbidden.

### New tests

- **TicketVisibilityService:**  
  - Department user can view ticket owned by teammate in same department (owner.team.name = 'HR', actor.departments = ['HR']).  
  - Department user cannot view ticket when owner is in different department (owner.team.name = 'Marketing', actor.departments = ['HR']).
- **CommentsService:**  
  - `create` throws `ForbiddenException` when `assertCanView` throws.  
  - `findByTicket` throws `ForbiddenException` when `assertCanView` throws.  
  - `findByTicket` throws `NotFoundException` when ticket does not exist.

### Build status

- **API:** `npx tsc --noEmit` ✅  
- **API tests:** `npx jest` — 7 suites, 65 tests passed ✅  

### Manual verification checklist

- [ ] **P0 — Department user can open teammate’s ticket:** As DEPARTMENT_USER (e.g. HR), ensure a ticket owned by another HR user appears in the ticket list. Open that ticket (detail). Expect 200 and full detail (no 403).
- [ ] **P0 — Department user cannot open out-of-scope ticket:** As DEPARTMENT_USER with no scope studios, try to open a ticket they do not own and whose owner is in a different department (or unassigned and different studio). Expect 403.
- [ ] **P1 — Comment create:** As a user who cannot view a ticket (e.g. direct POST to `/api/tickets/:id/comments` for another user’s ticket), expect 403.
- [ ] **P1 — Comment list:** As a user who cannot view the ticket, GET `/api/tickets/:id/comments` for that ticket; expect 403.
- [ ] **P1 — Subtask list/create:** Same as comments: out-of-scope ticket for subtasks list or create; expect 403.
- [ ] **Regression:** Studio user and ADMIN flows unchanged: list tickets, open ticket, add comment, list subtasks.
