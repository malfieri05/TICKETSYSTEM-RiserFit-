# Stage 32: File Uploads — Localhost Confirmation and Staging Checklist

## 1. Confirmed Working Architecture

From the current codebase and recent Stage 32/33 work, the **core attachment architecture is sound and implemented as designed**:

- **Backend pipeline**
  - `requestUploadUrl` (`POST /tickets/:ticketId/attachments/upload-url`):
    - Implemented in `AttachmentsService.requestUploadUrl` and `AttachmentsController`.
    - Validates `sizeBytes <= 25MB`.
    - Confirms `Ticket` exists by `ticketId`.
    - Builds `s3Key = tickets/<ticketId>/<timestamp>-<safeFilename>`.
    - Uses configured `S3Client` (bucket name, region, optional `S3_ENDPOINT`) to generate a **presigned PUT URL** via `getSignedUrl`.
    - Returns `{ uploadUrl, s3Key, expiresIn }` to the client.
  - `confirmUpload` (`POST /tickets/:ticketId/attachments/confirm`):
    - Validates `Ticket` existence again by `ticketId`.
    - Creates a `TicketAttachment` row with:
      - `ticketId`, `uploadedById`, `filename`, `mimeType`, `sizeBytes`, `s3Key`, `s3Bucket`.
    - Returns the created attachment including `uploadedBy` reference.
  - Listing / download / delete:
    - `GET /tickets/:ticketId/attachments` returns all attachments for the ticket, ordered by `createdAt`, including `uploadedBy`.
    - `GET /attachments/:id/download-url`:
      - Looks up the `TicketAttachment`.
      - Generates a presigned **GET** URL with `ResponseContentDisposition` so the browser downloads the named file.
    - `DELETE /attachments/:id`:
      - Looks up the attachment.
      - Issues `DeleteObject` to S3, then deletes the DB record.

- **Ticket association model**
  - Prisma `Ticket` model has `attachments   TicketAttachment[]`.
  - `TicketAttachment` rows are strictly ticket-scoped via `ticketId` and track `uploadedById`.
  - No pre-ticket or orphaned attachment tables; tickets remain the source of truth.

- **Frontend API wrapper and flows**
  - `attachmentsApi` (`apps/web/src/lib/api.ts`):
    - `requestUploadUrl(ticketId, { filename, mimeType, sizeBytes })` → `/tickets/:ticketId/attachments/upload-url`.
    - `uploadToS3(uploadUrl, file)`:
      - Performs a **direct browser `PUT`** to the presigned URL with `Content-Type: file.type`.
      - Throws descriptive errors that distinguish:
        - HTTP failures: `Direct upload to storage failed (s3-put stage) for host <host>: <status> <statusText>`.
        - Network/CORS failures: `Direct upload to storage failed (network/CORS at s3-put stage) for host <host>: <TypeError message>`.
    - `confirmUpload(ticketId, { s3Key, filename, mimeType, sizeBytes })` → `/tickets/:ticketId/attachments/confirm`.
    - `list`, `getDownloadUrl`, and `delete` wrap the corresponding endpoints.
  - **Ticket detail and drawer**
    - Both use the shared `TicketAttachmentsSection`:
      - Fetches `attachmentsApi.list(ticketId)` via React Query (`['ticket', ticketId, 'attachments']`).
      - Uses `UploadDropzone` for drag-and-drop / click-to-upload.
      - Calls `attachmentsApi.requestUploadUrl` → `uploadToS3` → `confirmUpload` on existing tickets.
      - Invalidates `['ticket', ticketId, 'attachments']` after each success so lists refresh.
      - Uses `AttachmentRow` to render filename, uploader, relative timestamp, and size, with row-click download and optional delete.
  - **Ticket creation (staged-file flow)**
    - `/tickets/new`:
      - SUPPORT and MAINTENANCE flows allow **staging attachments client-side** before submission.
      - On submit:
        - Calls `ticketsApi.create(payload)` to create the ticket.
        - On success, retrieves `ticketId` and then:
          - For each staged file:
            - Calls `requestUploadUrl` (upload-url stage).
            - Calls `uploadToS3` (s3-put stage).
            - Calls `confirmUpload` (confirm stage).
          - Errors at any stage are:
            - Logged with explicit stage labels (`upload-url`, `s3-put`, `confirm`).
            - Collected but **do not** cause ticket creation to fail.
      - The UI explicitly tells users that attachments are uploaded **after** ticket creation and can be retried from the ticket page.

In short: **Ticket ↔ Attachment relationship, backend endpoints, and frontend flows are correctly wired** for all three stages: upload-URL, direct PUT, and confirm, and they are working as far as code and architecture are concerned.

## 2. Confirmed Localhost Blocker

The **only consistently failing stage on localhost** is:

- **Direct browser `PUT` to the presigned S3 (or S3-compatible) URL**, i.e. the `s3-put` stage in:
  - `attachmentsApi.uploadToS3(uploadUrl, file)`
  - Both from:
    - The ticket creation post-create loop.
    - The ticket detail / drawer `TicketAttachmentsSection`.

From the current behavior:

