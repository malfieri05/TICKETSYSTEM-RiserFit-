# Dispatch Intelligence – Grouping Workspace Implementation Report

**Date:** 2026-03-18  
**Status:** Complete

---

## 1. Files Modified

### Backend (API)

| File | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Added `DispatchGroupTemplate` model and relations on User, Studio, MaintenanceCategory |
| `apps/api/prisma/migrations/20260319000000_add_dispatch_group_templates/migration.sql` | **New** – migration creating `dispatch_group_templates` table |
| `apps/api/src/modules/dispatch/services/dispatch-recommendation.service.ts` | Added `getNearbyForWorkspace(anchorTicketId, radiusMiles)` |
| `apps/api/src/modules/dispatch/services/dispatch-template.service.ts` | **New** – template CRUD service |
| `apps/api/src/modules/dispatch/dto/dispatch.dto.ts` | Added `WorkspaceNearbyQueryDto`, `CreateDispatchTemplateDto`, `UpdateDispatchTemplateDto` |
| `apps/api/src/modules/dispatch/dispatch.controller.ts` | Added GET `workspace/nearby`, POST/GET/PATCH/DELETE `templates` |
| `apps/api/src/modules/dispatch/dispatch.module.ts` | Registered `DispatchTemplateService` |

### Frontend (Web)

| File | Change |
|------|--------|
| `apps/web/src/lib/api.ts` | Added `getWorkspaceNearby`, `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate` |
| `apps/web/src/app/(app)/admin/dispatch/page.tsx` | Workspace state (`workspaceAnchorTicketId`, `workspacePanelOpen`), narrow-left layout, ticket row opens panel, anchor row styling, panel render |
| `apps/web/src/components/dispatch/DispatchWorkspacePanel.tsx` | **New** – Sections A/B/C, radius slider, nearby feed, selection, Create Dispatch Group button |
| `apps/web/src/components/dispatch/CreateDispatchGroupModal.tsx` | **New** – Group type (One-Time / Template), one-time group submit, template form and submit |

---

## 2. Migration / Schema Changes

- **New table:** `dispatch_group_templates`
  - `id` (PK, cuid), `name`, `createdBy` (FK users), `dispatchTradeType`, `maintenanceCategoryId` (nullable, FK maintenance_categories), `anchorStudioId` (nullable, FK studios), `radiusMiles`, `createdAt`, `updatedAt`
- **Indexes:** `createdBy`, `dispatchTradeType`
- **Relations:** User (creator), MaintenanceCategory (optional), Studio (optional anchor)
- **Migration:** `20260319000000_add_dispatch_group_templates` – applied via `npx prisma migrate deploy`
- **Prisma:** `npx prisma generate` run to refresh client

---

## 3. New Services / Endpoints

### Workspace nearby

- **Service:** `DispatchRecommendationService.getNearbyForWorkspace(anchorTicketId, radiusMiles)`
  - Anchor: maintenance ticket, open (not RESOLVED/CLOSED), has studio with lat/lng, has `dispatchTradeType`
  - Nearby: same `dispatchTradeType`, status not RESOLVED/CLOSED, exclude anchor, valid studio coordinates, Haversine ≤ radius, order distance ASC then createdAt DESC, cap 50
  - Does **not** require READY_FOR_DISPATCH or same maintenanceCategoryId for display
- **Endpoint:** `GET /api/dispatch/workspace/nearby?anchorTicketId=...&radiusMiles=...`
  - Returns `{ anchor, nearby, message? }`

### Templates

- **Service:** `DispatchTemplateService` – create, findAll, findById, update, delete (rule-only; no ticket IDs)
- **Endpoints:**
  - `POST /api/dispatch/templates` (ADMIN, DEPARTMENT_USER) – body: name, dispatchTradeType, maintenanceCategoryId?, anchorStudioId?, radiusMiles
  - `GET /api/dispatch/templates` – list all
  - `GET /api/dispatch/templates/:id` – one
  - `PATCH /api/dispatch/templates/:id` (ADMIN, DEPARTMENT_USER)
  - `DELETE /api/dispatch/templates/:id` (ADMIN, DEPARTMENT_USER)

---

## 4. Dispatch Page Integration

- **State:** `workspaceAnchorTicketId: string | null`, `workspacePanelOpen: boolean`
- **Tab switch:** Leaving “Ready to Dispatch” closes the panel and clears anchor
- **Layout:** Single flex row; left content area `maxWidth: workspacePanelOpen ? calc(100% - 420px) : 100%`; right panel fixed 420px
- **Ready to Dispatch:** Clicking a ticket row sets anchor and opens panel (no navigation); “Open ticket →” link still goes to `/tickets/:id`
- **Anchor row:** Accent background and left border when `t.id === workspaceAnchorTicketId`
- **Panel:** Rendered when `workspacePanelOpen && workspaceAnchorTicketId`; receives `anchorTicketId` and `onClose`

