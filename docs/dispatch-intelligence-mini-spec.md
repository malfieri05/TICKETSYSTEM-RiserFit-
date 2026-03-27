# Dispatch Intelligence — Mini-Spec

## 1. Intent

Build a **Dispatch Intelligence layer** on top of the maintenance ticket system. The purpose is to help admins identify which maintenance tickets can be bundled into one dispatch plan based on trade type, dispatch readiness, same-location opportunities, and nearby-location opportunities. The system answers: who should be sent, where else should they go, what other jobs can be bundled, and is this job ready to dispatch yet. This is a **dispatch recommendation engine**, not just a map. V1 stays tight and demo-worthy: data model first, recommendation engine second, UI third. The map is secondary visualization only.

---

## 2. Problem Statement

Today, admins have no structured way to:

- Classify maintenance tickets by **dispatch trade type** (e.g. plumbing, HVAC, handyman).
- Track **dispatch readiness** separately from ticket lifecycle status (e.g. “waiting on parts” vs “ready to send a tech”).
- See **same-location** or **nearby-location** tickets that could be bundled into one visit.
- Create and save **dispatch groups** as operational plans.
- Answer “what else can this tech do while they’re there?” or “which tickets are ready to dispatch?” in one place.

The existing admin Dispatch page (Stage 5/6) shows counts by studio, category, and market and “locations with multiple open issues,” but it does not provide recommendation semantics, grouping rules, or saved dispatch groups. Ticket lifecycle (Stage 1–2) and visibility (Stage 1) remain unchanged; dispatch is an **additional lens** over maintenance tickets.

---

## 3. Operational Goal

- Identify **open maintenance tickets** that are **dispatchable** (e.g. READY_FOR_DISPATCH).
- Classify them by **dispatch trade type** (controlled enum, not free text).
- Find **same-location** related tickets (same studio).
- Find **nearby-location** related tickets (same trade type, within configurable radius).
- **Recommend dispatch groups** (same-location and nearby) using deterministic rules.
- Let admin **manually create and save** a dispatch group from recommendations.

Out of scope for V1: route optimization, automatic vendor sending, SLA engine, complex scheduling, multi-trade bundling intelligence, advanced map-first UI.

---

## 4. Current System Gaps

| Gap | Current State | Desired |
|-----|---------------|---------|
| Trade type | Maintenance tickets have `maintenanceCategoryId` (e.g. Plumbing, HVAC) but no dispatch-oriented trade enum; category is taxonomy, not dispatch semantics. | Controlled **dispatch trade type** (HANDYMAN, PLUMBER, HVAC, etc.) for grouping and filtering. |
| Readiness | Ticket status (NEW, IN_PROGRESS, WAITING_ON_*, RESOLVED) describes lifecycle, not “ready for a tech to be sent.” | **Dispatch readiness** state (e.g. READY_FOR_DISPATCH) independent of ticket status. |
| Location for grouping | Ticket has `studioId`; Studio has `latitude`, `longitude`, `formattedAddress`. Studios may have null coordinates. | Guaranteed **location backbone**: address + lat/lng stored per studio; grouping uses distance. |
| Bundling view | No “same location” or “nearby” candidate list per ticket; no saved group. | **Recommendation engine** output: same-location candidates, nearby candidates; **saved dispatch groups** with items and stop order. |
| Admin UX | Dispatch page shows counts and “studios with multiple”; no ticket-level recommendation panel or group detail. | **Ticket-level recommendation panel**; **dispatch list/map view**; **dispatch group detail** page. |

---

## 5. Desired Behavior

- **Dispatch-specific fields** exist on the ticket (or on a related entity) where appropriate: trade type, readiness, group association, location coordinates (or derived from studio), optional duration and notes.
- **Dispatch trade type** is a controlled enum; it may be set manually and/or derived from maintenance category/keywords; it is not free text.
- **Dispatch readiness** is a separate state from ticket status; only READY_FOR_DISPATCH (and optionally other states) participate in grouping; readiness coexists with existing ticket/subtask workflow.
- **Location backbone**: every studio used for dispatch has address + latitude + longitude stored; coordinates are persisted, not recalculated on every request; grouping uses distance between studios.
- **Grouping rules** are deterministic: same trade type, both READY_FOR_DISPATCH, both open (not completed), within distance threshold, not already in another active dispatch group.
- **Recommendation engine** returns primary ticket, same-location candidates, nearby-location candidates, and a summary; inputs include ticketId, radius miles, optional trade override.
- **Dispatch groups** are first-class entities: admin creates a group from recommendations, assigns tickets (items) with stop order, and can view/edit/update status (e.g. DRAFT, READY_TO_SEND).
- **Admin UI**: ticket-level recommendation panel (primary V1 UX), dispatch list/map view of READY_FOR_DISPATCH tickets (grouped by trade, optional geography), and dispatch group detail page.
- **Configuration**: radius by trade, max tickets per group, which readiness statuses count, etc.; V1 may hardcode defaults with a path to config later.
- **Future integration** is documented: e.g. delivery confirmation moving tickets to READY_FOR_DISPATCH; Lease IQ landlord-responsibility affecting inclusion.