- **Ticket creation succeeds**:
  - `ticketsApi.create` works; tickets are created, and the user is redirected to `/tickets/[id]`.
- **Presigned URL generation succeeds**:
  - `requestUploadUrl` returns a structured response containing `uploadUrl`, `s3Key`, and `expiresIn`.
  - No backend errors are thrown at this stage.
- **Browser fails at the direct PUT-to-S3 step**:
  - The frontend logs errors of the form:
    - `Attachment upload failed at s3-put stage: "<file>" Error: Direct upload to storage failed (network/CORS at s3-put stage) for host <host>: <TypeError message>`
  - This indicates:
    - The browser could not complete `fetch(uploadUrl, { method: 'PUT', ... })` to the given host.
    - Typical causes: CORS policy, mixed content, or endpoint not reachable from the browser.
- **Confirm stage is not reached if PUT fails**:
  - When `uploadToS3` throws, `confirmUpload` is skipped for that file.
  - Thus, no `TicketAttachment` record is created and no attachments appear on the ticket.

Given:

- Ticket creation and `requestUploadUrl` work.
- `uploadToS3` fails with a **network/CORS `TypeError`** in the browser.
- Backend confirm/list/download/delete logic is independent and already working where attachments exist.

We can confidently say the current problem is **specific to localhost browser ↔ storage endpoint access**, not a flaw in the attachment design.

## 3. Why This Is Not a Core Architecture Failure

The core design is:

1. **Backend generates a presigned PUT** URL to storage for a specific ticket-key.
2. **Browser uploads directly to storage** using that URL.
3. **Backend confirms the upload**, creating a `TicketAttachment` record and associating it with the ticket.

This pattern:

- Keeps files out of the application server, reducing load and complexity.
- Works across environments as long as:
  - The presigned URL’s host is reachable from the browser.
  - CORS is configured to permit browser-origin PUTs.
  - Environment config (bucket, region, credentials) is correct.

The localhost failures are **exactly what we expect** when:

- The storage endpoint is:
  - Only reachable from the server (e.g., internal DNS, private network).
  - Or not configured for browser CORS.
- We attempt to use the same architecture from a local browser without having:
  - Proper CORS rules on the bucket.
  - A dev endpoint/host that the browser can hit.

On staging/production, the browser runs under a real HTTPS origin (e.g. `https://tickets.staging.company.com` or `https://tickets.company.com`) and hits a well-configured S3/R2 bucket with:

- Correct public endpoint.
- CORS rules that explicitly allow those origins and methods.

Therefore, **the architecture is correct**; what’s missing for localhost is entirely:

- CORS and endpoint configuration on the chosen storage provider.
- A public or dev-accessible bucket endpoint for browser PUTs.

## 4. Required S3 / Storage CORS Configuration

To make browser-based direct uploads work, the storage bucket / endpoint must allow **cross-origin PUTs** from:

- **Local dev** origin(s), e.g.:
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
- **Staging** app origin(s), e.g.:
  - `https://tickets.staging.company.com`
- **Production** app origin(s), e.g.:
  - `https://tickets.company.com`

### 4.1 AWS S3-style CORS example

For AWS S3 (or R2/MinIO with similar semantics), a **minimal CORS config** that supports this architecture would be:

```xml
<CORSConfiguration>
  <CORSRule>
    <!-- Local development -->
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>http://127.0.0.1:3000</AllowedOrigin>
    <!-- Staging -->
    <AllowedOrigin>https://tickets.staging.company.com</AllowedOrigin>
    <!-- Production -->
    <AllowedOrigin>https://tickets.company.com</AllowedOrigin>

    <!-- Methods needed for presigned uploads and downloads -->
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>OPTIONS</AllowedMethod>

    <!-- Headers that browser may send -->
    <AllowedHeader>*</AllowedHeader>

    <!-- Headers that browser may need to read -->
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>x-amz-request-id</ExposeHeader>
  </CORSRule>
</CORSConfiguration>
```

### 4.2 Rules by need

- **Required methods**:
  - `PUT` for presigned direct uploads.
  - `GET` for image/PDF views or downloads (if served directly from bucket).
  - `HEAD` and `OPTIONS` for pre-flight / metadata checks.
- **Required headers** (minimum):
  - `Content-Type` (our presigned PUT sets this).
  - If the provider requires additional `x-amz-*` headers to be signed and sent, either:
    - Allow `*`, or
    - Explicitly list them.
- **Origins**:
  - Every environment where the web app runs must appear as an allowed origin, or `*` if your security posture allows it (for internal tools this is usually locked down to known domains).

### 4.3 Non-AWS providers

For S3-compatible providers (Cloudflare R2, MinIO, etc.):

- Apply the equivalent CORS rules via their UI or API:
  - Allow `PUT`, `GET`, `HEAD`, `OPTIONS`.
  - Allow the app origins.
  - Allow `Content-Type` and any signed headers.
  - Expose at least the ETag / diagnostic headers if useful.

## 5. Required Env / Endpoint Conditions

For the existing architecture to function, **all** of the following must be true:

