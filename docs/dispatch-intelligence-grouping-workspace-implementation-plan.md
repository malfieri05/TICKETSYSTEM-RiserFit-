# Dispatch Intelligence – Grouping Workspace Implementation Plan

This document translates the approved [Grouping Workspace mini-spec](dispatch-intelligence-grouping-workspace-mini-spec.md) into a concrete engineering implementation plan. It builds on existing [Dispatch Intelligence V1](dispatch-intelligence-implementation-plan.md) without regressing it or any behavior from Stages 1–6.

**Constraints:** No regressions to Stages 1–6 or Dispatch Intelligence V1. Reuse `dispatch_groups`, `dispatch_group_items`, `DispatchGroupService`, and ticket dispatch fields. Build order: (1) workspace UX + supporting query/service extension, (2) template model/service, (3) group-creation integration. No map-first implementation. No route change for the main workspace flow. Left-side dispatch list remains visible when the workspace panel is open. Fast, demo-worthy workspace.

**Authoritative rules:** Anchor may be any open maintenance ticket (OPEN = status NOT IN RESOLVED, CLOSED); anchor does not need READY_FOR_DISPATCH. Nearby display does not require READY_FOR_DISPATCH or same maintenanceCategoryId; only group creation enforces READY_FOR_DISPATCH and one-active-group. Templates are rule-only; no selected ticket IDs stored. Template anchorStudioId defaults from current anchor when created from workspace; admin may clear it.

---

## 1. Workspace UX Implementation Plan

### 1.1 Page and tab

- **Page:** Existing Vendor Dispatch page at `apps/web/src/app/(app)/admin/dispatch/page.tsx`.
- **Tab:** The Grouping Workspace lives in the **Ready to Dispatch** tab (current “intelligence” tab). No new top-level tab; the workspace is an overlay/panel experience on top of the existing Ready to Dispatch list.

### 1.2 Existing Ready to Dispatch tab behavior (preserved and extended)

- Trade-type sections (Handyman, Plumber, HVAC, etc.) remain. Each section lists tickets from `GET /dispatch/ready` (or equivalent) with trade filter.
- **Change:** Each ticket row must support **click to open workspace panel** instead of navigating to `/tickets/:id`. Remove or replace any `router.push('/tickets/' + ticket.id)` on row click when the Grouping Workspace is the intended interaction. Keep a way to open the full ticket (e.g. link on ticket ID or secondary action) so users can still navigate when needed.

### 1.3 Clicking a ticket: open workspace panel

- **Primary click** on a ticket row in the Ready to Dispatch tab: set **anchor ticket** to that ticket and open the **Dispatch Workspace Panel** (right side). Do **not** navigate away; stay on `/admin/dispatch` with the same tab (Ready to Dispatch) active.
- **State:** Page-level state: `workspaceAnchorTicketId: string | null` and `workspacePanelOpen: boolean`. When user clicks a ticket, set `workspaceAnchorTicketId` to that ticket’s id and `workspacePanelOpen` to true.

### 1.4 Left side remains visible and narrows when panel opens

- When `workspacePanelOpen` is true, the **left content area** (the scrollable region containing the Ready to Dispatch trade sections) must **narrow** so the right-side panel can sit beside it. Use a single-column layout: e.g. left area `flex-1 min-w-0` with a max-width or calculated width when panel is open (e.g. `calc(100% - 420px)` or similar), and the panel fixed at 420px width. The left side must **not** collapse to zero; it must remain visible so the user can see the list and click a different ticket to change anchor.

### 1.5 Selected anchor row styling

- In the Ready to Dispatch list, the row that corresponds to the current **anchor ticket** (where `ticket.id === workspaceAnchorTicketId`) must have a **selected state**: e.g. distinct background (e.g. accent at low opacity), left border, or other clear visual so the user knows which ticket is the current anchor. Hover state applies to all rows; selected state applies only to the anchor row.

### 1.6 Single-column / narrowed layout

- Layout structure: **one column** for the main content (trade sections). When the panel is open, that column narrows; the workspace panel is a **second column** on the right. Do **not** convert the left side into a multi-column grid of tickets; the list remains a single vertical list of sections and rows.

