# Migration recovery: 20260309000000_remove_legacy_categories + Riser columns

## 1. Migration recovery diagnosis

### Failed migration: `20260309000000_remove_legacy_categories`

- **What it does:** Drops legacy `tickets.category_id` and `categories` table (taxonomy is now support topics + maintenance categories).
- **Why it failed:** The migration SQL uses **snake_case** names (`tickets_category_id_fkey`, `category_id`, `tickets_category_id_idx`, `tickets_status_category_id_idx`). The actual database uses **camelCase** (Prisma default): `tickets_categoryId_fkey`, column `categoryId`, indexes `tickets_categoryId_idx`, `tickets_status_categoryId_idx`.
- **What actually ran before failure:**
  - `DROP CONSTRAINT IF EXISTS "tickets_category_id_fkey"` → no-op (real constraint is `tickets_categoryId_fkey`).
  - `DROP INDEX IF EXISTS "tickets_category_id_idx"` and `tickets_status_category_id_idx` → no-op (real names use `categoryId`).
  - `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "category_id"` → no-op (real column is `categoryId`).
  - `DROP TABLE IF EXISTS "categories"` → **failed**: table exists and is still referenced by `tickets_categoryId_fkey`.
- **Current DB state (verified):**
  - `tickets` still has column `categoryId` and FK `tickets_categoryId_fkey`; indexes `tickets_categoryId_idx`, `tickets_status_categoryId_idx` exist.
  - Table `categories` exists.
  - No partial or half-dropped state; the migration made no effective change before failing.

### Pending migrations (blocked until failed one is resolved)

1. **20260310183000_add_page_number_to_document_chunks** — adds `pageNumber` to `document_chunks`.
2. **20260311110000_add_riser_fields_to_knowledge_documents** — adds `upstreamProvider`, `upstreamId`, `upstreamVersion`, `reviewOn`, `reviewDue`, `lastSyncedAt` and index on `knowledge_documents`.

### Dependencies

- No later migration depends on the *success* of `remove_legacy_categories`; they are independent. Resolving the failed migration and deploying will apply the two pending migrations in order.

### Safe recovery strategy

- **Do not** use `migrate resolve --rolled-back` and then re-run the same migration file: it would no-op again (snake_case vs camelCase) and leave the DB unchanged; we’d still need a manual fix.
- **Do:** Manually apply the *intent* of the migration using the **actual** DB object names, then mark the migration as applied so Prisma considers it done, then run `migrate deploy` to apply the two pending migrations.

---

## 2. DB state inspection (summary)

| Check | Result |
|-------|--------|
| `_prisma_migrations` | `20260309000000_remove_legacy_categories` has `finished_at: null`, `applied_steps_count: 0`, logs show "cannot drop table categories... tickets_categoryId_fkey". |
| `knowledge_documents` columns | **Missing Riser columns:** `upstreamProvider`, `upstreamId`, `upstreamVersion`, `reviewOn`, `reviewDue`, `lastSyncedAt`. Present: id, title, sourceType, sourceUrl, s3Key, mimeType, sizeBytes, isActive, uploadedById, createdAt, updatedAt, documentType, ingestionStatus, lastIndexedAt. |
| `tickets.category_id` / `categoryId` | Column exists as `categoryId`. |
| `categories` table | Exists. |
| Remnants of partial apply | None; only the table drop was attempted and it failed. |

---

## 3. Exact recovery commands

### Step 1: Manual fix (apply intent of failed migration with correct names)

Run the following SQL **once** against the target database. This is idempotent (IF EXISTS / IF NOT EXISTS).

```sql
-- Drop FK (actual name in DB)
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_categoryId_fkey";

-- Drop indexes (actual names in DB)
DROP INDEX IF EXISTS "tickets_categoryId_idx";
DROP INDEX IF EXISTS "tickets_status_categoryId_idx";

-- Drop column
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "categoryId";

-- Drop legacy table
DROP TABLE IF EXISTS "categories";
```

**Why this is safe:** It only drops the legacy category FK, column, indexes, and table. No data from other tables is modified. The application and Prisma schema already use taxonomy (support topics / maintenance categories), not `categories`.

**Verify after Step 1:**  
- `tickets` has no `categoryId` column and no FK to `categories`.  
- Table `categories` does not exist.

### Step 2: Mark the failed migration as applied

From `apps/api`:

```bash
npx prisma migrate resolve --applied "20260309000000_remove_legacy_categories"
```