Existing behavior from Stages 1–6 is preserved: visibility, canonical feed, ticket lifecycle, subtask completion, comments/mentions, feed/panel polish, dashboard/reporting semantics, admin filters and naming.

---

## 6. Dispatch-Specific Ticket Model

### 6.1 Required fields (on ticket or single extension)

| Field | Storage | Meaning |
|-------|---------|---------|
| **dispatchTradeType** | On ticket (or nullable FK to a small lookup table) | Controlled enum: HANDYMAN, PLUMBER, HVAC, ELECTRICIAN, LOCKSMITH, GENERAL_MAINTENANCE. Used for grouping and filtering. |
| **dispatchReadiness** | On ticket | Enum: NOT_READY, READY_FOR_DISPATCH, WAITING_ON_DELIVERY, WAITING_ON_APPROVAL, DISPATCHED, COMPLETED. Only READY_FOR_DISPATCH (and optionally NOT_READY for “not yet”) participate in V1 recommendations. |
| **dispatchGroupStatus** | On ticket or on group membership | Indicates whether the ticket is unassigned, in a DRAFT group, or in a SENT/SCHEDULED group. May be derived from `dispatch_group_items` (if ticket is in any active group) or stored on ticket for quick filtering. Spec recommends: **derived** from dispatch_group_items + group.status; no redundant column on ticket unless query performance requires it. |
| **locationLat** | Derived from Studio | For distance calculations. **Not stored on ticket**; derived from `ticket.studioId` → `studio.latitude`. If ticket has no studio or studio has null coordinates, ticket is excluded from nearby grouping. |
| **locationLng** | Derived from Studio | Same as above; from `studio.longitude`. |

### 6.2 Recommended fields (V1 or later)

| Field | Storage | Meaning |
|-------|---------|---------|
| **estimatedDurationMinutes** | Optional on ticket or on dispatch_group_items | Estimated time on site; useful for group planning. Can live on group item only in V1. |
| **dispatchNotes** | Optional on ticket or group item | Free-text notes for dispatch (e.g. “tenant will be home after 2pm”). |
| **requiresApproval** | Optional boolean on ticket | Flag for tickets that need approval before dispatch; may exclude from READY_FOR_DISPATCH in future. |
| **vendorType** | Optional on group or ticket | For future vendor routing; out of scope for V1. |

### 6.3 Fit with current ticket model

- **Ticket** already has: `studioId`, `marketId`, `maintenanceCategoryId`, `status`, `ticketClassId`. Do not remove or repurpose these.
- **Add** to Ticket (or to a minimal `ticket_dispatch_info` table if product prefers to keep ticket table lean): `dispatchTradeType` (enum or FK), `dispatchReadiness` (enum). All other dispatch fields are either derived (location from studio, group status from group membership) or optional (notes, duration on group item).
- **Lifecycle**: Ticket status (NEW, IN_PROGRESS, RESOLVED, etc.) is unchanged. Dispatch readiness is **additive**: a ticket can be IN_PROGRESS and READY_FOR_DISPATCH at the same time. Completion of work (resolution gate) is still driven by subtasks and ticket state machine (Stage 2).

---

## 7. Dispatch Trade Type Model

### 7.1 Why not free text

- **Consistency**: Grouping and filtering require a fixed set of values so “same trade type” is unambiguous.
- **Reporting**: Counts and recommendations by trade type must be stable.
- **Config**: Radius and rules may be configured per trade type; free text would not map to config keys.

### 7.2 Controlled enum (V1)

