# Stage 22: Ticket Feed & Detail / Panel UI Alignment — Mini-Spec (Planning Only)

**Purpose:** Architecture review. No implementation until approved.

**Context:** The system runs on taxonomy-driven creation, schema-driven submissions, workflow templates, subtasks for execution, and comments for communication. The ticket feed and ticket detail/panel views still expose legacy UI elements that do not align with this model.

**Constraints:** No schema changes. No workflow engine, notification, or permission changes. No backend redesign. Frontend-only cleanup.

---

## 1. Intent

Redesign the **ticket feed view** and **ticket detail/panel view** so the interface clearly reflects the current workflow-driven architecture:

- **Feed:** Emphasize title, created date, requester, and **subtask progress**; remove or de-emphasize legacy status/priority/SLA/owner/updated columns.
- **Detail/panel:** Lead with title, created date, requester, location, and progress summary; remove prominent internal ticket ID and legacy prominence of status/priority.
- **Tabs:** Reorder to **Subtasks → Comments → Ticket Submission → History**, with submission data as read-only reference.
- **Right-side panel:** Remove or drastically reduce legacy sections (Move to, Assigned to, SLA, Details, Watchers) unless there is a strong reason to keep one.

The UI should communicate that **subtasks are the execution model**, **comments are communication**, **submission data is reference**, and **history is audit**.

---

## 2. Scope

**In scope**

- **Feed view** (`/tickets` list + optional drawer): Primary columns/content = Title, Created date, Subtask progress (completed/total + optional progress bar), Requester. Remove from feed: status, priority, SLA, owner, updated. Topic/category, if shown, is secondary (titles are auto-generated and encode it).
- **Ticket detail full page** (`/tickets/[id]`): Header redesign (no prominent ticket ID; title, created date, requester, location, progress summary). Tab order: Subtasks, Comments, Ticket Submission, History. Ticket Submission tab shows original schema/form data in read-only form. Right-side panel: design decision to remove most or all of Move to, Assigned to, SLA, Details, Watchers (default: remove unless strong reason to keep).
- **Ticket panel/drawer** (slide-over from feed): Same alignment as detail—header (title, created, requester, location, progress), tab order, and right-side panel treatment as above.
- **Consistency:** Same information hierarchy and tab order in both full-page detail and drawer.

**Out of scope**

- Backend changes (APIs, schema, workflow engine, notifications, permissions).
- New features (e.g. new actions, new tabs, new APIs).
- Studio portal or other ticket views beyond the main feed and ticket detail/panel.
- Changes to actionable queue (/inbox) layout beyond any shared component tweaks that naturally fall out of feed cleanup.

---

## 3. Files to Change

| Area | File(s) | Change |
|------|---------|--------|
| **Feed view** | `apps/web/src/app/(app)/tickets/page.tsx` | Replace table columns: show Title, Created date, Subtask progress (completed/total + optional bar), Requester. Remove columns/cells for status, priority, SLA, owner, updated. Remove or simplify filter bar entries that only supported removed columns. Topic/category, if retained, secondary (e.g. subtitle or small label). Ensure list payload or usage still supports subtask counts (e.g. `_count.subtasks` or existing subtask list; confirm API returns completed/total or derive from ticket.subtasks if loaded). |
| **Feed – shared row/drawer trigger** | Same page or small extracted component | Row click still opens drawer or navigates to detail; row content reflects new columns only. |
| **Ticket detail page** | `apps/web/src/app/(app)/tickets/[id]/page.tsx` | (1) Header: remove prominent internal ticket ID from main header. (2) Header: redesign around title, created date, requester, location (studio/market), progress summary (same completed/total ± bar as feed). (3) Remove or de-emphasize status/priority from top (e.g. remove from primary header; move to subtle/secondary if kept at all). (4) Tab order: Subtasks, Comments, Ticket Submission, History. (5) Rename/label "Ticket Submission" tab and ensure it shows form/schema response data in read-only form. (6) Attachments: either remove as tab and fold into Ticket Submission or keep as sub-section of submission; spec prefers submission-focused flow. (7) Right sidebar: remove or collapse Move to, Assigned to, SLA, Details, Watchers per design decision (default: remove most or all). |
| **Ticket drawer/panel** | `apps/web/src/components/tickets/TicketDrawer.tsx` | (1) Header bar: remove prominent `#ticketId` display. (2) Header/title block: same as detail—title, created date, requester, location, progress summary; no primary status/priority. (3) Tab order: Subtasks, Comments, Ticket Submission, History. (4) Add or rename tab to "Ticket Submission" with read-only form data. (5) Attachments: same as detail (remove tab or fold into submission). (6) Right sidebar: remove or collapse Move to, Assigned to, SLA, Details, Watchers (same as detail). |
| **Types / API usage** | `apps/web/src/types/index.ts`, `apps/web/src/lib/api.ts` | Only if needed: ensure ticket list/detail types support subtask counts or list for progress (e.g. `subtasks` or `_count.subtasks`). No API contract changes required if existing payloads already provide subtask data. |

**Not changed**

- `apps/api/*` (no backend redesign).
- Prisma schema.
- Workflow engine, notifications, permissions.
- Other routes (portal, inbox, admin) except where they reuse feed/detail components.

---

## 4. Schema impact

