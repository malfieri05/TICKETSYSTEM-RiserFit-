# Stage 35: Riser Policy API Sync and Chatbot Grounding — Mini-Spec

## 1. Intent

- Replace ad-hoc, admin-uploaded handbook PDFs as the primary chatbot knowledge source with **Riser’s policy/manual API** as the upstream source of truth.
- Keep our existing **pgvector-based RAG architecture** (documents → chunks → embeddings → retrieval → grounded answers), but change **how documents are populated**.
- Make the floating AI chatbot (for **all user types**, including studio, department, and admin) primarily a **policy/manual assistant**:
  - Answer questions conversationally from current Riser policy content.
  - When the policy content does not cover a question, clearly say so and suggest creating a ticket.

## 2. Problem Statement

Today:

- The knowledge base RAG stack assumes **admin-uploaded text / files / PDFs** as the source for handbook content.
- We recently improved ingestion and handbook chat grounding, but:
  - Uploading PDFs via the admin UI is operationally heavy and brittle (file management, parsing issues, duplicate documents).
  - Policy content in Riser is the actual source of truth and is already versioned, reviewed, and curated upstream.
- The floating chatbot and handbook chat UIs:
  - Can query the local RAG index, but their content recency & completeness depend on **manual ingestion** rather than the authoritative policy API.

We need to:

- Introduce a **policy-sync pipeline** from Riser’s API into our knowledge store.
- Keep our DB as the **retrieval** source, while Riser remains the upstream truth.
- Make the chatbot reliably answer from **current Riser policies** and say “not covered” when appropriate, without hallucinations.

## 3. Scope

**In scope**

- Backend:
  - Sync service that pulls policy content from Riser via API and ingests it into `knowledge_documents` / `document_chunks`.
  - Schema extensions to track upstream policy metadata and sync status.
  - RAG retrieval adjustments (filtering, metadata in citations).
- Frontend:
  - Admin Knowledge Base UI changes to expose “Sync from Riser” flows and show policy-level metadata (title, version, review dates, sync status).
  - Chatbot UIs (floating assistant, `/assistant`, `/handbook`) aligned so:
    - They treat **Riser policies** as primary content.
    - They render grounded citations with policy title and useful metadata.
    - They say clearly when policies don’t cover a question and suggest ticket creation.

**Out of scope**

- Replacing pgvector or changing vector DB architecture.
- Per-department/policy scoping, multi-tenant knowledge partitioning.
- Full-blown document lifecycle management or analytics dashboards.
- Live, per-chat calls to Riser’s API (except maybe for rare, admin tools).

## 4. Current Knowledge / RAG Architecture

Summarizing existing design (from Stage 32/34):

- **Data model**
  - `KnowledgeDocument` (`knowledge_documents`):
    - `title`, `sourceType` (`manual` | `file` | `url`), `sourceUrl?`.
    - `s3Key?`, `mimeType?`, `sizeBytes?`.
    - `documentType` (`general` | `handbook`).
    - `isActive`, `ingestionStatus` (`pending` | `indexing` | `indexed` | `failed`), `lastIndexedAt`.
    - `uploadedById`.
  - `DocumentChunk` (`document_chunks`):
    - `documentId`, `chunkIndex`, `content`.
    - `embedding vector(1536)`, `tokenCount`, `createdAt`, `pageNumber?`.
- **Ingestion**
  - Text / `.txt` / `.md`:
    - Synchronous: create `KnowledgeDocument`, split, embed, insert `DocumentChunk`s, set `indexed`.
  - PDF (handbook):
    - Upload to S3, create `KnowledgeDocument` with `documentType='handbook'`, enqueue ingestion job.
    - Worker: fetch PDF, extract text with `pdf-parse`, split, embed, insert chunks, mark `indexed` or `failed`.
- **Retrieval**
  - General chat: RAG across all active `KnowledgeDocument`s.
  - Handbook chat: RAG only over `documentType='handbook'` and `isActive = true`, with conservative thresholds.
- **Chatbot**
  - Backend: `AiService.chat` / `chatHandbook` return `{ answer, sources, usedContext }` with citations.
  - Frontend:
    - `/assistant`: general internal assistant (all users).
    - `/handbook`: handbook-only assistant (studio user–only).
    - Floating assistant in app uses these APIs and surfaces sources.

## 5. Proposed Source-of-Truth Model

**Upstream truth**: Riser policy API (policy content and metadata).

**Local truth for retrieval**: our Postgres + pgvector (`knowledge_documents` + `document_chunks`).

### 5.1 Policy ingestion as primary handbook source

