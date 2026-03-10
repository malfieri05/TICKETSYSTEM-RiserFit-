# Stage 32: File Uploads — Mini-Spec

## 1. Intent

- Make **ticket attachments/file uploads fully reliable and production-ready** across the system while preserving the existing architecture and patterns.
- Clarify the **current end-to-end behavior** (UI → API → storage → DB) and close any remaining gaps so uploads, listing, download, and delete all behave consistently.
- Keep the implementation **minimal, incremental, and architecture-preserving**: re-use the existing S3 + presigned URL pipeline, ticket attachment model, and policy layer instead of introducing new paradigms.

## 2. Problem Statement

We believe file uploads are not yet fully working or polished in all the places they should:

- There is a **presigned-upload-based attachment pipeline** already present in both the backend and frontend:
  - Backend: `AttachmentsService` + `AttachmentsController` with S3 presigned PUT/GET URLs and `ticket_attachments` table.
  - Frontend: `attachmentsApi` helpers plus upload logic in `/tickets/[id]` and `TicketDrawer`.
- However, it is unclear whether:
  - The **UI affordances for picking/uploading files** are consistently wired up across all relevant surfaces.
  - The **attachment lists** are shown everywhere a ticket is viewed.
  - Errors, limits, and permissions are **clearly surfaced** to users.
  - Local/dev vs production S3 configuration is **easy to run and safe**.

We need a concise, senior-level plan to:

- Confirm the current state, including any partial implementations.
- Identify concrete, minimal changes required to deliver **fully working, safe file uploads** across the intended surfaces.
- Avoid rewrites while ensuring the behavior meets production expectations.

## 3. Scope

**In scope**

- **Surfaces**
  - Ticket detail page: `/tickets/[id]` — primary place where staff work a ticket.
  - `TicketDrawer` component — used from feeds/inbox for side-by-side ticket work.
  - Ticket creation flow: `/tickets/new` — decide whether to support attachments at creation time vs only post-creation.
  - Comments thread in detail/drawer — clarify whether attachments should be:
    - ticket-scoped only (current model), or
    - associated with specific comments (future phase; out of scope unless partially implemented).
  - Admin / knowledge-base areas **only** where they already use the shared `AttachmentsService` or S3 helpers.

- **Behavior**
  - Uploading files (single and small batches, e.g. a few attachments per ticket).
  - Listing attachments for a ticket.
  - Download / open behavior via presigned URLs.
  - Optional delete (where already implemented / expected for staff).

**Out of scope**

- Changing the core storage provider away from S3-compatible object storage.
- Large-scale document management or versioning semantics.
- Comment-level attachment semantics or rich media previews beyond simple metadata and download.
- New policy rules beyond enforcing **existing role and visibility semantics** for tickets.

## 4. Current Attachment Architecture

### 4.1 Backend

- **Model**
  - `Ticket` in Prisma (`apps/api/prisma/schema.prisma`) has:
    - `attachments   TicketAttachment[]`
  - `TicketAttachment` model (not fully quoted here) stores:
    - `ticketId`, `uploadedById`
    - `filename`, `mimeType`, `sizeBytes`
    - `s3Key`, `s3Bucket`
    - timestamps and relations (`uploadedBy`).
- **Service** — `AttachmentsService` (`apps/api/src/modules/attachments/attachments.service.ts`):
  - Uses S3-compatible client with `S3_BUCKET` from config.
  - **Request upload URL**:
    - Validates `sizeBytes <= 25 MB` (`MAX_SIZE_BYTES`).
    - Confirms ticket exists.
    - Generates S3 key `tickets/<ticketId>/<timestamp>-<safeFilename>`.
    - Returns `{ uploadUrl, s3Key, expiresIn }` via `PutObjectCommand` + `getSignedUrl`.
  - **Confirm upload**:
    - Confirms ticket exists again.
    - Creates `ticketAttachment` record with filename, mime type, size, s3 key/bucket, `uploadedById`.
  - **List attachments**:
    - `findMany` scoped by `ticketId`, ordered by `createdAt`, includes `uploadedBy`.
  - **Get download URL**:
    - Looks up attachment by ID.
    - Uses `GetObjectCommand` + `getSignedUrl` with `ResponseContentDisposition` as attachment filename.
  - **Delete**:
    - Fetches attachment; if absent, 404.
    - Deletes object from S3 and then the DB record.
  - Additional helpers (`uploadBuffer`, `getObjectBuffer`, `deleteObjectByKey`) are shared with the AI/knowledge base features.