**Why this is safe:** The DB state now matches the *intent* of that migration; we applied it manually with the correct object names. Marking it as applied tells Prisma not to run the migration file again and unblocks the migration chain.

**Verify after Step 2:**  
- `npx prisma migrate status` should list only the two pending migrations (no failed migration).

### Step 3: Apply pending migrations

```bash
npx prisma migrate deploy
```

**Why this is safe:** Applies only the two pending migrations (page_number, then Riser fields). No destructive changes to existing data.

**Verify after Step 3:**  
- `knowledge_documents` has columns: `upstreamProvider`, `upstreamId`, `upstreamVersion`, `reviewOn`, `reviewDue`, `lastSyncedAt`.  
- `document_chunks` has `pageNumber`.  
- `npx prisma migrate status` reports database is up to date.

### Step 4: Regenerate Prisma client (if not already done)

```bash
npx prisma generate
```

**Verify:** No errors; client includes `KnowledgeDocument` with Riser fields.

---

## 4. Data-risk warnings

- **Backup:** For production, take a DB backup or snapshot before running Step 1. For dev, optional but recommended.
- **Legacy category data:** Dropping `categories` removes that table and any rows. Ensure no application code or reports depend on it (per project brief, taxonomy is now ticket_form_schemas / support topics / maintenance categories).
- **Rollback:** There is no automated rollback. If you need to undo Step 1, you would need to recreate `categories` and `tickets.categoryId` from a backup; the migration file does not recreate them.

---

## 5. Post-recovery verification

After completing Steps 1–4:

1. **GET /api/ai/documents** — Must return **200** with payload shape: array of documents (id, title, sourceType, uploadedBy, _count.chunks, etc.). No 500 from missing columns.
2. **knowledge_documents query path** — List and filter by isActive/documentType/ingestionStatus work; Riser fields (upstreamProvider, upstreamId, etc.) are optional and present in the schema.
3. **Riser sync** — With valid `RISER_*` env (base URL, API key, policy ID), run at least one sync from Admin → Knowledge Base (or the sync endpoint); it should complete without schema/column errors.

---

## 6. Contract status (Op Central)

- **Auth:** Confirmed (x-api-key header from client/vendor).
- **Endpoint/path:** Current configured path; **pending confirmation from Op Central docs**.
- **Response shape:** Inferred / defensive until vendor docs confirm.

These labels remain in code (`riser-policy-sync.service.ts`) and are unchanged by this recovery.

---

## 7. Post-recovery verification results (executed)

| Check | Result |
|-------|--------|
| **Schema state** | `knowledge_documents` has all Riser columns: upstreamProvider, upstreamId, upstreamVersion, reviewOn, reviewDue, lastSyncedAt. `document_chunks` has pageNumber. |
| **GET /api/ai/documents** | **200 OK.** Payload shape: array of documents (id, title, sourceType, uploadedBy, _count.chunks, Riser fields, etc.). Verified with admin JWT after recovery; response was `[]` (no documents in DB) — correct shape. |
| **knowledge_documents query path** | listDocuments() runs without error; select includes all Riser fields and relations. |
| **Riser sync with real policy** | Not run in this pass (RISER_* env not set). Config-missing and error-handling paths verified in code. Once RISER_API_BASE_URL, RISER_API_KEY, and policy ID are set, one full sync should be run and confirmed in Admin → Knowledge Base. |

---

## 8. Deliverables summary

1. **Migration recovery diagnosis** — Documented above: failed migration used snake_case names while DB uses camelCase; manual fix applied with correct names; migration marked applied; deploy applied page_number and Riser migrations.
2. **Exact recovery commands** — Step 1: run `prisma/scripts/run-recovery-manual-fix.sql` (or the SQL in this doc). Step 2: `npx prisma migrate resolve --applied "20260309000000_remove_legacy_categories"`. Step 3: `npx prisma migrate deploy`. Step 4: `npx prisma generate`.
3. **Schema-state verification** — Riser columns and pageNumber confirmed present; migration history clean.
4. **GET /api/ai/documents** — Verified **200** with correct payload shape after recovery.
5. **Real Riser sync** — Not executed (no RISER_* in env). Use **docs/live-riser-verification.md** and **scripts/verify-riser-live.sh** to run one sync after setting env and confirm document appears in Knowledge Base.
6. **Vendor-confirmation gaps** — Op Central base URL and path (`GET {baseUrl}/v1/opdocs/policy/{policyId}`), response field names and optional fields, and any list endpoint remain **pending confirmation from Op Central docs**; auth is confirmed.
