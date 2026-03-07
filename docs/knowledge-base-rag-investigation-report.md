# Knowledge Base / RAG — Technical Investigation Report

**Date:** Investigation only. No code changes. No fixes implemented.

**Goal:** Determine why the Admin Knowledge Base (PDF manuals for Riser Fitness) is not working correctly for the chatbot.

---

## STEP 1 — Locate Knowledge Base Code

### Backend files

| File | Purpose |
|------|--------|
| `apps/api/src/modules/ai/ai.module.ts` | AI module wiring (AiService, IngestionService, AiController). |
| `apps/api/src/modules/ai/ai.controller.ts` | HTTP API: chat, handbook-chat, documents CRUD, ingest/text, ingest/file, ingest/pdf, toggle, delete. |
| `apps/api/src/modules/ai/ai.service.ts` | RAG: embed query, pgvector similarity search, build context, OpenAI chat completion; list/toggle/delete documents. |
| `apps/api/src/modules/ai/ingestion.service.ts` | Ingest text: create document, split into chunks, embed via OpenAI, insert chunks (raw SQL) into `document_chunks`. |
| `apps/api/src/modules/ai/dto/ai.dto.ts` | DTOs for chat and ingest (referenced by controller). |

### Frontend files

| File | Purpose |
|------|--------|
| `apps/web/src/app/(app)/admin/knowledge-base/page.tsx` | Admin Knowledge Base UI: ingest (text / file / PDF), list documents, toggle active, delete. |
| `apps/web/src/app/(app)/assistant/page.tsx` | Main AI Assistant chat UI; calls `aiApi.chat()` (all active documents). |
| `apps/web/src/app/(app)/handbook/page.tsx` | Studio-only Handbook chat UI; calls `aiApi.handbookChat()` (handbook documents only). |
| `apps/web/src/lib/api.ts` | `aiApi`: chat, handbookChat, listDocuments, ingestText, ingestFile, ingestPdf, toggleDocument, deleteDocument. |
| `apps/web/src/components/ai/AiChatWidget.tsx` | Reusable chat widget (if used elsewhere). |

### Database models

- **KnowledgeDocument** — `apps/api/prisma/schema.prisma` (model `KnowledgeDocument`, table `knowledge_documents`).
- **DocumentChunk** — same file (model `DocumentChunk`, table `document_chunks`).

### Background jobs

- **None.** Ingestion is synchronous in the API process (upload → parse → chunk → embed → insert in the same request). No BullMQ/worker pipeline for knowledge base.

### Storage locations

- **PDF bytes:** Not persisted to disk or S3. PDF is received in memory (`FileInterceptor` + `memoryStorage()`), parsed with `pdf-parse`, then only the extracted **text** is passed to `ingestionService.ingestText()`. No separate “PDF storage.”
- **Document metadata and chunk text/embeddings:** Stored only in **PostgreSQL** (tables `knowledge_documents`, `document_chunks`).

---

## STEP 2 — Database Schema

### Table: `knowledge_documents` (model `KnowledgeDocument`)

| Field | Type | Notes |
|-------|------|--------|
| id | TEXT (cuid) | PK |
| title | TEXT | Required |
| sourceType | TEXT | Default `'manual'` — e.g. manual, file, url |
| sourceUrl | TEXT | Nullable |
| s3Key | TEXT | Nullable (not used for current PDF path) |
| mimeType | TEXT | Nullable |
| sizeBytes | INT | Nullable |
| isActive | BOOLEAN | Default true |
| **documentType** | **TEXT** | **Nullable, default 'general'. Values: 'general' \| 'handbook'.** |
| uploadedById | TEXT | FK → users.id |
| createdAt | TIMESTAMP(3) | |
| updatedAt | TIMESTAMP(3) | |

**Indexes:** uploadedById, isActive, **documentType** (per Prisma schema).

**Relations:** User (uploadedBy), DocumentChunk[] (chunks).

**Important:** The **initial migration** `20260302210000_add_ai_knowledge_base/migration.sql` does **not** create `documentType` or `updatedAt`. Those columns exist only in the current **Prisma schema**. So there is **schema drift**: the migration history does not add these columns. If the database was created only from that migration, `documentType` (and possibly `updatedAt`) would be **missing**, causing document create and handbook query to fail.

---

### Table: `document_chunks` (model `DocumentChunk`)

| Field | Type | Notes |
|-------|------|--------|
| id | TEXT (cuid) | PK |
| documentId | TEXT | FK → knowledge_documents.id (CASCADE delete) |
| chunkIndex | INT | Order of chunk in document |
| content | TEXT | Chunk text |
| embedding | vector(1536) | pgvector; nullable in schema, filled on ingest |
| tokenCount | INT | Default 0 |
| createdAt | TIMESTAMP(3) | |

