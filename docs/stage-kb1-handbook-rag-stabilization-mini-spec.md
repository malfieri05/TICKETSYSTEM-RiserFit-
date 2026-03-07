# Stage KB1: Handbook RAG Stabilization — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [Knowledge Base RAG Investigation Report](knowledge-base-rag-investigation-report.md).

---

## 1. Intent

Stabilize and production-harden the **Handbook RAG Bot** (Tier 1) so studio users can reliably get answers from approved Riser Fitness manuals, reducing unnecessary ticket creation. This stage is **scoped only to Tier 1** — the Studio Handbook bot. It does not design or implement the broader Operational AI Assistant (Tier 2).

Goals:

- **Correct database schema** so Prisma and migrations match (fix documentType / updatedAt drift).
- **Persist uploaded PDFs** using the existing S3-compatible storage so documents can be re-indexed without re-upload.
- **Move ingestion off the request path** into a background pipeline (upload → document record → enqueue job → worker: extract text → chunk → embed → store chunks).
- **Enable re-indexing** so admins can re-run ingestion for an existing handbook document.
- **Improve retrieval quality** with reviewed defaults (threshold, TOP_K, handbook-only filtering, grounding behavior).
- **Keep the system simple:** PostgreSQL, pgvector, OpenAI embeddings/completion, modular monolith; no external vector DBs, no web search, no agent tool-calling or advanced reasoning.

---

## 2. Scope

**In scope**

- **A. Tier separation**  
  Design and implement only the **Studio Handbook** flow. Handbook chat remains the sole Tier 1 surface: studio users, handbook documents only, retrieval + answer only. No design work in this stage for the operational assistant (Tier 2).

- **B. Database correction**  
  New migration(s) so the live database schema matches the Prisma schema for the knowledge base. Specifically: ensure `knowledge_documents` has `documentType`, `updatedAt`, and any other columns/indexes defined in Prisma that are missing from the original AI migration. No new tables required unless ingestion status is added (see below).

- **C. PDF persistence**  
  When an admin uploads a handbook PDF, the file is stored in the project’s existing object storage (S3 or S3-compatible per current architecture). Store under a dedicated key prefix (e.g. `handbook/` or `knowledge/`) and persist the key on `KnowledgeDocument.s3Key`. The API upload flow: receive file → upload to S3 → create document record with s3Key → enqueue ingestion job. No retention of PDF in application memory beyond the upload request.

- **D. Background ingestion**  
  Replace synchronous ingestion with an async pipeline:  
  1. Upload PDF → store in S3 → create `KnowledgeDocument` (e.g. status “pending” or “processing”, documentType “handbook”, s3Key set).  
  2. Enqueue a single “handbook ingestion” job (e.g. BullMQ) with payload `{ documentId }`.  
  3. Worker: fetch PDF from S3 (or stream), extract text (pdf-parse), chunk, generate embeddings (OpenAI), delete existing chunks for that document, insert new chunks.  
  4. On success: update document (e.g. status “indexed”, chunk count, lastIndexedAt if added). On failure: update status to “failed” and optionally store error message; consider retry/backoff per queue config.  
  Text extraction, chunking, embedding, and chunk writes all happen in the worker, not in the HTTP request.

- **E. Re-indexing**  
  Admins can trigger “re-index” for an existing handbook document that has an s3Key. API: e.g. `POST /api/ai/documents/:id/reindex` (or equivalent). Behavior: enqueue the same ingestion job for that documentId. Worker re-fetches from S3, re-extracts, re-chunks, re-embeds, replaces chunks. No re-upload required. Optional: show ingestion status (pending / indexing / indexed / failed) in Admin UI and surface last indexed time / error.

- **F. Retrieval quality**  
  Review and specify defaults for handbook RAG:  
  - **Distance threshold:** Current 0.4 (cosine) may be too strict; propose a value (e.g. 0.5 or 0.45) and document the tradeoff (more recall vs noise).  
  - **TOP_K:** Current 8 for handbook; confirm or adjust (e.g. 8–12) so enough context is passed without token bloat.  
  - **Handbook-only:** Retain strict filter `documentType = 'handbook'` and `isActive = true` for handbook chat.  
  - **Answer grounding:** System prompt should instruct the model to answer only from provided context and to state clearly when the answer is not in the handbooks. Specify or refine the handbook system prompt in the mini-spec so implementation is consistent.