- **Controller** — `AttachmentsController` (`apps/api/src/modules/attachments/attachments.controller.ts`):
  - Ticket-scoped routes:
    - `POST /tickets/:ticketId/attachments/upload-url` → `requestUploadUrl`.
    - `POST /tickets/:ticketId/attachments/confirm` (201) → `confirmUpload`.
    - `GET  /tickets/:ticketId/attachments` → `listAttachments`.
  - Attachment-level routes:
    - `GET    /attachments/:id/download-url` → `getDownloadUrl`.
    - `DELETE /attachments/:id` → `deleteAttachment`.
  - All mutation routes expect `@CurrentUser` (`RequestUser`) and thus require authentication; authorization is currently implicit via ticket visibility model rather than explicit per-attachment policy checks.

### 4.2 Frontend

- **Client API wrapper** — `attachmentsApi` (`apps/web/src/lib/api.ts`):
  - `requestUploadUrl(ticketId, { filename, mimeType, sizeBytes })` → POST `/tickets/:ticketId/attachments/upload-url`.
  - `uploadToS3(uploadUrl, file)` → direct PUT to S3 with `Content-Type` = file type; throws on non-2xx.
  - `confirmUpload(ticketId, { s3Key, filename, mimeType, sizeBytes })` → POST `/tickets/:ticketId/attachments/confirm`.
  - `list(ticketId)` → GET `/tickets/:ticketId/attachments`.
  - `getDownloadUrl(attachmentId)` → GET `/attachments/:id/download-url`.
  - `delete(attachmentId)` → DELETE `/attachments/:id`.

- **Types** — `Attachment` (`apps/web/src/types/index.ts`):
  - `id`, `filename`, `mimeType`, `sizeBytes`, `s3Key`, `createdAt`, `uploadedBy { id, name }`.

### 4.3 UI Surfaces (current)

- **Ticket detail page** — `/tickets/[id]`:
  - Uses `useQuery` keyed by `['ticket', id, 'attachments']` and `attachmentsApi.list(id)` when `activeTab === 'submission'`.
  - Has handlers:
    - `handleFileUpload(file: File)`:
      - Calls `requestUploadUrl`, `uploadToS3`, then `confirmUpload`, then invalidates attachment query.
      - Manages `uploading` boolean, `uploadError` state, and resets the `<input type="file">` via `fileInputRef`.
    - `handleDownload(attachment)`:
      - Calls `attachmentsApi.getDownloadUrl` and `window.open(downloadUrl, '_blank')`.
  - There is **attachment logic**, but we need to verify:
    - The actual JSX: file picker/button, list of attachments (name, size, uploadedBy, createdAt), delete affordances.
    - Whether the logic is properly wired into the Submission tab and matches current design tokens.

- **TicketDrawer** — `apps/web/src/components/tickets/TicketDrawer.tsx`:
  - Mirrors the same pattern:
    - `useMutation` for delete, `useQuery` for list (via `attachmentsApi`).
    - `handleFileUpload(file)`, `handleDownload(att)` and a size formatting helper.
  - Again, **handlers exist**, but we must inspect the markup to confirm:
    - Where the file picker sits (which tab).
    - Whether attachments are visible and deletable.

- **Ticket creation (`/tickets/new`) and comments**:
  - No obvious attachments usage in those files from initial grep; likely **no upload affordance** on create or comments at present.

### 4.4 Storage / Configuration

- Uses an S3-compatible client:
  - Bucket name from `S3_BUCKET` in `apps/api/.env`.
  - Other env vars already exist for AI/knowledge base file ingestion (shared S3 integration).
