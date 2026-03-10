# Stage 33: Attachment Surface Completion and Premium Upload UX — Mini-Spec

## 1. Intent

- Ensure **ticket attachments are available and consistent everywhere they are product‑expected**, not just on ticket detail after creation.
- Deliver a **premium, modern upload UX** (drag-and-drop, previews, clear states) built on the existing attachment architecture (S3 presigned uploads + `TicketAttachment` model).
- Keep the solution **maintainable and architecture-preserving**: no new storage providers, no comment-level schema changes, and minimal additional state complexity.

## 2. Problem Statement

Current state after Stage 32:

- Backend attachment pipeline is solid and production-ready:
  - `TicketAttachment` model + Prisma wiring.
  - S3-compatible presigned upload + confirm flow.
  - Ticket-scoped list, download, and delete endpoints.
- Frontend attachment UX exists and is being polished for:
  - Ticket detail (`/tickets/[id]` Submission tab).
  - `TicketDrawer` Submission tab.
- Gaps and open questions:
  - **Ticket creation (`/tickets/new`) has no attachment support**, even for flows where users logically need to attach files up front (e.g. HR forms, maintenance issues with photos).
  - Other ticket surfaces (portal views, inbox/inbox detail, reporting views) may not surface attachments at all.
  - Admin / knowledge-base already uses separate upload UIs with good UX patterns; these patterns are **not reused** for ticket attachments.
  - Premium UX elements (drag-and-drop, previews, pending state, progress, error/empty polish) are **present for some flows (KB)** but not standardized for attachments.

We need a spec that:

- Audits all relevant surfaces and explicitly calls out which ones **do** and **do not** support attachments today.
- Defines the **intended behavior** of attachments by surface (including creation flows).
- Proposes a **clean, incremental implementation plan** to:
  - Add missing attachment support where required.
  - Upgrade UX to a premium, predictable pattern.
  - Avoid new architectural complexity (no pre-ticket DB records, no new storage systems).

## 3. Scope

**In scope**

- Ticket-facing attachments:
  - Ticket creation: `/tickets/new`.
  - Ticket detail: `/tickets/[id]` (all tabs where attachments are relevant).
  - `TicketDrawer`.
  - Any ticket-related portal / inbox surfaces that should show attachments.
- Admin / knowledge / AI surfaces:
  - Confirm which already use separate upload flows (e.g. `/admin/knowledge-base`) and **decide if any shared attachment UI patterns should be cross-applied**.
- UX improvements for ticket attachments:
  - Drag‑and‑drop upload zone.
  - Selected file and pending upload state.
  - Upload progress (where feasible) or at least clear “uploading” feedback.
  - Image and PDF preview where appropriate.
  - Non-preview fallback for other file types.
  - Remove/cancel pending files.
  - Error/empty state polish.

**Out of scope**

- Changing the core attachment architecture:
  - Remains: presigned PUT to S3 → confirm → `TicketAttachment` record → presigned GET.
- Introducing comment-level attachment models or cross-ticket document entities.
- Replacing S3-compatible storage with another provider.
- Broad redesigns of ticket detail or drawer layout.

## 4. Current Attachment Surfaces and Gaps

### 4.1 Ticket creation (`/tickets/new`)

**Implementation today**

- File: `apps/web/src/app/(app)/tickets/new/page.tsx`.
- Behavior:
  - Schema-driven create-ticket form.
  - Textual and structured fields only (`Input`, `Textarea`, `Select`).
  - No `<input type="file">`, no `attachmentsApi` usage, no staging of files.
  - On submit, payload is `CreateTicketPayload` with title/description, taxonomy fields, and `formResponses`; no attachment data.

**Gap**

- **No ability to add attachments at creation time**, even for:
  - SUPPORT tickets where upload of HR forms or screenshots is likely.
  - MAINTENANCE tickets where photos of issues are critical.

### 4.2 Ticket detail (`/tickets/[id]`)

**Implementation today**