- **HANDYMAN**
- **PLUMBER**
- **HVAC**
- **ELECTRICIAN**
- **LOCKSMITH**
- **GENERAL_MAINTENANCE**

Stored as an enum (or small `dispatch_trade_types` table with code/name). API and UI use the code; display name can be “Handyman,” “Plumber,” etc.

### 7.3 Mapping from maintenance category / keywords

- **Option A (V1):** Admin or system **manually selects** dispatch trade type when creating/editing a maintenance ticket (or in a dedicated “dispatch” section). Maintenance category (e.g. Plumbing, HVAC) can **default** the trade type (e.g. Plumbing → PLUMBER) but remains editable.
- **Option B (later):** Auto-classify from `maintenanceCategoryId` or title/description keywords (e.g. “leak,” “AC” → PLUMBER, HVAC) with optional override. V1 can implement **manual selection with default from maintenance category** so that existing categories (Plumbing, HVAC, Electrical, etc.) prefill trade type; admin can change it.
- **Spec recommendation:** V1 = manual selection + default from maintenance category when category maps cleanly to one trade type; document mapping in config or code. No free text; always one of the enum values (or UNKNOWN if product allows “not yet classified,” with UNKNOWN excluded from grouping until set).

---

## 8. Dispatch Readiness Model

### 8.1 States (example)

- **NOT_READY** — Not yet ready for dispatch (e.g. waiting on info, parts, or internal approval).
- **READY_FOR_DISPATCH** — Ready to be included in a dispatch plan; tech can be sent.
- **WAITING_ON_DELIVERY** — Parts or materials expected; will become READY_FOR_DISPATCH when delivered (future automation).
- **WAITING_ON_APPROVAL** — Pending approval before dispatch (future).
- **DISPATCHED** — Assigned to a sent/scheduled dispatch group (optional; may be inferred from group status).
- **COMPLETED** — Dispatch completed (optional; may align with ticket RESOLVED/CLOSED).

V1 **grouping** considers only tickets in **READY_FOR_DISPATCH**. Other states are for filtering and future automation.

### 8.2 How readiness differs from ticket lifecycle status

- **Ticket status** (Stage 1–2): NEW, TRIAGED, IN_PROGRESS, WAITING_ON_REQUESTER, WAITING_ON_VENDOR, RESOLVED, CLOSED. This describes **workflow progress** (has work started, is it blocked, is it done).
- **Dispatch readiness** describes **operational dispatchability**: “Can we send a tech for this job today?” A ticket can be IN_PROGRESS (work started) but NOT_READY (e.g. waiting on parts). A ticket can be READY_FOR_DISPATCH while still IN_PROGRESS (e.g. all prep done, just needs the visit).
- **Readiness does not replace ticket status.** Both are stored and used for different purposes. Feeds and lifecycle logic continue to use ticket status only.

### 8.3 Coexistence with ticket/subtask workflow

- Subtask completion and resolution gate (Stage 2) drive ticket status (e.g. to RESOLVED). They do **not** set dispatch readiness.
- Dispatch readiness is set **manually** in V1 (e.g. admin marks “Ready for dispatch”) or by a future automation (e.g. “delivery confirmed” → READY_FOR_DISPATCH). No change to `ticket-state-machine.ts` for status transitions; readiness is a separate field updated by dispatch-specific flows.
- When a ticket is RESOLVED or CLOSED, it is excluded from “open” dispatch views regardless of readiness; readiness is only meaningful for non-completed tickets.

### 8.4 Future automation (document only, not V1)

- **Delivery confirmation** (e.g. from email automation): when “parts delivered” or “order received” is confirmed, update ticket from WAITING_ON_DELIVERY to READY_FOR_DISPATCH.
- **Lease IQ / responsibility**: Landlord-responsibility tickets might be excluded from dispatch recommendations or flagged differently; tenant-responsibility might be the default for “send our tech.”

---

## 9. Location Backbone

### 9.1 Requirement

Every **studio (location)** used for dispatch grouping must have:

- **Address** — `formattedAddress` (already on Studio).
- **Latitude** — `studio.latitude`.
- **Longitude** — `studio.longitude`.

Without latitude and longitude, a studio cannot participate in **nearby-location** grouping (distance calculation). Same-location grouping (same studio) does not require coordinates.

### 9.2 Storage and calculation

