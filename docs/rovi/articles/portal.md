---
slug: portal
title: "Studio user portal"
feature: "Portal"
roles: [STUDIO_USER]
primary_routes:
  - /portal
  - /portal/tickets
related_routes:
  - /tickets/new
  - /handbook
  - /notifications
  - /locations
synonyms:
  - studio portal
  - studio user home
  - my portal
  - portal home
  - my tickets
  - studio dashboard
  - my studio tickets
summary: "The studio-user home screen — create tickets, see your tickets and your studio's tickets, and open a per-studio dashboard."
---

# Studio user portal

**Who can use this:** STUDIO_USER only.
**Where to find it:** open /portal.

## What it does
The portal is the home page for studio users. It keeps them out of the
staff ticket feed entirely and shows exactly three things tailored to
their scope: their own tickets, the tickets for their studio (or the
studios they are allowed to see), and a per-studio dashboard summary.

## Tabs
- **My tickets** — tickets the studio user submitted.
- **By studio** — tickets at the studio they belong to (or a location
  picker if they have multiple allowed studios).
- **Dashboard** — the same role-scoped summary as /dashboard: open vs
  completed counts, average completion time, and a by-location
  breakdown when the user has more than one allowed studio.

## Steps
1. Open /portal (studio users land here automatically after login).
2. Pick a tab. When the user has multiple allowed studios, a location
   filter appears at the top of **By studio** and **Dashboard**.
3. Click any ticket row to open the drawer — studio users can read the
   conversation, add comments, and watch progress, but they cannot
   change status, create subtasks, or mark work done.
4. Click **New ticket** (top-right) to jump to /tickets/new pre-scoped
   to their studio.
5. For the company handbook (HR, retail procedures), open /handbook in
   the sidebar — a separate RAG scope from the Assistant.

## Common pitfalls
- Studio users cannot open /tickets, /inbox, /dashboard (staff view), or
  any /admin route. The sidebar hides those links entirely.
- /portal/tickets still exists as a legacy list view, but /portal is the
  primary flow — send studio users to /portal.
- If a studio user filters to a studio outside their allowed set, the
  API returns 403 and the portal shows an access message.

## Related
- /tickets/new — create a ticket
- /handbook — company handbook chat (studio users)
- /notifications — notification center
