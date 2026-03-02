# CLAUDE.md — Ticketing System Project Brief
> This file is read automatically by Claude at the start of every session.
> It exists so Claude is ALWAYS fully up to speed, even after a session crash or context reset.

---

## 0. Project Overview

**What we're building:** A custom internal ticketing system for a single company (~400–500 employees).
- Client was using Teamwork.com — hated it (messy UX, unreliable/missed notifications)
- Client looked at Zoho Desk (liked features, hated price)
- Goal: Build something cleaner than Teamwork, more affordable than Zoho, tailored exactly to this company
- Single-tenant. Not a SaaS. One company only.
- This is the developer's (Michael's) first client delivery. Reputation is on the line. Build quality is critical.

**Project folder:** `TicketingSystem-CLAUDE` on Michael's Mac

---

## 1. Client Context

- Company uses **Microsoft Teams + Outlook** as their primary internal communication tools
- #1 pain point with Teamwork: **completion notifications don't fire reliably**
- Employees (~500) span multiple **Markets** (geographic regions) → each market has multiple **Studios** (physical locations)
- Org hierarchy: `Market → Studios` (1-to-many)
- Categories (e.g. Plumbing, HVAC) must be **admin-configurable** via DB table — no code deploys to add categories
- Client meeting is/was upcoming to finalize: SSO provider, department structure, SLA requirements, reporting needs

---

## 2. Tech Stack (Locked)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind | App router, src dir |
| Backend | NestJS + TypeScript | Modular monolith |
| Database | PostgreSQL via **Neon.tech** | Cloud managed, already provisioned |
| ORM | **Prisma** using `@prisma/client` | NOT the ESM-only generator — standard client in node_modules |
| Queue | Redis + BullMQ | For notification jobs, async tasks |
| Email | **Postmark** | Transactional, best deliverability |
| Teams Notifs | MS Teams incoming webhook | (Graph API in Phase 2) |
| Real-time | **SSE (Server-Sent Events)** | v1; WebSocket-ready for later |
| Attachments | S3-compatible object storage | 25MB limit enforced at API layer |
| Auth | SSO via OIDC/SAML (likely Azure AD) | + JWT + RBAC in app layer |
| Monorepo | **Turborepo** | Shared TypeScript types between apps |
| Deployment | **Render or Fly.io** | Simple: app + worker + managed Postgres + Redis + S3 |
| Error tracking | Sentry | |
| Monitoring | UptimeRobot + Vercel Analytics | |

---

## 3. Monorepo Structure

```
TicketingSystem-CLAUDE/
├── apps/
│   ├── web/          ← Next.js (TypeScript + Tailwind)
│   └── api/          ← NestJS (TypeScript)
│       └── prisma/
│           └── schema.prisma  ← full schema, migrated to Neon ✅
├── packages/
│   └── types/        ← shared TypeScript types/enums
├── turbo.json
├── package.json      ← workspaces configured
├── .gitignore
└── CLAUDE.md         ← this file
```

---

## 4. NestJS Module Structure (Locked Architecture)

```
apps/api/src/
├── main.ts
├── app.module.ts
└── modules/
    ├── auth/          # SSO (OIDC/SAML) + JWT + RBAC guards + decorators
    ├── users/
    ├── tickets/       # includes ticket-state-machine.ts — ONLY place for status transitions
    ├── subtasks/      # includes resolution gate check
    ├── comments/      # includes mention-parser.service.ts
    ├── attachments/   # S3 presigned URLs, 25MB enforcement
    ├── notifications/ # SSE endpoint + fan-out logic + channel adapters
    │   └── channels/  # email.channel.ts, teams.channel.ts, sse.channel.ts
    ├── workers/       # BullMQ processors (separate process)
    │   └── processors/
    │       ├── notification-fanout.processor.ts
    │       ├── notification-dispatch.processor.ts
    │       └── cleanup.processor.ts
    ├── events/        # domain-events.service.ts — event → queue bridge
    ├── reporting/
    ├── admin/         # categories, users, teams, markets, studios
    └── search/        # Postgres filtered search + pagination
```

---

## 5. Database (Neon.tech — All 17 Tables Migrated ✅)

All tables are live. Prisma schema is at `apps/api/prisma/schema.prisma`.

**Tables:**
- `users`, `teams`, `markets`, `studios`
- `categories` (admin-configurable)
- `tickets`, `ticket_comments`, `ticket_attachments`, `ticket_tags`, `ticket_watchers`
- `subtasks`
- `notifications`, `notification_deliveries`, `notification_preferences`
- `comment_mentions`
- `tags`
- `audit_logs`