- File: `apps/web/src/app/(app)/tickets/[id]/page.tsx`.
- Attachments are handled in the **Submission** tab:
  - Fetch: `useQuery(['ticket', id, 'attachments'], attachmentsApi.list(id))`.
  - Upload:
    - `handleFileUpload(file)` → request upload URL → direct S3 upload → confirm → invalidate attachments query.
    - Drag-and-drop + click-to-upload zone (single-file).
    - Uploading state + error banner.
  - List:
    - Ticket-scoped attachment list with filename, size, uploader, relative timestamp.
    - Download: row click or download icon → `attachmentsApi.getDownloadUrl()` → `window.open`.
    - Delete: visible for `canManage` roles.

**Gaps**

- Good base UX, but:
  - Upload is **single-file**; there is no multi-select or queue/pending concept.
  - Previews are not differentiated: all files are displayed as generic rows.
  - Drag-and-drop is limited to a single file drop (first file only).

### 4.3 TicketDrawer (`TicketDrawer` component)

**Implementation today**

- File: `apps/web/src/components/tickets/TicketDrawer.tsx`.
- Very similar to detail:
  - Submission tab includes attachments block:
    - Drag-and-drop + click-to-upload picker.
    - Uploading + error state.
    - Attachment list showing filename, uploader, size, relative timestamp.
    - Row click → download; delete for `canManage`.

**Gaps**

- Same as detail:
  - Single file at a time; no queued uploads.
  - No image/PDF previews; everything is a simple row.
  - No shared attachment row component between detail and drawer (duplicate markup).

### 4.4 Other ticket views (portal, inbox, reporting)

**Likely state (from prior tickets + codebase structure)**

- Portal & inbox pages (`/portal`, `/inbox`, `/tickets`) show ticket lists and open tickets either:
  - In TicketDrawer, which does include attachments.
  - Or via navigation to `/tickets/[id]`.
- **List views themselves** do not show attachment chips or counts.

**Gaps**

- In some workflows, users may expect to quickly see whether a ticket has attachments (e.g. an icon or count in the list row); this is not currently implemented.
  - This is optional polish; not a core functional blocker.

### 4.5 Admin / knowledge / AI surfaces

- `/admin/knowledge-base` (file uploads for knowledge docs):
  - Has a more polished upload UX:
    - Drag-and-drop zones.
    - Selected file state.
    - Remove/cancel selected file.
    - Different “modes” (text, file, pdf).
  - Uses a separate AI-specific ingestion API, **not** the ticket attachment pipeline.

**Gaps / opportunities**

- Good UX patterns exist here that can be **borrowed for attachments**:
  - Drag-and-drop styling.
  - Selected file summary + “Remove” action.
  - Simple, visible constraints (e.g. max size).
- No need to unify the backends; just reuse UX patterns in attachments UI components.

## 5. Ticket Creation Attachment Strategy

### 5.1 Requirements and constraints

- Some ticket flows **must** support attachments at creation:
  - HR/support workflow tickets where users upload forms or screenshots.
  - Maintenance tickets where photos of damage/fixtures are important context.
- Constraints:
  - Backend must **remain the source of truth**:
    - No pre-ticket `TicketAttachment` rows or alternate attachment tables.
  - We **must not** invent a pre-ticket attachment ID scheme or new storage.
  - Create-ticket API (`ticketsApi.create`) remains focused on ticket data, not binary uploads.

### 5.2 Proposed strategy: client-side staging, post-create upload

1. **Client-side staging only**
   - On `/tickets/new`, allow users to **select or drag-and-drop files** into a staged attachments area.
   - Keep staged files in local component state:
     - `stagedFiles: { id: string; file: File; error?: string }[]`.
   - Provide:
     - File name, size, and basic type icon.
     - Ability to remove staged files before submit.

