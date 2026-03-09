# Stage 18 — Recommended Client Demo Flow

This document describes a polished **happy path** for walking a client through the ticketing system. Use it to prepare for review/demo sessions.

---

## Prerequisites

- Log in as an **Admin** user (e.g. seeded admin account).
- Ensure the app has sample data: at least one market with locations, categories, and optionally workflow templates and tickets.

---

## Recommended Demo Path

### 1. **Home & ticket list**

- **Route:** `/tickets` (Home).
- **Show:** Ticket list with filters (status, priority, category, department). Mention that tickets can be filtered and searched.
- **If empty:** Use the empty state CTA **New Ticket** to create the first ticket in the next step.

### 2. **Create a new ticket**

- **Route:** `/tickets/new`.
- **Show:** New Ticket flow: choose ticket type (Support vs Maintenance), then category/topic, then title and description. Submit.
- **Outcome:** Redirect to ticket list or detail; new ticket appears.

### 3. **Ticket detail & collaboration**

- **Route:** `/tickets/[id]`.
- **Show:** Title, status, priority, SLA, assignee. Scroll to **Conversation**: add a comment (and optionally @mention). Show **Subtasks**: add or complete a subtask. Show **Attachments** and **History**.
- **Message:** “All changes are tracked and notifications go to the right people.”

### 4. **Notifications**

- **Route:** `/notifications`.
- **Show:** In-app notifications for ticket/subtask updates. Click one to jump to the ticket.
- **Message:** “Users see updates here and can open the ticket in one click.”

### 5. **Admin — Locations (and nearby)**

- **Route:** `/admin/markets` (sidebar: **Locations**).
- **Show:** Markets and locations list. Expand a market, click a location. In the detail panel, enable **Nearby Locations**, set radius (e.g. 25 miles). Show the list of nearby locations with distances.
- **Message:** “Locations have coordinates so we can find nearby sites for dispatching vendors.”

### 6. **Admin — Reporting**

- **Route:** `/admin/reporting`.
- **Show:** KPI cards (total, open, resolved, avg resolution). Volume chart (1d / 1w / 1m). Breakdowns by status, priority, category, market. Export CSV.
- **Message:** “Reporting gives you high-level metrics and export for your own analysis.”

### 7. **Admin — Vendor Dispatch**

- **Route:** `/admin/dispatch`.
- **Show:** Open issues by **Location**, by **Category**, by **Market**, and **Locations with multiple open issues**. Click a row to open the ticket list filtered by that location/category/market.
- **Message:** “Dispatch view helps route maintenance work by location and category.”

### 8. **Admin — Workflow templates (optional)**

- **Route:** `/admin/workflow-templates`.
- **Show:** List of workflow templates. Open one: show subtask steps, dependencies, and departments.
- **Message:** “Workflows define the steps and owners for each ticket type.”

### 9. **Admin — Workflow Analytics (optional)**

- **Route:** `/admin/workflow-analytics`.
- **Show:** Template execution counts, active runs, bottleneck subtasks.
- **Message:** “Analytics show how often workflows run and where they slow down.”

### 10. **Admin — Knowledge Base / Assistant (optional)**

- **Route:** `/admin/knowledge-base` then **Assistant** (`/assistant`).
- **Show:** Knowledge Base: add or list documents. Assistant: ask a question and show an answer with sources.
- **Message:** “Internal knowledge powers the Assistant and Handbook for staff.”

---

## Tips for a smooth demo

- **Empty states:** If a list is empty, use the new empty-state CTAs (e.g. **New Ticket**, **Add Category**, **Add Market**) to show the “first use” flow.
- **Loading:** Pages now show “Loading…” with spinners; briefly mention that the system is fetching data.
- **Naming:** Use “Locations” (not “Studios”) and “Nearby Locations” in speech to match the UI.
- **No dead ends:** Every main list has a clear next action (create, filter, or drill down).

---

## Out of scope for this demo

- No maps, geocoding, or address autocomplete.
- No live vendor assignment or external integrations.
- No schema or API changes—UX polish only.

---

*Last updated: Stage 18 — Final UX / Demo Polish.*
