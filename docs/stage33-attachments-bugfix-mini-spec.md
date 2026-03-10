# Stage 33: Attachments Creation/Drawer Crash — Mini-Spec

## 1. Intent

- Diagnose and fix the **missing attachments after ticket creation** and **TicketDrawer runtime crash** without changing the attachment architecture.
- Ensure the Stage 32/33 attachment enhancements are **stable, predictable, and production-ready**, especially around:
  - Ticket creation with staged files.
  - Drawer/detail views immediately after creation.
- Keep the solution **minimal and targeted**: fix concrete defects and tighten UX/feedback where it’s clearly lacking, without redesigning flows or storage.

## 2. Problem Statement

Observed behavior in local testing:

1. On `/tickets/new`, the user staged an **image**:
   - Thumbnail preview appeared correctly in the staged list.
2. After submitting the ticket:
   - The new ticket was created.
   - On navigating to the created ticket, **the uploaded image did not appear** in the attachments list.
3. Shortly after, the **local build “crashed”** and showed:

> `Runtime ReferenceError: setUploadError is not defined`
>
> at `src/components/tickets/TicketDrawer.tsx (38:5) @ TicketDrawer.useEffect`

This indicates:

- A **runtime bug in `TicketDrawer`** (leftover reference to a removed state setter).
- Potential issues with the **post-create attachment upload path** or at least with user feedback when uploads fail.

We need a clear plan to:

- Remove the runtime crash.
- Confirm and fix the conditions under which attachments uploaded during ticket creation may not appear on the created ticket.
- Slightly improve robustness and feedback, without changing attachment architecture.

## 3. Scope

**In scope**

- `TicketDrawer`:
  - Fix `setUploadError` runtime error.
  - Ensure Submission tab / attachments section is stable when tickets are opened/closed.
- `/tickets/new`:
  - Confirm the **staged → post-create upload** flow is correct.
  - Clarify and, if needed, slightly harden error handling so user expectations match behavior.
- Shared attachment components:
  - `UploadDropzone`
  - `TicketAttachmentsSection`
  - `AttachmentRow`

**Out of scope**

- Any schema or endpoint changes for attachments.
- Adding comment-level attachments or list-view attachment indicators.
- A full rework of the ticket creation UX.

## 4. Current Implementation Summary

### 4.1 TicketDrawer

- `TicketDrawer` previously owned attachment upload state (`uploading`, `uploadError`, `fileInputRef`, inline upload UI).
- Stage 33 refactor:
  - Removed local attachment query & upload state.
  - Introduced shared `TicketAttachmentsSection` which now:
    - Fetches `attachmentsApi.list(ticketId)`.
    - Handles upload via S3 presigned pipeline.
    - Handles delete and download.
    - Manages its own `uploading` and `uploadError` state.
  - Drawer now simply renders:
    - `TicketAttachmentsSection ticketId={ticketId!} canManage={canManage} variant="drawer"`.

**Bug:** `useEffect` in `TicketDrawer` still calls `setUploadError(null)` on `ticketId` change, but:

- The `uploadError` state and `setUploadError` setter were removed from `TicketDrawer`.
- Result: `ReferenceError: setUploadError is not defined` when component re-renders and effect runs.

### 4.2 Ticket creation (`/tickets/new`)

- Staging:
  - `stagedFiles: { id: string; file: File }[]` holds selected files.
  - `UploadDropzone` is used to pick/stage files, with its own size validation and error display.
  - Staged list shows:
    - Image thumbnails via `URL.createObjectURL(file)`.
    - PDF / generic file badges.
    - Filename, size, and Remove button per file.
