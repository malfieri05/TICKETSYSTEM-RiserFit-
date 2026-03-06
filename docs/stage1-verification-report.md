# Stage 1: Permissions & Visibility — Verification Report

## 1. Manual verification checklist (code + tests)

| Check | Implementation | Test coverage | Result |
|-------|----------------|---------------|--------|
| Studio user sees their own submitted tickets | `TicketVisibilityService.buildWhereClause` for STUDIO_USER includes `requesterId: actor.id` | `ticket-visibility.service.spec`: "STUDIO_USER with primary studio returns OR with requesterId and studioId", "STUDIO_USER can view their own submitted ticket" | **PASS** (logic + tests) |
| Studio user sees all tickets for their studio | Same: `studioId: { in: [actor.studioId, ...scopeStudioIds] }` in OR | "STUDIO_USER can view a ticket from their primary studio" | **PASS** |
| Studio user cannot see tickets from other studios | `assertCanView` throws ForbiddenException when ticket.studioId not in actor’s studio set | "STUDIO_USER throws ForbiddenException for out-of-scope ticket" | **PASS** |
| Department user only sees tickets allowed by department/scope | DEPARTMENT_USER where: ownerId=me OR owner.team in my departments OR studioId in scopeStudioIds | "DEPARTMENT_USER returns ownerId...", "DEPARTMENT_USER with departments includes team name...", "DEPARTMENT_USER with scope studio override..." | **PASS** |
| Admin can see all tickets | `buildWhereClause(ADMIN)` returns `{}`; `assertCanView` returns without throwing | "ADMIN returns empty object", "ADMIN can view any ticket" | **PASS** |
| Adding extra studio scope immediately grants access | scopeStudioIds included in STUDIO_USER and DEPARTMENT_USER OR conditions; user cache invalidated on scope grant so next request gets new scopes | "STUDIO_USER includes scope override studios", "DEPARTMENT_USER with scope studio override..." | **PASS** (logic; cache invalidation in users.service) |

**Summary:** All six checklist items are implemented in `TicketVisibilityService` and `TicketsService`, and covered by unit tests in `ticket-visibility.service.spec.ts`. No E2E was run; manual browser verification recommended for full sign-off.

---

## 2. Migration sanity check (database)

**Script run:** `apps/api/scripts/verify-rbac-migration.ts` (against current DB).

### 2.1 Users by role (active only)

| Role             | Count |
|------------------|-------|
| STUDIO_USER      | 10    |
| ADMIN            | 1     |
| DEPARTMENT_USER  | 9     |

### 2.2 DEPARTMENT_USER with no department assigned

**Count:** 0 (after backfill)

Backfill script `apps/api/scripts/backfill-department-user-departments.ts` was run. The four users previously with no department (tom.wright@helpdesk.dev, marcus.chen@riserfitness.dev, priya.patel@riserfitness.dev, tom.wright@riserfitness.dev) were assigned **MARKETING** as a safe default. Re-run: `npx ts-node -r dotenv/config scripts/verify-rbac-migration.ts` to confirm 0.

### 2.3 Studio scope overrides with invalid/missing studio

**Count:** 0  

All `user_studio_scopes` rows reference existing studios.

---

## 3. Old role references (REQUESTER / AGENT / MANAGER)

### 3.1 User-role checks — **FIXED**

Frontend now uses the new role model:

| File | Change |
|------|--------|
| `apps/web/src/components/tickets/TicketDrawer.tsx` | `enabled` and `canManage` use `DEPARTMENT_USER` + `ADMIN` (no `AGENT`) |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | `enabled`, agents filter, and `canManage` use `DEPARTMENT_USER` + `ADMIN` |
| `apps/web/src/app/(app)/tickets/new/page.tsx` | `enabled`, agents filter, and assign-to condition use `DEPARTMENT_USER` + `ADMIN` |

No remaining `AGENT` / `REQUESTER` / `MANAGER` user-role checks in active app code (see §6).

### 3.2 Intentional / not user roles (no change)

- **Ticket status `WAITING_ON_REQUESTER`:** Used in state machine, filters, UI labels (multiple files). This is a ticket status, not a user role — leave as is.
- **`AGENT_TOOLS` (agent.service.ts, tool-definitions.ts):** Name of the AI agent tools array; not user role — leave as is.
- **`packages/types/index.ts`:** Defines legacy `Role` enum (REQUESTER, AGENT, MANAGER, ADMIN). Shared package may be used elsewhere; updating or deprecating is a separate task.
- **`apps/api/prisma/migrations/*.sql`:** Historical migration content — do not change.
- **stale-ticket.processor.ts:** Comment still says “ADMIN and MANAGER users”; code already uses only `ADMIN`. Comment is outdated; optional cleanup.

---

## 4. Test run summary

- **ticket-visibility.service.spec.ts:** **PASS** (25 tests).
- **users.service.spec.ts:** **PASS** — `buildPrismaMock()` now includes `user.findUniqueOrThrow`; all 14 tests pass.
- **app.controller.spec.ts:** **PASS**.

**Full API suite:** `npm test` — **40 tests, 3 suites, all passing.**

---

## 5. Conclusion (pre-cleanup)

- **Visibility and permissions:** Implemented and covered by unit tests; checklist items 1–6 are satisfied in code and tests.
- **Migration data:** Role counts look correct; 4 DEPARTMENT_USER had no department → backfilled (§2.2); no invalid studio scopes.
- **Frontend role checks:** Updated to DEPARTMENT_USER + ADMIN (§3.1).
- **Tests:** Mock fix applied; all tests pass (§4).

---

## 6. Stage 1 completion report (final)

| Criterion | Status |
|-----------|--------|
| **All tests passing** | Yes — `apps/api`: 40 tests, 3 suites; no failures. |
| **No remaining AGENT/REQUESTER/MANAGER role checks in active code** | Yes — Grep of `apps/web/src` for `'AGENT'`/`'REQUESTER'`/`'MANAGER'`: no matches. Grep of `apps/api/src` for `Role.AGENT`/`Role.REQUESTER`/`Role.MANAGER`: no matches. Only intentional references remain: ticket status `WAITING_ON_REQUESTER`, `AGENT_TOOLS` name, `packages/types`, and migration SQL. |
| **All DEPARTMENT_USER have valid department** | Yes — `verify-rbac-migration.ts` reports **DEPARTMENT_USER with no department assigned: 0**. |

**Stage 1 (Permissions & Visibility) is complete.**
