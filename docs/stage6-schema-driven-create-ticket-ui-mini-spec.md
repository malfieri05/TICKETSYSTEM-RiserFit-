# Schema-Driven Create Ticket UI — Mini-Spec (Planning Only)

**Context:** Stage 2 (taxonomy), Stage 3 (form schema), and Stage 4 (workflow instantiation) are implemented in the backend. The current New Ticket page still uses a legacy form (title, description, category dropdown, priority) and submits only `title`, `description`, `priority`, `categoryId`, `ownerId`. That triggers the backend **compatibility path**: missing `ticketClassId` is inferred as MAINTENANCE, and optional `categoryId` is mapped to `maintenanceCategoryId`. As a result, the **full** taxonomy and form-schema context are not sent, workflow template resolution may not match the intended type/topic, and **workflow subtasks are not reliably instantiated** for operational use.

**Goal:** Replace the legacy create form with a **schema-driven Create Ticket UI** that uses the existing Stage 2 taxonomy API, Stage 3 form-schema API, and submits the full create payload so that workflow templates are instantiated and ticket detail shows subtasks.

**No code in this step — mini-spec only.**

---

## 1. Intent

- **Replace** the current hardcoded New Ticket form (title, description, category, priority, optional assignee) with a **dynamic form** driven by backend taxonomy and form schema.
- **Load** ticket taxonomy from the Stage 2 API and form schema from the Stage 3 API.
- **Support** both **SUPPORT** (department → support topic) and **MAINTENANCE** (maintenance category) flows with correct field visibility and validation.
- **Render** dynamic fields from the schema (text, textarea, select, checkbox, date, file as needed) and respect conditionals where implemented.
- **Submit** the full create payload: `ticketClassId`, and for SUPPORT `departmentId` + `supportTopicId`, for MAINTENANCE `maintenanceCategoryId`, plus `formResponses` (and existing `title`, `description`, `priority`, `ownerId`, etc.).
- **Use the legacy compatibility path only** when the user has not selected a ticket class (or explicitly chooses a “simple” / “legacy” create option, if offered); otherwise always send the full taxonomy and formResponses so workflow instantiation runs for the correct context.
- **Verify** after create that the ticket detail page shows instantiated subtasks (and that workflow templates exist for the chosen context where expected).

---

## 2. Scope

**In scope**

- **Frontend only** for this mini-spec: New Ticket page and any shared form/taxonomy types or helpers. Backend already supports full create payload and workflow instantiation.
- Replace the legacy form UI at `apps/web/src/app/(app)/tickets/new/page.tsx` (or equivalent) with a multi-step or single-page flow that:
  1. Loads ticket taxonomy (GET `/api/admin/config/ticket-taxonomy`).
  2. Lets the user choose **ticket class** (SUPPORT vs MAINTENANCE).
  3. For **SUPPORT:** choose **department**, then **support topic** (topics filtered by department).
  4. For **MAINTENANCE:** choose **maintenance category**.
  5. After (ticket class + topic/category) is selected, loads **form schema** (GET `/api/ticket-forms/schema?ticketClassId=…&departmentId=…&supportTopicId=…` or `?ticketClassId=…&maintenanceCategoryId=…`).
  6. Renders **dynamic fields** from the schema (type, label, required, options, conditionals).
  7. Collects **title**, **description** (if still required by schema or kept as core fields), **priority**, optional **ownerId**, and **formResponses** (fieldKey → value).
  8. Submits **POST /api/tickets** with: `title`, `description`, `priority`, `ticketClassId`, and for SUPPORT `departmentId` + `supportTopicId`, for MAINTENANCE `maintenanceCategoryId`, and `formResponses`; optionally `studioId`, `marketId`, `ownerId`. **Do not** send `categoryId` when full taxonomy is selected.
- **API client:** Extend `ticketsApi.create` (or equivalent) to accept the full payload: `ticketClassId`, `departmentId?`, `supportTopicId?`, `maintenanceCategoryId?`, `formResponses?`.
- **Post-create:** Redirect to ticket detail (`/tickets/[id]`); user (or QA) verifies that subtasks are present when a workflow template exists for the chosen context.
- **Fallback:** If no ticket class (or no topic/category) is selected, optionally allow “Create without type” that uses the legacy compatibility path (no `ticketClassId`, optional `categoryId`) so existing behavior remains available; spec should state whether this is required or optional.

**Out of scope (for this mini-spec)**

- Backend changes (create API, taxonomy, form schema, workflow instantiation are already implemented).
- Admin UI for editing taxonomy or form schemas.
- File upload UX for form fields of type `file` (can be minimal or deferred: store attachment id in formResponses per existing backend behavior).
- Changes to ticket detail page layout (only verification that subtasks appear).
- Stage 6 inbox/notifications (already done).

---

## 3. Current State Summary

