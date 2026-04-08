---
slug: tickets-create
title: "Creating a ticket"
feature: "New ticket"
roles: [STUDIO_USER, DEPARTMENT_USER, ADMIN]
primary_routes:
  - /tickets/new
related_routes:
  - /tickets
  - /portal
  - /portal/tickets
synonyms:
  - create ticket
  - new ticket
  - open a ticket
  - submit a ticket
  - file a maintenance request
  - file a support request
  - maintenance request
  - support request
  - ticket form
summary: "Create a Maintenance or Support ticket from the schema-driven form at /tickets/new."
---

# Creating a ticket

**Who can use this:** everyone (STUDIO_USER, DEPARTMENT_USER, ADMIN).
**Where to find it:** open /tickets/new.

## What it does
The New Ticket form is schema-driven: the fields you see depend on the
**ticket class** (Maintenance vs Support) and the taxonomy below it
(support topic, maintenance category, department, location). When your
selection matches an active workflow template, Rovi automatically creates
the right subtasks on the new ticket so the workflow starts immediately.

## Steps
1. Open /tickets/new from the sidebar "New Ticket" button (or from any
   ticket list via the "New" action).
2. Pick the **ticket class**: Maintenance for facilities (plumbing, HVAC,
   equipment, etc.), Support for software, HR, IT, and other non-physical
   issues.
3. Fill the context fields that appear — department and support topic for
   Support tickets, maintenance category and location for Maintenance.
   Required fields are marked on the form.
4. Write a clear title and description. Add priority (LOW / MEDIUM / HIGH /
   URGENT) if you can; Rovi defaults to MEDIUM.
5. Drag any photos, PDFs, or other files onto the attachments area (25 MB
   per file max).
6. Click **Create ticket**. Rovi opens the ticket detail page and the
   owner/watchers are notified via their preferred channels.

## Common pitfalls
- If you don't see a field you expected, check the ticket class — Support
  and Maintenance show different schemas.
- If a workflow template you set up isn't firing, re-open the template at
  /admin/workflow-templates and confirm the context (class + topic or
  category) matches AND that it is marked Active.
- Studio users can only create tickets for studios they are scoped to.

## Related
- /tickets — main ticket feed (staff & admin)
- /portal — studio user home
- /admin/workflow-templates — configure auto-subtask expansion (admin)