- **G. Keep existing core choices**  
  Continue using: PostgreSQL, pgvector, OpenAI text-embedding-3-small and gpt-4o-mini (or current models), current NestJS modular monolith, existing Auth/RBAC. Do not introduce: external vector databases (Pinecone, Weaviate, etc.), web browsing, agent tool-calling, or multi-step reasoning workflows.

- **H. Admin UI and Studio UI expectations**  
  - **Admin Knowledge Base:** Upload handbook PDF (title + file) → document appears in list with status (e.g. “Indexing…” then “Ready” or “Failed”). List shows: title, type (handbook), chunk count, size, uploaded by, date, status, actions: toggle active, re-index, delete. Re-index action available for documents that have s3Key; after trigger, status reflects “Indexing…” until worker completes.  
  - **Studio Handbook chat:** Unchanged entry point (`/handbook`); only studio users. User sends message → backend handbook-chat endpoint → RAG over handbook documents only → answer + optional source citations. Clear, grounded answers; when no relevant context, bot says so and suggests ticket or manager. No web access, no tools.

**Out of scope**

- Tier 2 (Operational AI Assistant): ticket analysis, workflow reasoning, operational recommendations.
- General “assistant” chat that uses all documents (can remain as-is or be deprecated later; not in KB1 scope).
- OCR or image-based PDF extraction for scanned manuals (document as limitation or future work).
- New embedding model or vector DB.
- Streaming responses (optional later).

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **Migrations:** New migration under `apps/api/prisma/migrations/` to add any missing columns/indexes to `knowledge_documents` (e.g. `documentType`, `updatedAt`). If ingestion status is added, add column(s) and optional `lastIndexedAt` / `indexError` (see Schema impact).
- **Prisma schema:** Align with migration; if ingestion status is introduced, add fields to `KnowledgeDocument` (e.g. `ingestionStatus`, `lastIndexedAt`, `indexError`).
- **Queue:** Add a new BullMQ queue (e.g. `handbook-ingestion` or `knowledge-ingestion`) and job payload type in `apps/api/src/common/queue/queue.constants.ts` (or equivalent). Register queue in `WorkersModule`.
- **S3 / storage:** Reuse existing AttachmentsService pattern (S3 client, bucket, credentials) for handbook PDFs. Either extend that service with a “store handbook PDF” method or introduce a small shared storage service used by both attachments and handbook. Key prefix distinct from tickets (e.g. `handbook/<documentId>/<filename>` or `knowledge/<documentId>.pdf`). Files: possibly `attachments.service.ts` or new `apps/api/src/common/storage/` (or under `modules/ai`).
- **AI module – controller:** `apps/api/src/modules/ai/ai.controller.ts`. Change PDF upload: store file to S3, create document record with s3Key and initial status, enqueue ingestion job; return 202 Accepted or 201 with status “indexing”. Add endpoint for re-index (e.g. `POST /api/ai/documents/:id/reindex`). Remove synchronous pdf-parse and ingestText from the upload request.
- **AI module – ingestion service:** `apps/api/src/modules/ai/ingestion.service.ts`. Split responsibilities: (1) “create document + enqueue job” (called from controller); (2) “run ingestion for documentId” (called from worker): fetch PDF from S3, extract text, chunk, embed, delete existing chunks for document, insert new chunks, update document status. The latter may live in a dedicated processor if preferred.
- **Worker:** New processor (e.g. `handbook-ingestion.processor.ts` or `knowledge-ingestion.processor.ts`) in `apps/api/src/workers/processors/`. Job data: `{ documentId: string }`. Processor loads document by id, checks s3Key, fetches object from S3, runs text extraction → chunk → embed → replace chunks, updates document. Handle failures (log, update status, optionally retry).
- **AI service:** `apps/api/src/modules/ai/ai.service.ts`. Adjust handbook retrieval: apply agreed distance threshold and TOP_K; keep handbook-only filter; ensure system prompt matches “answer only from context” and “say when not in handbooks”. listDocuments response should include ingestion status and lastIndexedAt if added.
- **Events / queue producer:** Either AI module or a small service that enqueues the ingestion job (InjectQueue, addJob). File: e.g. within `ai.controller.ts` or `ingestion.service.ts`, or a dedicated queue service used by AI module.

**Frontend (Next.js)**

- **Admin Knowledge Base page:** `apps/web/src/app/(app)/admin/knowledge-base/page.tsx`. After upload, show “Indexing…” until status is updated (poll or refetch list). Add “Re-index” button per document (enabled when document has s3Key / is handbook). Display status column (Indexing / Ready / Failed) and optional last indexed time or error. Handle new API response (e.g. 202, or 201 with status).
- **API client:** `apps/web/src/lib/api.ts`. Add reindex call (e.g. `aiApi.reindexDocument(id)`). Adjust ingestPdf response handling if response shape changes (e.g. documentId + status).
- **Studio Handbook page:** `apps/web/src/app/(app)/handbook/page.tsx`. No functional change required; ensure it continues to call handbook-chat and display answer + sources. Optional: minor copy or loading-state improvements.

