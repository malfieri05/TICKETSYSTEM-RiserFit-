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

### Claude Code vs Cursor

- **Cursor:** Open this repo folder in Cursor; the editor agent uses the workspace as context. This file (`CLAUDE.md`) is loaded per project rules so sessions stay aligned with architecture and phase status.
- **Claude Code (CLI):** Anthropic’s terminal coding agent (command is typically `claude`, e.g. `~/.local/bin/claude`). **Connect to this project** by starting it from the **repo root** — not from `.claude/worktrees/...` unless you mean to work in that git worktree copy. **Sign in once:** `claude auth login`, then verify with `claude auth status`. **Daily use:** `claude` from the repo root so `CLAUDE.md` and paths resolve correctly. Use a normal interactive terminal (full TUI features need a real TTY; automated pipes may fail for `claude doctor` etc.).
- **Do not commit secrets:** keep keys in `apps/api/.env`, `apps/web/.env.local`, and hosting env — never paste them into `CLAUDE.md`.

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
├── health/            # readiness + queue visibility (admin system monitoring)
├── policy/            # Riser policy sync hooks (AI / compliance)
├── common/
│   ├── database/      # Prisma
│   ├── cache/         # my-summary cache, user cache
│   ├── audit-log/
│   ├── permissions/   # ticket-visibility.service (role + studio scope)
│   ├── redis/         # SSE pub/sub for multi-instance
│   └── storage/       # shared S3 client from env (R2/AWS)
└── modules/
    ├── auth/          # JWT + RBAC guards + decorators (SSO path as configured)
    ├── users/
    ├── invitations/   # closed provisioning: invite, accept, resend, revoke
    ├── tickets/       # ticket-state-machine.ts — ONLY place for status transitions
    ├── subtasks/      # resolution gate check
    ├── comments/      # mention-parser.service.ts
    ├── attachments/   # S3 presigned URLs, 25MB enforcement
    ├── notifications/ # SSE + fan-out + channel adapters
    │   └── channels/  # email, teams, sse
    ├── events/        # domain-events → queue bridge
    ├── reporting/     # aggregates, CSV-oriented admin reporting, dispatch slices
    ├── dashboard/     # GET /dashboard/summary — role-scoped KPIs + breakdowns
    ├── admin/
    ├── ticket-forms/  # schema-driven create
    ├── subtask-workflow/
    ├── workflow-analytics/
    ├── search/
    ├── ai/            # RAG, knowledge ingest
    ├── agent/         # tool-calling assistant + audit
    ├── email-automation/  # Gmail ingest, assembly/delivery pipeline, review queue (see README in module)
    ├── lease-iq/      # per-studio lease PDF/rules, ticket evaluation
    ├── dispatch/      # dispatch groups, recommendations, maintenance-focused reporting hooks
    └── locations/     # public location profile API for studio pages
└── workers/
    └── processors/
        ├── notification-fanout.processor.ts
        ├── notification-dispatch.processor.ts
        ├── stale-ticket.processor.ts
        ├── email-ingest.processor.ts
        ├── invite-email.processor.ts
        └── knowledge-ingestion.processor.ts
