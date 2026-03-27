# Dispatch Intelligence – Grouping Workspace (Mini-Spec)

## 1. Feature Overview

**Purpose:** An **interactive dispatch grouping workspace** on the existing Vendor Dispatch page that lets admins anchor on a ticket, see nearby related tickets in a dedicated panel, select multiple tickets, and create either a **one-time dispatch group** or a **reusable geographic group template**—without leaving the page.

**Scope:** Build on existing [Dispatch Intelligence V1](dispatch-intelligence-implementation-plan.md): reuse `dispatch_groups`, `dispatch_group_items`, `DispatchGroupService`, and ticket fields (`dispatchTradeType`, `dispatchReadiness`, `maintenanceCategory`, location via `studioId` → Studio lat/lng). Add workspace-specific UX, a new "nearby by anchor + radius" matching mode, and the **group template** concept.

**Constraints:** List + intelligence driven (no map-first). No navigation away from Vendor Dispatch. Fast scanning and grouping. Clear anchor (parent) vs nearby (child) hierarchy. Visually distinguish ready-for-dispatch vs other active tickets.

---

## 2. UX Flow

**Flow:**

1. Admin is on **Vendor Dispatch** → **Ready to Dispatch** tab (existing trade-type sections).
2. **Click a ticket** → Does **not** navigate to `/tickets/:id`. Instead, a **custom right-side panel** (Dispatch Workspace Panel) opens. The clicked ticket becomes the **anchor ticket**.
3. **Left side:** Trade-type sections stay; width narrows when panel is open (single-column, no multi-column). Tickets have hover and selected state; selected = anchor.
4. **Right panel:** Sections A (anchor header), B (anchor content, expandable), C (nearby search + radius slider + "Create Dispatch Group"). Below C: feed of nearby tickets.
5. User adjusts **radius (miles)** → nearby results refresh (anchor location = center).
6. Each **nearby result** is a compact row (title, location, distance, status) with "Ready for Dispatch" capsule when `dispatchReadiness === READY_FOR_DISPATCH`. Chevron expands row **inline** to show submission content only (no comments/history).
7. User **selects** additional nearby tickets (anchor is always included). Selected state is visible.
8. User clicks **"Create Dispatch Group"** → **Modal** opens: **Group name**, **Group type** (One-Time Group | Group Template). Submit → create group (and optionally template). Stay on page; panel can close or show success.

**Panel positioning:** Slides in from the right; **top aligns below the Vendor Dispatch page header** (not full-viewport overlay). Width fixed (e.g. 420px) so left content remains visible and narrows.

---

## 3. Anchor Rule Clarification

The workspace **anchor ticket** may be **any open maintenance ticket**.

- The anchor ticket does **not** need to be `READY_FOR_DISPATCH`. Any maintenance ticket with a valid location (studio with coordinates) can serve as the anchor.
- **Nearby candidates** also do **not** need to be `READY_FOR_DISPATCH` for **display** in the workspace. The nearby list shows all matching active tickets; the UI differentiates them with a "Ready for Dispatch" capsule when applicable.
- **Only actual dispatch group creation** remains restricted by the existing rules: only tickets that are `READY_FOR_DISPATCH` and satisfy the one-active-group rule may be included when creating a group. The backend (and optionally the UI) enforces this at create time.

---

## 4. Data Model

### 4.1 Existing (unchanged)

- **dispatch_groups** — id, tradeType, createdBy, status, targetDate, notes, vendorId, createdAt, updatedAt.
- **dispatch_group_items** — id, dispatchGroupId, ticketId, stopOrder, estimatedDurationMinutes, createdAt.
- **Ticket** — dispatchTradeType, dispatchReadiness, maintenanceCategoryId, studioId (location derived from Studio).

### 4.2 New: dispatch_group_templates

Reusable **geographic dispatch rule** (for future auto-suggest; V1 stores and displays only). **V1: templates are reusable rules only. Do NOT store selected ticket IDs in templates.**

| Field | Type | Purpose |
|-------|------|---------|
| id | PK (cuid) | |
| name | String | User-defined template name |
| createdBy | FK users.id | |
| dispatchTradeType | Enum | Same as ticket |
| maintenanceCategoryId | FK nullable | Optional filter; may be used as future filter; not required for V1 matching |
| anchorStudioId | FK studios.id nullable | Anchor location; when template is created from workspace, defaults to current anchor ticket's studio; admin may clear so template is reusable across locations |
| radiusMiles | Float | Radius used for nearby |
| createdAt, updatedAt | DateTime | |

**Indexes:** createdBy, dispatchTradeType, maintenanceCategoryId.

---

## 5. Services

### 5.1 DispatchRecommendationService (extend existing)

**New method (workspace mode):** e.g. `getNearbyForWorkspace(anchorTicketId, radiusMiles)`:

- **Anchor:** Resolve ticket; must be maintenance, have studioId, studio with lat/lng. Anchor may be any open maintenance ticket (does not need READY_FOR_DISPATCH).
- **Matching (V1):** Same `dispatchTradeType` as anchor. **Do NOT require same maintenanceCategoryId** for workspace nearby matching in V1. `ticket.status` NOT IN (`RESOLVED`, `CLOSED`). Exclude anchor ticket. Candidate must have studioId with non-null lat/lng for distance.
- **Distance:** Haversine from anchor's studio to each candidate's studio; filter `distance <= radiusMiles`. Order: distance ASC, then createdAt DESC. Cap (e.g. 50).
- **Return:** List of tickets with id, title, status, studio (name, formattedAddress), distanceMiles, dispatchReadiness (and maintenanceCategoryId for UI display). maintenanceCategoryId may remain visible in the UI and available as a future filter; it is not required for matching in V1.