**Key indexes (already in schema):**
- tickets: status, owner_id, requester_id, studio_id, market_id, category_id, priority, created_at
- Compound: (status, category_id), (status, owner_id)
- subtasks: ticket_id, owner_id, team_id, status

---

## 6. Ticket State Machine (Locked)

```
NEW → TRIAGED → IN_PROGRESS → WAITING_ON_REQUESTER → RESOLVED → CLOSED
                             → WAITING_ON_VENDOR    ↗
```
- Only `ticket-state-machine.ts` can change ticket status
- Ticket can only resolve if all `isRequired` subtasks are DONE
- WAITING_ON_VENDOR included from day 1 (needed for facilities: Plumbing/HVAC etc.)

**Subtask statuses:** TODO → IN_PROGRESS → BLOCKED → DONE

---

## 7. Notification Architecture (Critical — This is the #1 Client Pain Point)

**Pipeline:**
1. Domain event fires → written to DB in same transaction → fan-out job enqueued
2. Fan-out worker: determines recipients, checks `notification_preferences`, creates `Notification` + `NotificationDelivery` records
3. Dispatch worker: sends per channel (email/teams/in-app SSE), marks delivery SENT/FAILED
4. Retry: exponential backoff, 5 attempts → DEAD_LETTERED → admin alert

**Idempotency key format:** `notif_{notificationId}_{channel}`

**Queue config:**
- `notification-fanout`: 3 attempts, 2s/4s/8s backoff
- `notification-dispatch`: 5 attempts, 5s/10s/20s/40s/80s backoff
- `dead-letter`: holds failed jobs for admin review + manual retry

**Channels:** EMAIL (Postmark), TEAMS (webhook), IN_APP (SSE)

**Fan-out rules (who gets notified per event):**
- TICKET_CREATED → owner
- TICKET_ASSIGNED/REASSIGNED → owner
- TICKET_STATUS_CHANGED/RESOLVED/CLOSED → requester + watchers
- COMMENT_ADDED → requester + owner + watchers
- MENTION_IN_COMMENT → mentioned user
- SUBTASK_ASSIGNED → subtask owner
- SUBTASK_COMPLETED/BLOCKED → ticket owner
- ATTACHMENT_ADDED → owner + watchers

---

## 8. Build Phases

| Phase | Description | Status |
|---|---|---|
| **Phase 0** | Foundations: repo, auth scaffold, DB schema, migrations | ✅ COMPLETE |
| **Phase 1** | Core Spine: tickets CRUD, comments, mentions, assignment, state machine, subtasks, audit logs, notifications | ✅ COMPLETE |
| **Phase 2** | Frontend UI: auth, ticket list/detail/create, notifications, admin panel | ✅ COMPLETE (frontend core) |
| **Phase 3** | Advanced Service Ops: SLA engine, escalations, scheduled reminders, export enhancements | NOT STARTED |
| **Phase 4** | AI Assistant: RAG chatbot ingesting RiserU docs + pgvector | NOT STARTED |

---

## 9. Current State (Where We Left Off)

**Phase 0 is 100% COMPLETE ✅**

The API boots cleanly:
```
✅ 0 TypeScript errors
✅ Database connected (Neon PostgreSQL via @prisma/adapter-pg)
✅ Nest application successfully started
✅ All auth + user routes registered
```

**Important Prisma 7 note:** Prisma 7 requires a Driver Adapter — no more `datasourceUrl` in constructor.
`PrismaService` uses `@prisma/adapter-pg` with `PrismaPg`. Do NOT revert this pattern.

**Phase 1 is 100% COMPLETE ✅**

All Phase 1 modules built and booting cleanly:
- ✅ TicketsModule: CRUD, state machine, assignment, resolution gate, watchers, audit history
- ✅ CommentsModule: create/list/edit, @mention parsing, internal notes
- ✅ SubtasksModule: create/list/update, status transitions, resolution gate enforcement
- ✅ AuditLogModule: every mutation logged with old/new values
- ✅ NotificationsModule: SSE real-time stream, REST endpoints, user preferences
- ✅ WorkersModule: BullMQ fan-out + dispatch processors, Postmark email channel
- ✅ EventsModule: DomainEventsService enqueues to BullMQ after every mutation