- Dev/prod behavior:
  - Assumes the same S3 bucket pattern, likely differing via credentials/endpoint rather than code branches.
  - No explicit local disk storage path; everything flows through S3-style object storage.

## 5. Observed / Likely Gaps

Based on the current code, plus prior phase notes:

- **End-to-end pipeline exists**, but may have these gaps:
  - **UI affordances** may be:
    - Present but visually inconsistent or hard to discover (e.g. buried in the Submission tab).
    - Missing from some key flows (no attachments at ticket creation, possibly missing in portal/Studio views).
  - **Loading/error handling**:
    - `uploadError` state strings are set but may not be clearly surfaced in the UI.
    - No obvious toast/notification patterns around upload failure/success.
  - **Permissions**:
    - Backend currently requires auth but does not appear to:
      - Restrict deletes to ticket owners/admins/department users.
      - Enforce ticket-visibility rules (e.g. a user with access to ticket X can see its attachments, but not others).
    - Some of this may be indirectly enforced via route guards in the main NestJS app module; attachments endpoints are plain controller methods and should rely on existing auth/guard configuration.
  - **Upload surfaces**:
    - Ticket creation flow likely **does not support attachments yet** (no file picker or association pattern).
    - Comments do not show per-comment attachments; everything is ticket-level.
  - **Operational clarity**:
    - Size limit (25MB) is enforced server-side, but there is no proactive client-side check to avoid round-trips.
    - File type validation is limited to whatever S3 accepts; no MIME allowlist yet.
    - No explicit cleanup for **orphaned S3 objects** if upload URL is requested but confirm is never called.

## 6. Files / Modules / Storage Areas Likely Involved

- **Backend**
  - `apps/api/src/modules/attachments/attachments.service.ts`
  - `apps/api/src/modules/attachments/attachments.controller.ts`
  - `apps/api/src/modules/auth` (guards/decorators that wrap attachment routes).
  - `apps/api/prisma/schema.prisma` (`Ticket`, `TicketAttachment`).
  - `apps/api/src/modules/tickets` (DTOs or serializer that include `attachments` where needed).

- **Frontend**
  - `apps/web/src/lib/api.ts` (`attachmentsApi`).
  - `apps/web/src/types/index.ts` (`Attachment` type).
  - `apps/web/src/app/(app)/tickets/[id]/page.tsx` (detail view).
  - `apps/web/src/components/tickets/TicketDrawer.tsx` (drawer view).
  - `apps/web/src/app/(app)/tickets/new/page.tsx` (create-ticket form).
  - Any shared attachment UI (if present) — e.g. a small component that renders attachment chips/rows.

- **Config / Infra**
  - `apps/api/.env` and environment variables for `S3_BUCKET`, region, keys, and optional endpoint.
  - Render/Fly configuration related to S3 (e.g. AWS vs R2).

## 7. Proposed File Upload Strategy

### 7.1 High-Level Strategy

- **Preserve the current attachment architecture**:
  - Keep using presigned PUT → client upload to S3 → confirm → DB record → presigned GET for download.
  - Do not introduce multi-part uploads, new storage backends, or different URL schemes.

- **Standardize the ticket-level attachment experience**:
  - For **ticket detail** and **TicketDrawer**:
    - Ensure both surfaces share a **single attachment UI pattern**:
      - A clear “Attachments” section with:
        - File picker button or drag-drop zone.
        - Inline list of attachments (name, size, uploader, timestamp, small icon).
        - Optional delete icons for users with manage rights.
      - Leverage existing `POLISH_THEME` and list/table tokens from earlier stages.
  - For **ticket creation**:
    - Decide on one of:
      - **Option A (minimal, likely)**: Attachments are **added only after ticket is created** (post-creation). In this case:
        - No attachments on `/tickets/new` (explicitly documented).
        - UI communicates that attachments can be added after submission.
      - **Option B (slightly richer)**: Allow attachments on creation by:
        - Staging files client-side.
        - Creating ticket first, then running the existing attachments pipeline with the new ticket ID.
      - The mini-spec should recommend **Option A** unless there is already partial implementation for creation-time attachments.