### 1.7 Slide-in / right-panel behavior

- The workspace panel **slides in from the right** (e.g. CSS transform or width transition from 0 to 420px). It is a **fixed or sticky** right-side panel. Optional: overlay with a light backdrop on the left content for focus, or no overlay so both panels are fully visible; spec prefers both visible.

### 1.8 Panel sizing and top alignment

- **Width:** Fixed, e.g. **420px** (or 400–440px). Document the chosen value so implementation is consistent.
- **Top alignment:** The panel’s **top** must align **below the Vendor Dispatch page header**. That is, the panel is **not** a full-viewport overlay from the very top of the screen; it starts below the header so the page title and any header actions remain visible. Use the same header as the rest of the dispatch page; the panel’s top edge starts at the bottom of the header (or the first sticky bar below it, if any).

### 1.9 Files likely to change

- **apps/web/src/app/(app)/admin/dispatch/page.tsx** — Add workspace state (anchor id, panel open), conditional layout (narrow left when panel open), render workspace panel component, and change ticket row click behavior in the Ready to Dispatch tab to open panel instead of navigate.
- **New component:** e.g. `apps/web/src/components/dispatch/DispatchWorkspacePanel.tsx` — The right-side panel (Sections A, B, C and nearby feed). Receives `anchorTicketId`, `onClose`, and any callbacks for create group / create template.

---

## 2. Anchor Ticket Panel Plan

### 2.1 Section A — Anchor ticket header

- **Content:** Title, ticket ID (short form, e.g. first 8 chars with copy affordance), status badge, created date (formatted), location (studio name and/or formattedAddress from anchor’s studio).
- **Data source:** Anchor ticket loaded by existing `GET /tickets/:id` or a lightweight summary endpoint (see §8). Required fields: id, title, status, createdAt, studioId, studio: { name, formattedAddress }.
- **Layout:** Compact header block at the top of the panel. Read-only; no edit actions in the header.

### 2.2 Section B — Anchor ticket content (primary block)

- **Purpose:** Represents the selected “parent” ticket with **reduced** ticket content (not the full ticket panel).
- **Content to show:** description, maintenanceCategory (name), dispatchTradeType (display name), dispatchReadiness (display name). Optionally a subset of ticket form responses (submission content) if useful for dispatch context.
- **Expandable/collapsible:** This block is **expandable and collapsible** (e.g. chevron to expand/collapse). Default state: collapsed or expanded per product preference; recommend **expanded** by default so anchor is prominent.
- **Excluded:** Do **not** show comments, comment count, full history, or full audit trail. Do **not** show subtasks list. This is intentionally a **reduced** view so the panel stays focused on grouping, not full ticket workflow.

### 2.3 Fit within existing Dispatch page UX

- Reuse existing design tokens (e.g. POLISH_THEME, panel borders, typography) from the app so the workspace panel feels part of the same product. Do not introduce a completely different visual language. The panel is a **custom variant** for the dispatch workspace, not the standard ticket detail drawer used elsewhere (e.g. TicketDrawer on tickets list).

---

## 3. Nearby Workspace Query / Service Plan

### 3.1 Extend DispatchRecommendationService

- **Approach:** Add a **dedicated method** on the existing `DispatchRecommendationService` (e.g. `getNearbyForWorkspace(anchorTicketId: string, radiusMiles: number)`) rather than overloading the existing `getRecommendations` with a “workspace mode” flag. This keeps the existing recommendation contract (READY_FOR_DISPATCH-only, same-location + nearby) unchanged and avoids regressions.
- **Location:** `apps/api/src/modules/dispatch/services/dispatch-recommendation.service.ts`.

### 3.2 Inputs

- **anchorTicketId** (required): The ticket id of the anchor.
- **radiusMiles** (required for workspace): Radius in miles centered on the anchor’s studio. No default in the service; caller (frontend) sends the current slider value.

### 3.3 Outputs