**Redis is live ✅**
- Upstash Redis provisioned: `set-ocelot-61422.upstash.io:6379` (N. Virginia, TLS enabled, eviction OFF)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS` set in `apps/api/.env`
- BullMQ connects cleanly on boot — no Redis errors in logs
- Full API boot confirmed: all modules + 54+ routes registered, Neon DB connected, BullMQ workers active

**Phase 2 Frontend is COMPLETE ✅**

Full Next.js UI built at `apps/web/src/`:

**Routes live:**
- `/login` — email login form, JWT stored in localStorage, redirects to `/tickets`
- `/tickets` — paginated ticket list, status/priority/search filters, "mine" toggle
- `/tickets/new` — create ticket form (title, description, priority, assign)
- `/tickets/[id]` — full ticket detail: comments tab, subtasks tab, history tab, sidebar (status transitions, assignment, watchers, details)
- `/notifications` — notification list, mark read / mark all read
- `/admin/categories` — add/enable/disable categories (data-driven, no code deploy needed)
- `/admin/markets` — add markets, drill into studios per market
- `/admin/users` — manage user roles, deactivate users

**Architecture:**
- `AuthProvider` — JWT in localStorage, injected on every axios request, 401 auto-redirects to `/login`
- `QueryProvider` — React Query for all data fetching + caching
- `useNotificationStream()` — SSE auto-connects on login, invalidates notification cache on new events
- `(app)/layout.tsx` — protected route group; redirects unauthenticated users to `/login`
- Role-aware UI — admin/agent see extra controls (status transitions, assignment, internal notes, subtask management, admin nav)

**Key fixes applied:**
- `devLogin` now returns `{ access_token, user }` (frontend-compatible shape)
- Backend maps DB field `name` → `displayName` in all auth responses
- `RequestUser` interface updated to use `displayName`
- `AuthProvider` hardened against bad localStorage values (`"undefined"`, `"null"`)
- Removed invalid `@nestjs/sse` package from api/package.json (SSE is built into `@nestjs/common`)

**Seeded user:**
- `malfieri05@gmail.com` — role: ADMIN — use this to log in via dev-login

**To run locally:**
```bash
# Terminal 1 (Cursor) — API
cd apps/api && npx ts-node --transpile-only src/main.ts

# Terminal 2 (Cursor) — Frontend
cd apps/web && npx next dev
```
Then open http://localhost:3000

**Next up (remaining Phase 2 items):**
1. S3 attachments (presigned upload, file display in ticket detail)
2. Reporting dashboard (ticket volumes, resolution times, by category/market)
3. MS Teams webhook notifications (Phase 2 backend)
4. Admin module backend endpoints (categories/markets/studios CRUD) — needed for admin UI to fully function

---

## 10. Testing Framework (Planned — Executed at Designated Build Gates)

| Phase | Tests |
|---|---|
| Ongoing | ESLint, SonarQube, Snyk (dep scanning), Jest unit tests, Postman API tests |
| ~40% build | Jest + Supertest integration, DB query analysis, Senior dev review |
| ~75% build | Playwright E2E, OWASP ZAP security scan, race condition tests (k6), role/permission audit |
| Pre-launch | k6 load test (500 concurrent users), penetration test (Burp Suite), full regression, cross-browser |
| Post-launch | Sentry error tracking, performance monitoring, UptimeRobot, log monitoring (Logtail) |

---

## 11. Key Engineering Rules (Non-Negotiable)

- DB migrations from day 1 (never manual schema edits)
- Strict constraints: FKs, not-null, enum constraints in Prisma
- Pagination on every list endpoint
- No N+1 query patterns
- Audit logs on ALL mutations
- Idempotency on all notification jobs
- Clear module boundaries — no "god services"
- Notifications are NOT best-effort — they are tracked, retried, audited
- State machine is the ONLY place ticket status changes
- Categories are data-driven (admin-configurable), statuses are code enums

**Anti-overengineering rules (do NOT introduce without strong justification):**
- No microservices
- No Kubernetes
- No Kafka / event buses
- No premature sharding
- No over-abstract enterprise patterns

---

## 12. Open Questions (Pending Client Meeting)

- Which SSO/identity provider? (Likely Azure AD given Teams/Outlook usage)
- Exact list of departments + typical subtask templates per category
- SLA requirements (response time / resolution time targets)?
- Required reporting dashboards (specific metrics)?
- External vendor access or strictly internal-only?
- Email-to-ticket ingestion needed? (Assumed Phase 2/3)
- Mobile support required?
- Attachment retention policy?

---

## 13. Business / Delivery Notes

- Michael's first client delivery — quality and reliability are paramount
- Hosting model: Michael hosts on Render, points to client's domain, charges monthly retainer
- Client's domain will be something like `tickets.theircompany.com`
- Build must comfortably handle 400–500 daily active users with zero unplanned downtime

---
*Last updated: Phase 2 frontend complete. Next: admin backend endpoints, S3 attachments, reporting dashboard.*
