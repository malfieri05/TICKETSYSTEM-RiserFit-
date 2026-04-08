---
slug: assistant
title: "AI Assistant (Rovi)"
feature: "AI Assistant"
roles: [STUDIO_USER, DEPARTMENT_USER, ADMIN]
primary_routes:
  - /assistant
related_routes:
  - /handbook
  - /admin/knowledge-base
  - /tickets
synonyms:
  - rovi
  - ai assistant
  - assistant
  - chatbot
  - tool calling agent
  - ask rovi
  - how do i
  - knowledge search
summary: "Rovi is a tool-calling chat assistant that can search the knowledge base, look up tickets and users, and take confirmed actions on your behalf."
---

# AI Assistant (Rovi)

**Who can use this:** everyone (STUDIO_USER, DEPARTMENT_USER, ADMIN).
**Where to find it:** open /assistant.

## What it does
The Assistant ("Rovi") is a tool-calling AI chat. It answers two kinds of
questions and can also take action for you:

1. **Data questions** — "how many open maintenance tickets today?",
   "which studio has the most plumbing issues?", "show my HVAC ticket
   from last week". Rovi calls the right reporting or search tool under
   the hood and answers from live data.
2. **Product Q&A** — "how do I create a workflow template?", "where is
   vendor dispatch?", "what does LeaseIQ do?". Rovi searches this
   product help corpus first and grounds every step in a retrieved
   article. It will tell you when something isn't covered, instead of
   guessing or defaulting to "ask your manager".
3. **Actions** — "create an urgent plumbing ticket at Downtown",
   "reassign this ticket to Alex", "resolve TCK-123". Rovi builds an
   action plan and shows **Confirm / Cancel** buttons. It will **not**
   mutate anything until you click Confirm. Every tool run is logged to
   the agent action log for audit.

## Steps
1. Open /assistant from the sidebar (admins have it below Actionable,
   everyone else has it in the main nav).
2. Type a plain-English question or instruction. Shift+Enter for a new
   line, Enter to send.
3. For how-to questions, Rovi cites the source article(s) — click the
   citation pill to open the underlying knowledge doc.
4. For actions, review the **action plan** card (ticket title, category,
   priority, assignee) and click **Confirm** to execute or **Cancel** to
   walk away.
5. For sensitive transitions (RESOLVED, CLOSED), Rovi always requires
   confirmation — it never auto-executes those.

## Permission awareness
Rovi calls `get_current_user_context` before answering role-dependent
questions, so it will never send a studio user to an admin URL like
/admin/workflow-templates. If your role can't do something, it says so
instead of showing steps you can't follow.

## Common pitfalls
- Rovi cannot see tickets outside your visibility scope. If you ask for
  something you aren't allowed to see, it says so.
- Rovi will not pretend to have done something without a tool call.
- The daily message quota is 100 per user per day.

## Related
- /handbook — company handbook chat (studio users)
- /admin/knowledge-base — upload new product help docs (admin)
