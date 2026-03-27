# Dispatch Intelligence — Implementation Plan

This document translates the approved [Dispatch Intelligence mini-spec](dispatch-intelligence-mini-spec.md) into a concrete engineering implementation plan. It applies the following authoritative corrections:

- **dispatchGroupStatus** is **derived only** (from dispatch_group_items + dispatch_groups.status); it is **not** stored on the ticket in V1.
- **Open / dispatch-eligible** ticket is defined as: `ticket.status NOT IN ('RESOLVED', 'CLOSED')`.
- **One active group per ticket (V1):** a ticket may belong to only one active dispatch group at a time. For V1 enforcement, **active** = group.status IN (DRAFT, READY_TO_SEND) only. SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS are not part of V1 enforcement (documented for later).
- **V1 dispatch group statuses:** implement only DRAFT, READY_TO_SEND, CANCELLED. Do not implement lifecycle handling for SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS, COMPLETED in V1 (document for later).

Constraints: no regressions to Stages 1–6; backend as source of truth; data model first, recommendation engine second, UI third; no map-first logic; V1 tight and demo-worthy; deterministic logic preferred.

---

## 1. Data Model Implementation Plan

### 1.1 Ticket additions

Add **two fields directly on the Ticket model** (no separate `ticket_dispatch_info` table in V1 to keep reads simple and avoid extra joins):

- **dispatchTradeType** — Enum or string matching a controlled set. Recommendation: add a Prisma enum `DispatchTradeType` and a nullable column `ticket.dispatchTradeType` (nullable so existing tickets are valid without a value). Values: HANDYMAN, PLUMBER, HVAC, ELECTRICIAN, LOCKSMITH, GENERAL_MAINTENANCE. Null = not classified; such tickets are excluded from recommendation candidate sets.
- **dispatchReadiness** — Enum. Add Prisma enum `DispatchReadiness` and nullable column `ticket.dispatchReadiness`. Values for V1: NOT_READY, READY_FOR_DISPATCH, WAITING_ON_DELIVERY, WAITING_ON_APPROVAL (latter two for future). Default or null treated as NOT_READY for recommendation logic. Only READY_FOR_DISPATCH tickets are considered dispatchable in V1.

**Maintenance-only:** `dispatchTradeType` and `dispatchReadiness` are only valid and editable for maintenance tickets (ticketClassId = MAINTENANCE). For PATCH /api/tickets/:id, see §11.6 (reject non-maintenance with 400 when these fields are sent).

**Do not add** to Ticket: `dispatchGroupStatus`, `locationLat`, `locationLng`. These are derived (see below).

### 1.2 dispatchGroupStatus (derived only)

**Do NOT store dispatchGroupStatus on the ticket.** Derive it at read time:

- For a given ticket, query: exists a row in `dispatch_group_items` where `ticketId` = ticket.id and the related `dispatch_groups.status` is one of: **DRAFT, READY_TO_SEND** (V1: only these two count as active). If yes, the ticket is “in an active group”; optionally derive a label (e.g. “In group (DRAFT)”) from that group’s status. If no such row (or only groups with status CANCELLED or other non-V1-active statuses), the ticket is “not in an active group.”
- Expose this in API responses as a computed field (e.g. `inActiveDispatchGroup: boolean` and optionally `activeDispatchGroupId` / `activeDispatchGroupStatus`) rather than persisting it on the ticket.

### 1.3 Location (studio latitude/longitude)

- Ticket location is **derived** from `ticket.studioId` → `studio.latitude`, `studio.longitude`. No `locationLat`/`locationLng` on the ticket.
- Use existing `Studio` model fields: `latitude`, `longitude`, `formattedAddress`. Recommendation and group services join Ticket → Studio and use Studio’s coordinates for distance calculations. If `studioId` is null or Studio has null latitude/longitude, the ticket is excluded from **nearby** recommendations (same-location still works if studioId is set).

### 1.4 dispatch_groups table

Create new model (Prisma) and migration:

- **id** — PK (cuid).
- **tradeType** — Enum DispatchTradeType (same values as on ticket).
- **createdBy** — String, FK to users.id (required).
- **status** — Enum DispatchGroupStatus. In V1 only three values are used: DRAFT, READY_TO_SEND, CANCELLED. Add other enum values (SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS, COMPLETED) to the enum for schema consistency but do not implement transitions to/from them in V1.
- **targetDate** — DateTime?, optional.
- **notes** — String?, optional.
- **vendorId** — String?, optional FK for future; nullable in V1.
- **createdAt**, **updatedAt** — DateTime.

Indexes: `status`, `createdBy`, `createdAt` (for list views and “my groups”).

### 1.5 dispatch_group_items table

Create new model and migration:

- **id** — PK (cuid).
- **dispatchGroupId** — String, FK to dispatch_groups.id, onDelete Cascade.
- **ticketId** — String, FK to tickets.id, onDelete Restrict (do not delete ticket when item is removed).
- **stopOrder** — Int, default 0. Order of visit (1-based or 0-based; pick one and document).
- **estimatedDurationMinutes** — Int?, optional.
- **createdAt** (and optionally **updatedAt**).

Unique constraint: **(dispatchGroupId, ticketId)** — a ticket can appear at most once per group.  
Indexes: **dispatchGroupId** (for “items of this group”), **ticketId** (for “is this ticket in any group?” when enforcing one active group).

### 1.6 One active group per ticket — enforcement

- **Rule:** A ticket may belong to at most one **active** dispatch group. **V1:** Active = group.status IN (DRAFT, READY_TO_SEND) only. Do not include SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS in the enforcement query.
- **Enforcement:** In DispatchGroupService, when adding a ticket to a group (create group with items, or add item to existing group):
  1. Before insert, query: is this ticketId already in any dispatch_group_items where the group’s status is in (DRAFT, READY_TO_SEND)?
  2. If yes: return 400 (or 409) with a clear message: “Ticket is already in an active dispatch group.” Do not insert.
  3. If no: proceed with insert.
- When changing a group’s status **to** CANCELLED (or COMPLETED in future), the ticket is no longer “in an active group,” so it can be added to another group later. No need to remove items from the cancelled group.
- Do not allow removing a ticket from a DRAFT group by “deleting” the group; only allow removing the item (or cancelling the group). So: “add ticket to group” and “remove ticket from group” (when group is DRAFT) both enforce the rule on add.

### 1.7 Indexes for recommendation queries

- **tickets:** Composite index on (studioId, dispatchTradeType, dispatchReadiness, status) for same-location and list-by-trade/readiness. Existing index on status; add index covering studioId + dispatchTradeType + dispatchReadiness if not already covered.
- **tickets:** Index on ticketClassId (to restrict to maintenance quickly; or filter by ticketClassId = MAINTENANCE in application code using existing indexes).
- **dispatch_group_items + dispatch_groups:** For “tickets not in any active group,” use ticketId index on dispatch_group_items and join to dispatch_groups to filter by status; or a small subquery/raw query that returns ticketIds in active groups, then exclude those in the main candidate query.
- **studios:** latitude, longitude (for distance). If using Haversine in SQL, consider composite (latitude, longitude) or spatial index only if scale demands it; V1 can use in-memory or simple SQL Haversine without PostGIS.

---

## 2. Dispatch Trade Type Implementation Plan

### 2.1 Controlled enum values

- Define a Prisma enum (or string literal union in TypeScript backed by a DB enum): **HANDYMAN**, **PLUMBER**, **HVAC**, **ELECTRICIAN**, **LOCKSMITH**, **GENERAL_MAINTENANCE**.
- Store on Ticket as nullable enum (or nullable string with check constraint). API and UI use the same code; display names (“Handyman”, “Plumber”, etc.) are frontend or a small lookup in API response.

### 2.2 Mapping / defaulting from maintenance category

- **Where it lives:** DispatchClassificationService (or a dedicated helper used by ticket create/update and by admin UI). Given `maintenanceCategoryId`, return a suggested default `DispatchTradeType` (or null if no mapping).
- **Mapping (hardcoded in V1):** Maintain a static map from maintenance category **name** (or id) to trade type, e.g.:
  - “Plumbing” → PLUMBER
  - “HVAC” → HVAC
  - “Electrical / Lighting” → ELECTRICIAN
  - “Doors / Locks / Hardware” → LOCKSMITH
  - “Flooring”, “Walls / Paint / Mounted Items”, “Equipment / Fixtures”, “Other”, etc. → GENERAL_MAINTENANCE or HANDYMAN (choose one convention)
  - Unmapped categories → null (no default)
- Use existing MaintenanceCategory names from seed/schema (e.g. from maintenance-categories.ts and DB). Map by name for stability; avoid binding to CUIDs in config.

### 2.3 Admin / manual setting

- **Admin sets trade type:** When creating or editing a **maintenance** ticket, the admin sees a “Dispatch trade type” dropdown (or section). They can select one of the enum values or leave it unset (null). If the ticket has a maintenanceCategoryId, **prefill** the dropdown with the default from the mapping above; admin can change it. No automatic save of trade type without user action on ticket create; on create, if a default exists, set it as initial value so one click “save” persists it.
- **Default suggestion:** On ticket create (maintenance only), when maintenance category is selected, call the classification helper to get suggested trade type and set it as the form’s initial value (or display “Suggested: Plumber” with override). Where the logic lives: backend can return `suggestedDispatchTradeType` in ticket taxonomy or in a dedicated “get defaults for ticket” endpoint; or frontend holds the same mapping and suggests; recommendation is backend so one source of truth.