**None.** All data required (ticket title, createdAt, requester, studio/market, subtasks, formResponses, comments, history) is already available from existing APIs. Subtask progress is derivable from `ticket.subtasks` or list `_count` if the API exposes it; no new tables or columns.

---

## 5. API impact

**None required.** Existing endpoints are sufficient:

- `GET /tickets` (list): Already returns fields needed for Title, Created, Requester; subtask counts or subtask list may already be present or derivable (e.g. from ticket list including `subtasks` or `_count.subtasks`). If the current list response does not include subtask count/completed count, the UI can either (a) use a lightweight count from list response if added in a trivial way, or (b) show progress only after opening the ticket (detail/drawer). Prefer (a) if it is a one-line or minimal backend addition; otherwise (b) is acceptable for this UI-only stage.
- `GET /tickets/:id` (detail): Already returns title, createdAt, requester, studio, market, subtasks, formResponses (or equivalent), comments, history. No change to contract.
- Status transition, assign, watch/unwatch: Remain available for use; only their **placement** in the UI changes (removed from or de-emphasized in the right-side panel per design decision).

---

## 6. UI impact

**A. Feed view**

- **Primary row content:** Title (main), Created date, Subtask progress (e.g. "3 / 5" with optional thin progress bar), Requester.
- **Removed from feed row:** Status, Priority, SLA, Owner, Updated.
- **Topic/category:** If shown, secondary (e.g. small label or second line); titles are auto-generated and already encode topic.
- **Filters:** Remove or simplify filters that only applied to removed columns (e.g. status, priority) unless there is a product decision to keep filtering by status/priority elsewhere (e.g. in a filter bar that still makes sense for "active vs completed" or similar). Active/Completed tab or equivalent can remain if it is driven by status.

**B. Ticket detail / panel header**

- **Remove:** Visually prominent internal ticket ID (e.g. `#abc12345`) from the main header.
- **Remove or de-emphasize:** Status and priority as primary header elements.
- **Header content:** Title, Created date, Requester, Location (studio/market as applicable), Progress summary (same completed/total ± bar). Optionally one line of taxonomy (e.g. SUPPORT · Dept · Topic or MAINTENANCE · Category) as secondary.

**C. Tabs**

- **Order:** (1) Subtasks, (2) Comments, (3) Ticket Submission, (4) History.
- **Ticket Submission tab:** Read-only display of original submitted schema/form data (field labels and values). No new backend; use existing form response or equivalent payload. Attachments can be a sub-section of this tab or a small "Attachments" block within it instead of a separate tab.

**D. Right-side panel**

- **Default design:** Remove the following from the right sidebar (or equivalent sidebar on full-page detail): **Move to** (status transitions), **Assigned to**, **SLA**, **Details**, **Watchers**.
- **Rationale:** Execution is subtask-driven; status/assignment/SLA are either redundant with progress or can be revisited in a later, product-driven iteration. Watchers and "Details" (created/resolved/location) are either redundant with header/main content or lower value for the primary workflow.
- **If one section is kept:** Only if product/architecture review explicitly requests it (e.g. "Watch" for notification preference). Document the exception and keep the rest removed.

**E. Architecture alignment**

- **Subtasks:** Primary execution model—first tab and progress in header/feed.
- **Comments:** Communication—second tab.
- **Ticket Submission:** Reference—third tab, read-only.
- **History:** Audit—fourth tab.

---

## 7. Risks

- **Status/assignment still needed:** Some users may still use "Move to Triaged/Closed" or "Assigned to" for triage or routing. Mitigation: Remove from primary UI as specified; if feedback demands it, reintroduce in a minimal form (e.g. single dropdown or one compact section) in a follow-up.
- **SLA visibility:** Removing SLA from feed and sidebar reduces at-a-glance SLA visibility. Mitigation: Acceptable for this alignment stage; SLA can be re-added in a targeted way later if required.
- **List API and progress:** If the ticket list API does not return subtask counts or completed counts, the feed may show progress only after opening a ticket, or the team may add a minimal list-field (e.g. `_count.subtasks` and a completed count) in the backend without redesigning the API.
- **Attachments:** Moving attachments under "Ticket Submission" or removing the Attachments tab may make files slightly harder to find. Mitigation: Keep attachments accessible in one place (e.g. within Ticket Submission tab or a compact block) and ensure download/delete still work.

---

## 8. Test plan

- **Manual (no new automated tests required for this spec):**
  - **Feed:** Load `/tickets`; confirm table shows only Title, Created, Subtask progress, Requester (and optional secondary topic). Confirm no status, priority, SLA, owner, or updated column. Confirm Active/Completed (or equivalent) still works if retained.
  - **Detail page:** Open a ticket; confirm header shows title, created date, requester, location, progress; no prominent ticket ID; no primary status/priority. Confirm tab order: Subtasks, Comments, Ticket Submission, History. Open Ticket Submission tab; confirm read-only form data. Confirm History tab shows audit entries.
  - **Drawer:** From feed, open drawer; confirm same header and tab order as detail; confirm right sidebar removed or reduced as specified.
  - **Regression:** Create ticket, add comment, complete subtask, transition status (if still available elsewhere), assign (if still available elsewhere). Confirm no regressions in permission or behavior; only UI layout and visibility change.
- **Optional:** Add a single E2E or component test that asserts feed columns (e.g. no status in table header) and tab order on detail page, if the project already has such tests.

---

*End of mini-spec. For architecture review only; do not implement until approved.*