- **Anchor validation:** If anchor ticket not found, not maintenance, or has no studio with valid coordinates, return an error (404 or 400) or a structured response with `anchor: null` and `message` explaining (e.g. “Anchor ticket has no location”).
- **Success:** List of **nearby tickets** only (no same-location split for workspace). Each item: `id`, `title`, `status`, `studio` (id, name, formattedAddress), `distanceMiles` (number, one decimal), `dispatchReadiness`, `maintenanceCategoryId` (optional for UI display), and optionally `maintenanceCategory: { id, name }` for display. Order: distance ASC, then createdAt DESC. Cap: **50** candidates.

### 3.4 Exact matching rules (workspace nearby)

- **Anchor:** Must be a maintenance ticket (ticketClassId = MAINTENANCE). Must have studioId; associated studio must have non-null latitude and longitude. Anchor **may** be any open ticket: **do not** require READY_FOR_DISPATCH for the anchor.
- **Candidates:** Same **dispatchTradeType** as anchor (if anchor has null dispatchTradeType, return empty list or 400). **Do not** require same maintenanceCategoryId. **ticket.status** NOT IN ('RESOLVED', 'CLOSED'). Exclude the anchor ticket id. Candidate must have studioId and studio with non-null latitude and longitude (valid studio coordinates for distance). **Do not** require dispatchReadiness = READY_FOR_DISPATCH for inclusion in the list.
- **Distance:** Haversine from anchor’s studio to candidate’s studio; include only where distance <= radiusMiles. Sort by distance ASC, then createdAt DESC. Limit 50.

### 3.5 Haversine / distance

- Reuse existing `distanceMiles(lat1, lng1, lat2, lng2)` in `apps/api/src/modules/dispatch/services/distance.util.ts`. No PostGIS. Compute in application layer after fetching candidates with valid coordinates.

### 3.6 When coordinates are missing

- **Anchor has no studio or studio has null lat/lng:** Return error or structured empty result with message (e.g. “Anchor ticket has no coordinates; add a location to see nearby tickets”).
- **Candidate has no studio or null lat/lng:** Exclude that candidate from results (they cannot be distance-filtered).

### 3.7 When anchor is not READY_FOR_DISPATCH

- **Allowed.** The workspace nearby query does **not** require the anchor to be READY_FOR_DISPATCH. Proceed with the query using anchor’s studio and dispatchTradeType. If anchor has null dispatchTradeType, return empty nearby list (or 400) since matching “same trade type” is undefined.

### 3.8 Maintenance-only requirement

- Anchor must be a **maintenance** ticket (ticketClassId = MAINTENANCE class id). Candidates are implicitly maintenance if they have a non-null dispatchTradeType that matches the anchor (maintenance tickets are the only ones with dispatch trade type in the current model). For consistency, filter candidates by ticketClassId = MAINTENANCE as well.

### 3.9 Broader than group-creation eligibility

- **Explicit:** The workspace nearby query is **broader** than group-creation eligibility. It includes all open (non-RESOLVED, non-CLOSED) tickets with the same trade type and valid coordinates within radius. It does **not** filter by READY_FOR_DISPATCH and does **not** exclude tickets already in an active dispatch group for **display** purposes. Group creation (when user clicks “Create Dispatch Group” and submits) will still call the existing `DispatchGroupService.create`, which enforces READY_FOR_DISPATCH and one-active-group; the UI or backend will validate selection at create time.

---

## 4. Nearby Results Feed Plan

### 4.1 Compact row structure

- Each nearby ticket is one **row** in a vertical list. Row content: title, location (studio name), distance (e.g. “2.3 mi”), ticket status (badge), and optionally a **READY_FOR_DISPATCH** capsule when `ticket.dispatchReadiness === 'READY_FOR_DISPATCH'`.

### 4.2 Row fields

- **Title:** Ticket title (truncate if long; link to full ticket optional, e.g. open in new tab).
- **Location:** Studio name; optionally formattedAddress on hover or second line.
- **Distance:** `distanceMiles` from API, formatted (e.g. one decimal).
- **Ticket status:** Use existing StatusBadge component (NEW, IN_PROGRESS, etc.).
- **Ready for Dispatch capsule:** If `dispatchReadiness === 'READY_FOR_DISPATCH'`, show a small capsule/tag (e.g. “Ready for Dispatch”) so the user can quickly see which tickets are eligible for group creation.

