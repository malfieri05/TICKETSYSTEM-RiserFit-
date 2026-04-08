---
slug: admin-knowledge-base
title: "Knowledge base ingestion (admin)"
feature: "Knowledge base"
roles: [ADMIN]
primary_routes:
  - /admin/knowledge-base
related_routes:
  - /assistant
  - /handbook
  - /admin/system-monitoring
synonyms:
  - knowledge base
  - kb
  - ingest document
  - upload document
  - paste text
  - handbook pdf
  - reindex
  - document chunks
  - rag ingestion
  - product help ingestion
  - re-embed
summary: "Upload and manage the documents that power the AI Assistant and Handbook chat — PDFs, pasted text, URLs, and product help articles."
---

# Knowledge base ingestion (admin)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/knowledge-base.

## What it does
/admin/knowledge-base is the control room for RAG content. Everything in
here ends up as embedded chunks in `document_chunks` and gets retrieved
by /assistant and /handbook. There are three document types today:

- **handbook** — studio-facing manuals, powers /handbook.
- **product_help** — the Rovi product help corpus in docs/rovi/articles,
  powers /assistant's "how do I" answers.
- **general** — anything else (policies, procedures, the original
  Platform user guide).

## Steps (ingest a document)
1. Open /admin/knowledge-base.
2. Pick the ingest mode:
   - **Handbook PDF** — upload a PDF (up to ~10 MB). Rovi extracts text
     via pdf-parse, page numbers are tracked so citations can say
     "Pages 4, 5".
   - **Paste text** — title + a big textarea. Good for quick edits.
   - **Upload file** — .txt or .md up to 10 MB.
3. Give it a clear title. For product help, prefix with "Rovi Help —"
   so it's easy to find in the list.
4. Submit. The doc appears in the table with a chunks count, toggle for
   active/inactive, and a delete action.

## Steps (keep the product help corpus fresh)
1. Edit or add markdown files in docs/rovi/articles.
2. From `apps/api`, run
   `npx ts-node --transpile-only -r dotenv/config scripts/ingest-product-help.ts`.
3. The script re-ingests each article idempotently by slug — no
   duplicates, stale chunks are removed, and articles deleted from the
   repo are deleted from the KB.

## Common pitfalls
- "Indexed" ≠ "active". A doc can be indexed and still toggled off;
  /assistant only retrieves `isActive = true` docs.
- Handbook docs are scoped — only /handbook sees them, not /assistant.
- If a PDF produces zero chunks, re-export it and try the paste-text
  mode; some PDFs are image-only and need OCR that pdf-parse can't do.

## Related
- /assistant — the primary consumer of product_help + general docs
- /handbook — the consumer of handbook docs (studio users)
- /admin/system-monitoring — knowledge ingestion queue health
