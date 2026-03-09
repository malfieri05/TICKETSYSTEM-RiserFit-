# Stage 21 — Auto-Summary Ticket Titles — Step A Mini-Spec (Planning Only)

**Stage name:** Stage 21 — Auto-Summary Ticket Titles

**Step A:** Planning only. No implementation, no code changes, no file modifications beyond this mini-spec.

**Context:** The system is taxonomy- and schema-driven with rich structured fields. Ticket feeds and lists would benefit from auto-generated, readable titles (e.g. "New Hire – John Smith – Irvine", "HVAC Issue – Costa Mesa – AC leak") instead of weak generic user-entered titles.

**Goal:** Design the cleanest, safest way to generate default/auto-summary ticket titles from existing taxonomy + schema/top-field data.

---

## 1. Intent

- **Improve ticket readability in feeds and lists** by auto-generating strong, scannable titles from structured data (topic/category, key schema fields, location).
- **Define a single, consistent title-generation strategy** that respects taxonomy and schema without changing backend data model or workflow.
- **Reuse existing data:** topic name, support topic / maintenance category, form responses (fieldKey → value), studio/location from create payload or ticket.
- **Keep scope minimal:** no AI, no schema changes, no new workflow or assignment logic; title generation is a presentation/creation concern only.

---

## 2. Scope

**In scope**

- **Auto-title generation rules:** Priority of data sources (topic/category name, key schema fields, location); topic-specific strategies for major ticket types; fallback when fields are missing or blank.
- **Create-ticket flow:** Decide whether title is hidden (fully auto) or shown as preview/editable derived from schema; ensure create payload sends a single `title` string as today.
- **Feed/list alignment:** Main ticket list, portal ticket list, and ticket detail header all display the same `ticket.title`; improving how that title is generated at create time improves all three without further change.
- **Implementation location:** Either (a) frontend-only: derive title at submit time from form state + topic + studio (current pattern, extended with location and topic-specific rules), or (b) backend-only: accept optional formResponses + studioId and compute title server-side before persist; or (c) both: frontend derives for preview, backend recomputes for single source of truth. Mini-spec recommends (c) with backend as authority so list/detail never need to recompute.

**Out of scope**

- AI-generated titles.
- Backend redesign (modular monolith, NestJS, Prisma unchanged).
- Due dates, assignment logic, or workflow changes.
- New Prisma schema or migrations for title (reuse existing `tickets.title`).
- Changing how list/detail read data (they keep using `ticket.title`).

---

## 3. Files to Change

| Area | File(s) | Change (planned) |
|------|---------|-------------------|
| **Backend title generation** | New: e.g. `apps/api/src/modules/tickets/title-generator.service.ts` (or inline in `tickets.service`) | Given ticket class + topic/category + formResponses + studioName (or studioId resolved to name), return a single title string. Topic-specific logic keyed by supportTopicId or maintenanceCategoryId (or topic/category name). No DB write in this module; pure function(s). |
| **Backend ticket create** | `apps/api/src/modules/tickets/tickets.service.ts` | When creating a ticket with taxonomy + formResponses, if title is empty or a sentinel (e.g. frontend sends empty for “auto”), call title generator with context and set `ticket.title` to result. Require non-empty title before persist (validation unchanged). |
| **Backend config** | New optional: e.g. `apps/api/src/config/title-strategies.ts` or data in title-generator | Map topic (support topic name or maintenance category name) to strategy: which fieldKeys to use and in what order, and whether to append location. Kept in code/config only; no DB. |
| **Frontend create** | `apps/web/src/app/(app)/tickets/new/page.tsx` | For schema-backed topics: either hide title input and send empty/sentinel so backend generates, or show read-only/editable preview (derived from same rules as backend) and send that string. If preview is editable, backend still receives explicit title and may optionally overwrite with generated for consistency (design choice). |
| **List/detail** | `apps/web` list and detail pages | No change required if they already display `ticket.title`; improved titles appear automatically once create flow writes better titles. |

---

## 4. Schema Impact

- **None.** No Prisma schema or migration changes. The `tickets.title` column already exists and remains the single stored title. Auto-summary only changes how that value is produced at create time (and optionally at display time for legacy tickets, which is out of scope).

---

## 5. API Impact

- **Ticket create (`POST /api/tickets`):**  
  - Request body continues to allow `title` (required today). Options: (1) Keep `title` required and let frontend send the derived title (no API change). (2) Allow `title` to be optional when taxonomy + formResponses are present; backend generates title when missing. (3) Add optional flag e.g. `autoTitle: true` and when set, backend ignores or overwrites `title` with generated one.  
  - Recommendation: (1) or (2). Prefer (2) for single source of truth: when `title` is missing or blank and schema context is present, backend generates and persists it. Validation: reject create if after generation the title would still be empty.
- **Ticket list/detail:** No change; responses already include `title`. No new query params or response fields.

---

## 6. UI Impact

