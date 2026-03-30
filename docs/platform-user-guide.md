# Riser Fitness Ticketing — Platform user guide (Assistant RAG)

This document is ingested into the Knowledge Base (document type: general) so the AI Assistant can answer how-to questions. Write paths exactly as shown so the app can turn them into links in chat.

**Indexing (pick one):**

- From `apps/api` with `DATABASE_URL`, `OPENAI_API_KEY`, and Redis available:  
  `npx ts-node --transpile-only -r dotenv/config scripts/ingest-platform-user-guide.ts`  
  Re-running updates the document titled `Platform user guide (RAG)` if it already exists.
- Or paste this file into **Admin → Knowledge Base** as a new text document (same title recommended).

## Roles: who can do what

- STUDIO_USER: Uses the portal home, creates and views own tickets, Handbook (if assigned to a studio). Cannot access Admin screens or Actionable inbox.
- DEPARTMENT_USER: Full ticket feed at /tickets, Dashboard, Notifications, AI Assistant. Can manage tickets and subtasks per permissions. No Admin sidebar unless also elevated (typically no Admin).
- ADMIN: Everything department users have, plus Actionable (/inbox), AI Assistant in admin position, full Admin menu (locations, users, workflows, reporting, vendor dispatch, knowledge base, etc.).

When explaining a feature, say if it is ADMIN ONLY or which roles can use it.

## Home and navigation

- Main ticket list (department staff and admins): open /tickets — columns include ID, title, status, filters, and search. Click a row to open the ticket side panel; click the same row again to close it.
- Studio users: home is /portal (My tickets). Use the sidebar to switch tabs on the portal when available.
- Dashboard (metrics snapshot): /dashboard
- Notifications center: /notifications
- AI Assistant (chat, can act on tickets with confirmation): /assistant — available to all authenticated users; admins also see Actionable above it in the sidebar.
- Handbook (company manuals, RAG chat for studio users): /handbook — shown when your account has a studio assignment.

## Creating a ticket

- Click New Ticket in the sidebar or go to /tickets/new.
- The form is driven by ticket class (Support vs Maintenance), department/topic or maintenance category, and location where applicable. Complete required fields and submit.
- Maintenance vs Support: choose the type that matches the issue; templates and workflows may apply automatically when a workflow template matches the context.

## Viewing and editing a ticket

- From /tickets or portal lists, click a ticket to open the drawer. Use Open in full screen in the drawer if you need /tickets/TICKET_ID (replace TICKET_ID with the full ticket id from the app).
- Status changes and subtasks follow your role: studio users have limited actions; department and admin users can manage workflow steps where allowed.

## Inbox (Actionable) — ADMIN

- Open /inbox to see actionable work (e.g. READY subtasks) in a queue. Uses the same ticket row pattern and side panel as the main feed.

## Location profiles

- From a ticket or markets/locations admin, you may open a studio location profile at /locations/STUDIO_ID (replace STUDIO_ID with the studio id). The page shows operational details (where enabled), tickets for that location, and the same ticket drawer behavior as the home feed.

## Admin: Workflow templates — ADMIN ONLY

- List templates: /admin/workflow-templates
- Create a template: /admin/workflow-templates/new — pick ticket context (class, topic or category), add subtask templates and dependencies, activate when ready.
- Edit an existing template: open /admin/workflow-templates then click the template, or go to /admin/workflow-templates/TEMPLATE_ID (replace TEMPLATE_ID with the template id).

## Admin: Workflow analytics — ADMIN ONLY

- /admin/workflow-analytics — metrics on template usage and completion timing.

## Admin: Vendor Dispatch and dispatch groups — ADMIN ONLY

- Vendor Dispatch overview and feeds: /admin/dispatch — create dispatch groups, manage readiness, and work tickets from the dispatch UI.
- A specific dispatch group (after you create one): /admin/dispatch/groups/GROUP_ID (replace GROUP_ID with the group id from the URL or list).

## Admin: Reporting — ADMIN ONLY

- KPIs and exports: /admin/reporting

## Admin: Locations (markets and studios) — ADMIN ONLY

- /admin/markets — markets and studios; geographic and list/map views for administration.

## Admin: Users — ADMIN ONLY

- /admin/users — search users, roles, departments, studio visibility, and location access for studio users.

## Admin: Knowledge Base — ADMIN ONLY

- /admin/knowledge-base — upload or paste documents that power Assistant RAG and policies. Not the same as Handbook: Handbook is for studio-facing manuals; Knowledge Base holds documents the assistant can search (including this platform guide).

## Admin: Lease IQ, Email automation, System monitoring — ADMIN ONLY

- Lease IQ rules and studio tools: /admin/lease-iq
- Email automation: /admin/email-automation
- System monitoring: /admin/system-monitoring

## Assistant vs Handbook

- Assistant (/assistant): operational help — tickets, metrics, creating or updating work with confirmation, and how-to questions answered using this guide and other knowledge base documents.
- Handbook (/handbook): company policy and procedures for studio users from handbook-type documents; separate RAG scope.

If a user asks how to do something and this guide does not cover it, tell them to ask their manager or IT admin. Do not invent screens or URLs that are not listed here.
