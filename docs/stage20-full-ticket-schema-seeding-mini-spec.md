# Stage 20 — Full Ticket Schema Seeding & Alignment — Step A Mini-Spec (Planning Only)

**Stage name:** Stage 20 — Full Ticket Schema Seeding & Alignment

**Step A:** Planning only. No implementation, no code changes, no file modifications beyond this mini-spec.

**Context:** Schema-driven ticket creation architecture is in place. Only some topics (e.g. HR → New Hire) have full topic-specific schema fields seeded. This stage plans full coverage so all active ticket types use structured schema-driven forms instead of legacy fallback.

**Source of truth:** Business breakdown (provided) and existing `apps/api/src/config/ticket-form.seed.ts` for field-level detail.

---

## 1. Intent

- **Populate all active support topics and maintenance categories** with complete, topic-specific form schema definitions (fields, types, options, conditionals) so the create-ticket UI is fully schema-driven.
- **Keep standard top fields** (submitter name, work email, location) as UI-only convention—not duplicated inside every topic schema—unless a topic explicitly requires a separate “employee name” etc.
- **Define a single, consistent maintenance create flow** backed by a common maintenance schema (or one schema per maintenance category with shared field shape) so maintenance is schema-aligned.
- **Establish a maintainable seed strategy** so schema definitions remain readable, auditable, and easy to extend without one giant unreadable block in `seed.ts`.
- **Define fallback policy** so legacy Summary/Additional notes appear only when a topic truly has no schema fields.

---

## 2. Scope

**In scope**

- Full mapping of every listed support topic (HR, Marketing, Retail, Operations) and maintenance flow to schema definitions (field key, label, type, required, options, conditionals, file usage).
- Seed data only: additions/restructuring in `apps/api/prisma/seed.ts` and/or companion seed modules. No new Prisma models or migrations; existing `ticket_form_schemas`, `ticket_form_fields`, `ticket_form_field_options` are sufficient.
- Standard top fields: remain UI-only (current create-ticket page behavior); no requirement to duplicate submitter name / work email / location as form fields in every topic schema unless the business breakdown explicitly asks for a separate “employee name” (e.g. Operations “Full Legal Name of Employee”).
- Maintenance: one schema per maintenance category, each with the same logical field set (Issue, Detailed Description, First Day availability, Pictures/Videos, Additional Comments) so maintenance is schema-consistent.
- Fallback policy: document when legacy Summary/Description are shown (only when a topic has no schema or zero schema fields).
- Seed file organization: design how to split or structure seed data (e.g. per-department modules, shared field definitions, helpers) for maintainability.

**Out of scope**

- Changes to Prisma schema or new migrations.
- Changes to API contracts (ticket create, schema GET) or workflow/notifications/permissions.
- New features (due dates, priority logic, new assignment systems).
- File upload backend behavior beyond storing a reference (e.g. attachment id or key) in a form response value; existing attachment flow remains.

---

## 3. Files to Change

| Area | File(s) | Change (planned) |
|------|---------|------------------|
| **Seed entry** | `apps/api/prisma/seed.ts` | After existing taxonomy and “one schema per topic/category” creation: invoke modular topic-field seed functions (or data files) per department/topic. Remove or reduce inline “New Hire only” block in favor of shared structure. |
| **Seed modules / data** | New (e.g. `apps/api/prisma/seed-data/` or `apps/api/src/config/seed-form-fields/`) | Add structured definitions for each topic’s fields (fieldKey, type, label, required, sortOrder, conditionals, options). One module or file per department (HR, Marketing, Retail, Operations) and one for maintenance. Seed runner imports and applies them by topic name / id. |
| **Config reference** | `apps/api/src/config/ticket-form.seed.ts` | No structural change; remains human-readable source of truth. Seed logic may reference it for consistency or leave it as documentation only. |
| **Frontend** | `apps/web/src/app/(app)/tickets/new/page.tsx` | No change required for Stage 20; already uses schema-driven vs fallback. Optional: clarify fallback condition in a comment (show Summary/Description only when schema missing or schema.fields.length === 0). |
| **API** | — | No change. |

---

## 4. Schema Impact

- **No Prisma schema or migration changes.** All new work is seed data only.
- **Existing tables used as-is:**
  - **ticket_form_schemas** — Already one row per support topic and per maintenance category. No new columns.
  - **ticket_form_fields** — New rows per topic: fieldKey, type (text | textarea | select | checkbox | date | file), label, required, sortOrder, conditionalFieldKey, conditionalValue.
  - **ticket_form_field_options** — New rows for every select/checkbox option where applicable.