- **Defer comment-level attachments**:
  - Continue storing attachments at the **ticket level**.
  - If future requirements demand per-comment attachments, handle them in a later stage with explicit schema changes.

### 7.2 Data and Association Model

- Ticket remains the **source of truth**:
  - `TicketAttachment` records belong to a `ticketId` and `uploadedById`.
  - Frontend fetches attachments via `/tickets/:ticketId/attachments` for both detail and drawer views.
- No additional cross-references (e.g. comments) are introduced at this stage.

## 8. API / Storage Design Considerations

### 8.1 Validation and Limits

- **Size limit**:
  - Maintain the 25MB limit in DTO validation and `AttachmentsService`.
  - Add **client-side checks**:
    - If `file.size > 25MB`, reject immediately with a clear, localized error before calling the API.
  - Ensure error messages over the wire align with UX copy.

- **File type validation**:
  - Today, the API only validates size and trusts MIME type; consider a **lightweight allowlist**:
    - e.g. `image/*`, `application/pdf`, `text/plain`, common office docs.
  - Implement validation in the `RequestUploadUrlDto`/service layer (e.g. central constant and check).
  - Surface disallowed types as 400 with a safe, generic message (no leaking internal details).

### 8.2 Auth / Permissions

- Confirm that **auth guards** wrap attachment routes the same way as ticket routes.
- Implement or verify **permission rules** consistent with ticket visibility:
  - Only users who can see a ticket may:
    - List its attachments.
    - Request upload URLs and confirm uploads.
    - Download attachments.
  - Delete should be restricted to:
    - ADMIN and DEPARTMENT_USER roles (or ticket owner) per existing ticket permission rules.
  - Ensure `deleteAttachment` performs or defers to a **policy check** rather than relying solely on auth.

### 8.3 Orphan and Cleanup Behavior

- Orphan scenarios:
  - User requests upload URL but never completes upload.
  - Upload completes to S3, but `confirmUpload` is never called (e.g. tab closed mid-flight).
- Minimal strategy:
  - Accept that some orphaned S3 objects may exist but keep them bounded via:
    - Short `UPLOAD_URL_TTL` and optionally naming them under a known prefix (`tickets/<ticketId>/temp/`) if we want targeted cleanup later.
  - Optionally, a **low-frequency cleanup worker**:
    - Scans S3 under `tickets/` for objects with no matching `ticketAttachment` record.
    - Deletes orphaned objects created X days ago.
  - This can be a later optimization; for Stage 32 we mainly ensure **no DB or user-visible orphans**.

### 8.4 Dev vs Prod Storage

- Document and standardize:
  - For local dev:
    - Recommended S3-compatible endpoint (e.g. MinIO or localstack) or shared low-risk S3 bucket.
    - Safe defaults (e.g. non-sensitive bucket, region).
  - For production:
    - Use the real S3/R2 bucket with strict IAM policies.
  - Ensure **no hard-coded bucket names or regions**; use env variables only.

## 9. Frontend UX Strategy

### 9.1 Ticket Detail and Drawer

- **Attachments section layout**:
  - A consistent block titled “Attachments” within:
    - Submission tab (ticket detail).
    - Submission tab (TicketDrawer).
  - Content:
    - Primary action: “Upload file” button (standard `Button` component) that triggers a hidden file input.
    - Optional drag-and-drop area if already partially implemented; otherwise, simple click-to-upload to keep scope tight.
    - Below: list of attachments with:
      - File icon + filename (truncated).
      - Size (using existing `formatBytes`/`fmt` helpers).
      - Uploaded-by name and relative time.
      - Download click area (entire row or dedicated button).
      - Delete icon for users with `canManage` rights.
  - Behavior:
    - While `uploading` is true, show:
      - Spinner inline with “Uploading…” copy or subtle progress indicator.
    - On error (`uploadError`):
      - Show a small, styled error message below the picker; avoid noisy alerts.

### 9.2 Ticket Creation

