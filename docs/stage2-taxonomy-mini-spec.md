# Stage 2: Ticket Taxonomy — Step A Mini-Spec (Planning Only)

**Follows:** [Task Template](task-template.md) Step A. No code until this plan is approved.

---

## 1. Intent

Introduce a **foundational ticket taxonomy** using **explicit config entities** so that:

- **SUPPORT** and **MAINTENANCE** are distinct concepts with separate tables, not one overloaded Category table.
- **SUPPORT tickets** are classified by **department** + **support topic** (department-scoped topics).
- **MAINTENANCE tickets** are classified by **maintenance category** only.

Config entities:

- **ticket_classes** — top-level class (SUPPORT, MAINTENANCE).
- **departments** — taxonomy list of departments (HR, OPERATIONS, MARKETING, RETAIL) for SUPPORT.
- **support_topics** — department-specific topics (e.g. HR: New Hire, Paycom; OPERATIONS: System Issues, Wipes Orders).
- **maintenance_categories** — MAINTENANCE-only list (Safety, Electrical / Lighting, HVAC, Plumbing, etc.).

**Ticket model:**

- **SUPPORT:** `ticket_class_id` (SUPPORT) + `department_id` + `support_topic_id`.
- **MAINTENANCE:** `ticket_class_id` (MAINTENANCE) + `maintenance_category_id`.

All taxonomy data is **admin-manageable config** (database + seed/config). The API exposes **read-only config endpoints** for classes, departments, support topics (by department), and maintenance categories. No dynamic form schema or subtask templates in this task; no Stage 1 permission changes.

---

## 2. Scope

**In scope**

- Prisma schema: add four config models — `TicketClass`, `Department` (table), `SupportTopic`, `MaintenanceCategory` — and extend `Ticket` with `ticketClassId`, `departmentId`, `supportTopicId`, `maintenanceCategoryId` as above. Add RETAIL to the existing `Department` enum (used by `user_departments`) so RBAC stays in sync with taxonomy departments.
- Migration: create new tables; backfill existing tickets to MAINTENANCE (map current `categoryId` → `maintenance_categories`, then set `ticketClassId` + `maintenanceCategoryId`); remove or deprecate `categoryId` and optionally remove/deprecate `Category` table.
- Seed/config: seed script or config that populates `ticket_classes`, `departments`, `support_topics`, and `maintenance_categories` with the full required lists.
- Read-only API: endpoint(s) (e.g. `GET /admin/config/ticket-taxonomy`) returning ticket classes, departments, support topics grouped by department, and maintenance categories; readable by **authenticated users**.
- No permission/visibility changes from Stage 1.

**Out of scope (explicit)**

- Dynamic form schema for ticket creation.
- Subtask templates.
- Changing Stage 1 RBAC or visibility rules.
- Admin CRUD UI for the new taxonomy tables (read-only config endpoints only; admin editing can be added later).

---

## 3. Files to Change

| Area | File(s) | Change |
|------|---------|--------|
| Schema | `apps/api/prisma/schema.prisma` | Add models `TicketClass`, `Department` (config table), `SupportTopic`, `MaintenanceCategory`; add RETAIL to existing `Department` enum; extend `Ticket` with `ticketClassId`, `departmentId?`, `supportTopicId?`, `maintenanceCategoryId?`; remove or make optional `categoryId`; optionally remove/deprecate `Category` after migration. |
| Migration | `apps/api/prisma/migrations/YYYYMMDDHHMMSS_stage2_ticket_taxonomy/migration.sql` | Create new tables; add columns to `tickets`; backfill tickets to MAINTENANCE and map `category_id` → `maintenance_category_id`; drop `category_id` (and Category table if deprecated). |
| Seed / config | `apps/api/prisma/seed.ts` and/or `apps/api/src/common/config/ticket-taxonomy.config.ts` (or JSON) | Populate `ticket_classes`, `departments`, `support_topics`, `maintenance_categories` with full taxonomy; idempotent upserts. |
| Admin module | `apps/api/src/modules/admin/admin.service.ts` | Add `getTicketTaxonomy()` (or equivalent) returning classes, departments, support topics by department, maintenance categories. |
| Admin module | `apps/api/src/modules/admin/admin.controller.ts` | Add read-only route e.g. `GET config/ticket-taxonomy`; allow authenticated read. |
| DTOs / types | `apps/api/src/modules/admin/dto/admin.dto.ts` or new file | Optional: response types for taxonomy payload. |
| Packages | `packages/types` | Optional: shared types for taxonomy (e.g. ticket class codes, taxonomy response). |

**Not changed in this step**

- `apps/web/**` (no UI for taxonomy yet).
- Stage 1 permission/visibility logic (RBAC still uses existing `Department` enum and `user_departments`).

**Note:** Code that currently uses `Ticket.categoryId` / `Category` (tickets service, reporting, agent tools, filters) will need to be updated to use the new Ticket taxonomy fields and the new config tables; that is part of implementation, not “files to change” for planning.

---

## 4. Schema Impact

**New config models**

- **ticket_classes** (table `ticket_classes`): `id`, `code` (e.g. SUPPORT, MAINTENANCE), `name`, `sortOrder`, `isActive`. Two rows.
- **departments** (table `departments`): `id`, `code` (HR, OPERATIONS, MARKETING, RETAIL), `name`, `sortOrder`, `isActive`. Four rows. Used for taxonomy only; Stage 1 `user_departments` continues to use the existing `Department` enum (add RETAIL to enum so it stays in sync).
- **support_topics** (table `support_topics`): `id`, `departmentId` (FK → departments), `name`, `sortOrder`, `isActive`. One row per topic; uniqueness per (departmentId, name).
- **maintenance_categories** (table `maintenance_categories`): `id`, `name`, `description?`, `color?`, `sortOrder`, `isActive`. Same shape as current Category but dedicated to MAINTENANCE.