### 2.4 Summary

- Trade type is **manually selected** by admin with **optional default from maintenance category**. Classification/defaulting logic lives in **DispatchClassificationService** (or TicketsService using it). Stored on Ticket; no free text.

---

## 3. Dispatch Readiness Implementation Plan

### 3.1 Enum values

- **NOT_READY** — Default for “not yet ready for dispatch.”
- **READY_FOR_DISPATCH** — Only this value makes the ticket eligible for recommendation and grouping in V1.
- **WAITING_ON_DELIVERY**, **WAITING_ON_APPROVAL** — Stored and displayable in UI but not used in V1 grouping logic (for future automation).
- Do not add DISPATCHED/COMPLETED to the ticket-level readiness enum if they overlap with “in a group” semantics; or add them for display only. V1 grouping only checks for READY_FOR_DISPATCH.

### 3.2 Storage

- **dispatchReadiness** column on **Ticket** (nullable). Default null treated as NOT_READY in recommendation and list filters. Optional: set DB default to NOT_READY for new tickets if product prefers.

### 3.3 How readiness is edited in admin UI

- On the **maintenance ticket** detail (and optionally in ticket create for maintenance): show a “Dispatch readiness” dropdown with options: Not ready, Ready for dispatch, Waiting on delivery, Waiting on approval. Save via PATCH ticket (e.g. PATCH /tickets/:id with dispatchReadiness in body). Only ADMIN or DEPARTMENT_USER with edit permission; reuse existing ticket update policy. No separate “dispatch” microservice; ticket update endpoint accepts new optional fields.

### 3.4 Separation from ticket status

- **Ticket status** (NEW, IN_PROGRESS, RESOLVED, etc.) is updated only by the existing ticket state machine and subtask completion logic. **Dispatch readiness** is updated only by:
  - Explicit admin action (PATCH ticket.dispatchReadiness), or
  - Future automation (e.g. delivery confirmation); not in V1.
- No code in ticket-state-machine.ts or subtask completion path sets dispatchReadiness. Readiness is an independent field; both are returned in ticket API responses.

### 3.5 Exact rule for “dispatchable” in V1

- A ticket is **dispatchable** for recommendation and grouping if and only if:
  - **ticket.dispatchReadiness = READY_FOR_DISPATCH**, and
  - **ticket.status NOT IN ('RESOLVED', 'CLOSED')** (open ticket), and
  - Ticket is maintenance (ticketClassId = MAINTENANCE class id), and
  - For “not already in another active group”: ticket is not in any dispatch_group_items whose dispatch_group.status is in (DRAFT, READY_TO_SEND). V1 enforcement uses only these two statuses.
- Use this predicate everywhere: recommendation candidate queries, dispatch list view, and “can add to group” checks.

---

## 4. Recommendation Engine Plan

### 4.1 Service: DispatchRecommendationService

- **Inputs:** `ticketId: string`, `radiusMiles?: number` (optional; default from hardcoded config by trade type), `tradeTypeOverride?: DispatchTradeType` (optional; if provided, use for matching instead of ticket’s dispatchTradeType).
- **Outputs:** Object with:
  - **primaryTicket** — The ticket with id = ticketId, plus studio (name, lat, lng), dispatch fields. If ticket not found or not maintenance, return error or null primary.
  - **sameLocationCandidates** — Array of tickets (same eligibility rules; see below).
  - **nearbyLocationCandidates** — Array of tickets with distance (miles) attached.
  - **summary** — String or structured summary, e.g. `{ sameLocationCount, nearbyCount, message? }` for UI (e.g. “2 same-location, 4 nearby” or “Ticket not ready for dispatch”).

### 4.2 Eligibility (single source of truth)

A ticket is a **candidate** (same-location or nearby) if **all** of:

- Same **dispatchTradeType** as primary (use tradeTypeOverride if provided, else primary ticket’s dispatchTradeType; if primary’s is null and no override, return empty candidates).
- **dispatchReadiness** = READY_FOR_DISPATCH.
- **ticket.status** NOT IN ('RESOLVED', 'CLOSED').
- **Not the primary ticket** (exclude ticketId from both lists).
- **Not in any active dispatch group** (no row in dispatch_group_items for this ticket with group.status in (DRAFT, READY_TO_SEND)). V1 uses only these two statuses for "active"; do not include SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS.
- **Ticket class** = maintenance (ticketClassId = MAINTENANCE).

For **same-location:** additionally ticket.studioId = primary.studioId, and primary.studioId is not null.  
For **nearby:** ticket.studioId != primary.studioId (different studio); both primary’s studio and candidate’s studio have non-null latitude and longitude; distance(primary.studio, candidate.studio) <= radiusMiles.

### 4.3 Same-location candidate query

