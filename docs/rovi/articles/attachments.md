---
slug: attachments
title: "Attachments (upload, download, 25 MB limit)"
feature: "Attachments"
roles: [STUDIO_USER, DEPARTMENT_USER, ADMIN]
primary_routes:
  - /tickets/new
  - /tickets
related_routes:
  - /portal
synonyms:
  - attachment
  - attachments
  - upload file
  - upload photo
  - drag and drop
  - file size limit
  - 25mb
  - s3 upload
  - presigned url
  - download attachment
summary: "Drag-and-drop file upload on the New Ticket form and ticket drawer, backed by S3 presigned URLs with a 25 MB per-file limit."
---

# Attachments (upload, download, 25 MB limit)

**Who can use this:** everyone (within their visibility scope).
**Where to find it:** the attachments area on /tickets/new and inside
the ticket drawer on /tickets or /portal.

## What it does
Attachments are stored in S3 (or an S3-compatible bucket like R2). The
API never streams file bytes — uploads and downloads both use presigned
URLs so the browser talks directly to S3 and the API only records the
metadata row in `ticket_attachments`.

## Steps (upload)
1. On /tickets/new or in the ticket drawer, drag a file onto the
   attachments area (or click to open a file picker).
2. Rovi requests a presigned PutObject URL from the API, the browser
   PUTs the file to S3, then the browser calls `confirm-upload` so the
   API writes the metadata row.
3. The attachment appears in the list with a thumbnail (images) or an
   icon (other). Notifications fire for watchers on
   ATTACHMENT_ADDED.

## Steps (download)
1. Click any attachment in the drawer.
2. Rovi requests a presigned GetObject URL and redirects the browser
   straight to S3.
3. The link expires after a few minutes — reload the drawer to get a
   fresh link.

## Limits
- **25 MB per file**, enforced at the API layer before the presigned
  URL is issued.
- The file must be one of the allowed MIME types (images, PDFs,
  common office docs); exotic formats are rejected.

## Common pitfalls
- Files over 25 MB fail before hitting S3. Compress images or upload
  multiple smaller files.
- If you see "failed to confirm upload" after a successful S3 PUT,
  the file **is** in S3 but the DB row wasn't written — retry the
  upload; Rovi will overwrite cleanly.

## Related
- /tickets/new — primary attachment surface on create
- /tickets — attachments on existing tickets