- Submit flow (`handleSubmit`):
  1. Validate form fields.
  2. Build `CreateTicketPayload`.
  3. `mutation.mutateAsync(payload)` → `ticketsApi.create` → returns created `ticketId`.
  4. If `stagedFiles.length > 0`:
     - Set `uploadingAttachments = true`.
     - For each staged file:
       - `attachmentsApi.requestUploadUrl(ticketId, ...)`.
       - `attachmentsApi.uploadToS3(uploadUrl, file)`.
       - `attachmentsApi.confirmUpload(ticketId, { s3Key, ... })`.
       - Any error per file is caught and **swallowed** with a comment “should not fail ticket creation”.
     - Finally, `uploadingAttachments = false`.
  5. Clear `stagedFiles` and navigate to `/tickets/${ticketId}`.

### 4.3 Ticket detail / drawer attachments

- Both detail and drawer use `TicketAttachmentsSection`, which:
  - Uses React Query to load attachments.
  - Handles upload and deletion.
  - Shows “No attachments yet” when there are none.

## 5. Root Causes

### 5.1 Drawer crash: dangling `setUploadError` reference

- After centralizing attachment logic in `TicketAttachmentsSection`, `TicketDrawer` no longer declares:

```ts
const [uploadError, setUploadError] = useState<string | null>(null);
```

- But the `useEffect` that runs when `ticketId` changes still does:

```ts
useEffect(() => {
  setActiveTab('subtasks');
  setCommentBody('');
  setNewSubtask('');
  setUploadError(null);
}, [ticketId]);
```

- At runtime, `setUploadError` is `undefined`, yielding the reported `ReferenceError`.
- This explains the “whole local build crashed” symptom: React’s error boundary shows the runtime error page when the drawer mounts or the ticket ID changes.

### 5.2 Attachments missing after creation

Even without the crash, the user report suggests attachments staged at creation did **not** appear on the created ticket.

Potential contributing factors:

1. **Post-create upload failure with swallowed errors**
   - If `requestUploadUrl`, `uploadToS3`, or `confirmUpload` fails for the staged image, the current code:
     - Catches the error.
     - Does not set any user-visible error at creation time.
     - Proceeds to navigate to `/tickets/${ticketId}`.
   - Result: ticket exists but no attachment records; user sees no attachment, with no clear explanation.

2. **S3 / env misconfiguration**
   - If S3 credentials/bucket are misconfigured locally:
     - `requestUploadUrl` or S3 PUT can fail.
     - Because errors are swallowed, user sees a successful ticket creation but no attachments.

3. **Timing vs navigation**
   - The current implementation awaits each upload and confirm before redirecting, so the attachments *should* be visible by the time the detail/drawer loads.
   - However, if uploads are failing, the redirect still proceeds, reinforcing the “ticket created but no attachments” experience.

4. **UI perception**
   - Staged thumbnail at creation is purely client-side; users may interpret it as “already uploaded”.
   - When they land on the ticket and see no attachments (especially if the drawer then crashes), it looks like the upload “disappeared”.

## 6. Proposed Fixes

### 6.1 Fix the TicketDrawer crash (mandatory)

**Goal:** Remove the `ReferenceError` without reintroducing duplicate attachment state.

- **Option A (preferred):** Remove the call to `setUploadError` entirely.
  - `TicketAttachmentsSection` owns its own error state and resets it when needed.
  - `TicketDrawer` only needs to reset:
    - `activeTab`
    - `commentBody`
    - `newSubtask`
  - This yields:

```ts
useEffect(() => {
  setActiveTab('subtasks');
  setCommentBody('');
  setNewSubtask('');
}, [ticketId]);
```

- **Option B (not recommended):** Reintroduce a local `uploadError` state in `TicketDrawer` and wire it through to `TicketAttachmentsSection`.
  - Adds complexity and duplicates logic already inside `TicketAttachmentsSection`.

**Planned approach:** Use Option A — simplest, least risk, and consistent with the new shared component ownership.

### 6.2 Improve robustness and feedback for create-time attachments

**Goal:** Keep architecture the same, but make behavior and expectations clearer when uploads fail post-create.

Proposed adjustments:

