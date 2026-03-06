# Stage 3: Schema-Driven Ticket Creation — Step A Mini-Spec (Planning Only)

**Follows:** [Task Template](task-template.md) Step A. No code until this plan is approved.

**Source material:** `apps/api/src/config/ticket-form.seed.ts` (structured requirements for SUPPORT and MAINTENANCE forms).

---

## 1. Intent

Introduce a **schema-driven ticket form system** so that:

- The **backend** owns form structure in the **database**: ticket class → department (for SUPPORT) → topic (support topic or maintenance category), plus **dynamic fields** (type, label, options, conditionals) stored in dedicated tables, derived from the logic in `ticket-form.seed.ts`.
- The **frontend** can request a **form schema** for a given context (e.g. SUPPORT + department + topic, or MAINTENANCE + category) and render the form dynamically (no hardcoded topic-specific fields).
- **Ticket submissions** persist **dynamic field responses** in a **normalized table** (`ticket_form_responses`: ticketId, fieldKey, value) for easier reporting and analytics.
- Schema and responses remain tied to the Stage 2 taxonomy (ticket_class, department, support_topic, maintenance_category). Stage 2 **compatibility bridge** stays in place. Stage 1 permissions unchanged. Subtask templates and dependency workflows are **out of scope**.

---

## 2. Scope

**In scope**

- **Database-backed form schemas only:** No config-only schemas at runtime. Three tables:
  - **ticket_form_schemas** — One row per form context (e.g. per support topic or per maintenance category). Keys: ticketClassId, and either (departmentId + supportTopicId) for SUPPORT or maintenanceCategoryId for MAINTENANCE. Links to Stage 2 taxonomy by id.
  - **ticket_form_fields** — One row per dynamic field: belongs to a form schema, has fieldKey, type (text | textarea | select | checkbox | date | file), label, required flag, sortOrder, and optional conditional visibility (e.g. depends on another fieldKey + value).
  - **ticket_form_field_options** — Options for select/checkbox fields: belongs to a form field, option value, label, sortOrder.
- **Seed-only schema population:** The file `ticket-form.seed.ts` (or equivalent) is used **only** to initialize the above tables during seed. At runtime the backend reads schemas from the database only.
- **Schema API:** Endpoints so the frontend can get the form schema for a given context (e.g. by ticketClassId + departmentId + supportTopicId, or ticketClassId + maintenanceCategoryId). Optionally list valid (class, department, topic) combinations; taxonomy endpoints can be reused where applicable.
- **Normalized response storage:** Table **ticket_form_responses** with columns: id, ticketId, fieldKey, value. One row per (ticket, field) response; multi-value (e.g. checkboxes) stored per implementation convention (e.g. one row per selected option or value as JSON string). **No** JSON column on `tickets`.
- **Validation:** Backend validates that required dynamic fields (per schema loaded from DB) are present; file fields reference valid attachment ids or uploads as applicable.
- **Connection to Stage 2:** Form schemas reference ticket_classes, departments, support_topics, maintenance_categories by id. No change to those tables.
- **Stage 2 compatibility:** Legacy create (no ticketClassId / only categoryId) remains supported; schema-driven create sends ticketClassId + topic ids + dynamic responses, persisted into `ticket_form_responses`.

**Out of scope (explicit)**

- Subtask templates.
- Subtask dependency workflow.
- Any change to Stage 1 RBAC or visibility.
- Removing or altering the Stage 2 compatibility bridge for ticket create.
- File upload UX/details beyond “field type file and storage of reference in responses”.

---

## 3. Files to Change

| Area | File(s) | Change |
|------|---------|--------|
| **Prisma schema** | `apps/api/prisma/schema.prisma` | Add models: `TicketFormSchema`, `TicketFormField`, `TicketFormFieldOption`, `TicketFormResponse`. Add relation from `Ticket` to `TicketFormResponse`. Migration to create tables. |
| **Seed** | `apps/api/prisma/seed.ts` and/or `apps/api/src/config/ticket-form.seed.ts` | Convert seed content into inserts/upserts for `ticket_form_schemas`, `ticket_form_fields`, `ticket_form_field_options` only. No runtime config; seed runs during `prisma db seed` (or equivalent). |
| **Form schema service** | New: e.g. `apps/api/src/modules/ticket-forms/` | Load form schema from DB by (ticketClassId, departmentId?, supportTopicId? \| maintenanceCategoryId?); return structured payload (schema + fields + options + conditionals). |
| **API endpoints** | New or under existing module | e.g. `GET /api/ticket-forms/schema?ticketClassId=&departmentId=&supportTopicId=` and/or `GET /api/ticket-forms/schema?ticketClassId=&maintenanceCategoryId=`. Optionally list contexts. |
| **Tickets create** | `apps/api/src/modules/tickets/dto/create-ticket.dto.ts`, `tickets.service.ts` | Accept optional payload of dynamic responses (e.g. `formResponses: Record<string, unknown>` or array of { fieldKey, value }). Validate required fields per schema from DB; persist into `ticket_form_responses` (one row per field). |
| **Tickets read** | `apps/api/src/modules/tickets/tickets.service.ts` (list/detail selects) | Include `ticketFormResponses` (or equivalent) when returning ticket detail so frontend can display saved form answers. |
| **Taxonomy** | Existing Stage 2 | No structural change; form schema service validates topic/category ids against taxonomy. |
| **Frontend** | `apps/web/` (when implemented) | Consume form schema API; render dynamic form; submit with dynamic responses. (Implementation in Step B or later.) |