2. **Ticket creation first, attachments second**
   - On submission:
     - Call `ticketsApi.create(payload)` **without attachments**.
     - After success, obtain the new ticket ID from response.
   - Then, for each staged file:
     - Use the **existing attachment pipeline**:
       - `attachmentsApi.requestUploadUrl(ticketId, { filename, mimeType, sizeBytes })`.
       - `attachmentsApi.uploadToS3(uploadUrl, file)`.
       - `attachmentsApi.confirmUpload(ticketId, { s3Key, filename, mimeType, sizeBytes })`.
     - This can be done sequentially or with limited concurrency (e.g. 2–3 uploads at a time) to avoid overwhelming S3.
   - Only after:
     - Either: navigate immediately to `/tickets/[id]` and let the detail view show attachments as they land.
     - Or: show a temporary “Your ticket is created; attachments are still uploading” indicator before redirect.

3. **Surface selection by ticket type**

- Not all ticket classes need attachments at creation.
- Strategy:
  - Enable **creation-time attachments** for:
    - SUPPORT tickets whose department/support topic config indicates attachments are relevant.
    - MAINTENANCE class by default (photo-heavy).
  - Keep a minimal mapping/config in the frontend (or from taxonomy) to control:
    - `allowAttachmentsOnCreate: boolean` for each topic/category.
  - For classes/topics where attachments are **not** expected:
    - Do not show the attachments area at creation time; rely on post-creation attachments via detail/drawer.

4. **Failure modes**

- If ticket creation fails:
  - Staged files remain in memory; show error and let user resubmit.
- If some attachments fail after ticket create:
  - Ticket remains created (backend source of truth).
  - Show per-file error in the creation success view or once the user lands on ticket detail (e.g. toast).
  - Users can retry uploads from the ticket detail/drawer attachments section.

## 6. Existing Ticket Surface Strategy

### 6.1 Detail vs Drawer parity

- Use a **shared attachment UI component** for row rendering and possibly the upload panel:
  - E.g. `TicketAttachmentsSection` that:
    - Accepts `ticketId`, `attachments`, `canManage`, and variation props (`variant: 'detail' | 'drawer'`).
    - Encapsulates:
      - Drag-and-drop zone.
      - Hidden file input.
      - Uploading + error rendering.
      - Attachment list with click/download/delete logic.
  - Keep `handleFileUpload` logic colocated where hook usage and query invalidation are already set up, but pass callbacks into the shared component.

### 6.2 Consistent UI behavior

For both detail and drawer:

- **Upload panel**
  - Same copy and visual tokens.
  - Drag-and-drop + click-to-upload.
  - Clear max size and allowed-type messaging.
- **Attachment rows**
  - Shared look and feel (icon, typography, spacing).
  - Row hover: `transition-colors duration-150` + `hover:bg-[var(--color-bg-surface-raised)]`.
  - Primary click = download.
  - Delete icon only for `canManage` roles (ADMIN / DEPARTMENT_USER).

### 6.3 Optional list-view indicators

- Consider a **small, non-blocking enhancement** for ticket rows in list views (inbox, portal, tickets list):
  - Show an attachment icon and count if `ticket.attachments.length > 0` in the list item.
  - No download interaction from the list; clicking opens drawer or detail where full attachments UI lives.
  - This requires list endpoints to return `attachmentsCount` or aggregated metadata; can be added via existing reporting/summary fields if low-risk.

## 7. Premium Upload UX Strategy

### 7.1 Drag-and-drop and selection

- Standardize a **reusable upload dropzone** component with:
  - Visual states:
    - Idle: dashed border, neutral icon, “Click or drag to upload”.
    - Hover/drag-over: accent-colored border and subtle background tint.
    - With selected files (for staging in `/tickets/new`): highlight + list of selected names.
  - Behavior:
    - Click opens hidden file input.
    - Drop event extracts files and calls `onFilesSelected(FileList | File[])`.
    - Respects size/type limits (client-side).

### 7.2 Pending uploads and progress