**Ticket model**

- Add: `ticketClassId` (FK → ticket_classes, required).
- Add: `departmentId` (FK → departments, nullable).
- Add: `supportTopicId` (FK → support_topics, nullable).
- Add: `maintenanceCategoryId` (FK → maintenance_categories, nullable).
- Remove or make optional and unused: `categoryId`. Migration backfills existing tickets to MAINTENANCE and sets `maintenanceCategoryId` from a mapping of current `categoryId` (e.g. copy Category rows into maintenance_categories, then update tickets). After backfill, drop `categoryId` (and optionally drop `Category` table).

**Invariants (enforced in app or DB)**

- If `ticketClassId` = SUPPORT then `departmentId` and `supportTopicId` must be set; if MAINTENANCE then `maintenanceCategoryId` must be set. Optional: CHECK constraint or application validation.

**Enum**

- Add `RETAIL` to existing `Department` enum (for `user_departments` and any RBAC that references departments). Taxonomy departments table holds the same four via `code`.

**Exact taxonomy to seed**

- **ticket_classes:** SUPPORT, MAINTENANCE.
- **departments:** HR, OPERATIONS, MARKETING, RETAIL.
- **support_topics (by department):**
  - **HR:** New Hire, PAN / Change in Relationship, Resignation / Termination, New Job Posting, Workshop Bonus, Paycom.
  - **MARKETING:** Grassroots Spend Approval, Print Materials Request, General Support, Instructor Bio Update, Custom Marketing Material, Club Pilates App Instructor Name Changes.
  - **RETAIL:** Missing / Update SKU, Retail Request, Damaged Product.
  - **OPERATIONS:** System Issues - CR, CRC, CP App, Netgym, Powerhouse, Riser U, other; CR, NetGym - add User and/or Locations; E-mail Reset/New/Microsoft Issues; Wipes Orders; Ops General Support ONLY - No Paycom.
- **maintenance_categories:** Safety, Electrical / Lighting, HVAC / Climate Control, Plumbing, Flooring, Mirror / Glass, Doors / Locks / Hardware, Walls / Paint / Mounted Items, Roof / Water Intrusion, Pest Control, Equipment / Fixtures, Other (and any legacy Category rows migrated in).

---

## 5. Risks

- **Two department representations:** `Department` enum (user_departments, RBAC) vs `departments` table (taxonomy). Keep in sync by adding RETAIL to enum and matching codes (HR, OPERATIONS, MARKETING, RETAIL) in the table; mapping by code where needed.
- **Migration of existing tickets:** Every ticket currently has `categoryId`. Backfill must create matching rows in `maintenance_categories` (from existing Category data or by name), then set `ticketClassId` = MAINTENANCE and `maintenanceCategoryId` for each ticket; then drop `categoryId`. No existing tickets are SUPPORT in current data, so backfill is MAINTENANCE-only.
- **Downstream usage of Category:** Tickets service, reporting, filters, agent tools reference Category. Implementation must switch these to the new Ticket fields and to maintenance_categories / support_topics / departments / ticket_classes as appropriate.
- **Seed idempotency:** Seed should upsert by natural key (e.g. ticket_classes by code, departments by code, support_topics by departmentId+name, maintenance_categories by name) so re-runs do not duplicate.

---

## 6. Test Plan

- **Schema / migration:** New tables exist; Ticket has new FKs; existing tickets backfilled to MAINTENANCE with valid `maintenanceCategoryId`; `categoryId` removed (or unused).
- **Seed:** All four config tables populated; SUPPORT topic counts per department match spec; maintenance_categories list includes all 12 required names (and any migrated legacy).
- **Read-only config API:** Taxonomy endpoint returns 200 with structure: ticket classes; departments; support topics grouped by department (correct names); maintenance categories. Authenticated user can call it; no ADMIN requirement for read.
- **Permissions:** No change to Stage 1 visibility or role checks.
- **Regression:** Ticket list/detail, create (using new taxonomy fields), reporting by ticket class/department/maintenance category (or equivalent), and agent tools updated to new schema all behave correctly; existing API tests updated and passing.

---

**Summary:** Four config tables — ticket_classes, departments, support_topics, maintenance_categories. Ticket uses ticket_class_id + (department_id, support_topic_id) for SUPPORT and ticket_class_id + maintenance_category_id for MAINTENANCE. Category/categoryId retained (deprecated); removal in a later cleanup migration. Seed and read-only taxonomy endpoint(s) expose config. No form schema, no subtask templates, no Stage 1 permission changes.

---

## 7. Implementation (Step B) — Done

- **Schema:** `TicketClass`, `TaxonomyDepartment`, `SupportTopic`, `MaintenanceCategory`; `Ticket` extended with `ticketClassId`, `departmentId`, `supportTopicId`, `maintenanceCategoryId`; `categoryId` kept, made optional (deprecated). `Department` enum extended with RETAIL.
- **Migration:** `20260306120000_stage2_ticket_taxonomy` — new tables, seed data in migration, backfill tickets to MAINTENANCE, trigger `tickets_classification_invariant_trigger` for DB enforcement. `categoryId` not dropped.
- **Seed:** Taxonomy upserts in `prisma/seed.ts` (ticket classes, departments, support topics, maintenance categories).
- **API:** `GET /api/admin/config/ticket-taxonomy` (read-only, authenticated); tickets create/update validate classification and use new fields; filters support `ticketClassId`, `departmentId`, `supportTopicId`, `maintenanceCategoryId`; agent create_ticket/list_categories/get_ticket_metrics use new taxonomy.
- **Tests:** All 40 API unit tests pass.
