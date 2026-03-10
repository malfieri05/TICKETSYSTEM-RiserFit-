# Stage 34: Knowledge Base PDF Ingestion and Chatbot Grounding — Mini-Spec

## 1. Intent

- Make the **knowledge-base + handbook PDF ingestion + chatbot grounding** feature fully functional, reliable, and production-ready.
- Ensure **studio users** can ask the AI assistant handbook/process questions and:
  - Get grounded answers from uploaded handbooks/manuals when possible.
  - Be clearly told when the answer is not present, with a gentle suggestion to create a ticket.
- Build on the existing RAG architecture (pgvector, `knowledge_documents`, `document_chunks`, `AiService`, `IngestionService`) without rewriting core systems.

## 2. Problem Statement

Current state (from code and prior stages):

- Admins can upload knowledge documents via the **Knowledge Base** admin page:
  - Paste text.
  - Upload `.txt`/`.md` files.
  - Upload PDFs for handbooks.
- There is a functioning ingestion pipeline:
  - For text and text files: synchronous split, embed, and store chunks.
  - For PDFs: upload to S3, create `KnowledgeDocument`, enqueue ingestion job, worker later fetches PDF and indexes text.
- There is a RAG-based chat service:
  - `AiService.chat` (general knowledge).
  - `AiService.chatHandbook` (handbook-only, used by `/ai/handbook-chat`).
- The admin UI lists documents and exposes basic management actions.

However:

- The **studio-user flow** (handbook-first chatbot, then ticket) is not yet fully polished or tightly integrated into ticket creation.
- The **PDF ingestion + status UX** still feels “developer-level” rather than production-ready (e.g. indexing status, reindex behavior, error visibility).
- We need to confirm and tighten:
  - Handbook grounding behavior and guardrails (avoid hallucinated policy answers).
  - Ingestion reliability (PDF parsing, chunking, retries).
  - Clear separation between “answer from handbook” vs “I don’t know, create a ticket”.

This spec defines the incremental work to elevate this feature to a **senior dev, production-quality** level without rewrites.

## 3. Scope

**In scope**

- Admin knowledge-base management:
  - Uploading and ingesting handbook PDFs.
  - Listing, toggling active/inactive, reindexing, and deleting documents.
  - Surface ingestion status and basic errors clearly in the UI.
- Backend ingestion and RAG behavior:
  - PDF → S3 → text extraction → chunking → embeddings → `document_chunks`.
  - Handbook-only retrieval (`chatHandbook`) and answer construction.
  - Guardrails and fallbacks when no relevant chunks exist.
- Studio-user experience:
  - Using the **handbook chatbot** as the first line of support for handbook/process questions.
  - Basic guidance for when to proceed to ticket creation.

**Out of scope**

- Redesigning the AI architecture, embedding model, or switching away from pgvector.
- Multi-tenant or fine-grained department/location-scoped knowledge bases.
- Deep analytics or content lifecycle management (versioning, approvals).

## 4. Current Knowledge Base / Chatbot Architecture

### 4.1 Data model

- `KnowledgeDocument` (`knowledge_documents` table):
  - `id`, `title`, `sourceType` (`manual` | `file` | `url`), `sourceUrl?`.
  - `s3Key?` for file-based documents (e.g. `knowledge/<id>.pdf`).
  - `mimeType?`, `sizeBytes?`.
  - `isActive` (soft on/off for retrieval).
  - `documentType` (`general` | `handbook`).
  - `ingestionStatus` (`pending` | `indexing` | `indexed` | `failed`).
  - `lastIndexedAt?`.
  - `uploadedById` → `User`.
  - Relation: `chunks: DocumentChunk[]`.
- `DocumentChunk` (`document_chunks` table):
  - `id`, `documentId`, `chunkIndex`, `content`, `embedding (vector(1536))`, `tokenCount`, `createdAt`.
  - Index on `documentId`.

### 4.2 Admin knowledge-base UI (web)

