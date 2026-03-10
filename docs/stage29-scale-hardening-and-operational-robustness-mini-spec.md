# Stage 29: Scale Hardening and Operational Robustness — Mini-Spec

## 1. Intent

- Prepare the ticketing system to remain **fast, stable, and trustworthy** as usage grows from small-team development into real multi-user production (~50–500 employees).
- Identify **practical, minimal** hardening steps that reduce likely bottlenecks and operational risk without rewriting the architecture.
- Preserve the current architecture; only add or tune what is necessary for production readiness and clear upgrade paths.

## 2. Problem Statement

The system is functionally strong (visibility, feed performance, UI polish, real-time updates). As it moves toward production:

- **Database and query load** may grow with more tickets, more concurrent list/detail/inbox/portal requests, and heavier search or filter combinations.
- **Real-time (SSE)** is in-memory and single-instance; adding a second API instance would break live updates for users connected to the instance that did not receive the fan-out.
- **Background jobs** (notification fan-out, dispatch) have retries and idempotency but no visibility into queue depth, backlog, or dead-letter handling.
- **Caching** (my-summary, user JWT) is in-process and correct today; under multi-instance or higher churn, invalidation semantics and TTLs may need to be validated.
- **Observability** is minimal: no health endpoint, no structured metrics, and logging is ad-hoc (Nest Logger); slow queries and queue health are not exposed.
- **API robustness** has no rate limiting or explicit timeouts; validation is strict but abuse or burst traffic is unmitigated.
- **Frontend** React Query cache and SSE reconnect behavior are reasonable for current scale but may need bounds or tuning under heavy or long-lived sessions.

We need a **staged, senior-level plan** that separates what to harden **now** (before broader production use) from what can wait until scale or multi-instance deployment demands it.

## 3. Scope

**In scope**

- Evaluating and documenting current behavior and risks in: database/queries, SSE/real-time, background jobs, caching, observability, API robustness, frontend under load.
- Proposing a **hardening strategy** with clear priorities (immediate vs later).
- Identifying **files, modules, and infra** that will be touched.
- Defining **acceptance criteria** and a **test/validation plan** for hardening work.
- Distinguishing **safe, high-leverage improvements** from **premature overengineering**.

**Out of scope**

- Changing business rules, visibility, or policy logic.
- Rewriting list/detail APIs or replacing Prisma/BullMQ/React Query.
- Full distributed tracing or APM unless justified as minimal and high-value.
- Multi-region or multi-tenant scaling.

## 4. Current System Areas Involved

### 4.1 Database / queries

- **Ticket list** (`TicketsService.findAll`): Visibility where-clause + filters (status, taxonomy, search, `actionableForMe`). Pagination (page, limit, max 100). Optional `includeCounts` (comment/subtask/attachment _count); light select when false. When `actionableForMe`, adds subtask READY filter and post-fetch READY subtask summary; progress uses two `groupBy` (completed/total) per page. Search: `contains`/`insensitive` on title and/or description.
- **Inbox folders** (`getInboxFolders`): Department + support topics; base where + `count` + `groupBy` by `supportTopicId`. Multiple queries in parallel.
- **Scope summary** (`getScopeSummary`): Open/completed counts + recent 10 tickets; for STUDIO_USER, fetches allowed studios.
- **My summary** (`getMySummary`): Cached (45s TTL) when page=1, limit=50. Four count queries (total, open, resolved, closed), groupBy for category counts, paginated ticket list; category enrichment from taxonomy tables.
- **Indexes** (schema): Tickets — status, ownerId, requesterId, studioId, marketId, ticketClassId, departmentId, supportTopicId, maintenanceCategoryId, priority, createdAt; compound (status, ownerId), (requesterId, status). Subtasks — ticketId, ticketId+status, ownerId, teamId, departmentId, departmentId+status. Notifications — userId, ticketId, (userId, isRead), (userId, createdAt).

### 4.2 Real-time (SSE)