- Load primary ticket with studio. If primary.studioId is null or primary is not READY_FOR_DISPATCH or primary.status in (RESOLVED, CLOSED), return empty sameLocationCandidates and a summary explaining why.
- Query: tickets where studioId = primary.studioId, id != primary.id, dispatchTradeType = primary (or override), dispatchReadiness = 'READY_FOR_DISPATCH', status not in (RESOLVED, CLOSED), ticketClassId = maintenance class id. Exclude ticketIds that appear in dispatch_group_items with an active group (subquery or join). **Order by: priority DESC, then createdAt ASC** (exact deterministic rule; use consistently). Limit 20.

### 4.4 Nearby-location candidate query

- If primary.studioId is null or primary’s studio has null latitude or longitude, return empty nearbyLocationCandidates and summary (e.g. “Studio has no coordinates for nearby search”).
- Get radius: use tradeTypeOverride or primary.dispatchTradeType to look up default radius (hardcoded map, e.g. PLUMBER → 15, HVAC → 20, default 10). Override with radiusMiles if provided.
- Load all candidates that: different studio (studioId != primary.studioId), same trade type, READY_FOR_DISPATCH, open status, maintenance, not in active group. Include only tickets whose studio has non-null lat/lng. Compute distance from primary.studio to each candidate’s studio (Haversine). Filter where distance <= radiusMiles. Sort by distance ascending, then createdAt desc. Limit 20.

### 4.5 Distance calculation

- Use **Haversine formula** in application code (or raw SQL) to compute distance in miles between two (lat, lng) points. No PostGIS required for V1. One implementation in a small util (e.g. `distanceMiles(lat1, lng1, lat2, lng2)`) and use it in the service. Deterministic and simple.

### 4.6 Radius handling

- Default radius by trade type (hardcoded): e.g. HANDYMAN 10, PLUMBER 15, HVAC 20, ELECTRICIAN 15, LOCKSMITH 10, GENERAL_MAINTENANCE 10. If request provides radiusMiles, use it; otherwise use default for the primary ticket’s trade type (or override). Same radius used for the entire nearby query.

### 4.7 Missing studio coordinates

- If primary ticket has no studio or studio has null lat/lng: same-location can still run (candidates at same studioId). Nearby returns empty and summary explains “Add coordinates to this location for nearby recommendations.”
- Candidates with studios missing coordinates are excluded from **nearby** (they cannot be distance-filtered). They can still appear in same-location if they share the same studio as primary.

### 4.8 Candidate limit

- Cap **sameLocationCandidates** and **nearbyLocationCandidates** at **20** each. **Same-location ordering:** priority DESC, then createdAt ASC (exact deterministic rule). **Nearby ordering:** distance ascending, then createdAt DESC. Take first 20 per list. Document in API response so UI can show “Showing up to 20” if needed.

---

## 5. Dispatch Group Service Plan

### 5.1 Create group flow

- **Input:** createdBy (userId), tradeType, optional notes, optional targetDate, and **list of ticketIds** (at least one). Optionally initial stopOrder per ticket (e.g. array of { ticketId, stopOrder }).
- **Validation:** All ticketIds must exist, be maintenance tickets, be open (status not RESOLVED/CLOSED), have dispatchReadiness = READY_FOR_DISPATCH, and **not** be in any active dispatch group. If any check fails, return 400 with clear message.
- **Create:** Insert dispatch_group with status = DRAFT, then insert dispatch_group_items with ticketId and stopOrder (1-based: 1, 2, 3, … from array order or from request).
- **Return:** Created group with items (and ticket summaries for UI).

### 5.2 Add tickets to group

- **Only when group.status = DRAFT.** For each new ticketId: same validation (exists, maintenance, open, READY_FOR_DISPATCH, not in another active group). Then insert dispatch_group_item with next stopOrder (max existing + 1). Enforce one-active-group rule: if ticket is already in another active group, return 400.

### 5.3 Stop order handling

- **Reorder:** PATCH or PUT that accepts ordered list of item ids or (ticketId, stopOrder) and updates stopOrder for each item. Only when group is DRAFT. Persist new order; no gap requirement (1, 2, 5 is allowed) but prefer 1, 2, 3 for simplicity.
- **Remove item:** Delete dispatch_group_item. Only when group is DRAFT. Ticket then becomes eligible for other groups again.

### 5.4 Status transitions (V1 only)

- **Implemented:** DRAFT → READY_TO_SEND (admin “finalizes” the group). READY_TO_SEND → CANCELLED. DRAFT → CANCELLED.
- **Not implemented in V1:** Transitions to or from SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS, COMPLETED. Enum values exist in schema; no API or UI to set them in V1.
- **Rules:** Only DRAFT groups can be edited (add/remove/reorder items, edit notes). READY_TO_SEND and CANCELLED are read-only for items. CANCELLED groups do not count as “active” for one-active-group rule.

### 5.5 Cancellation behavior