- Page: `/admin/knowledge-base` (`KnowledgeBasePage`).
- Capabilities:
  - Mode toggle: `text` | `file` | `pdf`.
  - Ingest:
    - **Text**: POST `/ai/ingest/text` with title + content.
    - **File (.txt/.md)**: POST `/ai/ingest/file` (multipart).
    - **Handbook PDF**: POST `/ai/ingest/pdf` (multipart).
  - Shows ingest result messages (“✓ Ingested…”, or “Ingestion failed…”).
  - Lists existing documents with fields:
    - Title, sourceType, mimeType, size, documentType, isActive, ingestionStatus, lastIndexedAt, uploadedBy, chunks count.
  - Actions:
    - Toggle active/inactive.
    - Delete document.
    - Reindex (for knowledge docs).

### 4.3 Backend ingestion (text + file)

- `AiController.ingestText`:
  - ADMIN-only.
  - Logs admin ID and title.
  - Calls `IngestionService.ingestText` with `sourceType: 'manual'`.
- `AiController.ingestFile`:
  - ADMIN-only, `.txt`/`.md` only, max 10 MB.
  - Reads file into memory, converts to UTF-8 string.
  - Calls `IngestionService.ingestText` with `sourceType: 'file'`, `mimeType`, `sizeBytes`.
- `IngestionService.ingestText`:
  - Creates `KnowledgeDocument` with defaults (`documentType: 'general'` unless overridden).
  - Splits content into overlapping chunks (`CHUNK_SIZE = 1200`, overlap `150`).
  - Embeds batches of chunks via OpenAI `text-embedding-3-small`.
  - Inserts rows into `document_chunks` via raw SQL (embedding stored as pgvector).
  - Sets `ingestionStatus = 'indexed'`, `lastIndexedAt = now()`.

### 4.4 PDF ingestion (handbooks)

- `AiController.ingestPdf`:
  - ADMIN-only.
  - Validates file is PDF (mime and extension), max 15 MB.
  - Calls `AiService.createHandbookDocument`:
    - Creates `KnowledgeDocument` with:
      - `sourceType: 'file'`, `documentType: 'handbook'`, `ingestionStatus: 'pending'`, `mimeType`, `sizeBytes`.
  - Computes `s3Key = knowledge/<documentId>.pdf`.
  - Saves PDF to S3 via `AttachmentsService.uploadBuffer`.
  - Calls `AiService.updateDocumentS3Key` to persist s3Key.
  - Calls `IngestionService.enqueueIngestionJob(doc.id)`.
  - Returns `{ documentId, status: 'pending', message: 'Document uploaded. Indexing in progress.' }`.
- `IngestionService.enqueueIngestionJob`:
  - Adds a job to `QUEUES.KNOWLEDGE_INGESTION` with configured job options.
- `IngestionService.runIngestionForDocument`:
  - Called by worker for each job.
  - Fetches `KnowledgeDocument`, ensures `s3Key` exists.
  - Sets `ingestionStatus = 'indexing'`.
  - Fetches PDF bytes from S3 via `AttachmentsService.getObjectBuffer`.
  - Uses `pdf-parse` to extract text.
  - If no text: set `ingestionStatus = 'failed'` and throw.
  - Deletes existing `document_chunks` for this doc.
  - Splits text into chunks and embeds in batches like `ingestText`.
  - Inserts new chunks.
  - Sets `ingestionStatus = 'indexed'`, `lastIndexedAt`.
  - On any error: sets `ingestionStatus = 'failed'` and rethrows.

### 4.5 AI chat (grounded RAG)

- `AiService.chat(userMessage)`:
  - Embeds user query via `IngestionService.embedOne`.
  - Performs RAG query across all active documents:
    - `kd.isActive = true`, `dc.embedding IS NOT NULL`, distance `< threshold`.
  - Builds a system prompt:
    - When chunks exist: includes `[Source N: title]` headers with content.
    - When no chunks: generic internal support prompt (still allows general answers, but suggests tickets).
  - Calls `gpt-4o-mini` with `temperature 0.2`.
  - Returns `{ answer, sources, usedContext }`, with de-duplicated source list.