### 4.3 Chevron-expand behavior

- Each row has a **right-aligned chevron** (e.g. `>` or `ChevronDown`). Clicking the row or chevron **toggles** an **inline expanded** section below the row (within the same list, not a new panel).

### 4.4 Inline expanded content

- **Show:** **Ticket submission content only** — e.g. description, and form response key-value pairs (from ticket form responses). Enough for the user to quickly inspect what the ticket is about without leaving the workspace.
- **Exclude:** Comments, comment count, history, audit log, subtasks, attachments list. No full ticket detail API for the expanded block; use a minimal payload (e.g. description + formResponses from existing GET ticket or a dedicated lightweight “ticket submission summary” response).

### 4.5 Expanded content styling

- **Indented** relative to the row; **secondary** visual weight (e.g. smaller text, muted border). Clearly part of the same result list item, not a separate card.

### 4.6 Selection behavior

- Each row (or a checkbox on the row) is **selectable**. **Anchor is always selected** and **non-removable** from the selection (anchor is always included when creating a group). Additional nearby tickets can be toggled selected/unselected. Selected rows have a **clear visual state** (e.g. checkmark, background tint, or border).

### 4.7 Selected row visuals

- Use a distinct style for selected rows (e.g. accent background at low opacity, or left border) so the user can see at a glance which tickets will be included in the group. Anchor row can have a separate subtle indicator (e.g. “Anchor” label) in addition to selected state.

---

## 5. Dispatch Group Creation Flow Plan

### 5.1 selectedTicketIds state

- **Client state:** `selectedTicketIds: Set<string>`. When the panel opens with an anchor, initialize to `[anchorTicketId]` (anchor always in the set). User can add/remove other nearby ticket ids; **anchor id cannot be removed**. When creating a group, the payload is `Array.from(selectedTicketIds)` with anchor first (or preserve order: anchor first, then selected nearby in list order).

### 5.2 Anchor always included

- When building the request for POST `/dispatch/groups`, the **anchor ticket id** must always be in the `ticketIds` array. Frontend must not allow deselecting the anchor; if the set is built from UI toggles, always add `anchorTicketId` when submitting.

### 5.3 Create button behavior

- **“Create Dispatch Group”** button lives in Section C of the panel (e.g. top-right of the nearby section). Click opens the **Create Dispatch Group** modal (see §10). Button is enabled when at least the anchor is selected (always true); optional: disable if no other tickets are selected and product wants “at least two” for one-time group—recommend **allow one-ticket group** (anchor only) for V1 to match existing behavior.

### 5.4 Modal fields

- **Group name** (text input, required for one-time group if product requires it; optional if group name is auto-generated). **Group type:** Radio or select — **One-Time Group** | **Group Template**. Conditional behavior: if One-Time Group, submit to create group; if Group Template, show template fields and submit to create template (see §10).

### 5.5 One-time group creation path

- User selects “One-Time Group”, enters group name (or leaves default), submits. Frontend calls **POST /dispatch/groups** with `tradeType` (from anchor ticket), `ticketIds: [anchorId, ...otherSelectedIds]`, optional notes. **Reuse existing DispatchGroupService** and existing validation: all ticketIds must be maintenance, open, READY_FOR_DISPATCH, and not in an active group. If validation fails, backend returns 400 with message.

### 5.6 Validation when selected tickets are not READY_FOR_DISPATCH

- **V1 approach:** **Backend enforces.** Frontend may **optionally** disable “Create group” or show a warning when the selected set includes any ticket that is not READY_FOR_DISPATCH (e.g. by checking `dispatchReadiness` on each selected item from the nearby response). Recommended: **frontend disables** “Create group” (or shows warning and disables submit) when any selected ticket has `dispatchReadiness !== 'READY_FOR_DISPATCH'`, and **backend** returns 400 with a clear message listing which tickets are not ready if the client sends them anyway. This gives a clear, deterministic UX: only READY_FOR_DISPATCH tickets can be in the payload; UI reflects that by disabling or warning when the selection includes non-ready tickets.