- **Policies from Riser** become the primary “handbook” knowledge:
  - Each upstream policy maps to one `KnowledgeDocument` with `documentType='handbook'` (and a `source`/`provider` tag).
  - Policy HTML body is converted to text and chunked into `DocumentChunk`s.
- **Manual uploads**:
  - Remain supported *only* for:
    - Internal docs not represented in Riser (e.g. internal notes, playbooks).
    - These can stay as `documentType='general'`.
  - PDF uploads are de-emphasized but not necessarily removed, to avoid breaking existing data; they just won’t be the primary handbook flow.

### 5.2 Sync strategy

- Riser remains upstream; we **sync policies down** periodically:
  - Use either a “list policies” API or, if not available, a pre-configured list of policy IDs to fetch.
  - On sync:
    - Create new `KnowledgeDocument`s for new policies.
    - Update existing documents when `version`/`review_on`/`review_due` change.
    - Deactivate or mark superseded policies as inactive when removed or flagged upstream.

## 6. Sync and Ingestion Strategy

### 6.1 Fetching policies from Riser

Assumed (or to be confirmed) upstream endpoints:

- `GET /v1/opdocs/policy/{policy_id}` → returns policy details:
  - `id`, `title`, `content` (HTML), `videos[]`, `attachments[]`, `embedded_pdf`, `version`, `review_on`, `review_due`, etc.
- `GET /v1/opdocs/attachment/{reference}` → fetches specific attachment when needed.
- Ideally: a **list endpoint**, e.g. `GET /v1/opdocs/policies` for pagination; if missing, we must:
  - Either maintain a configured list of policy IDs to sync.
  - Or call an upstream search/list endpoint if available (to be clarified with Riser).

### 6.2 Sync options

- **Mode A — scheduled background sync** (preferred):
  - A scheduled job periodically:
    - Lists policies from Riser.
    - Differs them against our `KnowledgeDocument`s.
    - Enqueues ingestion/re-ingestion jobs for changed policies.
- **Mode B — admin-triggered sync**:
  - Admin UI has a **“Sync from Riser”** button:
    - Kicks off the same sync logic (one-time or on demand).
  - Useful in early stages and for manual control.

We can support both: a periodic sync plus explicit admin “Sync now” trigger using the same underlying service.

### 6.3 Idempotent and selective re-indexing

For each Riser policy:

- Keep upstream metadata in `KnowledgeDocument`:
  - `upstreamProvider = 'riser'`.
  - `upstreamPolicyId`.
  - `upstreamVersion`.
  - `reviewOn`, `reviewDue`.
  - `lastSyncedAt`.
- On sync:
  - If `upstreamPolicyId` is new: create document with `pending` status and enqueue ingestion.
  - If existing document has:
    - Same `upstreamVersion` & same `reviewDue`: skip ingestion.
    - Newer version / changed review dates: re-enqueue ingestion.
  - If a policy is no longer returned by list endpoint:
    - Mark corresponding document as `isActive=false` and possibly `ingestionStatus='superseded'` (or just use a `deletedAt`/`archived` concept).

All ingestion should be **idempotent**:

- For a document, `runIngestionForDocument`:
  - Replaces its chunks with newly parsed ones.
  - Leaves `KnowledgeDocument` stable except for updated metadata & status.

## 7. Data Model / Schema Considerations

Extend `KnowledgeDocument` minimally to support Riser:

- Add fields (names to be finalized, but conceptually):
  - `upstreamProvider: String?` (e.g. `'riser' | 'manual' | 'file' | 'url'`):
    - Existing `sourceType` remains for legacy semantics; `upstreamProvider` clarifies origin.
  - `upstreamId: String?` (Riser `policy_id`).
  - `upstreamVersion: String?` (policy `version`).
  - `reviewOn: DateTime?`.
  - `reviewDue: DateTime?`.
  - `lastSyncedAt: DateTime?`.
  - Optionally a `syncStatus` string (`ok` | `out_of_date` | `error`) if we want to differentiate ingestion vs. sync.

Constraints:

- Add indexes on `upstreamProvider` + `upstreamId` to support fast lookups.
- Preserve backwards compatibility:
  - Legacy documents (manual uploads) simply have no `upstreamProvider`/`upstreamId`.

`DocumentChunk` likely doesn’t need more schema for Riser beyond existing `pageNumber`; attachments/sections can be expressed via content and citations.

## 8. Admin UX / Operational Strategy

### 8.1 Evolving Knowledge Base admin page

- **Add a Riser sync section** above the existing ingest UI:
  - Show:
    - Last sync time.
    - Number of Riser policies synced.
    - Basic status (“Healthy”, “Some policies failed”, etc.).
  - Actions:
    - “Sync from Riser now” (admin-only).
    - Optionally “View sync log” link that surfaces last few errors/warnings.

