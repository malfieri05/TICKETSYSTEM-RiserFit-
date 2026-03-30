# Platform user guide — manual QA checklist

Run after ingesting [platform-user-guide.md](platform-user-guide.md) (`npm run ingest:platform-guide` from `apps/api` or Admin KB paste).

For each role, open **AI Assistant** (`/assistant`) and verify answers mention correct paths where relevant and **do not** send users to admin URLs they cannot use.

## Questions (all roles)

| # | Question | Expect |
|---|----------|--------|
| 1 | How do I create a new maintenance ticket? | Mentions `/tickets/new` or New Ticket; knowledge_search used |
| 2 | Where is the main ticket list for staff? | `/tickets` (studio users: portal) |
| 3 | What is the difference between the Assistant and the Handbook? | Assistant = operational; Handbook = company manuals for studio users |
| 4 | How do I open notifications? | `/notifications` |

## Department user (non-admin)

| # | Question | Expect |
|---|----------|--------|
| 5 | How do I edit a workflow template? | Says **admin only** or not available; no `/admin/workflow-templates` as if they can open it |
| 6 | Where are dispatch groups? | Admin-only framing |

## Admin

| # | Question | Expect |
|---|----------|--------|
| 7 | How do I edit a workflow template? | `/admin/workflow-templates`, create at `/admin/workflow-templates/new` |
| 8 | Where is vendor dispatch and dispatch groups? | `/admin/dispatch`, groups under `/admin/dispatch/groups/...` when explaining detail |
| 9 | Where is reporting? | `/admin/reporting` |
|10 | What is the Actionable inbox? | `/inbox`, admin-only |

## Studio user

| # | Question | Expect |
|---|----------|--------|
|11 | Where is my home page? | `/portal` or portal home |
|12 | Can I open workflow templates admin? | No; explain role limitation |

## Linkification (UI)

With an admin account, ask for “the exact path to vendor dispatch” and confirm the assistant prints `/admin/dispatch` as a **clickable** link in the chat bubble.

## Retrieval sanity (optional)

With API + DB access, run agent chat or a one-off query: `knowledge_search`-style embedding search for “workflow template” should return chunks from **Platform user guide (RAG)** after ingest.