- **Create-ticket flow:**  
  - **Option A (hidden):** For schema-backed topics, do not show a title input; backend generates title. User sees no title field.  
  - **Option B (preview only):** Show a read-only line, e.g. “Title: New Hire – John Smith – Irvine”, derived client-side from same rules (or from backend if we add a “preview title” endpoint). Submit sends empty or sentinel; backend generates.  
  - **Option C (editable preview):** Show an input pre-filled with derived title, user can edit; submit sends that value. Backend can still overwrite with generated for consistency (then list/detail show backend value).  
  - Recommendation: **Option B** for MVP: show a non-editable preview so users see what the ticket will be called; backend generates on create. No new endpoint required if frontend derives preview with same logic as backend (or we implement backend generation and add a small “preview” endpoint later). Simpler: frontend derives preview; backend derives on create when title is blank.
- **Main ticket list / portal list / ticket detail header:** No UI code change; they already render `ticket.title`. Better titles appear as soon as new tickets are created with the new logic.

---

## 7. Risks

- **Stale or missing data:** If formResponses or studio is missing at create time, generated title may be generic (“New Hire – Submission” or “HVAC – [location]”). Fallback rules (see below) must guarantee a non-empty string.
- **Long titles:** Concatenating topic + name + location + issue could exceed `tickets.title` length (e.g. 255). Design: truncate or omit parts (e.g. skip location if total would exceed N chars) and document max length.
- **Topic name changes:** Strategies keyed by topic/category name must match DB (e.g. “Resignation / Termination”). Use stable identifiers (supportTopicId / maintenanceCategoryId) in backend strategy lookup when possible; names for display only.
- **Backend/frontend drift:** If both frontend (preview) and backend (persisted) generate titles, logic must stay in sync or preview will mismatch list/detail. Mitigation: single implementation in backend; frontend either calls a preview endpoint or replicates a minimal subset of rules and accepts rare mismatch.

---

## 8. Test Plan

- **Unit tests:** Title generator returns non-empty string for each supported topic/category with mock formResponses and studio name; fallback when key fields missing; length within limit.
- **Create ticket (support):** Submit HR → New Hire with legal first/last name and studio; expect title like “New Hire – John Smith – Irvine” (or equivalent). Submit with missing name; expect fallback title.
- **Create ticket (maintenance):** Submit HVAC with issue “AC leak” and studio Costa Mesa; expect title like “HVAC Issue – Costa Mesa – AC leak”.
- **Create ticket (fallback):** Submit with no formResponses or empty key fields; expect valid generic title (e.g. “New Hire – Submission” or “HVAC – Costa Mesa”).
- **List and detail:** After creating tickets with new flow, main list, portal list, and detail header show the generated title.
- **Validation:** Create with blank title and no taxonomy; expect 400. Create with blank title but with taxonomy + formResponses; expect 201 and generated title stored.

---

## A. Auto-Title Generation Rules (Data Source Priority)

1. **Topic or category name** (required)  
   - Support: support topic name (e.g. “New Hire”, “Resignation / Termination”).  
   - Maintenance: maintenance category name (e.g. “HVAC / Climate Control” or shortened “HVAC”).  
   - Always the first segment of the title.

2. **Most relevant schema field(s)** (topic-specific)  
   - One or two field values that identify the ticket (e.g. legal first + last name for New Hire, “issue” for maintenance, “brand/style” for Damaged Product).  
   - Priority: use a defined list of fieldKeys per topic (see B); if first choice is blank, use next; if all blank, use fallback label (e.g. “Submission”, “Request”).

3. **Location (studio name)** (optional but recommended)  
   - Resolve studio from `studioId` (create payload or ticket) to studio name; append as segment (e.g. “– Irvine”, “– Costa Mesa”) so titles are scannable by location.  
   - If studio missing, omit location segment.

4. **Order of segments**  
   - Recommended pattern: `[Topic/Category] – [Primary identifier] – [Location]` or `[Topic/Category] – [Location] – [Short issue]` for maintenance.  
   - Example: “New Hire – John Smith – Irvine”; “HVAC Issue – Costa Mesa – AC leak”.

5. **Length and safety**  
   - Max length = existing column (e.g. 255). If concatenation exceeds, truncate from the end or drop location; never persist empty title.

---

## B. Topic-Specific Title Strategies