**Not changed in this stage**

- Stage 1 permission or visibility logic.
- Stage 2 taxonomy tables or compatibility bridge.
- Subtask or workflow logic.

---

## 4. Schema Impact

- **New tables (database-backed schemas):**
  - **ticket_form_schemas** — id, ticketClassId (FK), departmentId (FK, nullable), supportTopicId (FK, nullable), maintenanceCategoryId (FK, nullable), **version** (integer, default 1), name/label optional, sortOrder, isActive, createdAt, updatedAt. Uniqueness: one schema per (ticketClassId, supportTopicId) for SUPPORT and per (ticketClassId, maintenanceCategoryId) for MAINTENANCE. Indexes for lookup by ticketClassId + supportTopicId and ticketClassId + maintenanceCategoryId. Version enables safe schema evolution.
  - **ticket_form_fields** — id, formSchemaId (FK), fieldKey, type (enum or string: text | textarea | select | checkbox | date | file), label, required (boolean), sortOrder, conditionalFieldKey (nullable), conditionalValue (nullable), createdAt, updatedAt. **Unique constraint on (formSchemaId, fieldKey)** to prevent duplicate field keys within a schema. Index formSchemaId.
  - **ticket_form_field_options** — id, formFieldId (FK), value, label, sortOrder. Index formFieldId.

- **New table (normalized responses):**
  - **ticket_form_responses** — id, ticketId (FK to tickets), fieldKey, value (TEXT). Unique constraint or convention on (ticketId, fieldKey) so one value per field per ticket (or multiple rows per field for multi-select if product chooses). Index ticketId for reads. FK to tickets onDelete Cascade.

- **Tickets table:** No new column. Dynamic responses are stored only in `ticket_form_responses`. Ticket has one-to-many relation to `TicketFormResponse`.

- **No change** to `ticket_classes`, `departments`, `support_topics`, or `maintenance_categories`. Form schema tables reference them by foreign key.

- **Seed:** `ticket-form.seed.ts` (or seed script that uses it) only inserts/upserts into `ticket_form_schemas`, `ticket_form_fields`, and `ticket_form_field_options`. No runtime dependency on config files for schema content.

---

## 5. Risks

- **Schema complexity:** The seed document has many conditionals. Fields in `ticket_form_fields` must support conditional visibility (e.g. conditionalFieldKey + conditionalValue). Validation must enforce “required when visible” (evaluate conditionals when checking required fields).
- **Value type:** `ticket_form_responses.value` is TEXT. Multi-value (e.g. multiple checkboxes) may be stored as JSON string or as multiple rows per (ticketId, fieldKey); decide convention and document. File fields may store attachment id(s) as value(s).
- **File fields:** File responses likely store ticket attachment ids. Ensure attachment creation is tied to ticket and permission-checked; response row stores id(s).
- **Backward compatibility:** Tickets created before this stage have no rows in `ticket_form_responses`. Reads must treat missing responses as “no dynamic responses”. Legacy create path must not require form responses.
- **Reporting:** Normalized table allows SQL aggregation and reporting on fieldKey/value; design fieldKey and value format so analytics (e.g. “count by Position”) stay straightforward.

---

## 6. Test Plan

- **Form schema API:**
  - Given valid (ticketClassId, departmentId, supportTopicId) for SUPPORT, GET schema returns 200 and schema with fields (and options where applicable) and conditional rules, loaded from DB.
  - Given valid (ticketClassId, maintenanceCategoryId) for MAINTENANCE, GET schema returns 200 with expected MAINTENANCE fields.
  - Invalid or missing topic/category returns 404 or 400. Schema is read from database only (no config fallback).
- **Ticket create with dynamic responses:**
  - Submit ticket with valid taxonomy ids and valid form responses (all required fields per schema). Assert 201 and rows in `ticket_form_responses` for each submitted field (ticketId, fieldKey, value).
  - Submit with missing required dynamic field: assert 400.
  - Submit with invalid field key or type: assert 400 or defined sanitization.
  - Legacy create (no ticketClassId, only categoryId, no form responses): still succeeds; no rows in `ticket_form_responses`.
- **Conditionals:** For “show field B when field A = YES”, submit A=YES and B present → success; A=YES and B missing → fail; A=NO and B omitted → success.
- **Permissions:** Schema endpoint(s) and create with form responses use same auth as existing ticket create.
- **Regression:** Ticket list/detail still work; tickets with no rows in `ticket_form_responses` render without errors. Detail response includes form responses when present (e.g. nested or separate endpoint).

---

**Summary:** Form schemas are stored in the database in three tables (`ticket_form_schemas`, `ticket_form_fields`, `ticket_form_field_options`). `ticket-form.seed.ts` only initializes these tables during seed. Dynamic responses are stored in a normalized table `ticket_form_responses` (id, ticketId, fieldKey, value); no JSON column on tickets. Backend exposes form-schema endpoint(s) and persists responses into the normalized table. Schema is keyed by Stage 2 taxonomy. No subtask templates, no dependency workflow, no permission changes; Stage 2 compatibility bridge remains.