- Set group.status = CANCELLED. Do not delete items; tickets are released (no longer in an active group) and can be added to a new group. No cascade delete of group; keep for audit.

### 5.6 One active group per ticket — enforcement in service

- On **create group** (with initial ticketIds) and on **add item**: for each ticketId, run a check: exists dispatch_group_items where ticketId = X and dispatchGroupId in (select id from dispatch_groups where status in ('DRAFT','READY_TO_SEND'))? **V1: only DRAFT and READY_TO_SEND.** If yes for any X, return 400 “Ticket already in an active dispatch group” (and list which ticket). Do not insert any items until all pass.

---

## 6. Ticket-Level Recommendation UI Plan

### 6.1 Where it appears

- **Placement:** On the **maintenance ticket** detail view and on the **ticket slide-over panel (drawer)** when the ticket is a maintenance ticket. Add a **“Dispatch”** (or “Dispatch recommendations”) section/card below existing sections (e.g. below Lease IQ block and above or beside tabs). Do not change tab structure from Stage 4; add a single block that is visible when ticket is maintenance and user has permission (e.g. ADMIN or DEPARTMENT_USER who can view the ticket).

### 6.2 Data it shows

- **Primary ticket:** Already in context; show its dispatch trade type and readiness (read-only or editable inline per plan §3).
- **Same-location list:** Heading “Same location (N)” with list of tickets: title (link to ticket), studio name. If empty: “No other dispatchable tickets at this location” and short hint (e.g. “Mark other tickets as Ready for dispatch”).
- **Nearby list:** Heading “Nearby (N)” with list: title (link), studio name, distance (e.g. “2.3 mi”). If empty: “No nearby dispatchable tickets” or “Add coordinates to this location for nearby search” when studio has no lat/lng.
- **Summary line:** Optional one-line summary from API (e.g. “2 same-location, 4 nearby”).

### 6.3 Create dispatch group action

- **Button:** “Create dispatch group” (or “Create group from recommendations”). When clicked: open a modal or inline flow where user selects which candidates to include (checkboxes for same-location and nearby lists; current ticket is pre-selected and required). Optional: set group notes. Submit calls API to create group with selected ticketIds; on success, redirect to dispatch group detail page (e.g. /admin/dispatch/groups/:id) or show success and link to group.
- **Permission:** Only users who can create dispatch groups (e.g. ADMIN or same as ticket edit) see the button. Disabled when there are no candidates and no other tickets to add (e.g. only current ticket); or allow “Create group with this ticket only” so a one-ticket group can be created.

### 6.4 Empty states

- **Ticket not ready:** If primary ticket is not READY_FOR_DISPATCH, show message “Mark this ticket as Ready for dispatch to see recommendations” and optionally show trade type/readiness fields for editing.
- **No trade type:** If dispatchTradeType is null, show “Set dispatch trade type to see recommendations.”
- **No studio:** If ticket has no studio, show “Assign a location to this ticket to see same-location and nearby recommendations.”
- **No coordinates:** For nearby only: “Add coordinates to this location to see nearby recommendations.” Same-location can still show if studio is set.

### 6.5 Fit with Stage 4

- Reuse existing ticket panel/drawer layout and styling (depth, spacing, typography). Add the Dispatch block as a new section without changing subtask, comment, or history tabs. Keep loading and error states consistent with rest of panel. No new tab unless product explicitly wants “Dispatch” as a tab; recommendation is a **block** to avoid tab proliferation.

---

## 7. Dispatch Admin Surface Plan

### 7.1 List of READY_FOR_DISPATCH maintenance tickets

- **Data:** All maintenance tickets where dispatchReadiness = READY_FOR_DISPATCH and status NOT IN (RESOLVED, CLOSED). Apply Stage 1 visibility (same as ticket list). Optionally exclude tickets already in an active group (or show them with “In group” badge).
- **Grouping:** Group by **dispatch trade type** (e.g. Plumbing, HVAC). Within each group, order by studio name then ticket title (or createdAt). Show count per trade type.

### 7.2 Filters

- **Trade type** — Filter to one or “All.”
- **Radius** — For “nearby” preview only (e.g. show studios within N mi); optional filter that affects a secondary view or a “preview nearby” action, not the primary list.
- **Location** — Studio and/or market (state). Same as existing dispatch page filters where applicable. Restrict list to tickets in selected studio/market.

### 7.3 Coexistence with existing dispatch page