- **Document list**:
  - Show Riser-backed documents clearly:
    - Indicate source: “Riser policy” vs “Manual” vs “File”.
    - Show `version`, `reviewOn`, `reviewDue` for Riser docs.
  - Continue to show:
    - `ingestionStatus` and `isActive`.
    - Chunks count, size, uploadedBy (for manual docs).

- **Actions for Riser policies**:
  - Toggle active/inactive (to include/exclude a given policy from RAG).
  - Re-index (force re-ingestion of a specific policy).
  - We probably **do not** allow delete for Riser policies via UI:
    - Instead, they become inactive or are logically superseded.

- **Manual ingestion UI**:
  - Demote manual ingest UI (text/file/PDF) visually under a “Advanced / Internal docs” label.
  - Keep it functional for non-Riser content only.

### 8.2 Operational clarity

- Admin help text:
  - State clearly:
    - “Riser policies are the primary source for handbook answers.”
    - “Only documents that are Indexed and Active are used by the assistant.”
  - For manual docs, specify they are **secondary** supplements.

## 9. Retrieval / Chatbot Grounding Strategy

### 9.1 Unified policy-centric RAG for all users

- For most assistant calls (floating chatbot, `/assistant`):
  - Use a retrieval strategy that:
    - Includes Riser policies (`upstreamProvider='riser'`) as the **primary pool**.
    - Optionally also includes other `handbook`/`general` docs, but labels sources so UI can show what’s policy vs internal.
  - For studio handbook-specific chat (`/handbook`):
    - Continue to filter to `documentType='handbook'` and `isActive=true`, which will now be dominated by Riser policies.

### 9.2 Confidence / similarity safeguards

- Reuse and refine existing thresholds:
  - Global threshold from env (`RAG_DISTANCE_THRESHOLD`, capped at a conservative value).
  - Optionally, add a **Riser-specific stricter guard**, e.g.:
    - Only treat matches as “handbook found” if `distance <= strictGuardDistance` (like `0.5 * threshold`) for the top result.
  - If no chunk passes the strict check:
    - Set `usedContext=false`; the answer should **NOT** pretend to be policy-grounded.
    - The model prompt should explicitly say: “The policies do not clearly cover this; suggest they submit a ticket.”

### 9.3 Citations

- For Riser policies:
  - Citations should include:
    - Policy title.
    - Page number if available.
    - Optional snippet/excerpt (already included).
  - UI should show:
    - “Based on: [Policy Title — Page X]”.
  - Where appropriate, we can also include `upstreamId` or `version` in the internal data (not necessarily shown to end users) for debugging.

### 9.4 Non-coverage behavior

- When no high-confidence chunks from Riser policies:
  - The assistant should:
    - Clearly say: “This doesn’t appear to be covered in the policies I have.”
    - Suggest: “You may need to submit a ticket or contact your manager.”
  - Optionally include a “Create Ticket” CTA in the UI where feasible.

## 10. Reliability / Performance Considerations

- **Performance**
  - RAG retrieval remains purely local:
    - No per-chat calls to Riser API.
    - Vector search stays in Postgres/pgvector as before.
  - Sync and ingestion run in background jobs:
    - They can be batched and rate-limited to respect Riser and OpenAI limits.

- **Reliability**
  - Sync jobs should:
    - Be idempotent (re-running does not create duplicate docs/chunks).
    - Mark `syncStatus` and/or `ingestionStatus='failed'` with logs when Riser calls or parsing fail.
  - Dashboard:
    - At minimum, include logs and admin-visible statuses; full dashboards can come later.

- **Scaling**
  - RAG with a few hundred to a few thousand policy documents is well within pgvector capabilities.
  - If Riser returns many small policies:
    - Keep chunking strategy consistent; adjust chunk size only if retrieval quality or performance demands.

## 11. Security / Permission Considerations

- **Riser API credentials**
  - Stored **server-side only** (e.g. `RISER_API_KEY`, `RISER_API_BASE_URL` in `apps/api/.env`).
  - Never exposed to frontend or stored in browser-accessible contexts.
  - Sync jobs call Riser API from the backend only.

- **Admin-only management**
  - Sync controls (manual trigger, viewing sync logs, toggling active policies) remain ADMIN-only.
  - The Knowledge Base admin page is only accessible to admins.

- **Users**
  - All authenticated users may use the floating assistant and `/assistant` to query policies.
  - `/handbook` remains studio-user–specific if desired, but its knowledge base is now Riser-backed.