**Docs**

- Update `CLAUDE.md` (or stage docs) to describe Tier 1 Handbook RAG, PDF persistence, background ingestion, and re-indexing once implemented.

Exact file list will be finalized in Step B.

---

## 4. Schema Impact

- **Migration to fix drift:** Add a migration that ensures `knowledge_documents` has:
  - `documentType` (TEXT, nullable or with default `'general'`) — used for handbook filter.
  - `updatedAt` (TIMESTAMP(3)) — used by Prisma.
  - Corresponding indexes if defined in Prisma (e.g. `documentType`).  
  Migration must be idempotent or conditional (e.g. ADD COLUMN IF NOT EXISTS where supported, or separate migration that is safe to run once).

- **Optional: ingestion status.** To support “Indexing / Ready / Failed” and re-indexing visibility, consider adding to `knowledge_documents`:
  - `ingestionStatus` — e.g. enum or string: `pending` | `indexing` | `indexed` | `failed`.
  - `lastIndexedAt` — TIMESTAMP(3), nullable; set when worker completes successfully.
  - `indexError` — TEXT, nullable; set when worker fails (e.g. “PDF produced no extractable text” or “OpenAI rate limit”).  
  If these are added, a second migration (or same migration) creates the column(s). Prisma schema updated to match.

- **document_chunks:** No schema change. Existing structure (documentId, chunkIndex, content, embedding, etc.) remains. Worker will DELETE existing chunks for a document before inserting new ones on re-index.

- **S3:** No DB table for “files”; only `s3Key` on `knowledge_documents` pointing to the stored PDF. Same bucket as attachments; key prefix different (e.g. `handbook/` or `knowledge/`).

---

## 5. API Impact

- **POST /api/ai/ingest/pdf**  
  **Current:** Sync parse + full ingest in request; returns 201 with documentId and chunksCreated.  
  **New:** Validate file and title; upload PDF to S3; create `KnowledgeDocument` with s3Key, documentType `handbook`, ingestionStatus `pending` (or `indexing`); enqueue ingestion job; return 201 with documentId and status (e.g. `indexing`). Response body may include `message` such as “Document uploaded. Indexing in progress.”

- **POST /api/ai/documents/:id/reindex**  
  **New:** Admin only. Validate document exists, has s3Key, and is handbook (or allow reindex for any document with s3Key). Enqueue same ingestion job for that documentId. Optionally set ingestionStatus to `indexing` and clear indexError. Return 202 Accepted or 200 with message “Re-indexing started.”

- **GET /api/ai/documents**  
  **Current:** Returns list with id, title, sourceType, mimeType, sizeBytes, documentType, isActive, createdAt, uploadedBy, _count.chunks.  
  **New:** Include ingestionStatus, lastIndexedAt, and optionally indexError so Admin UI can show status and re-index button.

- **POST /api/ai/handbook-chat**  
  No change to path or auth (studio users only). Implementation may use updated retrieval defaults (threshold, TOP_K) and system prompt; response shape unchanged (answer, sources, usedContext).

- **DELETE /api/ai/documents/:id**  
  When deleting a document, optionally delete the object from S3 (using s3Key) before or after deleting the DB record, to avoid orphaned files. Specify in implementation.

- No new public or non-admin endpoints required for KB1. Tier 2 endpoints are out of scope.

---

## 6. Infrastructure Impact

- **S3 (or S3-compatible) storage:** Already in use for ticket attachments. Same bucket and credentials can be used; ensure a distinct key prefix for handbook PDFs (e.g. `handbook/` or `knowledge/`) and that the worker process has read access to those keys. No new bucket or provider required unless operations choose to separate handbook storage.

- **Redis / BullMQ:** Already used for notification and scheduled jobs. Add one new queue (e.g. `handbook-ingestion`). Worker process (existing NestJS workers process) registers the new processor. Configure attempts and backoff for ingestion jobs (e.g. 3 attempts, exponential backoff) so transient failures (e.g. OpenAI rate limit) can retry.

- **PostgreSQL / pgvector:** No new extensions. Existing `knowledge_documents` and `document_chunks` tables and IVFFlat index remain. Migration only adds missing columns (and optionally ingestion status columns). Ensure pgvector extension is enabled (already in AI migration).