- **Option A:** Add a **sub-view or tab** on the existing Admin → Dispatch (“Vendor Dispatch”) page: e.g. “Intelligence” vs “By location” (current by-studio, by-category, etc.). Intelligence tab shows the READY_FOR_DISPATCH list grouped by trade and the new filters; existing sections remain for count-based views.
- **Option B:** New route `/admin/dispatch/intelligence` (or `/admin/dispatch/ready`) and keep current `/admin/dispatch` as-is. Nav: “Dispatch” with sub-links “Overview” (current) and “Ready to dispatch” (new list).
- Recommendation: **Option A** (tab or section on same page) to avoid nav bloat; if the current page is crowded, Option B is acceptable. Do not remove or redesign the existing “Open Issues by Location” / “By Category” / “Locations With Multiple Open Issues” sections; add new content only.

### 7.4 Map

- **Secondary only.** If a map is added in V1, it shows pins for studios (or tickets) that have READY_FOR_DISPATCH tickets; clicking a pin can open the list or ticket. Map is **not** the primary surface; list grouped by trade is primary. V1 can ship without map and add it in a follow-up.

---

## 8. Dispatch Group Detail Page Plan

### 8.1 Route and placement

- **Route:** e.g. `/admin/dispatch/groups/[id]`. Linked from ticket-level “Create dispatch group” success and from a “Dispatch groups” list (if implemented in V1) or from breadcrumb after create.

### 8.2 Group header

- **Trade type** — Display name (e.g. “Plumbing”).
- **Status** — Badge or text: DRAFT, READY_TO_SEND, or CANCELLED. Color or style to distinguish (e.g. DRAFT = neutral, READY_TO_SEND = accent, CANCELLED = muted).
- **Target date** — Optional; show if set.
- **Notes** — Optional; show if set; editable when status = DRAFT.
- **Created by** — User display name (from createdBy).

### 8.3 Item list

- **Rows:** One per dispatch_group_item. Columns: stop order, ticket title (link to ticket), studio name, optional estimated duration, optional notes (if field exists on item). Order by stopOrder ascending.

### 8.4 Stop order

- **When status = DRAFT:** Allow reorder via drag-and-drop or up/down buttons. Persist new stopOrder via API (PATCH group items order). When status = READY_TO_SEND or CANCELLED: list is read-only, no reorder.

### 8.5 Editing rules

- **DRAFT:** Can edit notes, add/remove items (via API), reorder items. “Mark ready” (or “Finalize”) button sets status to READY_TO_SEND.
- **READY_TO_SEND:** Read-only. “Cancel group” button sets status to CANCELLED.
- **CANCELLED:** Read-only; no further actions in V1.

### 8.6 Read-only vs editable

- Expose status in UI; show/hide edit controls (reorder, add ticket, remove ticket, edit notes, finalize, cancel) based on group.status. No edit when not DRAFT; no “finalize” when not DRAFT; no “cancel” when already CANCELLED.

---

## 9. Geocoding / Location Backbone Plan

### 9.1 Current usage

- **Studio** already has `latitude`, `longitude`, `formattedAddress`. They are nullable. Existing admin Locations (markets) flow allows setting address and lat/lng when creating/editing a studio. No change to that schema.

### 9.2 Plan for missing coordinates

- **Recommendation and grouping:** Tickets at studios with null lat/lng are excluded from **nearby** recommendations only. Same-location recommendations still work (same studioId). Dispatch list and group detail do not require coordinates; only the “nearby” candidate list does.
- **UI:** When showing “Nearby” empty state, message can say “Add coordinates to this location to see nearby recommendations.” Link or hint to Locations admin to edit the studio and add lat/lng.

### 9.3 One-time / backfill geocoding

- **Approach:** Either (1) a **one-time script** that, for each studio with formattedAddress but null lat/lng, calls a geocoding API and updates studio.latitude, studio.longitude, or (2) an **admin action** “Geocode address” on the Locations (studio) edit flow that fills lat/lng from current address. V1 does not require a fully automated backfill; manual “Geocode” button or script is enough.
- **Provider:** Implementation choice (e.g. Google Geocoding, Mapbox, or other). Not specified in plan; only that coordinates are stored on Studio after geocoding.

### 9.4 V1 scope

- **Geocoding as prerequisite or part of V1:** Treat as **part of V1** in the sense that (a) recommendation and group features work with existing coordinates, and (b) either a small “Geocode” action in admin or a one-off script is implemented so that key studios can get coordinates. Full backfill of all studios is not required for V1 demo; document that “studios without coordinates will not show in nearby recommendations.”

---

## 10. Configuration Plan

### 10.1 Hardcoded in V1

- **Radius by trade type:** HANDYMAN 10 mi, PLUMBER 15 mi, HVAC 20 mi, ELECTRICIAN 15 mi, LOCKSMITH 10 mi, GENERAL_MAINTENANCE 10 mi. Stored in code (e.g. constant map in DispatchRecommendationService or config file read at startup). No DB or env required for V1.
- **Max tickets per group:** 10 (or 20). Reject create/add if exceeding; no admin UI to change.
- **Dispatchable readiness:** Only READY_FOR_DISPATCH. No toggle; fixed in logic.
- **Same-location vs nearby:** Both included; no toggle to disable one or the other in V1.
- **Candidate list cap:** 20 per list (same-location, nearby). Hardcoded.