- For **ticket creation**:
  - Staged list shows:
    - File name.
    - Size.
    - Type icon.
    - Remove button.
  - Once ticket is created and attachments start uploading:
    - Show an “Uploading…” badge or spinner at the list level.
    - Optional per-file progress is nice but not required for Stage 33:
      - If added, use `XMLHttpRequest`/Fetch with progress events for PUT to S3; otherwise, show indeterminate progress.

- For **ticket detail/drawer**:
  - Maintain current behavior (spinner while uploading single file).
  - Optionally extend to support multiple pending uploads queued by user (nice to have, but keep scope tight).

### 7.3 Error and empty states

- Error states:
  - Clear, concise messages:
    - Size exceeded: “File must be smaller than 25MB.”
    - Client-side type rejection: e.g. “This file type is not supported.”
    - Generic upload failure: “Upload failed. Please try again.”
  - Use consistent styling across detail and drawer (e.g. soft red background with icon).

- Empty states:
  - In attachments list:
    - “No attachments yet.” with muted meta text.
  - For staged attachments at creation:
    - No separate message; the dropzone copy is sufficient.

## 8. Preview Behavior Strategy

### 8.1 Supported preview types

- **Images**: `image/*` (`.png`, `.jpg`, `.jpeg`, `.gif`, etc.).
- **PDF**: `application/pdf`.

### 8.2 Preview approach

- **Ticket creation (`/tickets/new`)**
  - Pre-submission:
    - For staged files:
      - Images: show small thumbnail using `URL.createObjectURL(file)` inside the staged list.
      - PDF: show PDF icon + “PDF” label (optional page count not required).
    - This is purely client-side; no S3 involvement before ticket exists.

- **Existing tickets (detail/drawer)**
  - For attachments already uploaded to S3:
    - Keep primary action as **download / open in new tab via presigned URL**.
    - For premium feel without heavy additional infra:
      - Inline preview can be limited to:
        - A thumbnail-size `<img>` when the presigned URL is opened in a new window/tab (default browser behavior for images).
      - For now, we avoid embedding live previews inside the app (no `<iframe>` or `<img>` bound directly to presigned URLs) to:
        - Keep complexity and token usage low.
        - Avoid dealing with expiring URLs in component state.
  - Future-optional:
    - If needed later, support “Quick preview” modals that:
      - Fetch a fresh presigned GET URL on demand.
      - Render `<img>` or `<embed>` / `<iframe>` for image/PDF in a modal.

### 8.3 Non-preview types

- All other types (ZIP, DOCX, XLSX, etc.) keep the **row + icon + download** representation.
- Distinguish by icon:
  - Document, spreadsheet, archive icons, etc. (optional; not required for Stage 33).

## 9. API / Storage / State Management Considerations

### 9.1 API

- **No new endpoints**:
  - Reuse:
    - `POST /tickets/:ticketId/attachments/upload-url`
    - `POST /tickets/:ticketId/attachments/confirm`
    - `GET /tickets/:ticketId/attachments`
    - `GET /attachments/:id/download-url`
    - `DELETE /attachments/:id`
- **No changes** to:
  - Core ticket `create` API.
  - `TicketAttachment` schema.

### 9.2 State management

- **Ticket creation**
  - State:
    - `stagedFiles` (array of local `File` + metadata).
    - `uploadingAttachments` (boolean or per-file status) during post-create upload.
  - Lifecycle:
    - Staged files cleared on:
      - Successful upload for each file.
      - User explicitly removing them.
      - Navigating away or canceling the new ticket.

- **Existing tickets**
  - Continue to rely on React Query queries keyed by `['ticket', id, 'attachments']`.
  - Upload operations invalidate that query on success.
  - No requirement for local “shadow” attachment state beyond `uploading` flags.

### 9.3 Orphan management

- **Pre-ticket**:
  - All staged files live purely in memory; no S3 objects created until ticket exists.
  - This avoids any pre-ticket S3 or DB orphans.