**Indexes:** documentId; **IVFFlat** on `embedding` using `vector_cosine_ops` with `lists = 100` (for approximate nearest-neighbor).

**Relations:** KnowledgeDocument (document).

---

## STEP 3 — Upload Pipeline (What Happens When an Admin Uploads a PDF)

1. **Upload endpoint**  
   `POST /api/ai/ingest/pdf` (Admin only).  
   File: `apps/api/src/modules/ai/ai.controller.ts` — `ingestPdf()` with `FileInterceptor('file', { storage: memoryStorage(), limits: 15MB, fileFilter: PDF only })`.

2. **Storage of PDF**  
   **In-memory only.** Multer stores the file in `file.buffer`. There is **no** write to S3 or local disk. The PDF is not stored for later re-extraction.

3. **Text extraction**  
   In the same request:  
   `const pdfParse = require('pdf-parse');`  
   `const data = await pdfParse(file.buffer);`  
   `const text = data?.text?.trim() ?? '';`  
   If `text` is empty, controller throws: `BadRequestException('PDF produced no extractable text')`.  
   So: **PDF parsing is synchronous, in-process, via `pdf-parse`.** Image-only or poorly encoded PDFs often yield no/minimal text and will fail here.

4. **Chunking**  
   Controller calls `ingestionService.ingestText(title, text, userId, { sourceType: 'file', mimeType: 'application/pdf', sizeBytes, documentType: 'handbook' })`.  
   In **IngestionService.ingestText()**:  
   - Create `KnowledgeDocument` (Prisma) with `documentType: 'handbook'` (and other metadata).  
   - `splitIntoChunks(content)` — 1200 chars per chunk, 150 char overlap; drops chunks with length ≤ 20.  
   - Chunking is in-memory; no separate “chunk storage” other than the DB.

5. **Embedding generation**  
   In **IngestionService**: batches of 20 chunks, `embedBatch(batch)` → OpenAI `text-embedding-3-small` (1536 dimensions).  
   If `OPENAI_API_KEY` is missing, `openai` is null and `embedBatch()` throws when called.

6. **Vector storage**  
   In **IngestionService**: for each chunk, `prisma.$executeRaw` INSERT into `document_chunks` with `id`, `documentId`, `chunkIndex`, `content`, `embedding` (as `[x,y,...]::vector`), `tokenCount`, `createdAt`.  
   All inserts are done in the same request (no background job). No Redis or other vector store; **only Postgres/pgvector**.

**End-to-end:** Admin selects PDF and title in UI → POST to `/api/ai/ingest/pdf` → PDF in memory → pdf-parse → text → ingestText → create row in `knowledge_documents` → split into chunks → for each batch of 20: get embeddings from OpenAI → INSERT into `document_chunks`. Response returns `documentId` and `chunksCreated`.

---

## STEP 4 — Retrieval Pipeline (When the Chatbot Answers a Question)

**Main assistant** (`/assistant`) uses **POST /api/ai/chat** → `AiService.chat()`.  
**Handbook** (`/handbook`) uses **POST /api/ai/handbook-chat** → `AiService.chatHandbook()` (studio users only).

### Steps (shared except for filter)

1. **User sends message**  
   Frontend: `aiApi.chat(message)` or `aiApi.handbookChat(message)`.  
   Backend: `AiService.chat(userMessage)` or `AiService.chatHandbook(userMessage)`.

2. **Query embedding**  
   `this.ingestion.embedOne(userMessage)` → OpenAI `text-embedding-3-small` → returns `number[]` (1536 dims).  
   File: `apps/api/src/modules/ai/ai.service.ts` (and `ingestion.service.ts` for `embedOne`).

3. **Vector search**  
   `this.prisma.$queryRaw` with raw SQL:  
   - Tables: `document_chunks` dc, `knowledge_documents` kd.  
   - Condition: `kd.isActive = true`, `dc.embedding IS NOT NULL`, and **cosine distance** `dc.embedding <=> $vector < 0.4` (DISTANCE_THRESHOLD).  
   - **chat():** no documentType filter (all active docs).  
   - **chatHandbook():** `AND kd."documentType" = 'handbook'`.  
   - Order: distance ASC.  
   - Limit: TOP_K = 5 (chat) or TOP_K_HANDBOOK = 8 (handbook).  
   File: `apps/api/src/modules/ai/ai.service.ts` (lines 58–72 for chat, 133–151 for handbook).

4. **Relevant chunks**  
   Result is an array of `ChunkRow` (id, content, document_id, document_title, distance).  
   If the DB has no `documentType` column, the handbook query fails at this step with a SQL error.