| Component | Current behavior | Target |
|-----------|------------------|--------|
| **New Ticket page** | Single form: title, description, category (legacy), priority, optional assignee. Submits `title`, `description`, `priority`, `categoryId`, `ownerId`. | Multi-step or single-page: ticket class → department/topic or maintenance category → load schema → render dynamic fields → submit full payload. |
| **Taxonomy API** | `GET /api/admin/config/ticket-taxonomy` returns `ticketClasses`, `departments`, `supportTopicsByDepartment`, `maintenanceCategories`. | Frontend loads once and uses for ticket class + department + support topic (SUPPORT) or maintenance category (MAINTENANCE). |
| **Form schema API** | `GET /api/ticket-forms/schema?ticketClassId=&departmentId=&supportTopicId=` (SUPPORT) or `?ticketClassId=&maintenanceCategoryId=` (MAINTENANCE). Returns schema with `fields[]` (fieldKey, type, label, required, options, conditionals). | Frontend fetches schema when context (class + topic/category) is determined; renders fields; collects formResponses. |
| **Create API** | Accepts `CreateTicketDto`: title, description, categoryId?, ticketClassId?, departmentId?, supportTopicId?, maintenanceCategoryId?, priority?, studioId?, marketId?, ownerId?, formResponses?. Legacy path: no ticketClassId → MAINTENANCE; categoryId can set maintenanceCategoryId. | Frontend sends full taxonomy + formResponses when user selected a type/topic; omit categoryId for that path. Use legacy path only when “no schema” selected. |
| **Workflow** | `instantiateForTicket(tx, ticketId, { ticketClassId, departmentId, supportTopicId, maintenanceCategoryId })` runs inside create transaction. Templates keyed by same context. | Full payload ensures correct context and thus correct template; ticket detail shows subtasks. |

---

## 4. Requirements (Checklist for Implementation)

1. **Replace the old create ticket form**  
   Remove or replace the legacy form that only collects title, description, category (legacy), priority, and optional assignee.

2. **Load ticket taxonomy from Stage 2 API**  
   - Call `GET /api/admin/config/ticket-taxonomy` (authenticated).  
   - Use response: `ticketClasses`, `departments`, `supportTopicsByDepartment`, `maintenanceCategories`.  
   - Ticket classes are SUPPORT and MAINTENANCE (by code or id).  
   - SUPPORT: departments list; for each department, topics list.  
   - MAINTENANCE: maintenance categories list.

3. **Load dynamic form schema from Stage 3 API**  
   - When user has selected:  
     - **SUPPORT:** ticketClassId (SUPPORT) + departmentId + supportTopicId.  
     - **MAINTENANCE:** ticketClassId (MAINTENANCE) + maintenanceCategoryId.  
   - Call `GET /api/ticket-forms/schema` with the appropriate query params.  
   - Handle 404 (no schema for this context) with a clear message; optionally allow submit without dynamic fields or fall back to legacy path.

4. **Support ticket class selection**  
   - User selects ticket class (SUPPORT or MAINTENANCE).  
   - UI shows only the relevant next step (department vs maintenance category).

5. **SUPPORT: department → support topic**  
   - After SUPPORT is selected, show department dropdown (from taxonomy).  
   - After department is selected, show support topic dropdown (topics for that department from `supportTopicsByDepartment` or equivalent).  
   - Both are required for SUPPORT before loading schema.

6. **MAINTENANCE: maintenance category**  
   - After MAINTENANCE is selected, show maintenance category dropdown.  
   - Required before loading schema.

7. **Render dynamic fields from schema**  
   - Use schema `fields` array: fieldKey, type, label, required, sortOrder, options (for select/radio), conditionalFieldKey/conditionalValue if supported.  
   - Map type to controls: text, textarea, select, checkbox, date, file (minimal or placeholder acceptable).  
   - Enforce required when visible (e.g. when conditional is satisfied).  
   - Collect values into a `formResponses` object (fieldKey → string value).

8. **Submit full create payload**  
   - Include: `title`, `description` (optional or as required by product), `priority`, `ticketClassId`.  
   - **SUPPORT:** `departmentId`, `supportTopicId`.  
   - **MAINTENANCE:** `maintenanceCategoryId`.  
   - Include `formResponses` (object of fieldKey → value) when schema was loaded and user filled the form.  
   - Optionally: `studioId`, `marketId`, `ownerId`.  
   - **Do not** send `categoryId` when using the full taxonomy path (to avoid mixing legacy and new paths).

9. **Do not use legacy compatibility path when full schema is selected**  
   - If user selected ticket class and topic/category, always send `ticketClassId` and the relevant ids and `formResponses`; do not send only `categoryId`.  
   - Use legacy path only when no ticket class (or no topic/category) is selected, if that option is offered.

10. **After create: verify workflow and subtasks**  
    - Redirect to `/tickets/[id]`.  
    - For a context that has a workflow template, ticket detail must show instantiated subtasks (e.g. under Subtasks tab).  
    - Manual or automated verification that subtask count > 0 when a template exists for the chosen context.

---

## 5. API Contract Summary