- **Field type usage:** Use existing types: `text`, `textarea`, `select`, `checkbox`, `date`. Use `file` where the business breakdown specifies “drag and drop” or “attach”; value stored as attachment reference (e.g. attachment id or key) per existing attachment flow; no schema change.
- **Conditionals:** Use `conditionalFieldKey` + `conditionalValue` for “if YES then show…”, “if Other then show…”, etc., as already implemented for New Hire (e.g. referring_employee_name when referred = true, candidate_source_other when candidate_source = OTHER).

---

## 5. API Impact

- **None.** Existing endpoints remain:
  - `GET /api/ticket-forms/schema?ticketClassId=&departmentId=&supportTopicId=` (support)
  - `GET /api/ticket-forms/schema?ticketClassId=&maintenanceCategoryId=` (maintenance)
  - `POST /api/tickets` with `formResponses`, taxonomy ids, etc.
- Schema payload shape (fields, options, conditionals) already supports all required field types and options. No new query params or response fields.

---

## 6. UI Impact

- **Standard top fields (unchanged):** Submitter full name, Work email, Employee / hiring location (support) and Studio Location / Submitter / Work email (maintenance) remain rendered at the top by the existing create-ticket page; they are not duplicated as schema fields unless a topic explicitly requires an extra “employee name” (e.g. Operations system-issues “Full Legal Name of Employee”).
- **Support flow:** After standard top + Department + Topic, the UI shows schema-driven fields for the selected topic. No Summary/Additional notes when the topic has at least one schema field (current behavior).
- **Maintenance flow:** After standard top + Maintenance Category, the UI shows the common maintenance schema (Issue, Detailed Description, First Day availability, Pictures/Videos, Additional Comments). Same schema-driven rendering as support; no legacy fallback when schema exists.
- **Fallback (documented):** Legacy “Summary” and “Additional notes” are shown only when:
  - No schema is returned for the selected context (e.g. 404 / no schema row), or
  - The schema has zero fields (e.g. `schema.fields.length === 0`).
- **File fields:** Where schema type is `file`, UI continues to use existing attachment upload (presigned URL, confirm-upload); the stored form response value is the attachment id or key as agreed with backend. No new UI contract.

---

## 7. Risks

- **Topic name drift:** Seed must match exact support topic names and department ids from existing taxonomy (e.g. “PAN / Change in Relationship”, “Ops General Support ONLY - No Paycom”). Use stable ids or unique keys (departmentId + topic name) when resolving topics for schema attachment.
- **Large seed surface:** Many topics and fields increase seed run time and chance of partial failure. Mitigate with idempotent upserts (by formSchemaId + fieldKey), per-topic or per-department try/catch in seed, and clear logging.
- **File field semantics:** `file` type currently stores a string value (attachment reference). Ensure product and backend agree that one file field = one attachment reference (or a delimiter-separated list if multiple files allowed); no schema change, but documentation should state the convention.
- **Paycom / redirect-only topics:** “Paycom” is informational (redirect to external resource). Options: (a) seed a minimal schema with a single informational text/textarea so the topic is still “schema-backed” and doesn’t fall back to legacy, or (b) keep zero fields and allow fallback for that topic only. Mini-spec recommends (a) for consistency.

---

## 8. Test Plan

- **Seed idempotency:** Run `prisma db seed` twice; no duplicate key errors; field counts per schema unchanged.
- **Schema API per topic:** For each support topic (HR × 6, Marketing × 6, Retail × 3, Operations × 5) call GET schema with correct ticketClassId + departmentId + supportTopicId; expect 200 and fields array with expected count and types.
- **Schema API maintenance:** For each maintenance category, call GET schema with ticketClassId + maintenanceCategoryId; expect 200 and common maintenance fields (issue, detailed_description, first_day_availability, pictures_videos, additional_comments or equivalent).
- **Create ticket (support):** For at least one topic per department (e.g. New Hire, Grassroots Spend Approval, Missing/Update SKU, System Issues), submit create with required schema fields; expect 201 and ticket_form_responses persisted; ticket detail shows “Submitted form data” with correct label/value.
- **Create ticket (maintenance):** Submit maintenance ticket with category + schema fields; expect 201 and form responses stored.
- **Conditionals:** For topics with conditionals (e.g. New Hire “referring employee name” when referred = yes, PAN equipment return), submit with conditional satisfied and verify response stored; submit with conditional not satisfied and verify no validation error for the hidden field.
- **Fallback:** For a topic with zero schema fields (if any left), verify UI shows Summary and Additional notes; for any topic with ≥1 schema field, verify UI does not show legacy Summary/Description as primary.
- **Required validation:** Submit with a required schema field missing; expect 400 and appropriate message.