5. **Context to OpenAI**  
   Chunks are formatted as:  
   `[Source N: title]\n{content}` joined with `\n\n---\n\n`.  
   System prompt instructs the model to answer **only** from this context (or say so if not found).  
   File: `ai.service.ts` (system prompt construction and `openai.chat.completions.create`).

6. **OpenAI call**  
   Model: `gpt-4o-mini`. Messages: system (with context or fallback) + user message. Temperature 0.2, max_tokens 800.  
   Response: `answer`, and frontend also gets `sources` and `usedContext`.

**Exact functions:**  
- **Embed:** `IngestionService.embedOne()` → `embedBatch([text])`.  
- **Search:** `AiService.chat()` / `AiService.chatHandbook()` — single `$queryRaw` each.  
- **Context + LLM:** same methods build `systemPrompt` and call `this.openai.chat.completions.create()`.

---

## STEP 5 — Identify Failure Points

### 1. **Schema drift: missing `documentType` (and possibly `updatedAt`)**

- **Evidence:** Migration `20260302210000_add_ai_knowledge_base/migration.sql` creates `knowledge_documents` **without** `documentType` or `updatedAt`. The current Prisma schema **has** these fields.
- **Impact:**  
  - If the DB was created only from migrations, `prisma.knowledgeDocument.create(..., documentType: 'handbook')` can fail (column missing).  
  - `chatHandbook()` uses `AND kd."documentType" = 'handbook'` — if the column does not exist, the raw query throws (e.g. column "documentType" does not exist).  
- **Result:** PDF ingest can fail on document create; handbook chat can fail on vector search. General chat (no documentType filter) could still work if the table otherwise exists.

### 2. **PDF text extraction**

- **Implementation:** `pdf-parse(file.buffer)` in the controller. No fallback for image-based or scanned PDFs.
- **Impact:** If the PDF is scanned or image-only, `data.text` is empty or negligible → controller throws “PDF produced no extractable text” and the document is never created.
- **Result:** Some “PDF manuals” may never be ingestible with the current stack unless they are text-based or OCR is added.

### 3. **OPENAI_API_KEY**

- **Implementation:** AiService and IngestionService read `OPENAI_API_KEY` from config. If unset, `_openai` is null and any call to `embedOne`/`embedBatch` or chat completion throws.
- **Impact:** No key → ingest fails at embedding; chat/handbookChat fail at query embedding (or at completion).
- **Result:** Entire RAG and handbook flow fails in environments where the key is missing.

### 4. **pgvector extension**

- **Implementation:** Migration runs `CREATE EXTENSION IF NOT EXISTS vector;` and creates `vector(1536)` column and IVFFlat index.
- **Impact:** If the extension was never run (e.g. different DB, or migration not applied), `vector` type and `<=>` operator do not exist → raw queries fail.
- **Result:** Vector search and chunk inserts fail until pgvector is enabled.

### 5. **Distance threshold and empty context**

- **Implementation:** DISTANCE_THRESHOLD = 0.4 (cosine). Only chunks with distance < 0.4 are returned; max 5 or 8 chunks.
- **Impact:** If no chunk is similar enough (e.g. query wording doesn’t match manual wording), `chunks.length === 0` → `usedContext = false` and the model gets a generic “no documentation” system prompt. Answers will not be grounded in the manuals.
- **Result:** Users may get “I don’t have specific documentation” even when relevant content exists, if threshold or chunk quality is off.

### 6. **No handbook-specific entry point in main Assistant**

- **Implementation:** `/assistant` uses `aiApi.chat()` (all active documents). `/handbook` uses `aiApi.handbookChat()` (documentType = 'handbook' only).
- **Impact:** If studio users are told to use “the chatbot” and they use `/assistant`, they get general RAG (all docs). If handbook PDFs are the only ingested content and are stored as `documentType = 'handbook'`, both endpoints search the same chunks; but if `documentType` column is missing, handbook endpoint fails and only `/assistant` might still work (if the table has no documentType filter and no such column). If documentType exists and only handbook docs exist, both behave similarly for content; the main difference is access control (handbook is studio-only) and prompt wording.
- **Result:** Confusion or “handbook not working” if users use the wrong page or if handbook query fails due to schema/column issues.

### 7. **Ingestion is synchronous and in-process**

- **Implementation:** Full pipeline (parse → chunk → embed → insert) runs inside the HTTP request. No queue, no worker.
- **Impact:** Large PDFs or many chunks can hit timeouts or rate limits (OpenAI). No retry or resume; partial state (e.g. document created but some chunk inserts failed) is possible.
- **Result:** Unreliable ingest for larger manuals or under load.

---

## STEP 6 — Storage Architecture