- **Post-ticket**:
  - Orphaned S3 objects can only result from partial pipeline (upload URL requested but no confirm).
  - This risk already exists and is bounded; Stage 33 does not significantly increase it.

## 10. Security / Reliability Considerations

- **Security**
  - Preserve:
    - Authenticated access to all attachment endpoints.
    - Ticket-level visibility rules for attachment list/download/delete.
  - Validation:
    - Keep 25MB server-side limit.
    - Enforce client-side size checks in both creation and existing ticket UIs.
    - Consider a light MIME allowlist, coordinated across:
      - Ticket attachments.
      - Knowledge base file uploads.

- **Reliability**
  - Ensure **ticket creation and attachments are decoupled**:
    - Ticket creation must succeed or fail **independently** of attachment uploads.
  - Graceful degradation:
    - If attachment uploads fail post-create:
      - Ticket is still usable.
      - Errors are surfaced to the user, who can retry from detail/drawer.
  - Observability:
    - Continue logging attachment failures on the backend.
    - Consider a small UI note for repeated failures.

## 11. Files / Modules Likely Involved

- **Frontend**
  - `apps/web/src/app/(app)/tickets/new/page.tsx`
  - `apps/web/src/app/(app)/tickets/[id]/page.tsx`
  - `apps/web/src/components/tickets/TicketDrawer.tsx`
  - `apps/web/src/lib/api.ts` (`attachmentsApi`)
  - Shared UI:
    - New components: `TicketAttachmentsSection`, `UploadDropzone` (or similar).
    - Potential list-row icon updates in ticket list components (`TicketRow`, portal rows, inbox rows).

- **Backend** (no structural changes; may only need minor validation tweaks if MIME allowlist added)
  - `apps/api/src/modules/attachments/attachments.service.ts`
  - `apps/api/src/modules/attachments/attachments.controller.ts`
  - `apps/api/src/modules/tickets` (only if list endpoints need an attachments count).

## 12. Test / Validation Plan

- **Ticket creation**
  - For SUPPORT and MAINTENANCE flows that should support attachments:
    - Create a ticket with:
      - No staged attachments.
      - One staged attachment.
      - Multiple staged attachments (images + PDFs + generic files).
    - Confirm:
      - Ticket is created successfully.
      - Attachments appear in detail and drawer after creation.
      - Removing staged files before submit works.
      - Errors are shown if file >25MB or unsupported type.

- **Existing tickets**
  - On `/tickets/[id]` and in `TicketDrawer`:
    - Upload small image, PDF, and generic file:
      - See correct rows and metadata.
      - Download opens file via presigned URL.
      - Delete removes from both UI and backend.
    - Try drag-and-drop vs click-to-upload.
    - Confirm error and empty states.

- **Cross-surface consistency**
  - Confirm detail and drawer show the same attachments for a ticket.
  - If list views gain attachment indicators, confirm counts match the attachment list.

- **Regression**
  - Ensure:
    - No changes to ticket state machine or notifications.
    - No regressions in knowledge-base upload flows.
  - Lint and type-check all touched files.

## 13. Acceptance Criteria

- **Coverage**
  - Ticket flows that require attachments at creation (SUPPORT/MAINTENANCE contexts) support client-side staging and post-create uploads.
  - Ticket detail and drawer share a consistent, premium attachments UX.

- **Architecture preservation**
  - No new storage providers.
  - No new attachment tables.
  - All uploads still go through the S3 presigned upload + confirm pipeline.

- **UX quality**
  - Drag-and-drop upload zones on all attachment entry points.
  - Clear size/type constraints and friendly error messages.
  - Image/PDF previews where appropriate (at least in staged creation UI).
  - Row-level hover, selection, and action affordances aligned with existing ticket UI polish.

- **Safety and maintainability**
  - Ticket creation remains robust even when attachments fail.
  - No pre-ticket DB records or complex orphan-cleanup logic introduced.
  - Implementation uses shared components for dropzones and attachment rows, minimizing duplication.