- **OpenAI:** No change to usage pattern: embeddings and chat completion. Ensure OPENAI_API_KEY is set in the environment where the worker runs (same as API if workers run in same process, or in worker-only env).

- **Deployment:** Worker process must have network access to S3 and OpenAI. If workers run on a separate node, ensure it has the same env (S3_*, OPENAI_API_KEY) and can reach Postgres and Redis. No new infrastructure components.

---

## 7. Risks

- **PDF text extraction in worker:** pdf-parse may still return empty or poor text for scanned/image PDFs. Worker should set status to `failed` and store a clear indexError (e.g. “PDF produced no extractable text”) so admins see the failure. OCR is out of scope for KB1 but can be documented as a limitation.

- **Large PDFs and timeouts:** Worker job may run long for large manuals. Configure BullMQ job timeout (e.g. 5–10 minutes) and consider chunking the PDF or processing in stages if a single job is insufficient later. Not required for initial design.

- **S3 key and document lifecycle:** If document is deleted, S3 object should be removed to avoid orphaned storage. Design delete flow to call S3 DeleteObject when s3Key is present.

- **Re-index thundering:** If many admins trigger re-index at once, queue may back up. Use same queue with concurrency limit (e.g. 1–2 concurrent ingestion jobs) to avoid OpenAI rate limits and DB load. Document in runbook.

- **Retrieval quality:** Relaxing distance threshold (e.g. 0.4 → 0.5) may include noisier chunks. Recommend A/B or spot-checks after deployment; keep threshold configurable (e.g. env var) so it can be tuned without code change.

- **Schema migration on existing DBs:** If some environments already have documentType/updatedAt (e.g. from db push), migration must be idempotent or skip existing columns to avoid errors.

---

## 8. Test Plan

- **Unit (backend):**  
  - Ingestion worker: given a mock S3 PDF buffer and mock OpenAI embeddings, assert chunks are created and document status updated.  
  - Re-index: assert job is enqueued with correct documentId; worker re-runs ingestion and replaces chunks.  
  - Document create with s3Key and status; list documents includes status and lastIndexedAt.

- **Integration / API:**  
  - POST ingest/pdf: returns 201, document has s3Key and pending/indexing status; job appears in queue (or mock).  
  - POST documents/:id/reindex: returns 202/200, job enqueued; after worker run, status indexed and chunks updated.  
  - GET documents: response includes ingestionStatus (and lastIndexedAt if added).  
  - Handbook-chat: with indexed handbook docs, returns answer and sources when query matches; returns “not in handbooks” style message when no chunks under threshold.  
  - Auth: ingest and reindex admin-only; handbook-chat studio-only.

- **Manual / E2E:**  
  - Admin: upload PDF → see “Indexing…” → after worker completes, see “Ready” and chunk count; trigger re-index → see “Indexing…” then “Ready” again.  
  - Studio user: open Handbook, ask a question that matches manual content → get grounded answer with sources; ask off-topic question → get clear “not in handbooks” response.  
  - Delete document → confirm S3 object removed (or document no longer listed and chunks gone).

- **Non-functional:**  
  - Worker completes a typical handbook PDF (e.g. 20–50 pages) within acceptable time (e.g. under 2 minutes).  
  - No ingestion logic runs in the HTTP request path for PDF upload (only S3 upload + create + enqueue).

---

## Summary

| Area | Deliverable |
|------|-------------|
| **Tier scope** | Tier 1 only: Studio Handbook RAG Bot. No Tier 2 design. |
| **Database** | Migration(s) to fix schema drift (documentType, updatedAt); optional ingestionStatus, lastIndexedAt, indexError. |
| **PDF persistence** | Upload PDF to S3 (existing stack), store s3Key on KnowledgeDocument. |
| **Background ingestion** | Upload → S3 + create doc + enqueue job → worker: fetch from S3, extract text, chunk, embed, replace chunks, update status. |
| **Re-indexing** | POST reindex endpoint; worker re-runs ingestion for documentId using s3Key. |
| **Retrieval** | Agreed defaults for threshold, TOP_K; handbook-only filter; grounding prompt. |
| **Admin UI** | Upload, list with status, re-index button, toggle, delete. |
| **Studio UI** | Handbook chat unchanged; clear, grounded answers. |
| **Infrastructure** | Same S3, Redis/BullMQ, Postgres; one new queue and worker processor. |

---

*Mini-spec only. No implementation. No code. No file changes beyond adding this document.*