| What | Where | Notes |
|------|--------|--------|
| **PDF files** | **Not stored** | Only kept in memory during the request; then discarded. Only extracted text is persisted. |
| **Document metadata** | **PostgreSQL** | Table `knowledge_documents`. |
| **Text chunks** | **PostgreSQL** | Table `document_chunks`, column `content`. |
| **Embeddings** | **PostgreSQL (pgvector)** | Table `document_chunks`, column `embedding` (vector(1536)). |
| **S3** | **Not used for knowledge base** | `s3Key` exists on the model but is not set by the current PDF or file ingest path. |
| **Redis** | **Not used for RAG** | No cache of embeddings or search results. |
| **Local disk** | **Not used for knowledge base** | No file system path for PDFs or chunks. |

So: **documents and embeddings live only in Postgres;** PDFs are not stored anywhere after processing.

---

## STEP 7 — Admin UI Behavior

- **Upload PDF:** Mode “Handbook PDF” → file + title → form submit → `aiApi.ingestPdf(title, file)` → `POST /api/ai/ingest/pdf`. Success shows “Ingested … — N chunks created”; failure shows “Ingestion failed. Check the API logs.”
- **List documents:** `GET /api/ai/documents` on load and after ingest/delete/toggle. Table shows: Title, Type (source), Doc type (Handbook/General), Chunks, Size, Uploaded by, Added, Status (Active/Disabled), actions.
- **Delete documents:** Button → `window.confirm` → `aiApi.deleteDocument(id)` → `DELETE /api/ai/documents/:id`. Document and chunks are removed (cascade).
- **Toggle active:** Eye/EyeOff → `aiApi.toggleDocument(id, !isActive)`. Only affects retrieval (isActive = false excludes doc from RAG); no re-indexing.
- **Trigger indexing:** **There is no separate “index” action.** Indexing is **automatic** and **synchronous** at upload time (text/file/PDF). No “Re-index” or background job; to “re-index” a document you would have to delete it and re-upload (or add a new feature).

---

## STEP 8 — Summary

### Current architecture

- **RAG pipeline:** User question → embed query (OpenAI) → similarity search in Postgres (pgvector, cosine, threshold 0.4) → top 5/8 chunks → build context string → GPT-4o-mini with context → return answer + sources.
- **Ingest pipeline:** Upload (PDF/text/file) → in-memory only for PDF → pdf-parse (PDF) or raw text → create `KnowledgeDocument` → chunk (1200 chars, 150 overlap) → embed in batches of 20 (OpenAI) → INSERT into `document_chunks` in same request. No background jobs; no persistent PDF storage.
- **Two chat entry points:** `/assistant` (all users, all active docs) and `/handbook` (studio users only, `documentType = 'handbook'`).

### What exists

- End-to-end RAG: embed, pgvector search, context, OpenAI completion.
- Admin UI: upload text/file/PDF, list, toggle active, delete.
- PDF ingest path with `documentType: 'handbook'`.
- Handbook chat endpoint and `/handbook` page.
- Tables and IVFFlat index in place (in migration and schema).

### What is broken or risky

1. **Schema drift:** Migration does not add `documentType` (or `updatedAt`) to `knowledge_documents`. If the DB was built only from that migration, document create and handbook query will fail; general chat may still work if the table exists without that column.
2. **PDFs with no extractable text** (e.g. scanned) always fail ingest with “PDF produced no extractable text”.
3. **Missing OPENAI_API_KEY** breaks both ingest and chat.
4. **Strict distance threshold (0.4)** can yield no chunks and generic answers even when relevant content exists.
5. **No persistent PDF storage** — cannot re-extract or re-chunk without re-upload.
6. **Synchronous ingest** — risk of timeouts and partial failures for large uploads; no retry.

### What must be rebuilt or fixed

- **Database:** Add a migration that creates `documentType` (and `updatedAt` if missing) on `knowledge_documents` so Prisma and raw SQL match. Verify migration history on all environments.
- **PDF path:** Either accept that only text-based PDFs work, or add OCR/image extraction for scanned manuals.
- **Operational:** Ensure `OPENAI_API_KEY` and pgvector extension are configured and that handbook and assistant are used with the correct entry points.
- **Quality:** Consider tuning threshold (and TOP_K) and/or chunk size/overlap so handbook content is actually retrieved for typical questions.

### What can be reused

- **AiService** (chat + handbookChat), **IngestionService** (ingestText, chunking, embed, raw chunk insert), **AiController** (endpoints), and **Admin + Assistant + Handbook** UI and API client are all in place and coherent. The design (pgvector, single request ingest, two chat modes) is reusable once schema and env are correct and PDF/retrieval behavior are aligned with expectations.

---

*Investigation only. No code or configuration was modified.*