```

---

## 5. Database (Neon.tech — Migrated ✅)

All tables are live. Prisma schema is at `apps/api/prisma/schema.prisma`.

**Tables:**
- `users`, `teams`, `markets`, `studios`
- `categories` (admin-configurable)
- `ticket_classes`, `departments`, `support_topics`, `maintenance_categories` (taxonomy)
- `tickets`, `ticket_comments`, `ticket_attachments`, `ticket_tags`, `ticket_watchers`
- `ticket_form_schemas` (schema-driven create)
- `subtasks`, `subtask_dependencies`
- `subtask_workflow_templates`, `subtask_templates`, `subtask_template_dependencies` (Stage 4 workflow)
- `notifications`, `notification_deliveries`, `notification_preferences`
- `comment_mentions`
- `tags`
- `audit_logs`
- `knowledge_documents`, `document_chunks` (Phase 4 AI)
- `user_invitations`, `user_departments`, `user_studio_scopes` (invites + department users + multi-studio visibility)
- `studio_profiles` (location profile pages)
- `dispatch_groups`, `dispatch_group_items`, `dispatch_group_templates` (dispatch intelligence)
- `inbound_emails`, `vendor_order_records`, `order_line_items`, `delivery_events`, `studio_address_normalized`, `assembly_trigger_items`, `email_automation_*` tables (vendor email automation pipeline — distinct from Postmark **notification** email)
- `lease_sources` (optional `uploadedBytes`, `textCharCount` for source list metadata), `lease_rule_sets`, `lease_rules`, `lease_rule_terms`, `ticket_lease_iq_results` (Lease IQ)
- `agent_conversations`, `agent_messages`, `agent_action_logs` (AI agent tool-calling audit trail)

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
| **Phase 3** | Advanced Service Ops: SLA engine, escalations, scheduled reminders, export enhancements | ✅ COMPLETE |
| **Phase 4** | AI Assistant: RAG chatbot ingesting RiserU docs + pgvector | ✅ COMPLETE |
| **Stage 6** | Inbox/notification center (actionable queue), schema-driven create-ticket UI | ✅ COMPLETE |
| **Stage 6.5** | Admin Workflow Template Manager: list/create/edit/delete templates, subtask templates, dependencies, workflow preview | ✅ COMPLETE |
| **Stage 5+** | Role-scoped dashboard summary API + UI; admin reporting extensions (workflow timing, dispatch-by-studio, etc.) | ✅ COMPLETE |
| **Email automation** | Gmail ingest + vendor order/assembly ticket path + admin review queue (module `email-automation`) | ✅ COMPLETE |
| **Lease IQ** | Lease PDF/source per studio, rule sets, ticket evaluation + admin UI | ✅ COMPLETE |
| **Dispatch** | Groups, templates, recommendations API + UI hooks | ✅ COMPLETE (V1) |
| **Invitations** | Admin invite flow, accept via token, Resend (or configured mailer) | ✅ COMPLETE |

---

## 9. Current State (Where We Left Off)

### Phases 0–3: ALL COMPLETE ✅

**Phases 0–1 (Foundations + Core Spine) ✅**
- API boots clean: 0 TS errors, Neon DB connected, 54+ routes, BullMQ workers active
- Prisma 7 pattern: `@prisma/adapter-pg` / `PrismaPg` — do NOT revert
- All backend modules live: Auth, Users, Tickets (state machine), Comments (@mentions), Subtasks (resolution gate), Attachments, Notifications (SSE + fan-out + dispatch), Workers (BullMQ), Events, Admin, Reporting, SLA
- Redis live: Upstash `set-ocelot-61422.upstash.io:6379` (TLS, eviction OFF)

**Phase 2 (Frontend) ✅**
- Full Next.js UI at `apps/web/src/`
- Core routes: `/login`, `/tickets`, `/tickets/new` (schema-driven), `/tickets/[id]`, `/notifications`, `/inbox` (actionable queue), `/dashboard`, `/assistant`, `/handbook`
- Portal (studio users): `/portal` (tabs: my tickets, by studio, dashboard summary), `/portal/tickets` (legacy list; primary flow is `/portal`)
- Locations: `/locations/[studioId]` (studio profile)
- Admin: `/admin/categories`, `/admin/markets` (locations), `/admin/users` (invites, roles, studio scopes), `/admin/reporting`, `/admin/workflow-templates` (list/new/[id]), `/admin/knowledge-base`, `/admin/email-automation`, `/admin/lease-iq`, `/admin/system-monitoring` (health/queues)
- Auth: JWT in localStorage → injected on every axios request → 401 auto-redirects
- SSE: `useNotificationStream()` auto-connects, invalidates cache on events
- Attachments: drag-drop upload → presigned S3 PutObject → confirm-upload; GetObject presigned download
- Reporting (admin): KPI cards, 30-day volume chart (CSS bars), by-status/priority/category/market breakdowns, avg resolution, completion-by-owner, workflow timing, dispatch-focused slices, CSV export where implemented
- Teams channel: Adaptive Card v1.2 via incoming webhook, dev-mode fallback
- **Theme / polish:** `apps/web/src/app/globals.css` — `data-theme` light/dark CSS variables (`--color-*`, `--radius-sm/md/lg`, `--shadow-*`). Shared TS helpers: `apps/web/src/lib/polish.ts` (`POLISH_THEME`, `POLISH_CLASS`, `FEED_COL_WIDTHS` for aligned ticket feed columns). **UI/UX polish spec:** `docs/ui-ux-polish-system-v1.md` (token usage, table standardization, workflow protection). **Brand:** `BrandMark` rounded-square tile (`apps/web/src/components/layout/BrandMark.tsx`) in sidebar + login. **Header:** fixed bar height via `Header` (`h-14`). **MultiComboBox:** portaled dropdown to avoid modal clipping (e.g. invite user departments).
- **Ticket list / feed UX:** ticket feed supports **search** and **date filter** via `TicketFeedSearchField` and `DateFilterInput` (wired into `TicketFeedLayout` / related ticket pages); keep column widths consistent with `FEED_COL_WIDTHS` in `lib/polish.ts` when changing layouts.

**Stage 6 / 6.5 ✅**
- Inbox: actionable notification queue with READY subtask context; relative timestamps; optimistic read
- Create ticket: taxonomy + form schema (GET `/admin/config/ticket-taxonomy`, form schemas); workflow templates instantiate subtasks on create when context matches
- Admin Workflow Templates: list, create (by ticket context), view/edit (name, isActive, subtask CRUD, add/remove dependencies, workflow preview). Create flow refetches list before redirect so the new template appears when returning to the list; redirect guarded on `res.data.id`

**Phase 3 (Advanced Service Ops) ✅**
- SLA engine: pure computation (`SlaService`) — `OK | AT_RISK | BREACHED | RESOLVED`; targets URGENT=4h, HIGH=24h, MEDIUM=72h, LOW=168h; AT_RISK = <20% remaining
- Every `findAll` / `findById` ticket response includes `sla: SlaStatus`
- Stale-ticket cron: hourly BullMQ repeatable job → `StaleTicketProcessor` → sends `TICKET_SLA_BREACHED` to owner + all ADMINs (idempotent: skips if notified in last 23h)
- SLA UI: `<SlaBadge>` + `<SlaProgressBar>` in ticket list and detail sidebar
- **⚠️ Required migration:** `cd apps/api && npx prisma migrate deploy` (adds `TICKET_SLA_BREACHED` enum value)

**Seeded login:**
- `malfieri05@gmail.com` — role: ADMIN

**To run locally:**
```bash
# Recommended — monorepo (API + web via Turborepo)
npm run dev
# API: http://localhost:3001/api  ·  Web: http://localhost:3000