- **Recommendation (minimal)**:
  - For this stage, treat ticket creation as **text-only**:
    - No attachment upload UX on `/tickets/new`.
    - Show small helper text indicating that attachments can be added after the ticket is created.
  - Rationale:
    - Avoid orchestrating ticket creation + attachment pipeline in a single step.
    - Maintain clear state (ticket ID always exists before attachments).

### 9.3 Cross-Surface Consistency

- Ensure:
  - The attachment list styling (colors, spacing, typography, icons) is consistent between:
    - Detail view.
    - TicketDrawer.
    - Any portal/admin surfaces that show attachments (if any).
  - All surfaces use the same `attachmentsApi` + `Attachment` type; no duplicate fetch logic.

## 10. Security / Reliability Considerations

- **Security**
  - Authenticated-only access to all attachment endpoints.
  - Enforce ticket-based authorization on:
    - Listing, upload URL, confirm, download, delete.
  - Validate filename and S3 key:
    - Continue sanitizing filenames (`safeFilename`) to avoid path traversal and weird characters.
    - Do not reflect raw user-supplied filenames in headers without quoting/escaping; `ResponseContentDisposition` already wraps the filename.
  - Content:
    - Size limit (25MB).
    - MIME allowlist to reduce risk of serving active content; treat as a defense-in-depth measure since attachments are downloaded and opened by client software.

- **Reliability**
  - Use **idempotent client behavior**:
    - Avoid duplicate confirm calls; if needed, rely on unique `(ticketId, s3Key)` pairs or let the DB handle duplicates gracefully.
  - Error handling:
    - On S3 upload failure, do not call `confirmUpload`.
    - On confirm failure, show a clear error and leave DB unchanged.
  - Monitoring:
    - Log errors in `AttachmentsService` (e.g. S3 exceptions, missing attachments) so failures can be debugged.

## 11. Test / Validation Plan

- **Backend**
  - Unit/integration tests for `AttachmentsService`:
    - `requestUploadUrl` rejects >25MB and invalid ticket IDs.
    - `confirmUpload` creates a correct DB record and links to the ticket/user.
    - `listAttachments` returns sorted results with `uploadedBy`.
    - `getDownloadUrl` returns a signed URL and correct filename.
    - `deleteAttachment` removes both S3 object and DB record; verify behavior for missing ID.
  - Auth/permission tests:
    - Users without access to a ticket cannot list or modify its attachments.
    - Deletion limited to allowed roles.

- **Frontend**
  - Manual E2E walkthroughs:
    - Create a ticket, then:
      - Upload one or more attachments from ticket detail.
      - See them appear in detail and drawer (if applicable).
      - Download them successfully.
      - Delete them (if role permits) and verify disappearance in both views.
    - Attempt to upload:
      - A file >25MB (should be blocked client-side with clear message).
      - A disallowed file type (if we add a MIME allowlist).
  - Regression checks:
    - Ensure ticket load performance is acceptable with attachments.
    - Verify behavior for Studio users vs department/admin roles (visibility vs manage rights).

## 12. Acceptance Criteria

- **Architecture-preserving**:
  - Implementation continues to use the existing S3 + presigned URL + `TicketAttachment` pipeline; no new storage backends or major refactors.

- **End-to-end correctness**:
  - From a user perspective:
    - On an existing ticket, they can reliably upload files (within size/type limits), see them listed, download them, and (if permitted) delete them from both detail and drawer views.
  - Uploads behave identically from ticket detail and TicketDrawer.

- **Scoped, minimal changes**:
  - No changes to core ticket visibility semantics, state machine, or notification architecture.
  - No new “comment-level attachment” model introduced in this stage.

- **Security and safety**:
  - All attachment actions are authenticated and respect ticket-level permissions.
  - File size and (optionally) type are validated on both client and server.
  - Filenames are sanitized and used safely in S3 keys and response headers.

- **Operational readiness**:
  - Dev and prod S3 configuration is documented and easy to run.
  - Known error states (size exceeded, disallowed type, S3 failure, missing attachment) are handled gracefully with user-visible feedback.

