# Environment variables — where to set them

Use this as the single reference for **what** to set and **where** (exact file path). Never commit real secrets; use `.env` (gitignored) or your host’s env config.

---

## 1. API — `apps/api/.env`

**File path:** `TicketingSystem-CLAUDE/apps/api/.env`  
**Used when:** You run the API from `apps/api` (e.g. `npx ts-node --transpile-only src/main.ts` or `npm run start:dev`). The API loads this file from the current working directory (`.env` next to `package.json`).

Create the file if it doesn’t exist (e.g. `touch apps/api/.env`), then paste the block below and replace placeholders with your real values.

```env
# ─── Required: Database (Neon) ─────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# ─── Required: Auth (JWT) ─────────────────────────────────────────────────
JWT_SECRET=your-long-random-secret-at-least-32-chars

# ─── Required: Redis (BullMQ + SSE) ────────────────────────────────────────
REDIS_HOST=your-redis-host.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true

# ─── Required: S3-compatible storage (attachments) ────────────────────────
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_ENDPOINT=

# ─── Optional: S3_ENDPOINT — leave blank for AWS; set for R2/MinIO ─────────
# S3_ENDPOINT=https://....

# ─── Optional: Email (Postmark) ────────────────────────────────────────────
# POSTMARK_API_TOKEN=...
# POSTMARK_FROM_EMAIL=tickets@yourcompany.com

# ─── Optional: MS Teams notifications ──────────────────────────────────────
# TEAMS_WEBHOOK_URL=https://yourcompany.webhook.office.com/...

# ─── Optional: SLA (defaults used if omitted) ──────────────────────────────
# SLA_URGENT_HOURS=4
# SLA_HIGH_HOURS=24
# SLA_MEDIUM_HOURS=72
# SLA_LOW_HOURS=168
# SLA_CHECK_INTERVAL_MS=3600000

# ─── Optional: AI Assistant (OpenAI) ───────────────────────────────────────
# OPENAI_API_KEY=sk-...

# ─── Optional: RiserU / Op Central policy sync (Knowledge Base) ───────────
# Base URL from RiserU API docs (no trailing slash):
# RISER_API_BASE_URL=https://riseru.api.opcentral.com.au
# RISER_API_KEY=your-riseru-api-key
# Policy IDs to sync (comma-separated). IMPORTANT: Use POLICY IDs, not manual IDs.
# Manual IDs from GET /v1/opdocs/manuals/all (5,6,7,...) are NOT valid for sync.
# Policy IDs are different (e.g. 75,99,100,101,150,200,...). Get from RiserU dashboard or discover via API.
# RISER_POLICY_IDS=75,99,100,101,150,200,201,250,251,300

# ─── Optional: App / hosting (for links in emails and health) ───────────────
# PORT=3001
# FRONTEND_URL=http://localhost:3000
# APP_HOSTING_DASHBOARD_URL=...
# NEON_DASHBOARD_URL=...
# UPSTASH_DASHBOARD_URL=...
# POSTMARK_DASHBOARD_URL=...
# OPENAI_DASHBOARD_URL=...
# RISER_DASHBOARD_URL=...
# UPTIME_MONITOR_DASHBOARD_URL=...
# SENTRY_DASHBOARD_URL=...
# S3_DASHBOARD_URL=...
```

**Copy-paste for RiserU only (add to `apps/api/.env`):**

```env
RISER_API_BASE_URL=https://riseru.api.opcentral.com.au
RISER_API_KEY=paste-your-riseru-api-key-here
RISER_POLICY_IDS=75,99,100,101,150,200,201,250,251,300
```

- **RISER_API_BASE_URL** — Use exactly `https://riseru.api.opcentral.com.au` (no trailing slash). Confirmed from [RiserU API documentation](https://riseru.opcentral.com.au/#/api-documentation/overview).
- **RISER_API_KEY** — Your RiserU API key (sent as `x-api-key` header). Keep this secret; do not commit it.
- **RISER_POLICY_IDS** — Comma-separated **policy** IDs (not manual IDs). **Manual IDs** from GET `/v1/opdocs/manuals/all` (e.g. 5, 6, 7, 8…) are **not** valid; they return "policy ID invalid". **Policy IDs** are a different set (e.g. 75, 99, 100, 150, 200…). Use the RiserU dashboard to find policy IDs, or use the sample list above (verified working).

---

## 2. Web (Next.js) — `apps/web/.env.local`

**File path:** `TicketingSystem-CLAUDE/apps/web/.env.local`  
**Used when:** You run the frontend (`npm run dev` or `next dev`). Next.js loads `.env.local` in dev and for build. This file is gitignored.

Create it if it doesn’t exist, then paste and adjust:

```env
# API base URL (used by the frontend to call the API)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- **Local dev with API on 3001:** use `http://localhost:3001`.
- **Local dev with API on another port:** use e.g. `http://localhost:3002`.
- **Production / staging:** set to your deployed API URL (e.g. `https://api.yourcompany.com`).

---

## 3. Quick reference table

| Variable | Where | Required? |
|----------|--------|-----------|
| `DATABASE_URL` | `apps/api/.env` | Yes |
| `JWT_SECRET` | `apps/api/.env` | Yes |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS` | `apps/api/.env` | Yes (for workers/SSE) |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `apps/api/.env` | Yes (attachments) |
| `S3_ENDPOINT` | `apps/api/.env` | No (blank for AWS) |
| `OPENAI_API_KEY` | `apps/api/.env` | No (needed for AI assistant + Riser ingestion) |
| `RISER_API_BASE_URL`, `RISER_API_KEY`, `RISER_POLICY_IDS` | `apps/api/.env` | No (needed for Riser policy sync) |
| `TEAMS_WEBHOOK_URL` | `apps/api/.env` | No |
| `POSTMARK_API_TOKEN`, `POSTMARK_FROM_EMAIL` | `apps/api/.env` | No |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` | No (defaults to `http://localhost:3001`) |

---

## 4. After editing

- **API:** Restart the API process so it reloads `apps/api/.env` (e.g. stop and run `npx ts-node --transpile-only src/main.ts` again).
- **Web:** Restart the Next dev server so it reloads `apps/web/.env.local` (e.g. stop and run `npm run dev` again).
