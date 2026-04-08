# Hybrid retrieval & product Q&A eval — operator guide

This doc explains **how the AI assistant finds answers in the Rovi product help
corpus**, how to tune it, how to keep the corpus healthy, and how to run the
regression eval set in `docs/rovi/eval-questions.json`.

Audience: admins and developers maintaining the assistant. If you just want to
add or edit an article, see `docs/rovi/README.md` first.

---

## 1. Retrieval architecture (what happens when a user asks Rovi a question)

```
user question
     │
     ▼
┌─────────────────────────┐
│ agent.service SYSTEM    │   "ALWAYS call knowledge_search first for
│ PROMPT                  │    how-do-I / where-is / what-is questions"
└─────────────┬───────────┘
              │ tool call
              ▼
┌─────────────────────────┐
│ tool-router             │   knowledge_search({ query, limit })
│ .knowledgeSearch()      │
└─────────────┬───────────┘
              │ delegates
              ▼
┌──────────────────────────────────────────────────────┐
│ HybridRetrievalService.hybridSearch()                │
│                                                      │
│   ┌───────────────┐     ┌─────────────────────┐      │
│   │ vectorSearch  │     │ keywordSearch       │      │
│   │ (pgvector,    │     │ (ILIKE on title +   │      │
│   │  cosine <=> ) │     │  chunk content)     │      │
│   └───────┬───────┘     └──────────┬──────────┘      │
│           │  pool=max(12, 2*limit) │                 │
│           └──────────┬─────────────┘                 │
│                      ▼                               │
│              Reciprocal Rank Fusion (RRF, k=60)      │
│                      │                               │
│                      ▼                               │
│             top-`limit` HybridChunkHit[]             │
└──────────────────────┬───────────────────────────────┘
                       ▼
               agent LLM draft answer
                grounded in chunks
                with cited sources
```

### Why hybrid (and not just vector)