### 10.2 Configurable later

- Radius by trade type (DB or env).
- Max tickets per group.
- Which readiness statuses count as dispatchable (e.g. allow WAITING_ON_DELIVERY in future).
- Toggle “include nearby” vs “same-location only.”
- Cross-district grouping flag.

No admin UI for these in V1; document in implementation plan that they are hardcoded and can be moved to config in a later iteration.

---

## 11. API / Contract Plan

### 11.1 Recommendation lookup

- **GET** `/api/tickets/:ticketId/dispatch-recommendations` (or `GET /api/dispatch/recommendations?ticketId=...`).
- **Query params:** `radiusMiles` (optional number), `tradeType` (optional override).
- **Response:** 200 with body:
  - `primaryTicket`: { id, title, studioId, studio?: { name, latitude, longitude }, dispatchTradeType, dispatchReadiness, status } (and any other needed for UI).
  - `sameLocationCandidates`: array of { id, title, studioId, studio?: { name }, status, dispatchTradeType } (no distance).
  - `nearbyLocationCandidates`: array of { id, title, studioId, studio?: { name }, status, dispatchTradeType, distanceMiles: number }.
  - `summary`: { sameLocationCount, nearbyCount, message?: string }.
- **Errors:** 404 if ticket not found; 400 if ticket not maintenance; 403 if actor cannot view ticket. When ticket not READY_FOR_DISPATCH or missing studio/trade type, return 200 with empty candidates and summary.message explaining.

### 11.2 Dispatch group creation

- **POST** `/api/dispatch/groups` (or under tickets if preferred). Body: `{ tradeType, ticketIds: string[], notes?: string, targetDate?: string }`. Optionally `stopOrder` as array matching ticketIds order.
- **Response:** 201 with created group: { id, tradeType, status: 'DRAFT', createdBy, notes, targetDate, createdAt, items: [{ id, ticketId, stopOrder, ticket?: { id, title, studio? } }] }.
- **Errors:** 400 if any ticket invalid (not open, not READY_FOR_DISPATCH, already in active group, not maintenance). 403 if unauthorized.

### 11.3 Dispatch group detail

- **GET** `/api/dispatch/groups/:id`. Response: group with status, tradeType, createdBy, notes, targetDate, items (with ticketId, stopOrder, ticket summary, optional estimatedDurationMinutes). 404 if not found; 403 if no access.

### 11.4 Dispatch group update (partial)

- **PATCH** `/api/dispatch/groups/:id` — Body: `{ notes?, targetDate?, status? }`. Only status transitions allowed in V1: DRAFT → READY_TO_SEND, DRAFT → CANCELLED, READY_TO_SEND → CANCELLED. 400 if invalid transition or invalid body.
- **PATCH** `/api/dispatch/groups/:id/items` — Reorder: body `{ order: { itemId: stopOrder } }` or `[{ itemId, stopOrder }]`. Only when group is DRAFT.
- **POST** `/api/dispatch/groups/:id/items` — Body `{ ticketId }`. Add item; only DRAFT. Enforce one active group per ticket.
- **DELETE** `/api/dispatch/groups/:id/items/:itemId` — Remove item; only DRAFT.

### 11.5 Dispatch list view

- **GET** `/api/dispatch/ready` (or `GET /api/tickets?dispatchReady=true&ticketClass=MAINTENANCE`). Query params: `tradeType`, `studioId`, `marketId` (filters). Response: list of tickets (or grouped by tradeType) with READY_FOR_DISPATCH and status not in (RESOLVED, CLOSED). Pagination: page, limit. Shape: either flat list with tradeType on each ticket (frontend groups) or server-grouped `{ byTradeType: { PLUMBER: [...], HVAC: [...] } }`. Contract choice: document one; recommendation is flat list with tradeType and sort/group on client for simplicity.

### 11.6 Ticket update (dispatch fields) — maintenance only

- **PATCH** `/api/tickets/:id` — Request body may include `dispatchTradeType`, `dispatchReadiness`. **These fields are valid and editable only for maintenance tickets.**
- **Preferred behavior:** If the ticket is **maintenance** (ticketClassId = MAINTENANCE class id), accept and persist `dispatchTradeType` and/or `dispatchReadiness` when present in the body; return updated ticket with these fields. If the ticket is **not maintenance** (e.g. support ticket), **reject** the request with **400** and a clear message (e.g. "Dispatch fields are only valid for maintenance tickets") when the client sends either field; do not persist dispatch fields on non-maintenance tickets. Alternatively, **ignore** dispatch fields silently for non-maintenance and return 200 with the rest of the update applied; the plan **recommends reject (400)** so the client does not silently send invalid data and so behavior is consistent and explicit.
- Document this in the ticket update contract and in validation logic so implementation does not guess.

