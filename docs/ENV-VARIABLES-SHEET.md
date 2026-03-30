# Environment variables — where to set them

Use this as the single reference for **what** to set and **where** (exact file path). Never commit real secrets; use `.env` (gitignored) or your host’s env config.

---

## 0. Production URLs (Riser Fitness — reference)

| Role | URL |
|------|-----|
| **Web** (Next.js) | `https://riser.quantumindustries.ai` |
| **API** (Nest) | `https://riser-api.quantumindustries.ai` |

**Vercel:** Web → `NEXT_PUBLIC_API_URL=https://riser-api.quantumindustries.ai`. API → `FRONTEND_URL` includes `https://riser.quantumindustries.ai` (comma-separated if you use more origins).

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

# ─── Required: S3-compatible storage (ticket attachments, KB PDFs, etc.) ────
# Cloudflare R2: fill every line below. AWS S3: set S3_ENDPOINT empty, use a real AWS region.
S3_BUCKET=
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_ENDPOINT=
# R2 needs S3_ENDPOINT + S3_REGION=auto. If debugging AWS SDK v3 checksum issues outside the app, try AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED (the API sets this for PutObject where needed).

# Optional: link shown in Admin → System Monitoring (paste Cloudflare R2 bucket URL if you want)
# S3_DASHBOARD_URL=https://dash.cloudflare.com/.../r2/default/buckets/your-bucket

# ─── Invite emails (Resend) — full paste template is in this doc under "Invite emails (Resend)"
# ─── Other transactional email (Postmark) — ticket notifications, still optional
# POSTMARK_API_TOKEN=
# POSTMARK_FROM_EMAIL=

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
# Knowledge ingestion: optional tuning (defaults are safe for large PDFs)
# KNOWLEDGE_CHUNK_TARGET_CHARS=1600
# KNOWLEDGE_CHUNK_OVERLAP_CHARS=200
# KNOWLEDGE_EMBEDDING_BATCH_SIZE=10   # embeddings per OpenAI call (1–64; lower if you see API errors on huge docs)

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

### Invite emails (Resend) — add to `apps/api/.env`

**Invite mail** uses **Resend** when `RESEND_API_KEY` is set. If it is unset, invite sending falls back to **Postmark** (`POSTMARK_API_TOKEN`), then to **console-only dev** logging.

Copy the block below into `apps/api/.env` and replace every `paste-…` / example value.

```env
# ─── Required for invite delivery (Resend) ─────────────────────────────────
RESEND_API_KEY=paste-your-resend-api-key-here

# From line must be allowed in Resend (verified domain or Resend test sender).
# Use quotes if you include a display name.
RESEND_FROM_EMAIL="Riser Fitness <notifications@quantumindustries.ai>"

# Public URL of the Next.js app (no trailing slash). Invite links are:
#   {WEB_PUBLIC_URL}/invite/accept?token=...
# Local: http://localhost:3000  |  Production: https://riser.quantumindustries.ai
WEB_PUBLIC_URL=http://localhost:3000

# ─── Optional (invites) ────────────────────────────────────────────────────
# INVITE_FROM_EMAIL=   # If set, overrides RESEND_FROM_EMAIL for invite mail only

# INVITE_TOKEN_TTL_DAYS=7
# INVITE_MAX_RESENDS_PER_DAY=5
# INVITE_VALIDATE_MAX_PER_HASH_WINDOW=30

# Send invite email in-process (skip Bull queue). Handy if workers are not running locally.
# INVITE_EMAIL_SYNC_DEV=true

# Production: 64 hex chars (32 bytes) so resend/regenerate can unwrap the same token.
# Dev may fall back to JWT_SECRET if unset — set explicitly in prod.
# INVITE_TOKEN_WRAP_KEY=paste-64-char-hex

# Fallback: use Postmark for invites only if RESEND_API_KEY is unset
# POSTMARK_API_TOKEN=
# POSTMARK_FROM_EMAIL=
```

| Variable | You paste / set… |
|----------|-------------------|
| **`RESEND_API_KEY`** | Resend dashboard → **API Keys** → key starting with `re_`. |
| **`RESEND_FROM_EMAIL`** | Exact **From** Resend accepts (e.g. `Name <you@your-verified-domain.com>`). Must match **Domains** or sender rules in Resend. |
| **`WEB_PUBLIC_URL`** | Browser origin users open for the app (**not** the API host). Same as your Next.js public URL. |
| **`INVITE_FROM_EMAIL`** | *(Optional)* Only if invite From should differ from `RESEND_FROM_EMAIL`. |
| **`INVITE_TOKEN_TTL_DAYS`** | *(Optional)* Days until the link expires (default `7`). |
| **`INVITE_MAX_RESENDS_PER_DAY`** | *(Optional)* Admin **Resend** cap per invite per rolling 24h (default `5`). |
| **`INVITE_VALIDATE_MAX_PER_HASH_WINDOW`** | *(Optional)* Max failed validate attempts per token per window (default `30`). |
| **`INVITE_EMAIL_SYNC_DEV`** | *(Optional)* `true` = send invite mail in the API process (no worker). |
| **`INVITE_TOKEN_WRAP_KEY`** | *(Optional in dev)* **Required in production** for resend without regenerating: 64 hex characters = 32 bytes. |
| **`POSTMARK_*`** | Used for **invites** only if `RESEND_API_KEY` is empty; ticket email notifications still use Postmark separately if configured. |