- **Scope**
  - Policies are company-wide; no per-studio/per-department scoping is introduced here.
  - Future scoping can be layered on later via metadata/filters if required.

## 12. Migration Strategy

### 12.1 Introducing Riser-backed policies

1. **Add Riser-aware ingestion** behind a feature flag:
   - Run a first sync against a subset of policies.
   - Ingest them as `documentType='handbook'`, `upstreamProvider='riser'`.
2. **Validate retrieval and chat behavior**:
   - Confirm that handbook/general chat returns grounded answers with correct citations.
   - Adjust thresholds and prompts as needed.

### 12.2 Transition from PDF uploads

- For existing handbook PDFs:
  - Strategy:
    - Keep them in the DB but:
      - Mark them as `isActive=false` once equivalent Riser policies are ingested and validated.
      - For any policy that doesn’t exist in Riser, keep its handbook PDF active as a fallback.
  - Admin help:
    - Provide a small checklist in the Knowledge Base page:
      - “After Riser policies are synced and validated, deactivate old handbook PDFs to avoid duplicate or conflicting content.”

### 12.3 Avoiding mixed/conflicting knowledge

- During migration, retrieval will see both:
  - Old PDF-based handbook docs.
  - New Riser policies.
- To avoid confusion:
  - Prioritize Riser policies by:
    - Filtering to `upstreamProvider='riser'` for handbook chat where possible.
    - Eventually, turning off PDF-based handbooks once Riser coverage is complete.

## 13. Files / Modules / Services Likely Involved

- **Backend**
  - `apps/api/src/modules/ai/ai.service.ts` (retrieval logic, thresholds, chat handlers).
  - `apps/api/src/modules/ai/ingestion.service.ts` (new ingestion methods for Riser policy HTML).
  - `apps/api/src/modules/ai/ai.controller.ts` (new admin sync endpoints).
  - New `RiserPolicySyncService` / `RiserClient` utility for API calls.
  - `apps/api/prisma/schema.prisma` (`KnowledgeDocument` extensions).
  - Knowledge ingestion worker queue (reused).

- **Frontend**
  - `apps/web/src/app/(app)/admin/knowledge-base/page.tsx` (sync controls, policy metadata, statuses).
  - `apps/web/src/lib/api.ts` (`aiApi` additions for sync endpoints).
  - Assistant UIs:
    - `apps/web/src/app/(app)/assistant/page.tsx`.
    - `apps/web/src/app/(app)/handbook/page.tsx`.
    - Floating assistant component.

## 14. Test / Validation Plan

- **Sync & ingestion**
  - Point to a Riser sandbox or test policies.
  - Run:
    - Manual “Sync from Riser”.
    - Confirm new `KnowledgeDocument` entries for policies, with correct `upstreamId`, `version`, `reviewOn`, `reviewDue`, `lastSyncedAt`.
    - Confirm `document_chunks` populated.
  - Force a policy update upstream:
    - Re-sync and confirm we only re-index changed policies.

- **Chat grounding**
  - Ask questions that:
    - Are clearly answered by specific Riser policies.
    - Are not covered by any policy.
  - Confirm:
    - For covered questions: grounded answers plus correct source titles and page approximations.
    - For uncovered questions: explicit “not in policies” message and suggestion to create a ticket.

- **Performance**
  - Run simple load checks:
    - Many chat queries with no Riser API calls per query.
    - Sync jobs with tens/hundreds of policies; ensure ingestion times remain acceptable.

- **Permissions**
  - Ensure:
    - Only admins can trigger sync/reindex or see sync logs.
    - All authenticated users can query policies via the assistant, but no one can see raw Riser API credentials or manage mappings.

## 15. Acceptance Criteria

- **Source-of-truth alignment**
  - Riser policies are ingested and visible in `knowledge_documents` with clear upstream metadata.
  - Riser is the actual source; our DB is an indexed cache for retrieval.

- **Stable sync**
  - Sync jobs are idempotent, retryable, and only re-index changed policies.
  - Failures are observable (status, logs) without requiring deep code dives.

- **Admin UX**
  - Admins can see Riser policy documents, their versions, review dates, ingestion/sync statuses, and active flags.
  - Admins can trigger sync and reindex in a controlled way.

- **Chatbot behavior**
  - Floating assistant and `/assistant` primarily answer from Riser policies and internal KB, with explicit citations.
  - Handbook chat clearly uses only policy-like documents and behaves conservatively.
  - When policies don’t cover the question, users are clearly told so and guided to ticket creation.

- **Architecture preserved**
  - pgvector/Prisma RAG architecture remains intact; we only extend ingestion and metadata.
  - No per-chat Riser API dependencies; performance remains predictable.