### 5.7 Reuse of DispatchGroupService

- **Explicit:** Group creation from the workspace uses the **existing** `POST /dispatch/groups` endpoint and **existing** `DispatchGroupService.create` logic. No new group-creation code path; only the source of the ticketIds (workspace selection) is new. All existing rules (READY_FOR_DISPATCH, one-active-group, maintenance-only) remain enforced by the existing service.

---

## 6. Group Template Data Model Plan

### 6.1 New model: dispatch_group_templates

- **Table name:** `dispatch_group_templates` (Prisma model `DispatchGroupTemplate`).

### 6.2 Exact fields

| Field | Type | Constraints |
|-------|------|-------------|
| id | String | PK, cuid |
| name | String | Required |
| createdBy | String | Required, FK to users.id |
| dispatchTradeType | Enum | DispatchTradeType (same as ticket) |
| maintenanceCategoryId | String | Nullable, FK to maintenance_categories.id |
| anchorStudioId | String | Nullable, FK to studios.id |
| radiusMiles | Float | Required |
| createdAt | DateTime | Default now() |
| updatedAt | DateTime | Required |

**No** field for storing selected ticket IDs or ticket snapshots. Templates are **rule-only**.

### 6.3 Indexes

- `createdBy` (for “my templates” list).
- `dispatchTradeType` (for filter by trade).
- `maintenanceCategoryId` (for optional filter).

### 6.4 Relationships

- **User:** `createdBy` → users.id (creator). No separate “owner” vs “creator”.
- **Studio:** `anchorStudioId` → studios.id, nullable. Optional: FK with onDelete SetNull so if studio is removed, template remains with null anchor.

### 6.5 anchorStudioId defaulting when created from workspace

- When the user creates a **Group Template** from the workspace modal, the **anchorStudioId** field in the create payload **defaults** to the **current anchor ticket’s studioId**. That is, the frontend (or backend if the API accepts a “create from workspace” context) sets `anchorStudioId` to `anchorTicket.studioId` when opening the template form. The admin can then **clear** this value (e.g. “Use at any location” or “Reusable across locations”) before submit.

### 6.6 Clearing anchorStudioId

- In the template creation/edit form, provide an explicit control (e.g. checkbox “Use at any location” or “Clear anchor location”) that sets `anchorStudioId` to null. When null, the template is reusable across locations (future “apply template” could use any anchor; V1 does not implement apply).

---

## 7. DispatchTemplateService Plan

### 7.1 createTemplate

- **Input:** name, createdBy (userId), dispatchTradeType, maintenanceCategoryId (optional), anchorStudioId (optional), radiusMiles.
- **Behavior:** Validate name non-empty; validate dispatchTradeType enum; validate radiusMiles > 0 (and optionally max, e.g. 100). Insert row into dispatch_group_templates. Return created template (id, name, createdBy, dispatchTradeType, maintenanceCategoryId, anchorStudioId, radiusMiles, createdAt, updatedAt). Do **not** accept or store any ticket IDs.

### 7.2 listTemplates

- **Input:** Optional filters: createdBy (userId), dispatchTradeType. Pagination: page, limit.
- **Behavior:** Query dispatch_group_templates with optional where; order by createdAt desc. Return list and total/count for pagination. Include creator display info (e.g. creator.name) in each item if useful for UI.

### 7.3 getTemplate

- **Input:** id.
- **Behavior:** Find one by id; 404 if not found. Return full template. Optionally enforce visibility (e.g. only creator or ADMIN can read); for V1, any authenticated user with dispatch access can read.

### 7.4 updateTemplate

- **Input:** id, partial dto (name?, maintenanceCategoryId?, anchorStudioId?, radiusMiles?). Do not allow changing createdBy or dispatchTradeType if that would complicate audit; or allow for simplicity (document choice). V1: allow update of name, maintenanceCategoryId, anchorStudioId, radiusMiles.
- **Behavior:** 404 if not found; update only provided fields; return updated template.