| Context | Example title | Primary data sources | Fallback |
|--------|----------------|----------------------|----------|
| **HR → New Hire** | New Hire – John Smith – Irvine | topic + legal_first_name + legal_last_name + studio name | New Hire – [first required field] – [location]; else “New Hire – Submission” |
| **HR → Resignation / Termination** | Resignation / Termination – Jane Doe – Irvine | topic + legal_first_name + legal_last_name + studio | Same pattern as New Hire |
| **HR → PAN / Change in Relationship** | PAN – John Smith – Irvine | topic (shortened) + legal first/last + studio | PAN – Submission |
| **HR → New Job Posting** | New Job Posting – Instructor – Irvine | topic + position + studio | New Job Posting – Request |
| **HR → Workshop Bonus** | Workshop Bonus – Name – Irvine | topic + name + studio | Workshop Bonus – Submission |
| **HR → Paycom** | Paycom – Irvine | topic + studio | Paycom – Request |
| **Marketing (any)** | [Topic] – [first key field or “Request”] – [location] | topic + one identifying field (e.g. short_description, instructor_cr_id) + studio | [Topic] – Request |
| **Retail → Missing/Update SKU** | Missing / Update SKU – Irvine | topic + studio (no single key field) | Missing / Update SKU – Request |
| **Retail → Retail Request** | Retail Request – Irvine | topic + studio | Retail Request – Request |
| **Retail → Damaged Product** | Damaged Product – Pasadena – Pilates Ring | topic + studio + brand_style_size (or first 30 chars) | Damaged Product – [location] |
| **Operations → System Issues** | System Issues – John Smith – Irvine | topic (shortened) + full_legal_name + studio | System Issues – Request |
| **Operations → Wipes Orders** | Wipes Order – Newport Beach | topic (shortened) + studio (ship_to_location or ticket studio) | Wipes Order – Request |
| **Operations (others)** | [Topic] – [name or “Request”] – [location] | topic + full_legal_name or similar + studio | [Topic] – Request |
| **Maintenance → [Category]** | HVAC Issue – Costa Mesa – AC leak | category name (shortened) + “Issue” + studio + issue (short) | [Category] Issue – [studio]; else [Category] – [studio] |

- **Shortened topic/category:** Use a compact label where helpful (e.g. “HVAC” instead of “HVAC / Climate Control”, “Wipes Order” instead of “Wipes Orders”) to save space and improve scanability.

---

## C. Fallback Behavior

- **Missing topic/category:** Use “Ticket” or “Support” / “Maintenance” as first segment so title is never empty.
- **All key schema fields blank:** Use a neutral second segment: “Submission”, “Request”, or topic-specific default (e.g. “New Hire – Submission – Irvine”).
- **Missing studio:** Omit location segment; title is e.g. “New Hire – John Smith” (still valid).
- **Very long field value:** Truncate (e.g. first 40 chars of `issue` or `brand_style_size`) so total title length stays within DB limit.
- **No formResponses (legacy or edge case):** Rely on topic + location only; second segment “Request” or “Submission”.

---

## D. Create-Ticket Flow Integration

- **Recommendation:**  
  - **Backend:** On create, if `title` is missing or blank and request includes ticketClassId + (supportTopicId or maintenanceCategoryId) + formResponses, run the title generator with formResponses + studio (resolve studioId to name if present) and set `ticket.title` to the result. If title is provided and non-empty, persist as today (optional: still overwrite with generated for consistency; recommend persist as-is to allow overrides).  
  - **Frontend:** For schema-backed topics, do not show a free-text title input. Show a **read-only preview** line: “Title: [derived title]” using the same rules (or call a preview endpoint if added). On submit, send `title: ''` or omit title so backend generates. User cannot edit title for schema-backed tickets in MVP; keeps one source of truth (backend).

- **Alternative (editable):** Show pre-filled editable title; submit sends it. Backend accepts it and does not overwrite. List/detail show whatever was sent. Allows manual override but risks weak titles if user clears the field. MVP can skip editable to keep behavior simple.

---

## E. Feed/List Alignment

- **Main ticket list** (`/tickets`): Displays `ticket.title` (and topic/category, created, status, etc.). No change; improved titles from create flow automatically improve the list.
- **Portal ticket list** (`/portal/tickets`): Same; uses `ticket.title`.
- **Ticket detail header** (`/tickets/[id]`): Shows title in header; uses `ticket.title`. No change.

No “computed title” in list or detail; both rely on stored `ticket.title`. Auto-summary only improves what gets stored at create time.

---

## F. Clean MVP Scope

- **In:** Auto-title generation at create time (backend) with topic-specific strategies; optional read-only preview on create form; fallbacks when data missing; reuse of existing taxonomy + schema + studio.
- **Out:** No AI; no backend redesign; no due dates, assignment logic, or workflow changes; no schema changes; no change to how list/detail read or display title (they keep using `ticket.title`).

---

## Summary

| Item | Decision |
|------|----------|
| **Where to generate** | Backend at create time (single source of truth); frontend can show read-only preview using same rules. |
| **Data sources** | Topic/category name + topic-specific schema field(s) + studio name; fallback to “Submission”/“Request” and omit location if missing. |
| **Create flow** | No user-editable title for schema-backed topics; show preview; send empty title so backend generates. |
| **API** | Allow empty/missing title when taxonomy + formResponses present; backend generates and persists. Validation: never persist empty title. |
| **Schema** | No change; use existing `tickets.title`. |
| **List/detail** | No code change; they already use `ticket.title`. |

---

*End of Stage 21 Step A mini-spec. Proceed to implementation only after architecture review and approval.*