# Alternative — separate terminals
cd apps/api && npm run start:dev    # Nest watch (port from env, often 3001)
cd apps/web && npx next dev         # port 3000
```
If ports 3000/3001 are stuck, free them before restarting (e.g. `lsof -ti:3001 | xargs kill`).

**Required env vars (apps/api/.env):**
```
# S3 Attachments
S3_BUCKET=your-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=           # blank for AWS; set for R2/MinIO

# MS Teams (optional — logs in dev if unset)
TEAMS_WEBHOOK_URL=https://yourcompany.webhook.office.com/...

# SLA thresholds (all optional, defaults shown)
SLA_URGENT_HOURS=4
SLA_HIGH_HOURS=24
SLA_MEDIUM_HOURS=72
SLA_LOW_HOURS=168
SLA_CHECK_INTERVAL_MS=3600000

# AI Assistant (Phase 4)
OPENAI_API_KEY=sk-...
```

---

### Phase 4: AI Assistant — COMPLETE ✅

**Backend (`apps/api/src/modules/ai/`):**
- `ingestion.service.ts` — splits docs into overlapping 1200-char chunks, embeds batches via `text-embedding-3-small`, stores in `document_chunks` via raw SQL (pgvector `vector(1536)`)
- `ai.service.ts` — RAG: embeds user query → cosine similarity search (`<=>`, threshold 0.4, top-5) → GPT-4o-mini with retrieved context + source citations; graceful fallback when no relevant docs found
- `ai.controller.ts` — `POST /ai/chat` (all users), `POST /ai/ingest/text`, `POST /ai/ingest/file` (.txt/.md up to 10MB), `GET /ai/documents`, `PATCH /ai/documents/:id/toggle`, `DELETE /ai/documents/:id` (ADMIN only)

**DB changes:**
- `knowledge_documents` + `document_chunks` tables with IVFFlat index on embedding column
- Migration: `20260302210000_add_ai_knowledge_base/migration.sql`
- **⚠️ Required:** `cd apps/api && npx prisma migrate deploy` (also enables `pgvector` extension on Neon)

**Frontend:**
- `/assistant` — full chat UI: message thread, avatar bubbles, source citation pills, auto-scroll, Shift+Enter multiline, AI disclaimer
- `/admin/knowledge-base` — ingest modes: **Handbook PDF**, paste text, upload file; document table (chunks count, toggle active/inactive, delete); info modal explains purpose for admins
- Sidebar: "AI Assistant" in main nav (all users), "Knowledge Base" in Admin section

**Required env var (add to apps/api/.env):**
```
OPENAI_API_KEY=sk-...
```

**Key design decisions:**
- Chunk: 1200 chars / 150-char overlap — balances context vs token cost
- Embedding: `text-embedding-3-small` (1536 dims, cheap & accurate)
- Chat: `gpt-4o-mini` (fast + cheap for internal tool, temp=0.2 for factual answers)
- Similarity threshold: cosine distance < 0.4 (strict — only truly relevant chunks retrieved)
- No streaming yet — single round-trip sufficient at this scale

---

### Performance & AI Agent Notes (Current)

- Horizontal scaling is not enabled yet; app is designed stateless so multiple API instances behind a load balancer can be added later without major refactors.
- k6 load tests show a single API instance cleanly handles 150–200 very active virtual users (0% errors) with p95 latency between ~5–8 seconds under synthetic, worst-case clicking.
- My-summary and ticket list endpoints have been optimized (caching, pooled DB connections, optional lightweight list mode) to keep real-world response times snappy for ~50 concurrent human users.
- AI Agent sidebar (tool-calling assistant) is fully wired into tickets/subtasks/users/reporting with confirmation flow and audit logs; it is an optional UX helper, not required for core workflows.
- **Stage 23 (User Visibility & Inbox):** Admin can set a studio user’s default location and add/remove additional locations (Admin → Users → Locations). Studio users see a location filter on the portal when they have multiple allowed studios; GET /tickets returns 403 if a STUDIO_USER filters by a studio outside their allowed set. Department users see inbox topic folders (All + support topics) with active counts (grouped count by supportTopicId). Studio users cannot create/update subtasks or transition ticket status; they can view progress, comment (non-internal), and receive notifications. Actionable nav remains visible for DEPARTMENT_USER and ADMIN.
- **Dashboard (`GET /dashboard/summary`):** `DashboardService` applies `TicketVisibilityService` filters. **ADMIN / DEPARTMENT_USER:** counts for NEW / IN_PROGRESS / RESOLVED+CLOSED, avg completion hours (last 30d), `supportByType` (support topic breakdown), `maintenanceByLocation` (maintenance tickets by studio). **STUDIO_USER:** open vs completed, same avg window, `byLocation` (optional `?studioId` when within allowed scope). UI: `/dashboard` and portal **Dashboard** tab reuse `dashboardApi.summary`.
- **Email automation vs notifications:** Postmark (or log-only) powers **ticket notification** emails. **Email automation** is a separate pipeline: Gmail ingest (BullMQ `email-ingest` job), persistence of inbound vendor mail, assembly/delivery matching, optional ticket creation — see `apps/api/src/modules/email-automation/README.md`.
- **Lease IQ:** Admin configures lease sources and rule sets per studio; tickets can be evaluated against published rules; admin UI at `/admin/lease-iq`. **`lease_sources`** may include optional **`uploadedBytes`** and **`textCharCount`** (list/detail metadata; `textCharCount` backfilled from `rawText` where present). **Migration:** `20260403180000_lease_source_list_meta` — run `cd apps/api && npx prisma migrate deploy` when pulling.
- **Invitations:** Closed provisioning — `InvitationsModule` + `invite-email.processor`; production mailer may be Resend (see `InviteMailService` logs) or as configured in env.

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
- General **support** email-to-ticket (shared mailbox → tickets): not the same as **vendor email automation** (implemented for assembly/delivery path); confirm if a separate inbound support address is required
- Mobile support required?
- Attachment retention policy?

---

## 13. Business / Delivery Notes

- Michael's first client delivery — quality and reliability are paramount
- Hosting model: Michael hosts on Render, points to client's domain, charges monthly retainer
- Client's domain will be something like `tickets.theircompany.com`
- Build must comfortably handle 400–500 daily active users with zero unplanned downtime

---
*Last updated: April 2026 — Same as above, plus: Claude Code vs Cursor notes (§0); ticket feed search/date filter UI; Lease IQ lease-source list metadata (`uploadedBytes`, `textCharCount`) + migration `20260403180000_lease_source_list_meta`; ongoing polish on admin/dispatch/inbox/portal/ticket surfaces.*