- **SseChannel**: In-memory `Map<userId, Subject>`. One stream per user at `GET /api/notifications/stream`. Emits `notification` and `ticket_update` (Stage 28). Cleanup on disconnect.
- **Fan-out**: Runs in same process as API; after creating notification and pushing notification SSE, calls `pushTicketUpdate(userId, payload)` for each recipient. Same recipient list as notifications; no extra visibility logic.
- **Limitation**: Only the API instance that holds the user’s SSE connection can push to them. With multiple API instances, fan-out would run on one instance (worker) but SSE connections are spread across instances — so ticket_update and notification SSE would not reach users on other instances.

### 4.3 Background jobs / async

- **Queues**: notification-fanout (3 attempts, 2s exponential backoff), notification-dispatch (5 attempts, 5s exponential), scheduled (stale-ticket cron), knowledge-ingestion. DEAD_LETTER queue in constants; dispatch failures can move to DEAD_LETTERED status; no dedicated dead-letter consumer or dashboard.
- **Idempotency**: Domain event jobId = `eventType_ticketId_occurredAt`. Notification delivery idempotencyKey per channel/recipient. Fan-out caps recipients at 200 per event.
- **Workers**: Run in same NestJS process as API (single process). BullMQ connected to Redis (env: REDIS_HOST, REDIS_PORT, etc.).

### 4.4 Caching / auth

- **MySummaryCacheService**: In-memory Map, 45s TTL. Invalidated on ticket create (actor + owner), assign/reassign (owner + previous), watch/unwatch (user). Used only for getMySummary(page=1, limit=50).
- **UserCacheService**: In-memory Map, 60s TTL. Used in JWT validate to avoid DB on every request. Invalidated on user deactivation, role update, department/scope changes (UsersService).
- **Risk**: If an admin changes a user’s departments or studio scopes and a request is served from cache before invalidation, that request could see stale scope. All mutation paths in UsersService call invalidate; risk is limited to the TTL window.

### 4.5 Observability / monitoring

- **Logging**: NestJS Logger (debug/info/error). No structured (JSON) log format. Prisma: `log: ['query']` in development only; production has no query logging.
- **Health**: No `/health` or `/ready` endpoint. App has `GET /` returning a simple string (AppController).
- **Metrics**: No Prometheus or metrics endpoint. No queue depth, job latency, or error-rate metrics.
- **Errors**: Sentry mentioned in CLAUDE for error tracking; not visible in codebase. No centralized slow-query or N+1 detection.

### 4.6 API / server robustness

- **Validation**: Global ValidationPipe (whitelist, forbidNonWhitelisted, transform). DTOs with class-validator.
- **Rate limiting**: None. No per-IP or per-user throttling.
- **Timeouts**: No explicit request timeout middleware. Node/Express default applies.
- **Concurrency**: Single process; Prisma pool size from env (default 20). Neon pooled endpoint recommended for production.
- **CORS / compression**: Configured. No abuse protection beyond auth.

### 4.7 Frontend robustness

- **React Query**: Query keys for tickets (list, actionable, portal-my, portal-studio), ticket detail (id, subtasks, history, attachments), notifications, inbox-folders, my-summary. No explicit `cacheTime`/`gcTime` or `staleTime` limits; default cache behavior. Placeholder data and debounced search used (Stage 26).
- **SSE**: Single EventSource in layout. On reconnect, invalidates ticket list keys once (after first open). ticket_update invalidation debounced 250ms; SUBTASK_BECAME_READY also invalidates inbox-folders.
- **Multi-tab**: Each tab has its own cache and SSE connection; no shared worker. Acceptable for current design.

## 5. Likely Scaling and Operational Risks