### 7.5 deleteTemplate

- **Input:** id.
- **Behavior:** 404 if not found; delete row. No cascade (templates are standalone). Return 204 or 200 with confirmation.

### 7.6 V1 scope

- **V1 stores and lists templates only.** No “apply template” (e.g. pre-fill radius or anchor from template when opening workspace). No auto-generate groups from templates. Template CRUD and display in the modal/list only.

---

## 8. API / Contract Plan

### 8.1 GET /dispatch/workspace/nearby

- **Query params:** `anchorTicketId` (required), `radiusMiles` (required, number).
- **Response 200:** `{ anchor: { id, title, status, createdAt, studioId, studio?: { id, name, formattedAddress, latitude, longitude }, dispatchTradeType, dispatchReadiness } | null, nearby: Array<{ id, title, status, studioId, studio: { id, name, formattedAddress }, distanceMiles, dispatchReadiness, maintenanceCategoryId?, maintenanceCategory?: { id, name } }>, message?: string }`. If anchor invalid or missing coordinates, `anchor` may be null and `message` explains; `nearby` empty.
- **Errors:** 404 if anchor ticket not found. 400 if anchor not maintenance or missing required params. 403 if user cannot view anchor ticket (apply same visibility as GET ticket).

### 8.2 POST /dispatch/templates

- **Body:** `{ name: string, dispatchTradeType: string, maintenanceCategoryId?: string | null, anchorStudioId?: string | null, radiusMiles: number }`.
- **Response 201:** `{ id, name, createdBy, dispatchTradeType, maintenanceCategoryId, anchorStudioId, radiusMiles, createdAt, updatedAt }` (and creator name if desired).
- **Errors:** 400 validation (e.g. name empty, radiusMiles <= 0). 403 unauthorized.

### 8.3 GET /dispatch/templates

- **Query params:** `createdBy?`, `tradeType?`, `page?`, `limit?`.
- **Response 200:** `{ data: Array<template>, total, page, limit, totalPages }` with each template shape as in 8.2 plus creator.

### 8.4 GET /dispatch/templates/:id

- **Response 200:** Single template (same shape). 404 if not found.

### 8.5 PATCH /dispatch/templates/:id

- **Body:** `{ name?, maintenanceCategoryId?, anchorStudioId?, radiusMiles? }`.
- **Response 200:** Updated template. 404 if not found. 400 validation.

### 8.6 DELETE /dispatch/templates/:id

- **Response:** 204 No Content or 200 with `{ deleted: true }`. 404 if not found.

### 8.7 Anchor ticket summary and expanded nearby rows

- **Anchor ticket (Sections A and B):** Use **existing GET /tickets/:id** to load the anchor. It returns full ticket including description, maintenanceCategory, dispatchTradeType, dispatchReadiness, studio, formResponses (if any). No new endpoint required. If the response is heavy, the frontend can use only the fields needed for the panel; optionally a future **GET /tickets/:id/summary** could return a subset (id, title, status, createdAt, description, studio, maintenanceCategory, dispatchTradeType, dispatchReadiness, formResponses) for performance—**V1 can rely on GET /tickets/:id** and not add a summary endpoint.
- **Expanded nearby rows:** For inline expanded content (submission only), use **existing GET /tickets/:id** for the expanded ticket. The full ticket includes description and formResponses; the UI renders only those. Alternatively, a **GET /tickets/:id/submission** that returns `{ description, formResponses }` could be added to reduce payload—**V1 recommendation:** reuse GET /tickets/:id and have the frontend use only description + formResponses for the expanded block to avoid extra endpoints.

---

## 9. Vendor Dispatch Page Integration Plan

### 9.1 Tab

- The Grouping Workspace is used **from the Ready to Dispatch tab** (current “Intelligence” tab in `apps/web/src/app/(app)/admin/dispatch/page.tsx`). It does **not** require a new tab; it augments that tab so that clicking a ticket opens the workspace panel instead of navigating.

### 9.2 Augment Ready to Dispatch tab