**After saving:** restart the **API** and ensure the **worker** process is running so the `invite-email` queue is processed (unless `INVITE_EMAIL_SYNC_DEV=true`).

---

**Copy-paste for RiserU only (add to `apps/api/.env`):**

```env
RISER_API_BASE_URL=https://riseru.api.opcentral.com.au
RISER_API_KEY=paste-your-riseru-api-key-here
RISER_POLICY_IDS=75,99,100,101,150,200,201,250,251,300
```

- **RISER_API_BASE_URL** — Use exactly `https://riseru.api.opcentral.com.au` (no trailing slash). Confirmed from [RiserU API documentation](https://riseru.opcentral.com.au/#/api-documentation/overview).
- **RISER_API_KEY** — Your RiserU API key (sent as `x-api-key` header). Keep this secret; do not commit it.
- **RISER_POLICY_IDS** — Comma-separated **policy** IDs (not manual IDs). **Manual IDs** from GET `/v1/opdocs/manuals/all` (e.g. 5, 6, 7, 8…) are **not** valid; they return "policy ID invalid". **Policy IDs** are a different set (e.g. 75, 99, 100, 150, 200…). Use the RiserU dashboard to find policy IDs, or use the sample list above (verified working).

### S3 / Cloudflare R2 — variable names to paste your values into

Put these in **`apps/api/.env`** (same file as the block above). Only the **left side** (before `=`) is fixed; you paste secrets on the right.

| Variable | You paste… |
|----------|------------|
| **`S3_BUCKET`** | Your R2 **bucket name** exactly as shown in Cloudflare (e.g. `riser-tickets-dev`). |
| **`S3_REGION`** | For R2 use **`auto`**. For AWS S3 use a real region (e.g. `us-east-1`). |
| **`S3_ACCESS_KEY_ID`** | R2 **Access Key ID** from **Manage R2 API Tokens** (after creating the token). |
| **`S3_SECRET_ACCESS_KEY`** | R2 **Secret Access Key** from the same screen (often shown only once). |
| **`S3_ENDPOINT`** | R2 S3 API URL: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` — replace `<ACCOUNT_ID>` with your **Account ID** from the R2 overview. **Leave empty** if you use real **AWS S3** (no custom endpoint). |
| **`S3_DASHBOARD_URL`** | *(Optional)* Link to open the bucket in Cloudflare (for admin “System Monitoring” only). |

**Copy-paste template (R2) — replace nothing on the left; only fill the right side:**

```env
S3_BUCKET=riser-fit-dev
S3_REGION=auto
S3_ACCESS_KEY_ID=4000ae6c3970741ef823719ce4915db9
S3_SECRET_ACCESS_KEY=b35ff0201614275496591dc186733510d5dae1a70a7744787ef13edc4be9ad84
S3_ENDPOINT=https://70351b4d20e2e5074b453851f6fe1d80.r2.cloudflarestorage.com


Example shape for **`S3_ENDPOINT`** (use your real Account ID): `https://70351b4d20e2e5074b453851f6fe1d80.r2.cloudflarestorage.com`

**Browser uploads:** In Cloudflare **R2 → your bucket → Settings → CORS**, allow your web origin (e.g. `http://localhost:3000` and your production URL) with methods **GET**, **PUT**, **HEAD**.

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
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `apps/api/.env` | Yes (attachments / KB PDFs) |
| `S3_ENDPOINT` | `apps/api/.env` | Required for **R2** / MinIO; **blank** for AWS S3 |
| `S3_DASHBOARD_URL` | `apps/api/.env` | No (admin dashboard link only) |
| `OPENAI_API_KEY` | `apps/api/.env` | No (needed for AI assistant + Riser ingestion) |
| `RISER_API_BASE_URL`, `RISER_API_KEY`, `RISER_POLICY_IDS` | `apps/api/.env` | No (needed for Riser policy sync) |
| `TEAMS_WEBHOOK_URL` | `apps/api/.env` | No |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `WEB_PUBLIC_URL` | `apps/api/.env` | No (needed for **invite** email delivery via Resend) |
| `INVITE_FROM_EMAIL`, `INVITE_TOKEN_WRAP_KEY`, `INVITE_*` tuning, `INVITE_EMAIL_SYNC_DEV` | `apps/api/.env` | No (invite-specific; see subsection above) |
| `POSTMARK_API_TOKEN`, `POSTMARK_FROM_EMAIL` | `apps/api/.env` | No (ticket notifications; invite fallback if Resend unset) |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` | No (defaults to `http://localhost:3001`) |

---

## 4. After editing

- **API:** Restart the API process so it reloads `apps/api/.env` (e.g. stop and run `npx ts-node --transpile-only src/main.ts` again).
- **Web:** Restart the Next dev server so it reloads `apps/web/.env.local` (e.g. stop and run `npm run dev` again).
