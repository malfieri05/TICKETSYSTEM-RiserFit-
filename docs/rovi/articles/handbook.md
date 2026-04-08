---
slug: handbook
title: "Handbook chat (studio users)"
feature: "Handbook"
roles: [STUDIO_USER, ADMIN]
primary_routes:
  - /handbook
related_routes:
  - /assistant
  - /admin/knowledge-base
synonyms:
  - handbook
  - employee handbook
  - company handbook
  - studio handbook
  - company policy
  - policy lookup
  - riser handbook
summary: "Studio-facing RAG chat scoped to company handbook documents — policy, procedures, operations."
---

# Handbook chat (studio users)

**Who can use this:** STUDIO_USER (and ADMIN for review). Not shown to
department users unless explicitly given a studio assignment.
**Where to find it:** open /handbook.

## What it does
Handbook is a separate RAG chat scoped to company handbook content —
things like HR policy, retail operations, opening/closing procedures,
and studio-specific manuals. It runs the same embedding + cosine
retrieval as the Assistant but filters to `documentType = 'handbook'`
so general product help, tickets, and metrics never leak in.

## Why it's separate from /assistant
- /assistant is operational: it can search tickets, run metrics, and
  take confirmed actions (create a ticket, assign, comment).
- /handbook is reference-only: it reads handbook docs and answers
  policy questions. It cannot mutate anything, cannot see tickets, and
  is safe to give to every studio employee.

## Steps
1. Open /handbook from the sidebar.
2. Ask a policy question in plain English ("how many days of PTO do I
   get?", "what's the closing procedure at a studio?").
3. Read the answer plus source citations — click any pill to open the
   underlying handbook document.
4. If the answer isn't in the handbook, the chat says so clearly
   instead of guessing.

## Common pitfalls
- Only studio-assigned users see /handbook in the sidebar. Department
  users who aren't scoped to a studio should use /assistant instead.
- Handbook answers never include tickets, metrics, or product-help
  content — that's by design.

## Related
- /assistant — operational Q&A + actions
- /admin/knowledge-base — upload/paste new handbook docs (admin)