- `AiService.chatHandbook(userMessage)`:
  - Same pattern but filters to `documentType = 'handbook'`.
  - When no handbook chunks: a prompt that explicitly says there is no relevant handbook content and suggests contacting a manager or submitting a ticket.
- `AiController.chat` and `AiController.handbookChat`:
  - Expose `/ai/chat` (all authenticated users) and `/ai/handbook-chat` (studio users only).

### 4.6 Studio-facing chatbot UX

From `CLAUDE.md` and existing code:

- There is an `/assistant` page and AI sidebar in the app where users can chat with the assistant.
- Handbook chat is specifically tied to **studio users** via `/ai/handbook-chat`; the UI references “Studio Handbook chat”.
- The intended behavior is:
  - Use handbook RAG first for handbook-related queries.
  - Fall back to suggesting tickets when answers aren’t found in the context.

## 5. Observed / Likely Gaps

Based on code and product goals:

- **Handbook ingestion UX & feedback**
  - Admin UI shows `ingestionStatus`, but:
    - There is no dedicated, user-friendly explanation of what each status means (`pending`, `indexing`, `indexed`, `failed`).
    - Errors in ingestion jobs only surface via `ingestionStatus='failed'` and API logs; admin UI message on PDF upload is always optimistic (“Indexing in progress.”).
  - Reindex is available but only via a generic “Reindex” mutation; no UI-level progress feedback.

- **Duplicate / updated documents**
  - No explicit guidance on:
    - How to replace an outdated handbook (upload new version vs toggle old vs delete).
    - How to avoid duplicate handbooks with similar titles.

- **Chatbot grounding**
  - `chatHandbook` enforces context-only answers when chunks exist, but:
    - There is no explicit, user-visible indicator like “Answer based on: [Handbook Title]”.
    - The UI does not yet highlight which sources were used or show citations inline.
  - `chat` (general) may answer from context or general knowledge:
    - The prompt tells the model to use context when present, but may still allow looser answers.

- **Studio-user flow before ticket creation**
  - It’s not yet enforced/encouraged that studio users try the **handbook chat** before creating a ticket.
  - Ticket creation flows do not currently include a “Did the handbook answer your question?” checkpoint.

- **Reliability / edge cases**
  - PDF text extraction depends on `pdf-parse`:
    - Complex PDFs (images, multi-column, scanned docs) may yield poor text.
    - There’s a failure path when no text is extracted, but no clear admin-side guidance for remediation.
  - Large documents:
    - There are size limits (15 MB for PDF), but no admin-side estimate of “this may create N chunks / cost M tokens” to set expectations.
  - Embedding failures (e.g. transient OpenAI issues):
    - Ingestion jobs fail and mark `ingestionStatus='failed'`, but no automatic retry or UI-level “retry ingestion” action beyond reindex.

- **Security & permission clarity**
  - Admin endpoints are protected by `@Roles(Role.ADMIN)`.
  - Handbook chat is restricted to studio users with `studioId`.
  - There is no department/location scoping of handbooks (currently **global** for all studio users).

## 6. Admin Upload and Ingestion Strategy

### 6.1 Upload + ingestion lifecycle

- Keep existing multi-mode ingestion:
  - Text (manual entry).
  - Files (.txt/.md).
  - PDFs for handbooks.
- Clarify and standardize ingestion statuses:
  - `pending`: Document created or PDF uploaded, ingestion not yet started (or queued).
  - `indexing`: Ingestion worker currently processing (embedding, storing chunks).
  - `indexed`: Chunks ready; document visible to RAG queries (subject to `isActive`).
  - `failed`: Ingestion job failed; doc not used in retrieval.

### 6.2 Admin UI enhancements (no rewrite)

- Document table:
  - Show a small badge for `ingestionStatus` with a short description on hover.
  - Make it clear that:
    - Only `indexed` + `isActive = true` docs are used in answers.
    - `failed` docs need admin attention (e.g. reindex or delete).
- Actions:
  - Ensure “Reindex” calls reindex endpoint and visually reflects that status transitions from `indexed/failed` → `indexing` → `indexed/failed`.
  - Keep delete and toggle behavior as-is.
