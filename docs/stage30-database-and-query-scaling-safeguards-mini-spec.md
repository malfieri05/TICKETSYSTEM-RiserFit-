# Stage 30: Database and Query Scaling Safeguards — Mini-Spec

## 1. Intent

- Harden the **database and query layer** so core ticket flows stay **fast and predictable** as ticket volume and concurrency grow.
- Introduce **targeted, measurement-driven** safeguards: max page sizes, selective counts, query instrumentation, and optional index or shape tweaks only where evidence supports them.
- Preserve the current architecture; avoid speculative indexing or rewrites. Distinguish **current real risks** from **hypothetical** scaling issues.

## 2. Problem Statement

The system’s main read paths are well-structured (visibility, pagination, optional includeCounts, my-summary cache). As ticket volume and user count grow:

- **List and search**: `findAll` combines TicketVisibilityService (OR conditions by role), user filters, optional `actionableForMe` (subtask READY + department/owner), and search (`contains`/insensitive on title and/or description). The same `where` is used for both `findMany` and `count`. At high volume, full-table scans or heavy index usage on `contains` can degrade; the count query can be expensive when the where clause is complex.
- **Actionable inbox**: Same list path with `actionableForMe=true` plus a follow-up `findMany` for READY subtask summary per page. Multiple round-trips per request (list, count, two groupBy for progress, optional ready-subtasks fetch).
- **My summary**: Four count queries, two groupBy (category), one findMany (paginated), plus taxonomy lookups. Cached for page=1/limit=50 (45s TTL) but uncached for other pages and on cache miss.
- **Inbox folders**: Visibility where + one count + one groupBy by supportTopicId. Runs on every inbox load for department/admin users.
- **Scope summary**: Two counts + one findMany (recent 10). Lightweight but still multiple round-trips.
- **Search**: `ILIKE`-style `contains`/insensitive does not use standard B-tree indexes efficiently; at very large ticket counts this can become a bottleneck. Not necessarily a problem at current or near-term scale.
- **Index coverage**: Single-column and a few compound indexes exist; the actionable filter (tickets with subtasks READY + department/owner) may or may not be well-served depending on planner choices. Only measurement (EXPLAIN / slow-query log) can confirm.

Without safeguards, we risk: slow list/count under load, expensive search with broad filters, and no clear signal when a query starts to degrade. The goal is to add **minimal, high-leverage** safeguards and a path to measure and tune, without overengineering.

## 3. Scope

**In scope**

- Documenting **current query surfaces** (list, actionable, portal, inbox folders, my-summary, scope-summary, detail, history, comments, subtasks) and their shapes.
- Identifying **likely scaling risks** (count + findMany with complex where, search, groupBy, includeCounts, actionableForMe).
- Proposing a **safeguard strategy**: max page size enforcement, optional lighter list mode, selective count behavior, and query instrumentation / EXPLAIN workflow.
- Defining **immediate vs later** priorities and **safe improvements vs premature optimization**.
- Test and measurement plan; acceptance criteria.

**Out of scope**

- Changing visibility or policy logic.
- Rewriting list/detail APIs or replacing Prisma.
- Full-text search or dedicated search infrastructure (defer until measurement shows need).
- Speculative indexing beyond what is clearly justified by current query patterns.

## 4. Current Query Surfaces Involved

| Surface | Method | Main queries | Pagination | Notes |
|--------|--------|--------------|------------|--------|
| **Ticket list** | `findAll` | findMany + count (same where); optional _count (comments, subtasks, attachments); two groupBy (subtask progress); optional findMany READY subtasks | page, limit (max 100) | Visibility + filters + optional actionableForMe + optional search |
| **Actionable inbox** | `findAll` with actionableForMe=true | Same as list + READY subtask summary per page | Yes | Department/admin only |
| **Portal my** | `findAll` with requesterId=actor | Same list shape | Yes | |
| **Portal studio** | `findAll` with requesterId + studioId | Same list shape | Yes | |
| **Inbox folders** | `getInboxFolders` | count(baseWhere); groupBy(supportTopicId, _count); taxonomy lookups | No | Department/admin; baseWhere = scope + active statuses |
| **Dashboard / my-summary** | `getMySummary` | 4× count(myTicketWhere); 2× groupBy (maintenanceCategoryId, supportTopicId); findMany (paginated, limit cap 100); 2× taxonomy findMany | page, limit (capped 100) | Cached 45s for page=1, limit=50. myTicketWhere = scope + (requester OR owner OR watcher) |
| **Scope summary** | `getScopeSummary` | count(whereOpen); count(whereCompleted); findMany(scopeWhere, take 10) | No (fixed 10 recent) | Portal dashboard |
| **Ticket detail** | `findById` | findUnique by id, full detail select (includes owner.team for policy) | No | Single row |
| **Ticket history** | `getHistory` | auditLog.findMany where ticketId, orderBy createdAt desc, include actor | No | Indexed by ticketId |
| **Comments** | CommentsService | ticketComment.findMany where ticketId | No (or paginated per API) | Indexed by ticketId |
| **Subtasks** | SubtasksService | subtask.findMany where ticketId | No | Indexed by ticketId |