- **Coordinates are stored**, not recalculated on every request. Geocoding (address → lat/lng) is done once when the location is created or updated, and the result is persisted on Studio. Current schema already has `latitude` and `longitude` on Studio; ensure they are populated for all studios that need dispatch.
- **If addresses exist but coordinates are null:** A one-time or periodic **geocoding job** (or admin action “Geocode address”) should populate latitude and longitude and persist them. Spec does not mandate a specific geocoding provider; implementation choice.
- **Grouping** uses **distance between two studios’ coordinates** (e.g. Haversine or PostGIS). Threshold is configurable (e.g. radius in miles). Tickets at the same studio have distance 0 (same-location). Tickets at different studios are “nearby” if distance ≤ radius.

### 9.3 Ticket location

- Ticket has `studioId`. Location for the ticket is **derived** from `ticket.studioId` → `studio.latitude`, `studio.longitude`. No duplicate storage of lat/lng on the ticket. If `studioId` is null or studio has null coordinates, the ticket is excluded from nearby recommendations (and optionally from same-location if “same location” is interpreted as same studio).

---

## 10. Grouping Rules

### 10.1 Eligibility for grouping (deterministic)

Two tickets can be grouped (recommended together) if **all** of the following hold:

- Same **dispatchTradeType**.
- Both **dispatchReadiness** = READY_FOR_DISPATCH.
- Both **open** (ticket status not in RESOLVED, CLOSED).
- Within **configured distance threshold** (for nearby) or **same studio** (for same-location).
- Not already assigned to another **active** dispatch group (e.g. group status not CANCELLED/COMPLETED; if a ticket is in a DRAFT or READY_TO_SEND group, it may still be recommendable for a new group until product rules say otherwise—V1 can allow “in draft” to still appear as candidate and let admin decide).

V1 does **not** bundle across different trade types (no multi-trade bundling).

### 10.2 Same-location bundling (A)

- **Definition:** Other dispatchable tickets at the **same studio** (same `studioId`).
- **Rule:** For ticket T with `studioId` = S, same-location candidates = all other tickets that: (1) have `studioId` = S, (2) same trade type as T, (3) READY_FOR_DISPATCH, (4) open, (5) not already in another active group (per product rule).
- **Use case:** “While the plumber is at East Dublin, what other plumbing jobs are there at East Dublin?”

### 10.3 Nearby-location bundling (B)

- **Definition:** Dispatchable tickets of the **same trade type** within a **radius** (miles) of the ticket’s studio.
- **Rule:** For ticket T with studio S (with valid lat/lng), nearby candidates = all other tickets that: (1) have a different studio with valid lat/lng, (2) same trade type, (3) READY_FOR_DISPATCH, (4) open, (5) distance(S, other.studio) ≤ radius, (6) not already in another active group.
- **Use case:** “What other plumbing jobs are within 10 miles of East Dublin?”

### 10.4 Two distinct recommendation types

- **Same-location** and **nearby** are **two distinct** recommendation types. The engine returns both lists separately. UI can show “Same location (3)” and “Nearby (5)” so the admin understands which is which. Same-location does not depend on radius; nearby depends on radius and coordinates.

---

## 11. Dispatch Recommendation Engine

### 11.1 Service: DispatchRecommendationService

**Responsibilities:** Given a ticket and options, return the primary ticket, same-location candidates, nearby-location candidates, and a short summary. No persistence of recommendations; read-only computation.

**Inputs:**

- `ticketId` (required)
- `radiusMiles` (optional; default from config or trade type)
- `tradeTypeOverride` (optional; if provided, use instead of ticket’s dispatch trade type for matching)

**Outputs:**

- **primaryTicket** — The ticket requested (with dispatch fields, studio, coordinates if available).
- **sameLocationCandidates** — List of tickets at the same studio satisfying eligibility (same trade, READY_FOR_DISPATCH, open, not in active group). Ordered by e.g. createdAt or priority.
- **nearbyLocationCandidates** — List of tickets at other studios within radius, same eligibility. Ordered by distance ascending, then by createdAt or priority.
- **summary** — E.g. “2 same-location, 4 nearby” or short text for UI.

### 11.2 Recommendation semantics

- **Eligibility** is defined by §10. If the primary ticket is not READY_FOR_DISPATCH or has no studio (or studio has no coordinates for nearby), return empty lists and a summary that explains why (e.g. “Ticket not ready for dispatch” or “Studio has no coordinates”).
- **Candidate ordering:** Same-location: by ticket createdAt desc or priority. Nearby: by distance asc, then createdAt desc. Limit to a sensible cap (e.g. 20 per list) for performance and UX.