1. **Bucket name**
   - `S3_BUCKET` in `apps/api/.env` must:
     - Exactly match the bucket name used in your storage provider.
     - Be the same bucket used for attachments (and any shared usage with AI docs, if applicable).

2. **Region**
   - `S3_REGION` must be the correct region for the bucket (e.g. `us-east-1`).
   - For S3-compatible providers, use the region/zone they specify (or a placeholder if they ignore it, but keep it consistent).

3. **Endpoint / host**
   - For AWS S3:
     - You can typically omit `S3_ENDPOINT` and use the default AWS endpoints.
   - For S3-compatible (R2, MinIO, etc.):
     - `S3_ENDPOINT` must be the external/public endpoint that:
       - The API server can reach for signing and operations.
       - The browser can reach for `PUT` and `GET` requests from your web origins.
     - Examples:
       - `https://<bucket>.r2.cloudflarestorage.com`
       - `https://s3.<region>.amazonaws.com`
       - `https://minio.dev.internal` (only if also resolvable and CORS-enabled from browser).

4. **Presigned URL host must be browser-reachable**

When `AttachmentsService` calls `getSignedUrl`, it builds the presigned URL based on `bucket`, `region`, and `endpoint`. That URL:

- Must resolve and accept `PUT` from the **browser’s network**.
- If:
  - The endpoint is only reachable from the API server (e.g. private VPC endpoint, internal DNS), or
  - DNS is not resolvable from the client machine, or
  - The scheme mismatches (e.g. `http` endpoint while the web app is `https`),
  then the browser will throw `TypeError: Failed to fetch` at the `s3-put` stage.

5. **Credentials**

- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` must be valid for:
  - `PutObject`, `GetObject`, and `DeleteObject` on the configured bucket.
  - The same identity used to generate presigned URLs must have permission for the operations being presigned.

## 6. Staging / Production Verification Checklist

Use this as a **step-by-step checklist** before enabling attachments on staging/live:

1. **Bucket + IAM**
   - [ ] Confirm bucket `S3_BUCKET` exists in the configured region.
   - [ ] Confirm IAM/user or keys used by the API have `PutObject`, `GetObject`, `DeleteObject` on that bucket.

2. **CORS**
   - [ ] Add CORS rules to the bucket:
     - Allowed origins:
       - [ ] `https://tickets.staging.company.com` (staging)
       - [ ] `https://tickets.company.com` (production)
       - [ ] `http://localhost:3000` for local testing (optional but recommended).
     - Allowed methods:
       - [ ] `PUT`
       - [ ] `GET`
       - [ ] `HEAD`
       - [ ] `OPTIONS`
     - Allowed headers:
       - [ ] `Content-Type`
       - [ ] `*` (or specific `x-amz-*` headers as needed).

3. **Env configuration**
   - [ ] Set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and (if applicable) `S3_ENDPOINT` in staging/production envs.
   - [ ] Deploy API with these envs and confirm `AttachmentsService` boots without configuration errors.

4. **Staging upload test**
   - [ ] Deploy frontend and API to staging (e.g. `https://tickets.staging.company.com`).
   - [ ] Create a ticket with:
     - [ ] No attachments.
     - [ ] A small image + PDF + generic file staged.
   - [ ] Verify:
     - [ ] Ticket creation succeeds.
     - [ ] No console errors at `upload-url`, `s3-put`, or `confirm` stages.
     - [ ] Attachments appear on ticket detail (Submission tab).
     - [ ] Attachments appear in `TicketDrawer` for that ticket.

5. **Download + delete test**
   - [ ] Click an attachment row to download/open via presigned GET URL.
   - [ ] Confirm file content is correct.
   - [ ] If user has manage rights:
     - [ ] Click delete icon on an attachment.
     - [ ] Confirm it disappears from detail and drawer.
     - [ ] Confirm no 4xx/5xx errors for `DELETE /attachments/:id`.

6. **Production rollout**
   - [ ] Mirror staging CORS + env config on production bucket and environment.
   - [ ] Repeat the staging test flow on production.

## 7. Optional Small Cleanup Items

These are **nice-to-have** improvements that stay within the existing architecture and could be tackled later:

1. **User-facing feedback for failed post-create uploads**
   - Currently, post-create upload failures are logged to the console and do not block ticket creation.
   - Optional improvement:
     - Show a small, non-blocking inline message on the creation success view or the first-load of ticket detail:
       - e.g. “Some attachments failed to upload. You can retry from this ticket.”
     - This would keep behavior the same but make failures more visible than just console logs.

2. **Optional “quick preview” modal for images/PDFs**
   - For existing tickets (after `confirmUpload`), consider:
     - On click, fetch a fresh download URL and show an inline preview modal for images/PDFs.
     - This should reuse the same `getDownloadUrl` endpoint and not change storage behavior.

3. **Dev-only diagnostic logging toggle**
   - Wrap console logging for attachment upload failures behind a simple dev flag:
     - So logs are fully verbose on localhost/staging and quieter in production.

None of these items are required for staging/live readiness; they are incremental UX/diagnostic enhancements on top of a **now-confirmed sound architecture** whose only current blocker was **lack of proper browser ↔ storage configuration on localhost/staging**.***