---

## A. Full Topic Coverage (Mapping)

All topics below receive a schema definition (one `ticket_form_schemas` row already exists per topic/category; this stage adds full `ticket_form_fields` + `ticket_form_field_options`).

**Support — HR**

| Topic | Notes |
|-------|--------|
| New Hire | Already seeded (Stage 19). Verify alignment with field list below; add any missing. |
| PAN / Change in Relationship | Name (first/last/alternate), Position (shared options), Pay Rate, Effective Date, Action (text), Equipment return? (Y/N), Equipment type (conditional). |
| Resignation / Termination | Name, Position, Effective Date / Last day, Resigned on, Resignation letter/documents (file), Why leaving (textarea), Equipment return? (Y/N), Equipment type (conditional). |
| New Job Posting | Position, Part-time/Full-time, Hiring Manager (text), Pay Rate/Range (text), Reason for Post (select: Promotion, New Position, New Studio, Resignation, Involuntary Termination). |
| Workshop Bonus | Name, Date and Name of Workshop. |
| Paycom | Informational only: one non-required text/textarea with static text or link so topic remains schema-backed. |

**Support — Marketing**

| Topic | Notes |
|-------|--------|
| Grassroots Spend Approval | Acknowledge checkbox, Grassroots Type (select: Expo, Table Booth, Sponsorship, Other), Short Description, Date of efforts, Cost, What’s included in Cost?, Estimated Leads, Why good fit?, Participated before? (textarea), Relevant Links, Relevant attachments (file). |
| Print Materials Request | Digital stack template/photo (file), Description, Fedex print/ship address, Types of Materials (multi-select or checkboxes from list), Quantity. |
| General Support | Single textarea (general support). |
| Instructor Bio Update | Instructor CR ID, Description of update, Studio locations. |
| Custom Marketing Material | Textarea (flyer/social details). |
| Club Pilates App Instructor Name Changes | Current name, new name, location; Instructor Club Ready ID. |

**Support — Retail**

| Topic | Notes |
|-------|--------|
| Missing / Update SKU | File (picture of tag: brand, style, color, size); optional text. |
| Retail Request | Textarea (milestone, apparel, etc.); optional file (picture of item). |
| Damaged Product | Brand/style/size description, Picture of damage + tag (file), Shipping invoice (file, optional). |

**Support — Operations**

| Topic | Notes |
|-------|--------|
| System Issues | Full Legal Name of Employee (text), Systems (multi-select/checkboxes: Powerhouse, Club Pilates app, Club Ready, CRC, NetGym, Amazon, Riser U, Other), Screenshot (file), More details (textarea). |
| CR, NetGym - add User and/or Locations | Full Legal name, Which locations need to be added? (textarea). |
| E-mail Reset/New/Microsoft Issues | Full legal name, Screenshot (file), More details (textarea). |
| Wipes Orders | Location for shipment, How many single bags left?, Cases needed (number/text), Sharing with other studios? (textarea). |
| Ops General Support | Screenshot (file), More details (textarea). |

**Maintenance (all categories)**

- One schema per maintenance category (already one row per category).
- Same field set for every category: **Issue** (text, short description), **Detailed Description** (textarea), **First Day availability** (date), **Pictures/Videos** (file), **Additional Comments** (textarea). Optional: **additional_details** kept for backward compatibility if desired.

---

## B. Field Modeling Conventions

For each topic, define:

- **field_key:** snake_case, unique within schema (e.g. `legal_first_name`, `equipment_return`, `equipment_type`).
- **label:** Human-readable label (e.g. “Legal first name”, “Does the employee have company-issued equipment to return?”).
- **type:** One of `text`, `textarea`, `select`, `checkbox`, `date`, `file`. Use `file` for “drag and drop” / “attach”; value = attachment reference.
- **required:** true only when business requires it (e.g. legal first/last name for New Hire; Issue for maintenance).
- **sort_order:** Integer for display order (10, 20, 30… to allow insertions).
- **select options:** For `select`/checkbox lists, define options with `value` (machine) and `label` (display). Store in `ticket_form_field_options`.
- **Conditional logic:** Use `conditional_field_key` and `conditional_value` (e.g. show `referring_employee_name` when `referred` = 'true'; show `equipment_type` when `equipment_return` = 'true'; show `candidate_source_other` when `candidate_source` = 'OTHER').
- **Shared option sets:** Reuse the same option list for “Position” across HR topics (New Hire, PAN, Resignation, etc.) to keep consistency; define once in seed and apply to each topic’s Position field.