**Taxonomy (existing)**  
- `GET /api/admin/config/ticket-taxonomy`  
- Response: `{ ticketClasses: [{ id, code, name, sortOrder }], departments: [{ id, code, name, sortOrder }], supportTopicsByDepartment: [{ ...dept, topics: [{ id, name, sortOrder }] }], maintenanceCategories: [{ id, name, description?, color?, sortOrder }] }`.

**Form schema (existing)**  
- `GET /api/ticket-forms/schema?ticketClassId=...&departmentId=...&supportTopicId=...` (SUPPORT).  
- `GET /api/ticket-forms/schema?ticketClassId=...&maintenanceCategoryId=...` (MAINTENANCE).  
- Response: `{ id, ticketClassId, departmentId, supportTopicId, maintenanceCategoryId, version, name, fields: [{ id, fieldKey, type, label, required, sortOrder, conditionalFieldKey?, conditionalValue?, options?: [{ value, label, sortOrder }] }] }`.

**Create ticket (existing, extend frontend usage)**  
- `POST /api/tickets`  
- Body (full path): `title`, `description?`, `priority?`, `ticketClassId`, `departmentId?` (required if SUPPORT), `supportTopicId?` (required if SUPPORT), `maintenanceCategoryId?` (required if MAINTENANCE), `formResponses?`, `studioId?`, `marketId?`, `ownerId?`.  
- Do not send `categoryId` when sending `ticketClassId` + topic/category ids.

---

## 6. Files to Change (Implementation Phase)

| Area | File(s) | Change |
|------|---------|--------|
| **New Ticket page** | `apps/web/src/app/(app)/tickets/new/page.tsx` | Replace legacy form with taxonomy-driven flow: ticket class → department/topic or maintenance category → fetch schema → render dynamic form → submit full payload. |
| **API client** | `apps/web/src/lib/api.ts` | Extend `ticketsApi.create` (and types) to accept `ticketClassId`, `departmentId?`, `supportTopicId?`, `maintenanceCategoryId?`, `formResponses?`. Add `adminApi.getTicketTaxonomy()` if missing; add `ticketFormsApi.getSchema(params)` if missing. |
| **Types** | `apps/web/src/types/index.ts` (or equivalent) | Add types for taxonomy response, form schema response (fields, options, conditionals), and create payload with full taxonomy and formResponses. |
| **Shared form components (optional)** | `apps/web/src/components/...` | Optional: reusable dynamic field renderer (by type) and/or a small “CreateTicketForm” component; can remain inline on the page for simplicity. |

**Not changed**

- Backend create endpoint, DTO, or workflow instantiation logic.  
- Ticket detail page structure (only used for verification).  
- Stage 2/3/4 backend APIs (only consumed correctly by frontend).

---

## 7. Risks and Mitigations

- **No schema for context:** Backend returns 404 for some (ticketClassId, topic/category). Show a clear message and either allow submit without formResponses (backend may still create ticket and run workflow if template exists) or offer “Create without form” / legacy path.
- **Conditional fields:** Schema may include conditionalFieldKey/conditionalValue. Frontend must evaluate visibility and only require and submit visible required fields.
- **File fields:** If schema has type `file`, backend may expect attachment id(s) in formResponses. Defer complex file UX or implement minimal “upload then set value” flow.
- **Backward compatibility:** Keeping an explicit “Simple create” or “Create without type” that uses only title/description/priority/categoryId ensures existing users can create tickets without selecting taxonomy; document that workflow/subtasks may not be created in that case.

---

## 8. Verification (Post-Implementation)

1. **Create SUPPORT ticket:** Select SUPPORT → department → support topic; confirm schema loads; fill required dynamic fields; submit. Open ticket detail; confirm subtasks appear if a workflow template exists for that context.  
2. **Create MAINTENANCE ticket:** Select MAINTENANCE → maintenance category; confirm schema loads; fill required fields; submit. Confirm subtasks on detail when template exists.  
3. **Legacy path (if kept):** Create without selecting ticket class (or with “simple” option); confirm ticket is created and either no subtasks or default MAINTENANCE behavior; no regression.  
4. **Validation:** Omit required dynamic field → submit fails with clear message.  
5. **API:** Confirm request body for full path does not include `categoryId` and includes `ticketClassId`, topic/category ids, and `formResponses`.

---

## 9. Summary

Replace the legacy New Ticket form with a schema-driven UI that: (1) loads taxonomy from the Stage 2 API, (2) lets the user choose ticket class and then SUPPORT (department + support topic) or MAINTENANCE (maintenance category), (3) loads form schema from the Stage 3 API for that context, (4) renders dynamic fields and collects formResponses, (5) submits the full create payload (ticketClassId, departmentId/supportTopicId or maintenanceCategoryId, formResponses) so the backend runs workflow instantiation, and (6) verifies on ticket detail that subtasks appear. Use the legacy compatibility path only when no new schema/type is selected. No backend changes required for this mini-spec; frontend and API client/type updates only.