**Visibility where clause (TicketVisibilityService)**

- **ADMIN**: `{}`
- **DEPARTMENT_USER**: `OR [ ownerId=actor, owner.team.name in departments, studioId in scopeStudioIds ]`
- **STUDIO_USER**: `OR [ requesterId=actor, studioId in [primary, scopeStudios] ]`

**List select**

- **includeCounts=true** (default): TICKET_LIST_SELECT with `_count: { comments, subtasks, attachments }` (Prisma subqueries per row).
- **includeCounts=false**: TICKET_LIST_SELECT_LIGHT (no _count). Progress (completed/total) is still computed via two groupBy after the page is fetched.

**Pagination**

- DTO: `page` (min 1), `limit` (min 1, **max 100**). Default limit 25.

## 5. Likely Query / Scaling Risks

| Risk | Surface(s) | Severity (at ~10k tickets, 50–500 users) |
|------|------------|------------------------------------------|
| **Count with complex where** | findAll, getMySummary, getInboxFolders | Medium. Same where as findMany; at high volume count can be costly if index use is poor. |
| **Search (contains/insensitive)** | findAll | Medium at 10k+ rows. ILIKE-style predicates often prevent index-only plans; can degrade with growth. |
| **actionableForMe filter** | findAll (inbox) | Medium. Joins tickets to subtasks (status READY, department/owner). Planner may choose nested loop or poor join order; compound index on (ticketId, status) and (departmentId, status) on subtasks exist but ticket-side filter is combined with scope. |
| **Multiple counts per request** | getMySummary | Medium. Four counts with same base where; under concurrency this multiplies load. Caching reduces impact for default page. |
| **groupBy for category counts** | getMySummary, getInboxFolders | Low–medium. groupBy by category/topic with same scope where; typically smaller result sets. |
| **includeCounts _count** | findAll | Low–medium. Three _count subqueries per row; Prisma may optimize, but adds work per page. |
| **Progress groupBy (completed/total)** | findAll | Low. Two groupBy by ticketId for current page only; ticketIds bounded by page size. |
| **Detail / history / comments / subtasks** | findById, getHistory, comments, subtasks | Low. Single-ticket scoped; indexed. |

## 6. Root Cause Hypotheses / Bottleneck Areas

1. **findAll + count**: The combined where (scope AND filters AND optional actionableForMe AND optional search) can produce a complex plan. Count is a separate query; both need to evaluate the same predicate. If the planner does not use indexes effectively (e.g. for OR-heavy scope or search), both findMany and count can slow down.
2. **Search**: `title: { contains: search, mode: 'insensitive' }` (and optionally description) does not map to a simple B-tree index. At large table size, sequential or index scan with filter is likely. Limiting search to title only (`searchInTitleOnly`) reduces work but does not remove the pattern.
3. **Actionable queue**: Filter “tickets that have at least one subtask with status READY and (department in X or ownerId=actor)” requires a join or subquery. Existing indexes on subtasks (ticketId, status; departmentId, status) help; the risk is the combination with ticket visibility (OR conditions) leading to a suboptimal plan.
4. **My-summary**: Four counts over the same myTicketWhere (scope + requester/owner/watcher) and two groupBy. No pagination on counts; each runs over the full matching set. Cache absorbs the common case (first page).
5. **Inbox folders**: One count and one groupBy over baseWhere (scope + active statuses). Single request per inbox load; risk is proportional to ticket volume and concurrency.

## 7. Files / Modules / Schema Areas Likely Involved

| Area | Files / modules | Schema |
|------|-----------------|--------|
| List / filters | `tickets.service.ts` (findAll), `ticket-filters.dto.ts` | tickets, subtasks |
| Visibility | `ticket-visibility.service.ts` | — |
| My-summary | `tickets.service.ts` (getMySummary), `my-summary-cache.service.ts` | tickets |
| Inbox folders | `tickets.service.ts` (getInboxFolders) | tickets, supportTopic, taxonomyDepartment |
| Scope summary | `tickets.service.ts` (getScopeSummary) | tickets, studios |
| Detail / history | `tickets.service.ts` (findById, getHistory), `audit-log.service.ts` | tickets, audit_logs |
| Comments / subtasks | `comments.service.ts`, `subtasks.service.ts` | ticket_comments, subtasks |
| Indexes | — | `schema.prisma`: Ticket @@index, Subtask @@index |

**Existing Ticket indexes**: status, ownerId, requesterId, studioId, marketId, ticketClassId, departmentId, supportTopicId, maintenanceCategoryId, priority, createdAt; compound (status, ownerId), (requesterId, status).

**Existing Subtask indexes**: ticketId, (ticketId, status), ownerId, teamId, departmentId, (departmentId, status).

