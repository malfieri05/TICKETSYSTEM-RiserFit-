# Live Riser integration verification

## Prerequisites

1. **Environment:** In `apps/api/.env` set (see **docs/ENV-VARIABLES-SHEET.md** for copy-paste):
   - `RISER_API_BASE_URL` — **https://riseru.api.opcentral.com.au** (no trailing slash). Confirmed from [RiserU API documentation](https://riseru.opcentral.com.au/#/api-documentation/overview).
   - `RISER_API_KEY` — Your RiserU API key (sent as `x-api-key` header).
   - `RISER_POLICY_IDS` — Comma-separated **policy** IDs (e.g. `75,99,100,150,200`). **Not** manual IDs from `/manuals/all` (those return "policy ID invalid"). Use policy IDs from the RiserU dashboard or the sample list in **docs/ENV-VARIABLES-SHEET.md**.

2. **API running:** From `apps/api`: `npx ts-node --transpile-only src/main.ts` (or `npm run start:dev`).

3. **Database:** Migrations applied (including Riser columns on `knowledge_documents`). See `docs/migration-recovery-20260309-and-riser.md` if needed.

---

## 1. Live Riser sync verification

### Option A: Admin UI

1. Log in as an admin (e.g. `malfieri05@gmail.com` via dev-login).
2. Go to **Admin → Knowledge Base**.
3. Click **Sync from Riser**.
4. **If configured:** You should see a message like “Riser sync finished — N synced, M skipped, K failed” and the documents list should refresh. Synced policies appear as rows with source “Riser” (or URL) and `upstreamProvider: riser`.
5. **If not configured:** You will see “Riser sync not configured. Set RISER_API_BASE_URL, RISER_API_KEY, and RISER_POLICY_IDS …”.

### Option B: API (curl or script)

```bash
# From repo root; API must be running on port 3001
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"malfieri05@gmail.com"}' | jq -r '.access_token')

curl -s -X POST http://localhost:3001/api/ai/riser/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected success response shape:

```json
{
  "synced": 1,
  "skipped": 0,
  "failed": 0,
  "details": [{ "id": "<policy-id>", "status": "synced" }]
}
```

Then verify documents list:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/ai/documents
```

You should see at least one document with `upstreamProvider: "riser"`, `upstreamId` matching the policy ID, and `_count.chunks > 0` after indexing.

---

## 2. Contract confirmation (after a successful sync)

- **Auth:** Confirmed (x-api-key header from client/vendor). Live 200 response confirms the key is accepted.
- **Endpoint/path:** After a successful sync, the **current configured path** is confirmed by real upstream behaviour: `GET {baseUrl}/v1/opdocs/policy/{policyId}` returns 200 and a body we can parse. It remains **pending confirmation from Op Central docs** until the vendor documents this path.
- **Response shape:** Our defensive parsing accepts `id`, `title`, and `content` or `body`; optional `version`, `review_on`, `review_due`. A successful sync confirms the upstream returns at least id, title, and content/body in a shape we handle.

---

## 3. Failure-path check

Code behaviour (no live call required):

- **401 Unauthorized:** Logged with “check RISER_API_KEY”; returned to client as `reason: 'Unauthorized (check RISER_API_KEY)'` in sync details.
- **403 Forbidden:** Logged; returned as `reason: 'Forbidden (API key may lack access)'`.
- **404 Not found:** Logged; returned as `reason: 'Policy not found'`.

**Optional live test (401):**

1. In `apps/api/.env` set `RISER_API_KEY` to an invalid value (e.g. `invalid-key-for-test`).
2. Restart the API.
3. Trigger sync (UI or POST `/api/ai/riser/sync`).
4. Confirm the sync result shows failed count ≥ 1 and in `details` one entry has `reason: 'Unauthorized (check RISER_API_KEY)'` (or similar). Restore the real key afterward.

---

## 4. Final checklist (after running with real values)

- [ ] Sync returns 202 and a payload with `synced` / `skipped` / `failed` / `details` (no `configMissing`).
- [ ] At least one policy ID syncs (`synced ≥ 1` and a `details` entry with `status: 'synced'`).
- [ ] GET `/api/ai/documents` returns 200 and includes a document with `upstreamProvider: 'riser'`, `upstreamId` = policy ID, and `_count.chunks` ≥ 1 (after indexing).
- [ ] Admin Knowledge Base UI shows the synced document (title, source, chunks count).
- [ ] (Optional) One failure-path test: invalid API key or invalid policy ID; operator sees a clear reason in sync result and/or logs.

---

## Verification pass log (live integration)

**Run (no real RISER_* in env):**

- **Sync:** POST `/api/ai/riser/sync` returned **202** with `configMissing: true` (RISER_API_BASE_URL, RISER_API_KEY, or RISER_POLICY_IDS not set in `apps/api/.env` for the running API).
- **Real Riser sync:** Not run — requires setting real values in `.env` and restarting the API, then re-running sync (UI or `scripts/verify-riser-live.sh`).
- **Failure path (code):** Verified in `riser-policy-sync.service.ts`: 401 → `reason: 'Unauthorized (check RISER_API_KEY)'`; 403 → `reason: 'Forbidden (API key may lack access)'`; 404 → `reason: 'Policy not found'`. Logs include policy ID and snippet. For live 401 test, set `RISER_API_KEY=invalid` and run sync once.
- **Contract:** Auth (x-api-key) confirmed from client/vendor. Endpoint/path and response shape remain **assumed / pending Op Central docs** until a successful live sync is run; then path is confirmed by behaviour.

**After you run with real RISER_* set:**

- Record here: sync result (synced count, one example policy id/title), that GET `/api/ai/documents` included the doc, and that the Admin Knowledge Base UI showed it.
- Then endpoint/path can be stated as **confirmed by live upstream behaviour** (still pending vendor doc citation).