---

## 5. Workspace Panel Behavior

- **Section A (anchor header):** Title, short id, status badge, created date, location (studio name/address)
- **Section B (anchor details):** Expandable; description, maintenance category, trade type, readiness; no comments/history
- **Section C:** “Nearby” title, radius slider (1–50 mi, default 10), “Create Dispatch Group” button
- **Nearby feed:** List from GET workspace/nearby; each row: title, location, distance, status, “Ready for Dispatch” capsule when applicable; chevron to expand; expanded content uses GET /tickets/:id (description + formResponses only)
- **Selection:** Anchor always selected and non-removable; other rows toggle; selected rows styled; selection used for one-time group creation
- **Create group:** Opens `CreateDispatchGroupModal`

---

## 6. Template CRUD Behavior

- **Create (from modal):** Name (required), dispatchTradeType (from anchor, read-only in UI), maintenanceCategoryId (optional), anchorStudioId (default anchor’s studio, “Use at any location” clears it), radiusMiles (from current slider)
- **No ticket IDs** stored in templates; rule-only
- **List/Get/Update/Delete:** Standard CRUD; no “apply template” in V1

---

## 7. Group Creation Integration

- **One-time group:** Modal “Create group” → POST `/api/dispatch/groups` with `tradeType` from anchor, `ticketIds = [anchorTicketId, ...selectedOthers]`, `notes` = group name; reuse existing `DispatchGroupService` and validation
- **Validation:** Submit disabled when any selected ticket is not READY_FOR_DISPATCH; backend still enforces READY_FOR_DISPATCH and one-active-group
- **Template:** Modal “Create template” → POST `/api/dispatch/templates` with name, dispatchTradeType, maintenanceCategoryId?, anchorStudioId? (default from anchor, clearable), radiusMiles; no ticket IDs in payload
- **Anchor:** Always included in one-time group; cannot be deselected

---

## 8. Verification Results

| Check | Result |
|-------|--------|
| Clicking a ready-to-dispatch ticket opens workspace panel | Yes – no navigation; panel opens with that ticket as anchor |
| Left side remains visible when panel open | Yes – left narrows to `calc(100% - 420px)` |
| Selected anchor row styling | Yes – accent background + left border |
| Panel below page header, fixed width | Yes – 420px, same header as rest of page |
| Anchor may be any open maintenance ticket | Yes – workspace nearby does not require READY_FOR_DISPATCH for anchor |
| Nearby: same trade, no RESOLVED/CLOSED, exclude anchor, radius, valid coords | Yes – implemented in `getNearbyForWorkspace` |
| READY_FOR_DISPATCH capsule on nearby rows | Yes – shown when `dispatchReadiness === 'READY_FOR_DISPATCH'` |
| One-time group: READY_FOR_DISPATCH-only, anchor always included | Yes – UI disables submit when selection includes non-ready; backend validation unchanged |
| Template: rule-only, no ticket IDs, anchorStudioId default/clear | Yes – template payload has no ticket IDs; anchorStudioId defaults from anchor, clearable |
| Template CRUD endpoints | Yes – POST/GET/PATCH/DELETE /dispatch/templates |
| No regressions to Dispatch Intelligence V1 | Yes – recommendations, ready list, groups tabs and group detail unchanged |
| No regressions to Stages 1–6 | Yes – no changes to visibility, feed, lifecycle, comments, panel, dashboard, admin filters |

---

## 9. Intentional Deviations

- **Template list response:** Implementation returns a plain array from `GET /api/dispatch/templates`; spec §8.3 allowed pagination (`data`, `total`, `page`, `limit`, `totalPages`). V1 keeps a single list without pagination for simplicity.
- **Anchor ticket source:** Panel uses GET `/tickets/:id` for full anchor (Section B); workspace nearby response also returns `anchor` for fallback/header when ticket query is still loading.
- **CreateDispatchGroupModal template anchor location:** Dropdown shows only “Use at any location” and the current anchor’s studio (no full studio list), per spec “default from anchor” and “clear for reusable”.

---

## 10. Quality Notes

- Workspace logic is additive; existing recommendation and group-creation behavior unchanged.
- Panel and modal reuse existing design tokens and layout patterns.
- Backend remains source of truth; group creation still goes through `DispatchGroupService` and existing validation.
- No map-first flow; main workflow stays on Vendor Dispatch with left list visible when the workspace panel is open.