## 8. Proposed Safeguard Strategy

**Phase 1 — Immediate (low-risk safeguards)**

- **Enforce max page size** in one place: ensure list endpoints never request more than 100 rows per page (DTO already @Max(100)); document and optionally add a server-side clamp so that even if the DTO is bypassed, limit is capped (e.g. `Math.min(limit, 100)`).
- **Document includeCounts**: Frontend and any API consumers should use `includeCounts=false` for lightweight list refreshes (e.g. after ticket_update) when comment/subtask/attachment counts are not needed; keep default true for full list loads. No code change required if callers already pass it where appropriate.
- **Use slow-query logging**: Rely on Stage 29 Phase 1 slow-query threshold (e.g. 500 ms) to surface degrading queries; use logs to decide if and where to add indexes or simplify shape.
- **Optional: cap getMySummary limit server-side**: Already `Math.min(limit, 100)`; ensure this is the single place for that cap and document.

**Phase 2 — After measurement**

- **EXPLAIN workflow**: When slow-query log or metrics point to a specific query (e.g. findAll with actionableForMe, or count with search), run EXPLAIN (ANALYZE) in staging or with production-like data. Add a compound index only if the plan shows a clear win and the index is justified by the query pattern (e.g. (supportTopicId, status) for inbox folders if the plan shows a sequential scan on tickets).
- **Selective count**: If evidence shows that the total count in list responses is rarely needed (e.g. “load more” without total), consider an option to skip the count query and return a conservative total or “more available” flag. This is a behavioral change and should be driven by product need and measurement.
- **Search**: If measurement shows search is slow at target volume, consider (later) a dedicated strategy (e.g. full-text index, or external search). Not in scope for Stage 30; only document as a future option.

**Phase 3 — Only if needed**

- **Composite index for actionable**: Only if EXPLAIN shows that the current indexes are insufficient for the actionableForMe + visibility where clause. Avoid speculative indexes.
- **Inbox folders / my-summary**: If counts or groupBy become hot, consider short TTL cache for folder counts or my-summary counts; again only after measurement.

## 9. Immediate Priorities vs Later Priorities

| Priority | Item | When |
|----------|------|------|
| **P0** | Ensure limit is capped (e.g. 100) server-side for list and my-summary | Now (small guard) |
| **P0** | Rely on existing slow-query logging to capture degrading queries | Now (already in place) |
| **P1** | Document includeCounts and when to use light list | Now |
| **P1** | Run EXPLAIN on one or two high-traffic list shapes (e.g. list with status filter, actionable list) with production-like data volume | Before or early production |
| **P2** | Add index only if EXPLAIN and slow-query log show a clear bottleneck | After measurement |
| **P2** | Optional selective count or “no total” mode for list | Only if product and metrics support it |
| **Later** | Full-text or dedicated search strategy | Only when search is proven slow at target scale |

## 10. Safe Improvements vs Premature Optimization

**Safe now**

- Server-side clamp on list and my-summary `limit` (e.g. max 100).
- Documentation of includeCounts and searchInTitleOnly for API consumers.
- Relying on slow-query logging (Stage 29) to identify hot queries.

**Avoid for now**

- Adding compound indexes without EXPLAIN evidence.
- Removing or changing the count query in list responses without product agreement.
- Introducing a new search backend or full-text index before measuring search performance.
- Caching list or count results beyond the existing my-summary cache unless a specific bottleneck is measured.
- Changing the visibility where clause for performance (correctness first).

## 11. Test / Measurement Plan

- **Unit**: Any new server-side clamp (limit) is covered by a test (e.g. limit 150 passed in → query uses 100).
- **Integration**: Run list endpoints (with and without actionableForMe, with and without search) against a database with 5k–10k tickets; capture response times and, if possible, query plans. Compare with and without includeCounts.
- **EXPLAIN**: For the list query (and optionally count) with a representative where clause (e.g. DEPARTMENT_USER scope + status + actionableForMe), run EXPLAIN (ANALYZE) and record whether indexes are used and whether sequential scans appear on large tables.
- **Slow-query log**: After deployment, use the existing slow-query threshold to identify any query that exceeds the threshold; investigate and tune (index or shape) only those.

## 12. Acceptance Criteria

- **AC1** List and my-summary endpoints never return more than the configured max page size (e.g. 100) per page, enforced server-side.
- **AC2** No regression in list, detail, inbox, or summary correctness or visibility behavior.
- **AC3** Slow-query logging (Stage 29) is the primary mechanism to detect degrading queries; no new speculative indexes are added without EXPLAIN evidence.
- **AC4** Documentation (or code comments) describe when to use includeCounts=false and searchInTitleOnly for lighter list loads.
- **AC5** Optional: one or more high-traffic query shapes (e.g. list with filters, actionable list) have been run through EXPLAIN with production-like data and the outcome documented; index changes only if the plan clearly warrants them.
- **AC6** Architecture and existing API contracts are preserved; safeguards are additive and minimal.