### 11.3 Demo-worthy but simple V1

- Deterministic: same inputs always yield same outputs. No ML or probabilistic ranking.
- Fast: single or few queries (ticket by id; candidates by studio + trade + readiness; nearby via distance query or in-memory filter if dataset is small). Add DB index on (studioId, dispatchTradeType, dispatchReadiness, status) and optionally spatial index if using PostGIS.
- Clear: admin sees “Same location: 2 tickets” and “Nearby: 4 tickets” with ticket title, studio name, and distance (for nearby). One action: “Create dispatch group” that opens group creation with pre-selected tickets.

---

## 12. Dispatch Group Model

### 12.1 New models

**dispatch_groups**

- `id` (PK)
- `tradeType` (dispatch trade type enum)
- `createdBy` (userId, FK)
- `status` (enum: DRAFT, READY_TO_SEND, SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED)
- `targetDate` (optional date for planned dispatch)
- `notes` (optional text)
- `vendorId` (optional FK, for future vendor integration)
- `createdAt`, `updatedAt`

**dispatch_group_items**

- `id` (PK)
- `dispatchGroupId` (FK)
- `ticketId` (FK, unique per group; one ticket in at most one active group if product rule is “one group per ticket”)
- `stopOrder` (int; order of visit for the group)
- `estimatedDurationMinutes` (optional)
- `createdAt` (optional `updatedAt`)

### 12.2 Dispatch group statuses (V1)

- **DRAFT** — Being built; not yet finalized. Admin can add/remove items, reorder, edit notes.
- **READY_TO_SEND** — Finalized; ready to send to vendor or schedule. V1 may stop here (no actual “send” yet).
- SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED — For future use or minimal V1 support (e.g. mark COMPLETED when work is done). V1 can implement **DRAFT** and **READY_TO_SEND** only if that keeps scope tight.

### 12.3 Operational semantics

- Dispatch groups are **operational plans** built **manually** from recommendations. Admin selects a set of tickets (from same-location and/or nearby list), creates a group, sets stop order and optional notes, and saves. No automatic creation of groups by the engine.
- When a ticket is added to a group, product may enforce “ticket can only be in one active group” (e.g. one DRAFT or READY_TO_SEND group) so it does not appear in other recommendations; or allow multiple draft groups and let admin resolve. Spec recommends: **one active group per ticket** (active = status in DRAFT, READY_TO_SEND, SENT_TO_VENDOR, SCHEDULED, IN_PROGRESS).

---

## 13. Admin UI Surfaces

### 13.1 A. Ticket-level recommendation panel (primary V1 UX)

**Placement:** On the **maintenance ticket** detail view (or slide-over panel), a section “Dispatch” or “Dispatch recommendations.”

**Content:**

- Same-location recommendations: list of tickets (title, studio name, link) that can be bundled at the same location.
- Nearby-location recommendations: list of tickets (title, studio name, distance, link) within radius.
- **Action:** “Create dispatch group” — opens a flow to create a new dispatch group with the current ticket + selected candidates (or “Create group from these” with checkboxes). After creation, redirect to dispatch group detail page.

This is the **best first UX** for V1: admin is already looking at a ticket and can immediately see what can be bundled and create a group.

### 13.2 B. Dispatch list / map view

**Placement:** Admin → Dispatch (existing route can be extended or a new “Dispatch Intelligence” sub-page).

**Content:**

- List (and optionally map) of **all READY_FOR_DISPATCH maintenance tickets**.
- **Grouped by trade type** (e.g. Plumbing, HVAC) and optionally **clustered by geography** (e.g. by market or by proximity).
- **Filters:** Trade type, radius (for nearby preview), district/region (market), status (readiness).
- **Actions:** Open ticket, “Create group” from selection. Map is **secondary visualization** (pin per ticket or per studio); list is primary. V1 does not require map; list + filters are sufficient.

### 13.3 C. Dispatch group detail page

**Placement:** e.g. `/admin/dispatch/groups/:id`.

**Content:**

- Group header: trade type, status, target date, notes, created by.
- **Grouped ticket list** with stop order (editable drag-and-drop or up/down).
- Per item: ticket title, studio, link to ticket, optional estimated duration and notes.
- Actions: Edit (DRAFT only), Update status (e.g. DRAFT → READY_TO_SEND), Cancel group. No route optimization or “send to vendor” in V1.

