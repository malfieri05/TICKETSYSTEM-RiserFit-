---
slug: tickets-view
title: "Ticket list, ticket drawer, and ticket detail"
feature: "Ticket feed"
roles: [DEPARTMENT_USER, ADMIN]
primary_routes:
  - /tickets
related_routes:
  - /tickets/new
  - /inbox
  - /portal
  - /dashboard
synonyms:
  - ticket list
  - ticket feed
  - ticket drawer
  - ticket panel
  - ticket detail
  - view tickets
  - open a ticket
  - full screen ticket
  - ticket columns
summary: "Browse, filter, and open tickets from the main feed at /tickets."
---

# Ticket list, ticket drawer, and ticket detail

**Who can use this:** DEPARTMENT_USER, ADMIN. Studio users use /portal.
**Where to find it:** open /tickets.

## What it does
The main ticket feed is the home screen for staff and admins. It shows
every ticket you are allowed to see (scoped by your role, team, and
studio/market visibility), with status chips, priority, SLA indicator,
requester, owner, location, and category.

Clicking any row opens the **ticket drawer** in place without navigating
away. This lets you triage, comment, update status, and manage subtasks
while keeping the list in view.

## Steps
1. Open /tickets.
2. Use the filter bar at the top to narrow by status, priority, class,
   category, market, studio, or owner. Type in the search box to match
   title/description.
3. Click any row to slide the ticket drawer in from the right. Click the
   same row again (or press Esc) to close it.
4. Inside the drawer: change status from the status chip, add comments,
   @mention teammates, update subtasks, add watchers, and upload
   attachments.
5. Click **Open in full screen** in the drawer to navigate to
   /tickets/{id} if you need more room or want to share the URL.
6. Sort or change density from the column header menu. The feed remembers
   your filter state across reloads.

## Common pitfalls
- Status transitions follow the Rovi state machine. Resolving a ticket is
  blocked until all **required** subtasks are DONE — the drawer shows you
  exactly which ones are outstanding.
- Studio users cannot transition ticket status or edit subtasks; they can
  comment and watch progress only.

## Related
- /tickets/new — create a ticket
- /inbox — Actionable work queue (admin / department user)
- /dashboard — KPIs across your visibility scope