- PDF upload:
  - On success, consider including the new document’s title and `documentType` (“Handbook”) in the success message.
  - On failure (`400` from controller), show the actual error message where safe (e.g. size/mime too large/wrong type).

### 6.3 Replacing outdated handbooks

- Define a simple pattern for admins:
  - For yearly handbook updates:
    - Upload new PDF with a versioned title (e.g. “Studio Handbook 2026”).
    - Toggle `isActive = false` on old versions, or delete them if they should no longer appear in RAG.
  - Document this pattern in admin-facing help text on the Knowledge Base page.

## 7. Retrieval / Chatbot Grounding Strategy

### 7.1 Handbook-first for studio users

- For **studio users**:
  - The front-end should call `/ai/handbook-chat` for handbook questions.
  - Optionally, the assistant UI can:
    - Provide a “Handbook mode” or “Studio Handbook” tab explicitly for these queries.

### 7.2 Clear separation of “grounded” vs “no handbook answer”

- `chatHandbook` already:
  - Uses handbook-only chunks when available, with strict context-only instructions.
  - Returns a fallback message when no relevant context is found.
- Frontend improvements:
  - Show a small **“Based on:”** section listing the `sources` returned by the backend:
    - Document titles (e.g. “Studio Handbook 2026”).
  - When `usedContext = false`:
    - Display a clear label like “No relevant handbook content found; consider submitting a ticket.”

### 7.3 Guardrails against hallucination

- For `chatHandbook`:
  - Keep the system prompt strict: answer only from context or admit not knowing.
  - Optionally:
    - Include a short safety instruction: “Do not invent policies or procedures not present in the context.”
- For `chat` (general):
  - Maintain the existing “if the answer cannot be found in the context, say so and suggest a ticket” behavior.
  - Consider using a slightly higher threshold/stricter retrieval for sensitive policy categories (future enhancement).

## 8. Studio-User Experience Strategy

### 8.1 Entry points

- Primary:
  - **Studio Handbook Chat** (backed by `/ai/handbook-chat`), surfaced:
    - In the main sidebar as “Handbook” or “Studio Handbook”.
    - Inside the portal/dashboard for studio users.
- Secondary:
  - General assistant `/assistant` can still use `/ai/chat` for broader questions.

### 8.2 Before ticket creation

- Today:
  - Ticket creation does not enforce a handbook check.
- Minimal improvement:
  - On studio portal pages or the ticket creation page for certain categories (e.g. HR/policies), display:
    - A small inline prompt: “Have you checked the Studio Handbook chat for this question?”
    - A link/button to open the handbook chat in a side panel or new tab.
  - This remains **advisory**, not a hard gate, to avoid blocking workflows.

### 8.3 UX confirmation and fallback

- When `chatHandbook` can’t find a relevant answer:
  - Answer clearly: “I don’t see this covered in the handbook. You may need to submit a ticket.”
  - Optionally provide a “Create Ticket” button in the assistant UI that pre-fills summary with the question.

## 9. Reliability / Quality Considerations

- **Ingestion completeness**
  - Ensure ingestion worker:
    - Marks `ingestionStatus` accurately for success/failure.
    - Logs detailed errors for PDF parsing and embedding failures.
  - Consider adding a **max page count** or truncation strategy for extremely large PDFs to keep cost manageable.

- **PDF parsing edge cases**
  - `pdf-parse` may struggle with:
    - Image-only scans.
    - Complex layouts.
  - For handbooks that fail with `PDF produced no extractable text`:
    - Admins should see `ingestionStatus='failed'`.
    - Provide UI hint: “This PDF could not be parsed; consider uploading a text-based version or checking with IT.”

- **Chunking and recall**
  - Current chunking (1200 chars with 150 overlap) is reasonable.
  - If recall quality is poor for some documents, an admin-only tuning config (env) can be added later, but no rewrite is needed now.