| Area | Risk | Severity (at ~50–500 users) |
|------|------|------------------------------|
| **DB/queries** | List/search with `contains` on large ticket table slows down; count + findMany + groupBy for my-summary/inbox-folders can spike under concurrent load. | Medium |
| **DB/queries** | Missing composite index for actionable queue filter (tickets + subtasks READY + department/owner) could cause slow plans. | Medium |
| **SSE** | Second API instance: users on instance B never get SSE when fan-out runs on instance A. | High (if scaling out) |
| **SSE** | Many concurrent SSE connections (one per user) on one process: memory and file descriptors. | Low–medium at 500 |
| **Jobs** | Fan-out backlog if Redis or worker is slow; no visibility into queue depth or age. | Medium |
| **Jobs** | DEAD_LETTERED deliveries not surfaced for admin retry or alerting. | Medium |
| **Caching** | User cache TTL 60s: admin changes scope, user still has old scope for up to 60s. | Low (documented, acceptable) |
| **Caching** | My-summary cache per-instance; with multiple instances, cache hit rate is lower (acceptable). | Low |
| **Observability** | No health check: load balancer or orchestrator cannot detect unhealthy app. | High |
| **Observability** | No slow-query or queue metrics: hard to diagnose production slowness. | High |
| **API** | No rate limiting: one abusive client can spike load. | Medium |
| **API** | No request timeout: a stuck Prisma or external call can hold the connection. | Low–medium |
| **Frontend** | React Query cache unbounded; long session with many navigations could hold many keys. | Low for 500 users |

## 6. Root Cause Hypotheses / Bottleneck Areas

1. **List and search**: `findAll` with complex AND/OR (visibility + actionableForMe + search) and optional _count/groupBy. At 10k+ tickets, `contains`/insensitive search may not use indexes well; count queries with same where can be expensive.
2. **My-summary / inbox-folders**: Multiple sequential or parallel counts and groupBys per request; under many concurrent users these add up.
3. **SSE multi-instance**: Fan-out and SSE both in-process; once the worker or API is split across instances, SSE delivery must go through a shared bus (e.g. Redis pub/sub) so the instance holding the connection can push.
4. **Visibility and policy**: Not a bottleneck; already applied in service layer. No change needed for scale hardening.
5. **Queue backlog**: Under burst of events (e.g. many comments or status changes), fan-out queue could grow; without metrics, operators won’t see it until latency or failures appear.

## 7. Files / Modules / Infrastructure Likely Involved

| Change area | Files / modules | Infra |
|-------------|-----------------|--------|
| Health / readiness | `main.ts`, new `HealthModule` or controller | None |
| DB query tuning | `tickets.service.ts` (findAll, getMySummary, getInboxFolders, getScopeSummary), `schema.prisma` (indexes) | Neon/Postgres |
| Observability (logs/metrics) | New middleware or filter, optional metrics module; Prisma middleware for slow query log | Log aggregation, optional Prometheus |
| SSE multi-instance | `sse.channel.ts`, notifications module; optional Redis pub/sub adapter | Redis |
| Queue observability | Workers module, queue constants; BullBoard or custom admin endpoint | Redis, BullMQ |
| Rate limiting | `main.ts` or global guard, throttle module | None |
| Caching | `my-summary-cache.service.ts`, `user-cache.service.ts` | None (or Redis if moving to shared cache later) |
| Frontend | `useNotifications.ts`, React Query provider/defaults | None |

## 8. Proposed Hardening Strategy

**Phase 1 — Immediate (before broader production use)**  
- Add a **health/readiness endpoint** (e.g. `GET /api/health` or `GET /health`) that checks DB connectivity (and optionally Redis). Use it for load balancer health checks and restarts.  
- **Structured logging** (optional but high-value): ensure logs can be parsed (e.g. JSON with level, message, context). Prefer minimal change (e.g. Nest logger override or single middleware) rather than replacing every log call.  
- **Slow query visibility**: enable Prisma query logging in production with a threshold (e.g. log only queries > 500ms) or use Prisma middleware to log slow queries. Protects against regressions and helps tune indexes.  
- **Document and optionally expose queue depth** for notification-fanout and notification-dispatch (e.g. simple GET that returns counts). Enables alerting if backlog grows.  
- **Review and, if needed, add one composite index** for the actionable list (e.g. supporting subtasks READY + ticket visibility) only if EXPLAIN shows a clear win; avoid speculative indexes.

**Phase 2 — When scaling to multiple API instances**  
- **SSE via Redis pub/sub**: When a ticket_update or notification is to be pushed to user X, publish a message to a Redis channel (e.g. `sse:user:X`); the API instance that holds X’s SSE connection subscribes and pushes to the stream. SseChannel becomes a wrapper that either pushes in-memory (single-instance) or publishes to Redis; each instance subscribes for its connected user IDs.  
- **Keep fan-out in same process as API** (or run workers on one instance) until queue depth or throughput requires dedicated workers; then ensure worker publishes SSE messages to Redis so any API instance can deliver to the right connection.