---

## 12. Implementation Order

1. **Data model + migration** — Add enums DispatchTradeType, DispatchReadiness, DispatchGroupStatus. Add columns to Ticket (dispatchTradeType, dispatchReadiness). Create dispatch_groups and dispatch_group_items tables and migration. Add indexes per §1.7. Run migration.
2. **Trade type / readiness wiring** — DispatchClassificationService (default from maintenance category). Ticket create/update: accept and persist dispatchTradeType, dispatchReadiness. No UI yet; ensure API and DB work.
3. **Recommendation service** — Implement DispatchRecommendationService: same-location and nearby queries, eligibility, distance util, one-active-group exclusion. Unit or integration tests for eligibility and ordering.
4. **Dispatch group service** — Implement DispatchGroupService: create group, add/remove items, reorder, status transitions (DRAFT, READY_TO_SEND, CANCELLED only). Enforce one active group per ticket on add. API endpoints: POST/PATCH/GET groups, PATCH/DELETE items.
5. **Recommendation API** — GET recommendations endpoint; wire to DispatchRecommendationService. Return primaryTicket, sameLocationCandidates, nearbyLocationCandidates, summary.
6. **Ticket-level recommendation panel** — On maintenance ticket detail and drawer: fetch recommendations, show same-location and nearby lists, “Create dispatch group” with selection flow, empty states. PATCH ticket for readiness/trade type if editable in same block.
7. **Dispatch list / admin surface** — GET dispatch/ready (or equivalent) and filters. Admin Dispatch page: add tab or section for “Ready to dispatch” list grouped by trade; filters (trade, studio, market). No map required in V1.
8. **Dispatch group detail page** — New page: GET group by id, show header (trade, status, notes, createdBy), item list with stop order. When DRAFT: reorder, add/remove items, edit notes, “Finalize” → READY_TO_SEND, “Cancel” → CANCELLED. When READY_TO_SEND or CANCELLED: read-only.
9. **Final pass** — Empty states, error messages, verification checklist (§13). Ensure no regressions to Stages 1–6 (visibility, feed, lifecycle, comments, panel polish, dashboard, admin filters). Geocode: add “Geocode” action or script and document.

---

## 13. Verification Checklist

- [ ] **Trade type stored correctly** — Create/update maintenance ticket with dispatchTradeType; read back via GET ticket. Default from maintenance category appears when category is set; admin can override.
- [ ] **Readiness stored correctly** — Set dispatchReadiness to READY_FOR_DISPATCH via PATCH; read back. Ticket status unchanged (e.g. still IN_PROGRESS).
- [ ] **Only READY_FOR_DISPATCH recommended** — Ticket with NOT_READY or null readiness: recommendation API returns empty candidates or message. Ticket with READY_FOR_DISPATCH: appears in others’ candidate lists when eligible.
- [ ] **Same-location candidates correct** — Two tickets at same studio, same trade, both READY_FOR_DISPATCH, open: each appears in the other’s same-location list. Different studio: do not appear in same-location.
- [ ] **Nearby-location candidates correct** — Two tickets at different studios with coordinates, same trade, READY_FOR_DISPATCH, open, within radius: each appears in the other’s nearby list with distance. Beyond radius: do not appear. Missing coordinates: nearby empty with message.
- [ ] **Tickets in RESOLVED/CLOSED excluded** — Mark ticket RESOLVED; it does not appear in any recommendation candidate list and does not appear in “ready to dispatch” list.
- [ ] **One active group rule enforced** — Add ticket A to group 1 (DRAFT). Try add ticket A to group 2 (DRAFT): reject with 400. Cancel group 1 (CANCELLED); now add ticket A to group 2: success.
- [ ] **DRAFT / READY_TO_SEND / CANCELLED** — Create group → DRAFT. Finalize → READY_TO_SEND. Cancel from DRAFT or READY_TO_SEND → CANCELLED. Only DRAFT allows add/remove/reorder items and edit notes.
- [ ] **Ticket panel UI** — Open maintenance ticket; Dispatch block shows; same-location and nearby lists or empty states; “Create dispatch group” works and redirects to group detail. No layout break; Stage 4 panel polish preserved.
- [ ] **No regressions to Stages 1–6** — Visibility: department/studio user sees only allowed tickets; recommendation and dispatch list respect same visibility. Feed: ticket list and actionable unchanged. Lifecycle: resolution gate and state machine unchanged. Comments/mentions: unchanged. Panel/feed polish: no visual or interaction regression. Dashboard/reporting: unchanged. Admin filters and naming: unchanged.

---

*This implementation plan is the single reference for building Dispatch Intelligence V1. All implementation must follow this order and these contracts; dispatchGroupStatus remains derived; open ticket and one active group rules are binding.*