- **Confidence and fallback**
  - The distance threshold and `RAG_TOP_K` can be tuned (via env) if recall is:
    - Too strict (few/no chunks).
    - Too loose (irrelevant matches).
  - When no chunks pass the threshold, `usedContext = false` ensures the model clearly communicates lack of handbook coverage.

## 10. Security / Permission Considerations

- **Admin-only management**
  - Keep all ingest/list/toggle/delete endpoints under `@Roles(Role.ADMIN)`.
  - Ensure admin UI checks for admin role before rendering Knowledge Base page.

- **Studio users: query-only**
  - `handbookChat` already restricts to studio users with `studioId` and only returns answers; no write/update behavior.
  - No changes needed: studio users should never be able to upload, toggle, or delete documents.

- **Scope**
  - For now, handbooks are **company-wide** for all studio users:
    - No department/location scoping is implemented.
  - Keep scoping out of scope for Stage 34; treat all active `documentType='handbook'` docs as shared knowledge.

## 11. Files / Modules / Services Likely Involved

- **Backend**
  - `apps/api/src/modules/ai/ai.controller.ts`
  - `apps/api/src/modules/ai/ai.service.ts`
  - `apps/api/src/modules/ai/ingestion.service.ts`
  - `apps/api/src/modules/attachments/attachments.service.ts` (file storage for PDFs).
  - Knowledge ingestion worker (`knowledge_ingestion` queue processor).
  - `apps/api/prisma/schema.prisma` (`KnowledgeDocument`, `DocumentChunk`).

- **Frontend**
  - `apps/web/src/app/(app)/admin/knowledge-base/page.tsx`
  - `apps/web/src/lib/api.ts` (`aiApi` for chat and ingestion endpoints).
  - `apps/web/src/app/(app)/assistant/page.tsx` or equivalent assistant/chat UI.
  - Studio portal or handbook chat UI (where `/ai/handbook-chat` is used).

## 12. Test / Validation Plan

- **Admin ingestion**
  - In dev or staging:
    - Upload:
      - A small text manual via text paste.
      - A `.md` file.
      - A handbook PDF (well-structured, text-based).
    - Confirm:
      - `ingestionStatus` transitions to `indexed`.
      - `document_chunks` are created with expected counts.
      - Document list shows correct size, type, and chunk count.

- **Ingestion failure paths**
  - Use:
    - A malformed PDF.
    - A scanned, image-only PDF.
  - Confirm:
    - Worker sets `ingestionStatus='failed'`.
    - Admin UI surfaces failure state.
    - Reindex behaves as expected.

- **Handbook chat behavior**
  - For studio user with `studioId`:
    - Ask questions clearly answered in handbook:
      - Verify responses reference correct content and titles in `sources`.
    - Ask questions not covered:
      - Verify the assistant states it doesn’t see it in the handbook and suggests a manager/ticket.

- **General chat behavior**
  - Ensure `chat` still works with both general and handbook documents, and uses `usedContext` appropriately.

- **Permission tests**
  - Confirm:
    - Non-admin users cannot access ingest/list/toggle/delete endpoints or Knowledge Base admin page.
    - Non-studio users cannot access `/ai/handbook-chat`.

## 13. Acceptance Criteria

- **Admin knowledge base**
  - Admins can upload, reindex, toggle, and delete handbook PDFs and text docs.
  - Ingestion status and errors are visible and interpretable without reading server logs.

- **Reliable ingestion**
  - Text and PDF handbooks are consistently split, embedded, and indexed.
  - Failures set `ingestionStatus='failed'` and can be re-run via reindex.

- **Grounded handbook chat**
  - `chatHandbook` reliably uses only handbook chunks when available.
  - Responses clearly distinguish when answers are based on handbook vs when the handbook is silent.
  - No silent hallucinations of company policy.

- **Studio-user flow**
  - Studio users have an obvious, working “Handbook” chat entry point.
  - The assistant encourages ticket creation only when the handbook cannot answer.

- **Architecture preserved**
  - No rewrites of AI architecture, embeddings, or RAG infrastructure.
  - Backend remains the source of truth for documents and chunks.
  - All changes are incremental and maintainable within the existing modules.***