**Phase 3 — As load and ops mature**  
- **Rate limiting**: Add a simple per-IP (or per-user) rate limit for API routes (e.g. 200 req/min per IP for non-stream routes). Protects against abuse and burst.  
- **Request timeout**: Global or per-route timeout (e.g. 30s) for non-SSE requests so stuck requests don’t hold connections indefinitely.  
- **Dead-letter handling**: Document DEAD_LETTERED delivery status; add a simple admin view or script to list and optionally retry failed deliveries.  
- **Frontend**: Consider React Query `gcTime` or cache size limits if long-lived sessions show memory growth; defer until observed.

## 9. Immediate Priorities vs Later Priorities

| Priority | Item | When |
|----------|------|------|
| **P0** | Health/readiness endpoint | Before production traffic |
| **P0** | Slow-query logging (threshold-based) in production | Before production traffic |
| **P1** | Queue depth visibility (and alerting if backlog > N) | Before or early in production |
| **P1** | Structured or parseable logs | Early production |
| **P2** | Index review for actionable list (only if EXPLAIN shows need) | When list latency is an issue |
| **P2** | SSE Redis pub/sub | When adding a second API instance |
| **P3** | Rate limiting, request timeout | When abuse or stuck requests are a concern |
| **P3** | Dead-letter UI/retry | When ops need to retry failed notifications |
| **Later** | Shared cache (Redis) for user/my-summary | Only if multi-instance cache coherence is required |

## 10. Safe Improvements vs Premature Overengineering

**Safe, high-leverage now**  
- Health endpoint (small, no business logic).  
- Prisma middleware or log option to log queries above a duration threshold.  
- Exposing queue depths (read-only) for fan-out and dispatch.  
- One composite index only after measuring and confirming the plan.

**Avoid for now**  
- Full APM or distributed tracing unless a specific production problem requires it.  
- Rewriting list or detail APIs.  
- Adding Redis cache for my-summary/user before multi-instance.  
- Complex rate limiting (e.g. per-route, per-user tiers) until abuse is observed.  
- Changing SSE to WebSockets for “scale”; SSE + Redis pub/sub is sufficient for the stated scale.  
- Multiple new infra dependencies; prefer using existing Redis and DB for observability and health.

## 11. Test / Validation Plan

- **Health**: Call `GET /api/health` (or chosen path); assert 200 and body indicates DB (and optionally Redis) OK; simulate DB down and assert non-200 or unhealthy flag.  
- **Slow query log**: Run a query that sleeps or scans large table; assert it appears in logs when over threshold.  
- **Queue depth**: After enqueueing jobs, call queue-depth endpoint (if implemented); assert counts are non-zero where expected.  
- **Load**: Repeat existing k6 or load tests; ensure health and logging do not regress latency.  
- **SSE (Phase 2)**: With two instances behind a router, connect SSE to instance A; trigger event from instance B (or worker); assert instance A receives and delivers to client (via Redis pub/sub).  
- **Rate limit (Phase 3)**: Send requests above limit; assert 429 or configured response.

## 12. Acceptance Criteria

- **AC1** Health/readiness endpoint exists, returns 200 when DB (and optionally Redis) is reachable, and returns unhealthy when DB is unreachable.  
- **AC2** Slow queries (e.g. > 500ms) are logged in production (or via a configurable threshold) without logging every query.  
- **AC3** Queue depth for notification-fanout and notification-dispatch is observable (documented or exposed via endpoint) for alerting.  
- **AC4** No regression in list/detail/inbox/portal latency under existing load tests.  
- **AC5** (Phase 2) When SSE is backed by Redis pub/sub, multi-instance deployment delivers ticket_update and notification to the correct client.  
- **AC6** (Phase 3) Rate limiting and request timeout are applied as specified; dead-letter handling is documented and optionally surfaced for ops.  
- **AC7** Architecture and existing behavior (visibility, policy, real-time semantics) are preserved; hardening is additive and minimal.