- **No** new internal sub-route (e.g. no `/admin/dispatch/workspace`). The workspace is a **panel + state** on the same tab. When the user switches to Overview or Dispatch Groups tab, the workspace panel can close (or stay open with anchor from previous tab—recommend **close panel when switching tabs** for simplicity).

### 9.3 Preserve trade-type sections

- The existing structure of the Ready to Dispatch tab (grouped by trade type, each section showing tickets) is **preserved**. Only the **click handler** and **layout** when panel is open change. No removal of sections or change to how tickets are fetched for that tab (existing GET dispatch/ready or equivalent).

### 9.4 Change when a ticket is clicked

- **Before:** Clicking a ticket row may navigate to `/tickets/:id` or do nothing (confirm current behavior in code). **After:** Clicking a ticket row sets the anchor and opens the Dispatch Workspace Panel; no navigation. Optionally provide a separate “Open ticket” link/icon on the row so users can still go to the full ticket page.

### 9.5 Coexistence with other tabs

- **Overview** tab: unchanged (by-studio, by-category, by-market, studios with multiple). **Dispatch Groups** tab: unchanged (list of groups, link to group detail). **Ready to Dispatch** tab: now has workspace panel when a ticket is selected; left list and right panel coexist. No change to how groups are created from other flows (e.g. from ticket detail page Dispatch panel) or to group detail page.

---

## 10. Template Creation Modal / UX Plan

### 10.1 Create Dispatch Group modal

- **Trigger:** User clicks “Create Dispatch Group” in the workspace panel. Modal opens with two paths: **One-Time Group** and **Group Template**.

### 10.2 Fields

- **Group name:** Text input. Used as the group’s notes or a display name for one-time group (map to existing `notes` on dispatch_group if no separate “name” field on groups); for template, required as template name.
- **Group type:** Radio or select. Options: **One-Time Group**, **Group Template**. Default: One-Time Group.

### 10.3 Conditional submission behavior

- **If One-Time Group:** Modal shows group name (optional or required per product). On submit: call POST /dispatch/groups with tradeType (from anchor), ticketIds (anchor + selected), notes = group name. On success: close modal, show success (e.g. toast), optionally close panel or redirect to group detail. Do **not** call template API.
- **If Group Template:** Modal shows template fields: **name** (required), **dispatchTradeType** (pre-filled from anchor, read-only or editable), **maintenanceCategoryId** (optional dropdown, pre-filled from anchor if any), **anchorStudioId** (optional; default from anchor, with option to clear), **radiusMiles** (required, pre-filled from current workspace radius slider). On submit: call POST /dispatch/templates with those fields. **Do not** send any ticket IDs. On success: close modal, show success; optionally list templates somewhere (e.g. future “Templates” tab or in modal). V1 does not implement “apply template”; storing the template is the end of the flow.

### 10.4 Defaulting anchorStudioId from current anchor

- When the user selects **Group Template**, the form’s **anchorStudioId** field is **pre-filled** with the **current anchor ticket’s studioId**. The UI can show the studio name (from anchor ticket’s studio) and pass the id in the create payload.

### 10.5 Optional clearing of anchorStudioId

- Provide a control (e.g. “Use at any location” checkbox or “Clear anchor” button) that sets anchorStudioId to **null** before submit. When checked/cleared, the template is reusable across locations (anchorStudioId = null in DB). Label clearly so the admin understands that clearing makes the template location-agnostic.

### 10.6 V1 behavior explicit and simple

- One-time group: one API call (POST groups), then done. Template: one API call (POST templates), then done. No multi-step wizard. No “apply template” in V1.

---

## 11. Implementation Order

