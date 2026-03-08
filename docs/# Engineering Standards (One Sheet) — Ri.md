# Engineering Standards (One Sheet) — Riser Internal Ticketing System
**Stack:** Next.js (TS) + NestJS (TS) + Postgres (Neon) + Prisma + Redis/BullMQ + SSE + S3 + Sentry  
**Goal:** “Senior-grade” codebase: readable, testable, secure, observable, and boring to operate for 3+ years.

---

## 1) Non-Negotiable Principles
- **Correctness > cleverness.** Prefer simple, explicit code over abstraction.
- **Modules own domains.** No cross-domain reach-around.
- **Deterministic behavior.** State changes, notifications, and jobs must be predictable and auditable.
- **Security enforced server-side.** Never rely on UI or AI agent prompts for permissions.
- **Performance by default.** Pagination everywhere, lean payloads, indexes for hot queries.

---

## 2) Repository & Structure
### Monorepo (recommended)
- `/apps/web` (Next.js)
- `/apps/api` (NestJS)
- `/packages/shared` (types/constants only; no server secrets)
- `/docs` (architecture + standards + runbooks)

### NestJS module boundaries (rule)
- Each domain = module: `TicketsModule`, `SubtasksModule`, `CommentsModule`, `NotificationsModule`, `ReportingModule`, `AuthModule`, `AgentModule`, `AdminModule`
- **No “GodService”.** Services must be domain-focused.
- Cross-module access only via exported services or events/jobs (not direct DB access).

---

## 3) API Design Rules (NestJS)
- All inputs validated with DTOs (`class-validator` / `zod`) at the edge.
- **Consistent error format** with meaningful HTTP status codes.
- **Pagination required** for list endpoints:
  - Use `limit` + `cursor` (preferred) or `page` + `pageSize`.
- **Response payloads are minimal**:
  - Lists do NOT include large nested objects (e.g., full comments). Fetch details via separate endpoint.
- Use request IDs / correlation IDs in logs.

---

## 4) Database Rules (Postgres + Prisma)
- **Migrations only.** Never mutate schema manually.
- **Foreign keys + NOT NULL + enums/constraints** for data integrity.
- Every “hot filter” must have an index. Minimum indexes:
  - `tickets(status)`, `tickets(owner_user_id)`, `tickets(requester_user_id)`, `tickets(category_id)`,
  - `tickets(studio_id)`, `tickets(market_id)`, `tickets(created_at)`, `tickets(updated_at)`
  - `subtasks(ticket_id)`, `subtasks(team_id)`, `subtasks(owner_user_id)`, `subtasks(status)`
- **Explain plans required** for slow queries in production-like data.
- Prefer normalized relational design; use JSON columns only when justified.

---

## 5) Workflow & State Machines
- Ticket and subtask status transitions are explicit (state machine).
- Only allowed transitions are permitted; invalid transitions return `409 Conflict`.
- Required fields on transitions enforced (e.g., resolution note if moving to `RESOLVED`).
- Status changes write:
  - domain mutation
  - **audit log entry**
  - notification events (queued)

---

## 6) Notifications & Jobs (Redis + BullMQ)
**Golden rule:** user trust depends on notifications being reliable.

- Any notification send (email/Teams/in-app) must be executed by the worker via a job.
- Jobs must be **idempotent**:
  - Every job has an `idempotency_key`
  - Worker checks `notification_deliveries` or `job_runs` to prevent duplicates
- Jobs must have:
  - retry with backoff
  - failure recorded
  - DLQ (or “failed” queue) after max retries
- All notification deliveries are logged:
  - channel, recipient, success/failure, error message, timestamps
- Expensive work never blocks requests:
  - email sends, Teams posts, AI calls, exports, ingestion = background jobs

---

## 7) Real-Time Updates (SSE)
- SSE used for low-complexity “push” updates:
  - in-app notifications
  - ticket updates indicator
- Must be optional/fallback safe:
  - UI should still work with refresh if SSE unavailable
- SSE stream respects auth + RBAC.

---

## 8) Security Standards (OWASP-aligned)
- RBAC enforced on every write and sensitive read at the API layer.
- All actions include `actor_user_id` in audit logs.
- Protect against:
  - injection (ORM + validation)
  - broken access control (server-side checks)
  - CSRF (where applicable)
  - rate limits on auth + agent endpoints
- Secrets only in environment variables (never committed).
- Attachments:
  - stored in S3
  - signed URLs
  - virus scanning optional (phase later)
  - enforce file size + type allowlist

---

## 9) Observability & Operability
- Sentry enabled for API and web.
- Structured logs (JSON) include:
  - request_id, user_id, endpoint, duration, status_code
- Health endpoints:
  - `/health` (app)
  - worker health / queue health
- Basic runbook in `/docs/runbook.md`:
  - “If notifications fail…”
  - “If DB latency spikes…”

---

## 10) Testing Requirements (Minimum Bar)
### Unit tests (required)
- Ticket state machine transitions
- RBAC rules for core actions
- Notification job idempotency logic

### Integration tests (required)
- Create ticket → assign → comment → resolve → verify delivery records
- Search/pagination works and does not over-fetch
- SSE endpoint auth + scope

### Load/perf sanity (required)
- P95 target for key endpoints in staging dataset:
  - tickets list / summary endpoints should be <2s at expected concurrency
- Any endpoint with p95 >2s must be profiled (DB, payload size, N+1, pool).

---

## 11) Frontend Standards (Next.js)
- Pages are thin; business logic stays in API.
- Use typed API clients; no untyped JSON access.
- Avoid global state chaos; keep state local where possible.
- List pages paginate; do not render massive lists.
- UI must show:
  - action confirmations for destructive events
  - clear status/ownership
  - notification feed + read/unread

---

## 12) AI Agent Standards
- Agent uses **tool calls only** (no UI automation).
- Tools are schema-validated; no freeform parsing.
- Requires confirmation for risky actions (resolve/close/bulk/reassign).
- Agent actions are fully audited:
  - `agent_action_logs` + domain `audit_logs`
- Web search is OFF by default; explicit user toggle required.

---

## 13) Code Review Rules (Even if Solo)
No PR merges unless:
- CI passes (lint, typecheck, tests)
- Changes match module boundaries
- New behavior has tests
- DB changes include migration + indexes if needed
- No duplicated logic
- Logs and errors are meaningful

---

## 14) Definition of Done (Task-Level)
A feature is “done” only if:
- Implemented in correct module boundaries
- Input validation + RBAC enforced server-side
- Audit logs written for mutations
- Notifications/jobs handled via queue (if applicable)
- Tests added/updated
- Docs updated if new operational behavior introduced

---

## 15) Anti-Overengineering Guardrails
Avoid by default:
- microservices
- Kubernetes
- Kafka/event buses
- premature sharding / multi-region HA
- over-abstract frameworks or meta-programming

Allowed only with written justification tied to:
- security requirement
- performance requirement
- maintainability requirement for this specific org