---

## 14. Configuration Options

### 14.1 Examples

- **Default radius by trade type** — e.g. Handyman 10 mi, Plumber 15 mi, HVAC 20 mi.
- **Max tickets per group** — e.g. 10 (to keep groups manageable).
- **Include same-location only vs nearby too** — Toggle or config so admin can restrict recommendations to same-location only.
- **Which readiness statuses count as dispatchable** — Default: only READY_FOR_DISPATCH; config could add others later.
- **Cross-district grouping** — Allow or disallow grouping across markets/districts; config flag.

### 14.2 V1 approach

- **Recommendation:** **Hardcoded defaults** in V1 (e.g. radius 10/15/20 by trade, max 10 per group, same + nearby both included). No admin UI for dispatch config in V1. Config can be moved to **config-backed** (DB or env) in a later iteration so admins can change radius and limits without code deploy.

---

## 15. Integration with Existing Automations

### 15.1 Documented future integration (no V1 implementation)

- **Delivery email automation:** When an assembly/delivery email confirms “order received” or “parts shipped,” a future step could set ticket dispatch readiness from WAITING_ON_DELIVERY to READY_FOR_DISPATCH. No change to current email automation in V1.
- **Lease IQ / responsibility:** Tickets classified as landlord responsibility might be **excluded** from dispatch recommendations (we don’t send our tech) or **flagged** differently. Tenant-responsibility tickets are the default for “can be dispatched.” V1 does not need to filter by Lease IQ; document the integration path for later.

---

## 16. Service Architecture

### 16.1 Recommended services

| Service | Responsibility |
|---------|----------------|
| **DispatchClassificationService** | Set or derive dispatch trade type (and optionally readiness) for a ticket. May apply defaults from maintenance category; expose “set trade type” / “set readiness” for admin. |
| **DispatchRecommendationService** | Compute same-location and nearby candidates for a ticket; return structured recommendation (see §11). Read-only. |
| **DispatchGroupService** | CRUD for dispatch groups and group items; enforce “one active group per ticket” if applicable; validate stop order and status transitions. |
| **DispatchMapService** | (Later.) Provide geo data for map view (e.g. pins for tickets or studios, clusters). V1 can skip or stub. |

### 16.2 Responsibilities summary

- **DispatchClassificationService:** Classification and defaulting; no grouping logic.
- **DispatchRecommendationService:** Grouping rules and candidate computation; no persistence of groups.
- **DispatchGroupService:** Persistence and lifecycle of groups; used by UI when creating/editing groups.

---

## 17. V1 Scope / Out of Scope

### 17.1 Build now

- Dispatch fields on tickets (dispatchTradeType, dispatchReadiness).
- Dispatch trade type enum and (optional) mapping from maintenance category.
- Dispatch readiness state model and storage.
- Coordinates storage: ensure studios used for dispatch have lat/lng (geocode if needed).
- Same-location recommendations (same studio, same trade, READY_FOR_DISPATCH, open).
- Nearby-location recommendations (within radius, same trade, READY_FOR_DISPATCH, open).
- Manual dispatch group creation (create group, add tickets, set stop order, save).
- Dispatch group detail page (view/edit group, status, list of items).
- Ticket-level recommendation panel (same-location list, nearby list, “Create dispatch group” action).

### 17.2 Do NOT build yet

- Route optimization.
- Vendor SLA engine.
- Automatic sending to vendor.
- Complex scheduling (recurring, time windows).
- Multi-trade bundling intelligence (e.g. one visit for plumbing + HVAC).
- Advanced map-first intelligence (map as primary UX, clustering algorithms).
- Config UI for dispatch (radius, max per group); hardcoded defaults in V1.

---

## 18. Risks and Edge Cases

| Risk / Edge Case | Mitigation |
|------------------|------------|
| **Studios without coordinates** | Exclude from nearby recommendations; show in same-location only when ticket is at that studio. Geocode job or admin flow to backfill. |
| **Ticket in multiple groups** | Enforce one active group per ticket (DRAFT/READY_TO_SEND/…); when adding to a new group, remove from previous or reject. |
| **Readiness vs status confusion** | Clear labels in UI: “Dispatch readiness” vs “Ticket status.” Training or tooltips. |
| **Performance with many tickets** | Index (studioId, dispatchTradeType, dispatchReadiness, status). Limit candidate list size (e.g. 20). For nearby, use efficient distance query (Haversine in SQL or PostGIS). |
| **Preserving Stages 1–6** | No change to ticket state machine, visibility service, feed contract, or dashboard/reporting semantics. Additive only. |
| **Empty recommendations** | Handle gracefully: “No same-location tickets” / “No nearby tickets” and explain (e.g. “Mark ticket as Ready for dispatch” or “Add coordinates to studio”). |

