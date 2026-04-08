# Rovi product help corpus

This directory holds the canonical, task-oriented articles that power the AI
Assistant's "how do I use this app" answers. Each article in
`docs/rovi/articles/` is ingested into the knowledge base as a standalone
`KnowledgeDocument` with `documentType = 'product_help'`.

The Assistant's `knowledge_search` tool is biased to retrieve product_help docs
first for "how do I / where do I / what is the …" questions, and the agent
`SYSTEM_PROMPT` requires it to call `knowledge_search` (never guess navigation,
never default to "ask your manager" before searching).

## File layout

```
docs/rovi/
├── README.md                  ← this file (corpus format + add/edit workflow)
├── HYBRID-RETRIEVAL.md        ← retrieval architecture, tuning, eval runner guide
├── articles/                  ← one markdown per app surface
│   ├── tickets-create.md
│   ├── tickets-view.md
│   ├── inbox-actionable.md
│   ├── portal.md
│   ├── notifications.md
│   ├── dashboard.md
│   ├── assistant.md
│   ├── handbook.md
│   ├── admin-workflow-templates.md
│   ├── admin-dispatch.md
│   ├── admin-reporting.md
│   ├── admin-markets.md
│   ├── admin-users.md
│   ├── admin-knowledge-base.md
│   ├── admin-lease-iq.md
│   ├── admin-email-automation.md
│   ├── admin-system-monitoring.md
│   ├── locations-profile.md
│   ├── sla.md
│   └── attachments.md
└── eval-questions.json        ← product Q&A regression set
```

## Article format (required)

Every article MUST start with YAML front matter, followed by the article body.
Front matter is parsed by the ingestion script to build the document title,
append synonyms to the embedded text, and tag documents for retrieval:

```markdown
---
slug: admin-workflow-templates
title: "Workflow templates (admin)"
feature: "Workflow templates"
roles: [ADMIN]
primary_routes:
  - /admin/workflow-templates
  - /admin/workflow-templates/new
related_routes:
  - /tickets/new
  - /admin/dispatch
synonyms:
  - workflow template
  - workflow templates
  - subtask templates
  - template manager
  - workflow analytics
summary: "Manage subtask workflow templates that auto-expand on matching tickets."
---

# Workflow templates (admin)

**Who can use this:** ADMIN only.
**Where to find it:** open /admin/workflow-templates.

## What it does
...

## Steps
1. ...
2. ...
3. ...

## Common pitfalls
- ...

## Related
- /tickets/new
- /admin/dispatch
```

### Field rules

- **slug**: kebab-case, unique; used to build the `KnowledgeDocument.title`
  (`Rovi Help — {title}`) and to make ingestion idempotent.
- **title**: human-readable — shown as the citation label in chat.
- **feature**: short marketing-style name ("Lease IQ", "Vendor dispatch").
- **roles**: subset of `[STUDIO_USER, DEPARTMENT_USER, ADMIN]`. The agent will
  refuse to send a user to a route their role cannot access.
- **primary_routes**: paths matching `apps/web/src/lib/app-help-routes.ts`
  (`APP_HELP_STATIC_PATHS`). Use real, linkable paths so the chat UI can
  render them as clickable links.
- **related_routes**: other paths a user might jump to from this feature.
- **synonyms**: brittle-query insurance. Include camelCase and spaced variants
  ("LeaseIQ", "Lease IQ", "lease iq"). These are appended to the embedded
  chunk text AND indexed by the keyword side of hybrid retrieval, so queries
  that miss on semantics still match on substring.
- **summary**: one sentence the agent can fall back on when nothing else fits.

### Body rules

- 300–700 words. Task-oriented, no marketing fluff.
- 3–7 numbered steps per procedure. Use real paths (`/tickets/new`, not
  "click the New Ticket button in the sidebar").
- Include at least one "Common pitfalls" line where useful.
- End with a "Related" list of 2–4 linkable paths.

## Ingesting / updating the corpus

From `apps/api/`:

```bash
npx ts-node --transpile-only -r dotenv/config scripts/ingest-product-help.ts
```

This script is **idempotent**: it re-ingests each article by slug, replacing
chunks in-place so stale content is never left behind. If you delete an
article's markdown file it will also delete the corresponding
`KnowledgeDocument` so the corpus stays in sync with the repo.

Required env: `DATABASE_URL`, `OPENAI_API_KEY`, reachable Redis.

## Adding a new article

1. Create `docs/rovi/articles/<slug>.md` using the template above.
2. Add the slug (and any new synonyms) to an existing `related_routes` list on
   adjacent articles if there's a natural cross-link.
3. Add 2–4 questions to `docs/rovi/eval-questions.json` that specifically test
   retrieval of the new article (include its `slug` in `expected_slugs`).
4. Run the ingestion script.
5. Open `/assistant` and ask a few of the new eval questions.

## See also

- **`HYBRID-RETRIEVAL.md`** — how the assistant actually finds these
  articles (vector + keyword RRF), config knobs (`RAG_DISTANCE_THRESHOLD`),
  debugging recipes, and how to run the eval set.
- **`eval-questions.json`** — regression eval set. Add 2–4 questions per
  new article.

## Anti-hallucination contract

- Every article MUST use paths that exist in `APP_HELP_STATIC_PATHS`.
- Do NOT invent screens, settings, or URLs that are not in the app.
- When a feature is role-gated, the "Who can use this" line is the
  single source of truth the agent consults before quoting a step.
- The agent's `SYSTEM_PROMPT` instructs it to say "the help docs don't cover
  that yet" rather than fabricate — it should NEVER default to "contact your
  manager" before calling `knowledge_search`.