---

## C. Standard Top Fields (Recap)

- **Support:** Submitter full name, Work email, Employee / hiring location → UI only, not stored as schema fields. Stored via auth/context and ticket.requesterId / ticket.studioId.
- **Maintenance:** Studio Location (studioId), Submitter full name, Work email → UI only; studioId on ticket.
- **Exception:** Where the business breakdown asks for an *additional* “Full Legal Name of Employee” or “Name” (e.g. Operations System Issues), that is a **topic-specific schema field**, not a duplicate of the top “Submitter full name.”

---

## D. Fallback Policy

- **Show legacy “Summary” and “Additional notes”** only when:
  - The schema API returns 404 / no schema for the selected context, or
  - The schema returns successfully but `schema.fields.length === 0`.
- **Do not show legacy fields** when the topic has at least one schema field. Title is derived from schema/topic (e.g. “New Hire – First Last”) and description from a schema field (e.g. `additional_details`) when present.
- After Stage 20, no active topic or maintenance category should have zero fields; fallback becomes rare (e.g. future new topics before they are seeded).

---

## E. Maintenance Alignment

- **One schema per maintenance category** (current pattern): each category (Safety, Electrical/Lighting, HVAC, Plumbing, … Other) has one `ticket_form_schemas` row.
- **Same field set for every maintenance schema:** Issue (text), Detailed Description (textarea), First Day availability (date), Pictures/Videos (file), Additional Comments (textarea). Optionally keep `additional_details` as last field for consistency with support.
- **No category-specific field variation** in the initial design; all categories share the same logical form. If product later wants category-specific fields, they can be added as additional fields per category in seed.
- **Standard top in UI:** Studio Location (studioId), Submitter full name, Work email rendered at top; then Maintenance Category selector; then schema-driven section with the five (or six) fields above.

---

## F. Seed Strategy (Maintainability)

- **Option 1 — Inline data in seed.ts:** Keep one large file but group by department; use named arrays (e.g. `HR_TOPIC_FIELDS['New Hire']`, `HR_TOPIC_FIELDS['PAN / Change in Relationship']`) and a small helper that “applyTopicFields(prisma, schemaId, fields)”. Reduces duplication but file can still be long.
- **Option 2 — Separate seed data modules (recommended):**  
  - `apps/api/prisma/seed-data/support-hr.ts` — Export field definitions for each HR topic (New Hire, PAN, Resignation, … Paycom).  
  - `apps/api/prisma/seed-data/support-marketing.ts` — Same for Marketing topics.  
  - `apps/api/prisma/seed-data/support-retail.ts` — Retail topics.  
  - `apps/api/prisma/seed-data/support-operations.ts` — Operations topics.  
  - `apps/api/prisma/seed-data/maintenance-common.ts` — Single field set for all maintenance categories.  
  Each module exports a structure keyed by topic name (or id) with array of field definitions (fieldKey, type, label, required, sortOrder, conditionals, options). Shared option sets (e.g. Position) live in a shared constant or in the HR module and are referenced by other topics.
- **Option 3 — JSON/YAML files:** Define fields in `seed-data/hr-new-hire.json`, etc., and seed runner reads and creates fields. Keeps seed.ts small but adds file I/O and less type-safety unless generated from TS.
- **Recommended:** Option 2. Seed.ts (or a single `seed-form-schemas.ts`) does: (1) ensure one schema per topic/category (existing logic), (2) for each support topic, resolve schema by topic name/department, then call `applyFields(prisma, schema.id, supportHrFields['New Hire'])` etc., (3) for each maintenance category, resolve schema and call `applyFields(prisma, schema.id, maintenanceCommonFields)`. All apply functions are idempotent (upsert by formSchemaId + fieldKey).

---

## Summary

| Item | Decision |
|------|----------|
| **Full topic coverage** | All listed support topics (20) and all maintenance categories (12) get full schema field definitions. |
| **Standard top fields** | UI-only; not duplicated in schema except where topic explicitly needs an extra “employee name” field. |
| **Maintenance** | One common field set (Issue, Detailed Description, First Day availability, Pictures/Videos, Additional Comments) per category. |
| **Fallback** | Legacy Summary/Description only when schema missing or schema.fields.length === 0. |
| **Seed structure** | Modular per-department (and maintenance) field definitions; seed runner applies them idempotently by topic. |
| **Schema/API/UI** | No Prisma or API changes; UI already schema-driven; optional comment for fallback condition. |

---

*End of Stage 20 Step A mini-spec. Proceed to implementation only after architecture review and approval.*