1. **Workspace nearby query / service extension** — Add `getNearbyForWorkspace(anchorTicketId, radiusMiles)` to DispatchRecommendationService; implement matching rules (same trade, status not RESOLVED/CLOSED, radius, no maintenanceCategoryId requirement). Add GET /dispatch/workspace/nearby endpoint. No UI yet.
2. **dispatch_group_templates model + migration** — Add Prisma model and migration; run migrate. No service yet.
3. **DispatchTemplateService + template endpoints** — Implement create, list, get, update, delete; wire POST/GET/PATCH/DELETE /dispatch/templates. No UI yet.
4. **Vendor Dispatch page panel state and anchor interactions** — In dispatch page, add state (workspaceAnchorTicketId, workspacePanelOpen). In Ready to Dispatch tab, change ticket row click to set anchor and open panel (no navigate). Implement narrow-left layout when panel open; render a placeholder or minimal panel component. Selected anchor row styling.
5. **Workspace panel structure and anchor sections** — Build DispatchWorkspacePanel: Section A (anchor header), Section B (anchor content, expandable). Fetch anchor via GET /tickets/:id. No nearby feed yet.
6. **Nearby feed UI** — In panel, add Section C: radius slider, “Create Dispatch Group” button. Fetch nearby via GET /dispatch/workspace/nearby. Render nearby list (compact rows: title, location, distance, status, Ready for Dispatch capsule). Chevron-expand for submission-only content; use GET /tickets/:id for expanded data. Selection state (anchor always selected; toggle others). Selected row visuals.
7. **Create group modal integration** — Modal: group name, group type (One-Time | Template). One-time path: build ticketIds from selection, call POST /dispatch/groups; handle validation errors (e.g. 400 when non-READY tickets included). Optional: disable submit when selection includes non-READY tickets and show warning.
8. **Template creation path** — In modal, when Group Template: show template fields; default anchorStudioId from anchor; allow clear. Submit POST /dispatch/templates. Success feedback. No “apply template” or list UI required for V1 if out of scope; otherwise minimal list of templates.
9. **Final polish / empty states / verification** — Empty state when anchor has no coordinates; empty state when no nearby results; loading states; no regressions to Dispatch Intelligence V1 (recommendations, group creation from ticket panel, group detail) or Stages 1–6 (visibility, feed, lifecycle, comments, panel polish, dashboard, admin filters).

---

## 12. Verification Checklist

- [ ] **Clicking a ready-to-dispatch ticket opens workspace panel** — No navigation to ticket detail page; panel opens with that ticket as anchor.
- [ ] **Anchor may be any open maintenance ticket** — Selecting a ticket that is not READY_FOR_DISPATCH still opens the panel and loads nearby; no error.
- [ ] **Nearby results follow broader workspace rules** — Nearby list includes tickets with same dispatchTradeType and status not RESOLVED/CLOSED within radius; includes tickets that are NOT READY_FOR_DISPATCH (they show without capsule).
- [ ] **Nearby display differentiates READY_FOR_DISPATCH** — Tickets with dispatchReadiness READY_FOR_DISPATCH show “Ready for Dispatch” capsule.
- [ ] **Group creation still enforces READY_FOR_DISPATCH-only** — Submitting a one-time group with a non-READY ticket returns 400 or UI prevents submit; only READY_FOR_DISPATCH tickets can be in the created group.
- [ ] **One-active-group enforcement still works** — Creating a group with a ticket already in an active group returns 400; existing DispatchGroupService behavior unchanged.
- [ ] **Template creation stores rule-only data** — POST /dispatch/templates does not accept ticket IDs; template record has only name, createdBy, dispatchTradeType, maintenanceCategoryId, anchorStudioId, radiusMiles.
- [ ] **anchorStudioId defaults from anchor and can be cleared** — When creating a template from the workspace, anchorStudioId is pre-filled with anchor’s studioId; user can clear it to save a location-agnostic template.
- [ ] **Expanded rows show submission content only** — Inline expanded content shows description and form responses; no comments or history.
- [ ] **No regressions to Dispatch Intelligence V1** — Ticket-level recommendation panel (on ticket detail and drawer) still works; GET /dispatch/recommendations/:ticketId unchanged; dispatch/ready and dispatch groups tabs unchanged; group detail page unchanged.
- [ ] **No regressions to Stages 1–6** — Visibility, feed, lifecycle, comments, panel polish, dashboard, admin filters unchanged.

---

*This implementation plan is the single reference for building the Grouping Workspace feature. All implementation must follow this order and these contracts; workspace matching is broader than group-creation eligibility; templates are rule-only.*