---

## 19. Verification Plan

1. **Data model:** Dispatch fields on ticket (or extension) and dispatch_groups / dispatch_group_items exist; migrations run; indexes in place.
2. **Trade type:** Tickets can be assigned a dispatch trade type (manual or default from category); only enum values allowed.
3. **Readiness:** Tickets can be set to READY_FOR_DISPATCH; grouping only includes READY_FOR_DISPATCH; ticket status remains independent.
4. **Location:** Studios with lat/lng participate in nearby; tickets at same studio appear in same-location; tickets at studio without lat/lng have no nearby candidates.
5. **Recommendation engine:** For a given ticket, API returns same-location and nearby candidates per rules; ordering and limits correct; summary accurate.
6. **Dispatch group:** Admin can create a group from ticket panel (select tickets from recommendations), set stop order, save; group detail page shows list and status; no route optimization or send.
7. **UI:** Ticket-level recommendation panel visible on maintenance ticket; dispatch list view shows READY_FOR_DISPATCH tickets by trade; group detail page functional.
8. **Preservation:** Stage 1–6 behavior unchanged (visibility, feed, lifecycle, comments, polish, dashboard/reporting, admin filters).

---

## 20. Acceptance Criteria

- [ ] **Dispatch ticket fields:** dispatchTradeType and dispatchReadiness stored (on ticket or extension); location derived from studio; dispatchGroupStatus derived from group membership (or stored if needed). No breaking change to existing ticket fields.
- [ ] **Trade type:** Controlled enum (HANDYMAN, PLUMBER, HVAC, ELECTRICIAN, LOCKSMITH, GENERAL_MAINTENANCE); manual selection with optional default from maintenance category; no free text.
- [ ] **Readiness:** Readiness model implemented; only READY_FOR_DISPATCH tickets included in grouping; readiness independent of ticket status; documented coexistence with workflow.
- [ ] **Location backbone:** Studios have address + lat/lng where used for dispatch; coordinates persisted; grouping uses distance for nearby; same-location uses studioId.
- [ ] **Grouping rules:** Same-location and nearby rules defined and implemented; two distinct recommendation types; deterministic and configurable (radius, trade, readiness).
- [ ] **Recommendation engine:** DispatchRecommendationService returns primary ticket, same-location candidates, nearby candidates, summary; inputs ticketId, radius, optional trade override; eligibility and ordering per spec.
- [ ] **Dispatch group model:** dispatch_groups and dispatch_group_items with status (at least DRAFT, READY_TO_SEND); admin can create group from recommendations, set stop order, view/edit on detail page.
- [ ] **Ticket-level panel:** Same-location and nearby recommendations and “Create dispatch group” on maintenance ticket view.
- [ ] **Dispatch list/view:** READY_FOR_DISPATCH maintenance tickets grouped by trade; filters (trade, radius, location); map optional/secondary.
- [ ] **Dispatch group detail:** Group header, ticket list with stop order, notes, status; edit and status update for DRAFT.
- [ ] **Config:** Defaults (radius by trade, max per group) hardcoded or config-backed; no config UI required in V1.
- [ ] **Integration path:** Documented future links to delivery automation and Lease IQ; not implemented in V1.
- [ ] **Services:** DispatchClassificationService, DispatchRecommendationService, DispatchGroupService responsibilities defined and implemented; DispatchMapService stubbed or skipped for V1.
- [ ] **V1 boundary:** No route optimization, vendor send, complex scheduling, multi-trade bundling, or map-first intelligence.
- [ ] **Preservation:** Stages 1–6 behavior preserved; no regression in visibility, feed, lifecycle, collaboration, polish, dashboard/reporting, or admin cleanup.

---

*This mini-spec defines the Dispatch Intelligence feature for V1: data model first, recommendation engine second, UI third. Backend remains the source of truth; all existing behavior from Stages 1–6 is preserved.*