Pure semantic search is great for paraphrases ("Where can I see urgent work I
need to act on?" → matches the inbox article). It is **brittle for proper
nouns and branded tokens** — a user asking about `LeaseIQ` may not match
chunks that spell it `Lease IQ` if the embedding doesn't pull them close
enough. The keyword side (ILIKE with camelCase expansion) exists specifically
to catch those cases.

### Why Reciprocal Rank Fusion

RRF is score-agnostic: we don't need to normalize the cosine distance against
an ILIKE hit-count. We only care about **each chunk's rank in each list**, so
we sum `1 / (k + rank)` across the two lists. `k = 60` is the de facto
standard and gives a nice long tail (rank 1 → 1/61, rank 10 → 1/70).

### Why no `tsvector` + GIN index

At the current corpus scale (~20 product help articles + handbook, a few
thousand chunks total), ILIKE runs in single-digit milliseconds on Neon and
avoids a migration. If the corpus grows past **~50k chunks** we should add a
generated `tsvector` column + GIN index and swap the keyword SQL. The service
is written so only `keywordSearch()` needs to change.

---

## 2. Document scoping

`HybridRetrievalService` takes a `scope` parameter:

| Scope                  | Includes                                                                   | Used by                     |
| ---------------------- | -------------------------------------------------------------------------- | --------------------------- |
| `general_plus_product` | everything EXCEPT non-Riser handbook PDFs (general, product\_help, Riser)  | `/assistant` agent chat     |
| `handbook`             | only `documentType = 'handbook'` (Riser or uploaded company handbook)      | `/handbook` search surface  |

The assistant always uses `general_plus_product` so users can ask both
"what is LeaseIQ?" (product\_help) and "what's our PTO policy?" (handbook) in
the same chat.

---

## 3. Keyword extraction rules (the small stuff that matters)

`HybridRetrievalService.extractKeywords(query)` is unit-tested in
`hybrid-retrieval.spec.ts`. The rules:

1. Lowercase, split on anything not `[a-z0-9]`.
2. Drop stop words (`how`, `the`, `is`, `do`, `use`, `what`, `where`, etc. —
   see the `STOP_WORDS` set).
3. Drop tokens shorter than 3 characters **unless** the entire query is a
   single token. This is the "sla" / "rbac" / "kpi" exception — 3-char
   acronyms must still match when asked in isolation.
4. For camelCase inputs (`LeaseIQ`), also emit:
   - the individual words (`lease`, `iq`),
   - the full de-camelCased phrase as one token (`lease iq`) so it matches
     the article text literally.
5. Dedupe.
6. Cap total tokens at **10** to keep the SQL bounded.

Title hits score **double** the weight of content hits (titles almost always
contain the canonical feature name, so matching the title is a strong signal).

---

## 4. Configuration knobs

All optional; defaults are safe.

| Env var                  | Default | What it does                                                              |
| ------------------------ | ------- | ------------------------------------------------------------------------- |
| `RAG_DISTANCE_THRESHOLD` | `0.78`  | Cosine distance ceiling for vector search. Higher = more permissive.     |
| `OPENAI_API_KEY`         | —       | Required. Used for `text-embedding-3-small` and `gpt-4o-mini`.           |

Retrieval itself is not externally tunable per request — the agent calls
`knowledge_search` with `limit: 8` (default) and the service expands its
internal pool to `max(limit * 2, 12)` per source before RRF.

### Tuning guidance

- **Too many irrelevant chunks coming back** → lower `RAG_DISTANCE_THRESHOLD`
  (e.g. `0.7`). This tightens the vector half only; keyword still fires.
- **Queries for real features return "not in the docs"** → raise
  `RAG_DISTANCE_THRESHOLD` to `0.85` and re-run the eval set. If the eval set
  still passes, ship it. If not, the article text is probably missing a
  synonym — fix the article, not the threshold.
- **Brittle proper-noun matching** (e.g. a new product name) → add the
  variant to the article's `synonyms` front matter list and re-ingest.
  **Do not** try to fix this by tweaking the threshold; add data instead.

---

## 5. Corpus update workflow

**Every change to the corpus must go through the ingestion script.** Manual
DB edits will be overwritten on the next ingest run.

```bash
cd apps/api

# 1. Edit or add docs/rovi/articles/<slug>.md
# 2. Re-ingest (idempotent — safe to run repeatedly)
npm run ingest:product-help
```

What the script does:

1. Walks `docs/rovi/articles/*.md`.
2. Parses YAML front matter; requires `slug` and `title`.
3. Builds a metadata block (feature, roles, primary/related routes,
   `Also known as:` synonym line, summary) and prepends it to the body.
   This is what makes keyword retrieval resilient to camelCase variants.
4. For each article:
   - If a `KnowledgeDocument` titled `Rovi Help — {title}` with
     `documentType = 'product_help'` exists → re-ingest in place (chunks are
     replaced).
   - Else → create a new one.
5. Deletes any existing `product_help` document whose corresponding markdown
   file no longer exists, so the corpus stays in sync with the repo.

Required env: `DATABASE_URL`, `OPENAI_API_KEY`, reachable Redis (for the
ingestion queue), and at least one active ADMIN user in `users` (used for
`uploadedById`).

### Pitfalls when updating the corpus

- **Forgetting to re-ingest** after editing an article → the assistant will
  still return the old chunks. The script is a few seconds per article; just
  run it.
- **Adding a route that doesn't exist in `APP_HELP_STATIC_PATHS`** → the chat
  UI will render it as a dead link. Always cross-check
  `apps/web/src/lib/app-help-routes.ts`.
- **Renaming a slug** → the old document is deleted and a new one is
  created. Citations in old agent conversation logs will still reference the
  old document id, but new chats will cite the new one.

---

## 6. Eval set — `docs/rovi/eval-questions.json`

The eval set is a regression harness for "did we break retrieval?" It lives
at `docs/rovi/eval-questions.json` and follows this schema:

```json
{
  "id": "leaseiq-001",
  "question": "What is LeaseIQ?",
  "role": "ADMIN",
  "expected_slugs": ["admin-lease-iq"],
  "expected_routes": ["/admin/lease-iq"],
  "must_contain": ["lease"],
  "must_not_contain": ["ask your manager"],
  "note": "optional free-text reason for the question"
}
```

| Field               | Required | Meaning                                                                                        |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `id`                | yes      | Stable identifier — use `<feature>-<NNN>`.                                                     |
| `question`          | yes      | The literal query to send to `knowledge_search` / `/assistant`.                                |
| `role`              | yes      | `ANY`, `STUDIO_USER`, `DEPARTMENT_USER`, or `ADMIN`. Use the role whose permissions you test.  |
| `expected_slugs`    | yes      | Article slugs that **must** appear in the top retrieved chunks (via `Rovi Help — {title}`).    |
| `expected_routes`   | no       | Routes that **must** appear in the assistant's drafted answer.                                 |
| `must_contain`      | no       | Case-insensitive substrings the answer must contain (e.g. `"25"` for the 25 MB attachment cap). |
| `must_not_contain`  | no       | Substrings the answer must NOT contain — used for role-guard tests (e.g. a studio user must not be sent to `/admin/reporting`). |
| `note`              | no       | Human context for why the question exists.                                                    |

### Eval categories currently covered

- **Navigation** (create-\*, tickets-view-\*, portal-\*, dashboard-\*, handbook-\*)
- **Feature explainers** (assistant-\*, leaseiq-\*, dispatch-\*, email-auto-\*)
- **Admin-only features** (workflow-templates-\*, reporting-\*, markets-\*, users-\*, kb-\*, monitoring-\*)
- **Policy & limits** (sla-\*, attachments-\*)
- **Role guards** (role-guard-001, role-guard-002 — studio user must NOT be
  told to open `/admin/*`)
- **Synonym / tokenizer stress** (synonym-001 camelCase `LeaseIQ`, synonym-002
  short `rbac`, synonym-003 short `sse`)

### How to run the eval set

There is no built-in runner yet. The fastest path is to call
`knowledge_search` via curl against a running API:

```bash
# 1. Get a JWT for a role-matching user
JWT=$(curl -s http://localhost:3001/api/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"malfieri05@gmail.com"}' | jq -r .access_token)

# 2. Hit the assistant with a question
curl -s http://localhost:3001/api/assistant/chat \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is LeaseIQ?"}]}'
```

Manual checks per question:

1. **Did `expected_slugs` appear?** The assistant response includes cited
   source titles like `Rovi Help — Lease IQ (admin)`. The slug for that
   article (`admin-lease-iq`) should be in the expected list.
2. **Did `expected_routes` appear?** grep the drafted answer text for each
   path.
3. **Did `must_contain` / `must_not_contain` hold?** case-insensitive
   substring check.
4. For `role: STUDIO_USER` or `DEPARTMENT_USER` questions, log in as a test
   user with that role (or impersonate via dev-login) so the agent's
   `get_current_user_context` tool sees the right role.

A lightweight Node runner that loops over the JSON and writes pass/fail is a
good next addition — see §8.

### Adding new eval questions

When you add a new product\_help article, add **2–4 eval questions** that
specifically exercise it. Include at least one question that is worded
differently from the article's title — that's what catches retrieval
regressions.

Good:
```json
{ "id": "dispatch-003",
  "question": "How do I group three HVAC tickets into one vendor visit?",
  "role": "ADMIN",
  "expected_slugs": ["admin-dispatch"],
  "expected_routes": ["/admin/dispatch"] }
```

Bad (just a restatement of the title — doesn't test retrieval):
```json
{ "id": "dispatch-003",
  "question": "vendor dispatch",
  "role": "ADMIN",
  "expected_slugs": ["admin-dispatch"] }
```

---

## 7. Debugging retrieval failures

When a real user says "Rovi couldn't answer my question":

1. **Reproduce** — ask the same question in `/assistant` as the same role.
2. Check the `agent_action_logs` table for that conversation. `knowledge_search`
   tool calls log the `query` and the returned chunk titles.
3. If `knowledge_search` returned **no chunks**:
   - Run `extractKeywords` mentally on the query. Are any tokens left?
   - Look at the matching article — does its body or `synonyms` list cover
     any of those tokens? If not, add them and re-ingest.
   - If tokens exist but the article is still not matching, bump
     `RAG_DISTANCE_THRESHOLD` temporarily to confirm it's a vector gap, then
     fix the article text rather than leaving the threshold loose.
4. If `knowledge_search` returned chunks but the agent still answered badly:
   - The agent's `SYSTEM_PROMPT` is the other half of the fix. Check that
     the chunks it retrieved actually contain the answer; if they do, this
     is a prompt/grounding issue, not a retrieval issue.
5. If the agent cited a slug but sent the user to a wrong or missing route:
   - Check the article's `primary_routes` list.
   - Cross-check `apps/web/src/lib/app-help-routes.ts` — if the path isn't
     listed, the chat UI won't linkify it.

---

## 8. Future work (not blocking)

- **Eval runner script** — `scripts/run-product-help-eval.ts` that loads
  `eval-questions.json`, calls the assistant per question, applies the
  expected-slug / route / must-contain checks, and prints a pass/fail
  summary. Wire it into CI once the API has a repeatable local
  testing harness.
- **`tsvector` + GIN index** — only once corpus > 50k chunks. Add a
  generated `content_tsv` column on `document_chunks`, a GIN index, and
  swap `keywordSearch()` to use `to_tsquery` + `ts_rank_cd`. No consumer
  changes needed — `HybridChunkHit` stays the same.
- **Chunk-level synonyms boost** — currently synonyms are embedded in the
  prepended metadata block for every chunk of an article. For very long
  articles, only the first few chunks get strong synonym weight. If this
  matters, append the synonym line to **every** chunk at ingestion time.
- **Per-role corpus filtering at the SQL layer** — today the agent's
  `SYSTEM_PROMPT` tells the model to refuse to send studio users to
  `/admin/*` paths. A stricter approach would be to pre-filter
  `knowledge_search` results by the caller's role so admin-only articles
  never even come back to a studio user.