### 5.2 DispatchGroupService (existing)

Unchanged for one-time group creation; continues to enforce READY_FOR_DISPATCH and one-active-group when creating a group.

### 5.3 DispatchTemplateService (new)

- **createTemplate(dto):** name, createdBy, dispatchTradeType, maintenanceCategoryId?, anchorStudioId?, radiusMiles. When creating a template from the workspace, **anchorStudioId defaults to the current anchor ticket's studio**; the admin may optionally clear/remove it if the template should be reusable across locations. Do not store selected ticket IDs.
- **listTemplates(filters), getTemplate(id), updateTemplate, deleteTemplate:** CRUD for templates.

---

## 6. API Endpoints

| Method | Route | Purpose |
|--------|--------|--------|
| GET | `/dispatch/workspace/nearby` | Query: `anchorTicketId`, `radiusMiles`. Returns nearby tickets: same dispatchTradeType, status not RESOLVED/CLOSED, within radius, exclude anchor, valid studio coordinates. No maintenanceCategoryId requirement. |
| POST | `/dispatch/groups` | Existing. Create one-time group. |
| POST | `/dispatch/templates` | Body: name, dispatchTradeType, maintenanceCategoryId?, anchorStudioId?, radiusMiles. Create template (rules only; no ticket IDs). |
| GET | `/dispatch/templates` | List templates. |
| GET | `/dispatch/templates/:id` | Get one template. |
| PATCH | `/dispatch/templates/:id` | Update template. |
| DELETE | `/dispatch/templates/:id` | Delete template. |

---

## 7. UI Components

### 7.1 Modified: Ready to Dispatch tab (left)

- Trade-type sections; per-ticket row with hover and selected state. Click opens Dispatch Workspace Panel with that ticket as anchor (no navigation). When panel is open, left content narrows.

### 7.2 New: Dispatch Workspace Panel (right)

- **Section A — Anchor ticket header:** Title, ticket #, status, created date, location.
- **Section B — Anchor ticket content (primary block):** Expandable; reduced content: description, maintenanceCategory (visible), dispatchTradeType, dispatchReadiness.
- **Section C — Nearby ticket search:** Title: "Active Tickets with Same Vendor Type Need". Radius slider; "Create Dispatch Group" button. Refetch nearby on radius change.

### 7.3 Nearby ticket results (feed)

- Row: title, location, distance, status. "Ready for Dispatch" capsule when READY_FOR_DISPATCH. Expandable inline for submission content only. Selection state; anchor always included.

### 7.4 Create Dispatch Group modal

- Group name; Group type: One-Time Group | Group Template. One-Time → POST groups. Template → POST templates with name, trade type, optional category, optional anchor studio (default from current anchor), radius; no ticket IDs stored.

### 7.5 Anchor studio template default

- When a template is created from the workspace, **anchorStudioId defaults to the current anchor ticket's studio**. The admin may optionally clear/remove it so the template is reusable across locations.

---

## 8. Evaluation Logic (Matching + Radius)

**Workspace nearby query (V1):**

1. **Anchor:** Load ticket by id; must be maintenance, have studioId, studio with non-null latitude/longitude. Anchor may be any open maintenance ticket (READY_FOR_DISPATCH not required).
2. **Filters for candidates:**
   - Same `dispatchTradeType` as anchor.
   - **Do NOT require same maintenanceCategoryId** in V1.
   - `ticket.status` NOT IN (`RESOLVED`, `CLOSED`).
   - Exclude anchor ticket id.
   - Candidate has studioId with non-null lat/lng (valid studio coordinates for distance).
3. **Distance:** Haversine(anchor.studio, candidate.studio) <= radiusMiles. Order: distance ASC, createdAt DESC. Limit 50.
4. **Response:** Include dispatchReadiness (for "Ready for Dispatch" capsule) and maintenanceCategoryId for UI display. maintenanceCategoryId remains available as a future filter and optionally on templates; it is not required for nearby matching in V1.

**Group creation:** Existing rules (READY_FOR_DISPATCH, one-active-group) apply when creating a dispatch group.

---

## 9. Future Extensibility

- **maintenanceCategoryId:** May be added as an optional filter to the workspace nearby query in a later version.
- **Templates:** "Apply template" could set radius/category/trade from template; anchorStudioId default when creating from workspace; admin may clear for cross-location reuse.
- **Map (optional later):** Secondary view; list remains primary.

---

## 10. Summary

| Area | Detail |
|------|--------|
| **Matching (V1)** | Same dispatchTradeType; status not RESOLVED/CLOSED; within radius; exclude anchor; valid studio coordinates. **Not** same maintenanceCategoryId. |
| **Anchor** | Any open maintenance ticket; READY_FOR_DISPATCH not required. |
| **Nearby display** | READY_FOR_DISPATCH not required; capsule shown when applicable. |
| **Group creation** | Existing READY_FOR_DISPATCH and one-active-group rules apply. |
| **Templates** | Reusable rules only; name, createdBy, dispatchTradeType, maintenanceCategoryId nullable, anchorStudioId nullable (default from anchor when created from workspace; admin may clear), radiusMiles. **Do not store selected ticket IDs.** |