1. **Capture upload failures and surface minimal feedback**
   - When a staged file upload fails during the post-create loop:
     - Collect a list of failed filenames in a local array.
     - After the loop, if any failures occurred:
       - Store a brief message (e.g. `someAttachmentsFailed`) in memory/state.
       - After redirect to `/tickets/${ticketId}`, optionally:
         - Show a small toast/banner on ticket detail (future improvement), or
         - For now, show a non-blocking note on the creation page *before* redirect, indicating that some attachments failed and can be retried from the ticket page.

2. **Do not block ticket creation**
   - Maintain the invariant: ticket creation success is **independent** of attachment upload success.
   - All attachment upload errors remain post-create and non-fatal to ticket creation.

3. **Clarify UX copy around staging**
   - Slightly adjust helper text near the creation attachments block to make it explicit:
     - “Attachments are uploaded after the ticket is created; if an upload fails, you can retry from the ticket view.”

4. **Optional: extra logging in dev**
   - During dev, `console.error` upload failures inside the catch block for easier diagnosis, while still not failing the flow.

### 6.3 Keep shared component behavior consistent

**TicketAttachmentsSection & UploadDropzone**

- Confirm and maintain:
  - 25MB limit on ticket-level uploads (with visible error).
  - Stable behavior when `ticketId` changes (no leaked state across tickets).
  - Proper invalidation of `['ticket', ticketId, 'attachments']` after each successful upload/confirm.

No changes are required here for the reported bug aside from ensuring nothing references undefined state in the parent.

## 7. Files / Modules to Change

- **Primary fixes**
  - `apps/web/src/components/tickets/TicketDrawer.tsx`
    - Remove `setUploadError(null)` from the `useEffect` that depends on `ticketId`.
    - Confirm no other references to `uploadError` or `setUploadError` remain.

- **Optional UX / robustness improvements**
  - `apps/web/src/app/(app)/tickets/new/page.tsx`
    - Enhance error handling in the staged-file upload loop to collect failed filenames and (optionally) surface a brief warning.
    - Update copy around the attachments block to clearly communicate “uploads occur after ticket creation”.

## 8. Testing / Verification Plan

1. **Crash regression**
   - Steps:
     - Start app, open `/tickets`.
     - Open a ticket in `TicketDrawer`.
     - Close and reopen different tickets via the drawer.
   - Verify:
     - No `Runtime ReferenceError` for `setUploadError`.
     - Drawer mounts/unmounts cleanly.

2. **Create-time attachments**
   - On `/tickets/new` with a SUPPORT or MAINTENANCE flow:
     - Stage:
       - A small image (<25MB).
       - A small PDF.
       - A generic document.
     - Submit ticket.
   - Verify:
     - Ticket is created successfully.
     - After redirect to `/tickets/[ticketId]`:
       - All successfully uploaded files appear in the attachments list.
     - If S3 misconfiguration or network error is simulated:
       - Ticket is still created.
       - Attachments may not appear, but any enhanced feedback (if added) is shown.

3. **Drawer/detail parity**
   - Open the same ticket via:
     - `/tickets/[id]` detail page.
     - TicketDrawer from a list view.
   - Verify:
     - Same attachments appear in both.
     - Uploading a file in one view reflects in the other after refresh/invalidations.
     - Deleting from one removes from both.

## 9. Acceptance Criteria

- **Stability**
  - `TicketDrawer` no longer throws `setUploadError` ReferenceError.
  - No new runtime errors introduced in attachments flows.

- **Correctness**
  - Tickets created with staged attachments:
    - Always create successfully.
    - Show attachments on the ticket when uploads succeed.
  - Failures in post-create uploads **do not** roll back or hide the ticket.

- **Transparency (if optional UX tweaks are implemented)**
  - Users are not left guessing when attachments silently fail; there is at least a minimal inline indication that uploads happen after creation and can fail independently.

- **Architecture preservation**
  - No new endpoints, tables, or storage backends.
  - Presigned S3 upload pipeline remains unchanged.
  - No pre-ticket attachment DB records are introduced.***
