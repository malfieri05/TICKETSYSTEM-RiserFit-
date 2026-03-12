# Stage 6: Admin Filter and Settings Cleanup — Mini-Spec

## 1. Intent

Finalize the system by cleaning up remaining **admin filters, naming inconsistencies, outdated controls, and redundant surfaces** so the product feels coherent and production-ready. This stage is a **cleanup and finalization pass** only. It does not introduce new domain logic, new analytics architecture, or major redesigns. Goals:

- **Admin ticket filtering** — Define a clear, consistent filtering experience on ticket list surfaces (department, ticket type, location) that aligns with Stage 1 canonical feed behavior.
- **Location / state field cleanup** — Rename and refine the “Market” vs “State” field where the intended meaning is US state; add searchable state selection.
- **Redundant assistant surfaces** — Remove or consolidate duplicate assistant/admin chatbot entry points so users are not confused by multiple overlapping surfaces.
- **Final naming and terminology** — Remove any remaining references that conflict with NEW / IN_PROGRESS / RESOLVED semantics or with Stage 2 removals (BLOCKED, required subtasks).
- **Role-based UX consistency** — Align labels and layout so the same concepts are named and presented consistently across admin, department, and studio contexts.
- **Filter and control consistency** — Remove or update outdated toggles, redundant controls, and filters that no longer match the data model.

Stage 1 visibility and feed correctness, Stage 2 workflow/timing truth, Stage 3 collaboration behavior, Stage 4 feed/panel polish, and Stage 5 dashboard/reporting structure are **preserved**. The backend remains the source of truth.

---

## 2. Problem Statement

After Stages 1–5, several rough edges remain that make the product feel unfinished or inconsistent:

- **Admin ticket list filters** may be incomplete, inconsistent, or cluttered: department filter may use legacy team vs taxonomy; ticket type and location filters may be missing from the UI or only applied via URL; filter state persistence (URL vs local) may be inconsistent; the combination of filters may not be clearly documented or UX-clean.
- **Location / market terminology** is mixed: in some places “Market” is used where the intended meaning is **State** (e.g. US state); the Add Location flow may use a plain dropdown instead of a searchable list of states; users cannot easily type to find a state when the list is long.
- **Assistant entry points** may be redundant: a full-page Assistant route and a global chatbot (e.g. bottom-right widget) can duplicate the same or similar capability; nav may expose both, causing confusion about where to go for help.
- **Naming drift** may remain: “My Dashboard” and “By Market” were fixed in Stage 5, but other copies or tooltips might still use old wording; any status or workflow copy that implies BLOCKED or “required” subtasks must be removed.
- **Role-based UX** may drift: the same concept (e.g. “location,” “department,” “ticket type”) might be labeled differently for admin vs department vs studio users without a good reason.
- **Outdated controls** may still exist: toggles or filters that reference removed concepts (BLOCKED, required subtasks) or stale ticket status terminology.

This stage defines the desired cleanup so the system feels finished and coherent without re-opening settled architecture from Stages 1–5.

---

## 3. Current Admin / Settings Cleanup Issues

| Area | Current Issue |
|------|----------------|
| **Ticket list filters** | Filter bar may show only department (team) and search; ticket type (ticket class / support topic / maintenance category) and location (studio / market) may be absent from UI or only in URL. Department filter may use legacy teamId/teamName instead of taxonomy departmentId. Filter state may not persist in URL for shareability or may be inconsistent. |
| **Location / state** | “Market” is used in schema and some UI where the intended meaning is **State** (e.g. US state). Add Location (or Add Studio) flow may use a non-searchable dropdown for market/state; no type-to-filter for 50 states. Label “Market” vs “State” is inconsistent. |
| **Assistant surfaces** | Full-page route `/assistant` (RAG knowledge-base chat) and possibly a global AI chat widget (e.g. bottom-right) both exist; nav may link to “Assistant” for the full page while the widget is always visible. Redundancy can confuse users. |
| **Naming** | Possible leftover “My Dashboard,” “By Market,” or tooltips/copy that conflict with NEW/IN_PROGRESS/RESOLVED or that reference BLOCKED/required subtasks. |
| **Role UX** | Same concept (location, department, ticket type) may have different labels or placement for admin vs department vs studio. |
| **Stale controls** | Any filter, toggle, or label that still implies BLOCKED status or “required” subtasks; any status wording that conflicts with the ticket state machine. |

---

## 4. Desired Behavior

- **Admin ticket filtering** is clearly defined: filter by department (taxonomy-aligned where applicable), by ticket type (support topic / maintenance category or ticket class), and by location (studio and/or market/state). Filters are a **view-layer refinement** only; they do not change Stage 1 visibility or authorization. Filter UI is clean and uncluttered; filter state persistence (URL params preferred for shareability) is consistent.
- **Location / state** where the field means US state: label is **“State”**; selection supports **typing and searching**; list of all 50 states (or configured states) is available and filters as the user types. UX is a searchable select or autocomplete, not a long non-searchable dropdown.
- **Redundant assistant surfaces** are removed or consolidated: one clear entry point for “ask the assistant” (either full-page or widget, not both that do the same thing). Nav and routes are updated so nothing points to a removed page; no broken links.
- **Naming** is consistent: no “My Dashboard,” no “By Market,” no BLOCKED or required-subtask wording; all status and workflow copy aligns with NEW / IN_PROGRESS / RESOLVED and Stage 2 completion rules.
- **Role-based UX** is consistent: same concepts use the same labels and similar layout across roles where appropriate; no unnecessary drift.
- **Stale controls** are removed or updated: no filters/toggles/labels that reference BLOCKED or required subtasks; no outdated status terminology.

---

## 5. Admin Filter Cleanup

### 5.1 Scope

Admin (and, where applicable, department) **ticket list** surfaces (e.g. Tickets page, Inbox) must support filtering that is consistent with the canonical feed (Stage 1). Filters **refine the view** over the already-visible ticket set; they do **not** change authorization or visibility. The backend continues to apply visibility first; filters are additional query parameters (e.g. departmentId, ticketClassId, supportTopicId, maintenanceCategoryId, studioId, marketId).

### 5.2 Filter dimensions

- **Department** — Filter by ticket’s responsible department (taxonomy `departmentId` where applicable). Prefer taxonomy department list over legacy team-based list so the filter aligns with Stage 1 department visibility semantics. Single-select (e.g. “All departments” | Department A | Department B) is sufficient; multi-select can be added only if product requires it and UI stays clean.
- **Ticket type** — Filter by ticket class and/or support topic / maintenance category. Options: “All types,” or by ticket class (Support / Maintenance), and within Support by support topic, within Maintenance by maintenance category. Single-select per dimension (one ticket class, one topic or one category) keeps the UI simple; if multiple dimensions are needed, use a single “Type” dropdown that lists meaningful combinations (e.g. “Support – HR,” “Maintenance – Plumbing”) or separate dropdowns (Class, then Topic or Category) with clear labels.
- **Location** — Filter by studio and/or market (state). Single-select for “Location” (e.g. “All locations” | Studio X | Market/State Y) or two dropdowns (Market/State, then Studio) depending on product preference. Location filter must use the same location hierarchy and naming as the rest of the app (e.g. “State” where the field is state).

### 5.3 Multi-select vs single-select

- **Recommendation:** **Single-select** per dimension (one department, one ticket type, one location) to keep the filter bar from becoming cluttered and to avoid complex “any of these” semantics. If product explicitly needs multi-select (e.g. “show tickets in State A or State B”), it must be designed so the UI remains clear and the API supports it (e.g. departmentId in [], studioId in []).
- **Default:** “All” or no filter for each dimension so the initial view shows the full visible set.

### 5.4 Filter state persistence

- **URL query parameters** are preferred so that filtered views are shareable and bookmarkable (e.g. `?departmentId=...&studioId=...`). When the user changes a filter, the URL is updated (replaceState or pushState); when the page loads with query params, filters are initialized from the URL so the view is consistent on refresh or share.
- **Local state only** is acceptable only if product explicitly prefers no URL persistence; then document that filters do not persist on refresh or share.
- **Consistency:** The same persistence approach (URL vs local) should be used for all list surfaces that support these filters (Tickets, Inbox if it has the same filter set).

### 5.5 Filter UI cleanliness

- Filters must **not** clutter the page: use a compact filter bar (e.g. one row of dropdowns and search), optional “Clear filters” when any filter is active, and optional “Filter” collapse/expand on small viewports if needed.
- Filter labels must be clear and consistent with the rest of the app (“Department,” “Type,” “Location” or “State” / “Studio” as appropriate).
- **No duplicate or redundant filters:** e.g. do not show both “Team” (legacy) and “Department” (taxonomy) unless they serve different purposes and are both documented; prefer a single department dimension aligned with Stage 1.

### 5.6 Alignment with Stage 1

- Filters are **view-layer refinement** only. The canonical feed behavior (visibility, sort, pagination, status group) is unchanged. Adding or changing filters must not introduce a new authorization model; the backend still applies `TicketVisibilityService.buildWhereClause(actor)` first, then applies filter parameters to that visible set.

---

## 6. Location / State Field Cleanup

### 6.1 Rename “Market” to “State” where appropriate

- Where the **intended meaning** of the field is **US state** (or a state/province in a single country), the **label** must be **“State”** (or “State / Region” if the product supports multiple countries). Backend and schema may still use `marketId` / `market` internally; the **user-facing label** in the Add Location flow and in any admin or reporting UI that refers to this dimension must say **“State.”**
- If “market” in the product means a broader region (e.g. “Northeast,” “West”) and not a US state, then the label should reflect that (e.g. “Market” or “Region”); this section applies only where the field is intended to represent state.

### 6.2 Searchable state selection

- **State selection** (in the Add Location flow, e.g. when creating a new studio/location and assigning it to a state) must support **typing and searching**. The list of options (all 50 US states, or the configured list) must **filter as the user types** so they can quickly find a state by name without scrolling a long dropdown.
- **Behavior:** User can open the control and type a few characters; the list narrows to matching states (e.g. “Cal” → “California”). Selection is by single click or Enter. “All states” or “No state” option may be offered where the flow allows it.

### 6.3 Control type

- **Recommended:** **Searchable select** (combobox): closed state shows the selected value or placeholder (“Select state”); open state shows an input that filters a list of states; arrow keys and Enter select. Alternative: **autocomplete** that suggests states as the user types and allows selection from suggestions. **Command-palette style** (modal with search) is acceptable if it fits the rest of the app but may be heavier than necessary; prefer inline searchable select for consistency with other form controls.
- **Data:** The list of states (e.g. all 50 US states with canonical names and optional abbreviations) must be available to the component; it can be static (e.g. constant list in frontend) or from a small API/config so that adding a new location only requires selecting state and then filling studio name and address.

### 6.4 UX-only

- This cleanup is **UX only**. No new location hierarchy or new authorization rules. Existing `marketId` / Market (or State) and Studio model remain; only labels and the selection interaction are improved.

---

## 7. Redundant Surface Removal

### 7.1 Identify redundant assistant surfaces

- If the product has **both**:
  - A **full-page Assistant route** (e.g. `/assistant`) that provides a RAG or chatbot experience, and
  - A **global chatbot** (e.g. floating widget in the bottom-right) that provides the same or substantially similar capability (e.g. same RAG backend, same “ask a question” flow),
- then the two are **redundant** for the primary “ask the assistant” use case. Users should not have to choose between “open the Assistant page” and “use the widget” for the same task.

### 7.2 Removal or consolidation

- **Option A — Keep widget, remove full page:** If the global widget is always visible and sufficient, **remove the full-page Assistant route** (`/assistant` or equivalent). Remove the **nav item** that links to that route (e.g. “Assistant” under Admin or main nav). Ensure the widget is discoverable (e.g. label, tooltip, or onboarding hint) so users know where to ask questions.
- **Option B — Keep full page, remove widget:** If the full page is preferred (e.g. for longer conversations or accessibility), **remove or hide the global widget** and keep a single “Assistant” entry in the nav that goes to the full page.
- **Option C — Differentiate:** If the full page and the widget serve **different** purposes (e.g. full page = RAG knowledge-base chat, widget = ticket/action agent), then **rename and differentiate** them in the UI (e.g. “Knowledge Base” for the page, “Assistant” for the widget) and remove redundancy in naming and capability so it is clear which to use when. Do not leave two identically named “Assistant” entry points that do the same thing.

The spec **recommends** one clear primary entry point (either page or widget) for “ask the assistant” and removal or clear differentiation of the other.

### 7.3 Nav and route cleanup

- After deciding which surface to remove or rename:
  - **Remove** any nav items that point to removed routes (e.g. remove “Assistant” from sidebar if the full page is removed).
  - **Update** any in-app links (e.g. from Knowledge Base or help text) that pointed to the removed route so they point to the retained surface or to a sensible alternative.
  - **Redirect** the old route to the retained surface if desired (e.g. `/assistant` → redirect to home or to a “chat” panel) so bookmarks and old links do not 404. Document the redirect in the implementation plan.

### 7.4 No broken navigation

- After removal, **no** nav item or primary CTA should point to a route that no longer exists. If the Assistant page is removed, the sidebar (and any footer or header links) must not contain “Assistant” linking to `/assistant` unless that route is kept or redirected.

---

## 8. Naming and Terminology Cleanup

### 8.1 Explicit targets

The following naming cleanup targets must be identified and addressed in implementation:

- **“My Dashboard”** — Already fixed in Stage 5 (→ “Dashboard”). **Verify** no remaining copies in sidebar, page title, breadcrumbs, or tooltips anywhere in the app.
- **“By Market”** — Already fixed in Stage 5 (→ “By Location” on reporting). **Verify** no remaining “By Market” in reporting page, API client labels, or chart axes; any backend route name can remain `by-market` if the frontend label is “By Location.”
- **Status and lifecycle wording** — Any user-facing or admin-facing text that conflicts with **NEW / IN_PROGRESS / RESOLVED** semantics must be updated. For example: do not use “Open” where the spec means “Active” (not RESOLVED/CLOSED); do not use “In Progress” to mean “any active status” if the product has defined “In Progress” as `status = IN_PROGRESS` only (per Stage 5 implementation). Align tooltips, empty states, and table headers with the canonical definitions.
- **BLOCKED and required subtasks** — Stage 2 removed BLOCKED and the required-subtask concept. **Remove** any remaining wording that implies “blocked” subtask status or “required” subtasks (e.g. “Required subtask,” “Blocked,” “Most blocked subtask types”). Workflow analytics and reporting must use only timing-based language (e.g. “Longest-running,” “Steps exceeding target”). Exception: form validation “required fields” (e.g. “Name is required”) is unrelated and stays.
- **“Market” vs “State”** — Where the field represents US state, use **“State”** in labels (see §6). “Market” may remain in schema/API names; display label should be “State” (or “Region” if not state).

### 8.2 Search and verification

- Implementation must **search** the codebase and any static copy for: “My Dashboard,” “By Market,” “blocked,” “BLOCKED,” “required subtask,” “optional subtask,” and similar. Each occurrence must be either updated to match the final architecture or removed. No leftover references that would confuse users or contradict Stage 1–2 semantics.

---

## 9. Role-Based UX Consistency

### 9.1 Same concept, same label

- Where **admin**, **department**, and **studio** users see the same concept, the **label** should be the same. Examples:
  - **Location** — Use “Location” (or “State” / “Studio” where that is the specific dimension) consistently; do not use “Market” for admin and “Location” for studio unless the data is actually different.
  - **Department** — Use “Department” for the taxonomy department everywhere; avoid “Team” in one place and “Department” in another for the same concept (unless legacy “Team” is explicitly still in use and documented).
  - **Ticket type** — Use “Type” or “Ticket type” or “Category” consistently; do not use “Support topic” in one screen and “Category” in another for the same dropdown without a reason.

### 9.2 Layout and placement

- **Placement** of equivalent controls (e.g. location filter, status tabs) should be **similar** across role-appropriate surfaces. For example: if the Tickets page has Active/Completed tabs at the top and then filters, the Inbox (for department users) should not put the same conceptual filters in a completely different order or under a different name unless there is a clear role-based reason. This is **consistency**, not rigid duplication—layout can adapt to role (e.g. studio users may have fewer filters) but naming and behavior should align.

### 9.3 No unnecessary drift

- **Avoid** different wording for the same idea just because the user is admin vs department vs studio. Examples: “All departments” vs “All teams” for the same filter; “My locations” vs “Studios” for the same list. Standardize on one term per concept and use it everywhere that concept appears.

### 9.4 Permissions unchanged

- This section addresses **wording and layout consistency** only. It does **not** change who can see what or what actions each role can perform; Stage 1 visibility and role permissions remain unchanged.

---

## 10. Filter / Control Cleanup

### 10.1 Outdated toggles

- **Identify** any toggle, checkbox, or switch that implies:
  - **BLOCKED** status (e.g. “Show blocked only”) — remove or replace with a timing-based alternative if needed.
  - **Required subtasks** (e.g. “Required only,” “Optional subtasks”) — remove; Stage 2 removed the required concept.
- **Remove or repurpose** such controls so the UI matches the current domain model.

### 10.2 Redundant controls

- **Remove** controls that are no longer meaningful after Stages 1–5. Examples:
  - A filter that duplicates what another filter already does (e.g. two “department” dropdowns that both filter by the same dimension).
  - A “View” or “Display” option that has no effect or that conflicts with the canonical feed (e.g. “Show my tickets only” on a page that is already scoped by visibility).
- **Keep** controls that add value (e.g. “Clear filters,” “Export”) and that align with the data model.

### 10.3 Filters that no longer match the data model

- **Align** filter options with the **current** schema and visibility model. For example:
  - If department filter is backed by **taxonomy** `departmentId`, the options must come from taxonomy departments, not from a legacy team list that no longer drives visibility.
  - If “location” filter is studio and/or market/state, the options must reflect the current list of studios and markets (states) in the system; no stale or removed IDs.
- **Document** which API parameters each filter maps to so that backend and frontend stay in sync.

### 10.4 Stale workflow analytics wording

- **Workflow analytics** and **reporting** pages must not use:
  - “Blocked” or “Most blocked” — use timing-based language only (e.g. “Longest-running subtask types,” “Steps exceeding target”).
  - “Required” in the sense of required subtasks — Stage 2 removed that; do not imply that some subtasks are “required” and others “optional” in the UI.
- **Verify** section titles, table headers, and tooltips on workflow analytics and reporting for any such wording and update them.

---

## 11. Risks and Edge Cases

| Risk / Edge Case | Mitigation |
|------------------|------------|
| **URL length with many filters** | Prefer short query keys (e.g. `dept`, `type`, `loc`); cap or omit very long multi-select values if multi-select is ever added. |
| **State list maintenance** | Use a single source of truth for state names (e.g. static list of 50 US states); if product supports multiple countries, extend to region/state list per country without overcomplicating the Add Location flow. |
| **Removing Assistant page breaks bookmarks** | Implement redirect from old `/assistant` to home or to the widget’s context so existing links do not 404. |
| **Department filter uses legacy team** | Align filter with taxonomy departmentId where Stage 1 visibility is department-based; migrate filter options to taxonomy list and document any legacy team fallback if still in use. |
| **Renaming “Market” to “State” confuses non-US users** | If product is US-only, “State” is correct. If product is multi-country, use “State / Region” or make the label configurable so other regions can use “Region” or “Province.” |
| **Over-cleaning** | Only remove or rename what is explicitly redundant or conflicting; do not remove controls that serve a distinct purpose. |

---

## 12. Verification Plan

1. **Admin filters:** On Tickets (and Inbox if applicable), verify filters for department, ticket type, and location are present, labeled consistently, and apply correctly; filter state persists in URL when specified; “Clear filters” resets all; no duplicate or redundant filter controls.
2. **Location / state:** In Add Location (or Add Studio) flow, verify the field that represents state is labeled “State” (or as specified); selection is searchable (type to filter); list includes intended states (e.g. 50 US states); selection works and saves correctly.
3. **Redundant surfaces:** After removal or consolidation, verify only one primary “Assistant” (or clearly differentiated) entry point; no nav item points to a removed route; old route redirects or returns 404 with a clear message; no broken links from Knowledge Base or help text.
4. **Naming:** Search codebase and UI for “My Dashboard,” “By Market,” “blocked,” “BLOCKED,” “required subtask”; verify no conflicting or outdated wording; status and lifecycle copy align with NEW/IN_PROGRESS/RESOLVED and Stage 2.
5. **Role UX:** As admin, department, and studio user, compare labels and placement for “location,” “department,” “ticket type”; verify consistent terminology and no unnecessary drift.
6. **Stale controls:** Verify no toggles or filters that reference BLOCKED or required subtasks; workflow analytics and reporting use only timing-based and current status language.
7. **Stage 1–5 preserved:** Visibility, feed, workflow/timing, collaboration, dashboard/reporting, and panel/feed polish behave as before; no regressions.

---

## 13. Acceptance Criteria

- [ ] **Admin filter cleanup:** Ticket list (and Inbox where applicable) supports filter by department (taxonomy-aligned), ticket type, and location; single-select per dimension (or documented multi-select); filter state persists per product choice (URL preferred); filter UI is clean and not cluttered; filters are view-layer only and consistent with Stage 1 canonical feed.
- [ ] **Location / state:** Where the field means US state, label is “State”; state selection is searchable (type to filter); list of states (e.g. 50) is available and filters correctly; control type is searchable select or autocomplete; no new location hierarchy or auth rules.
- [ ] **Redundant surfaces:** Redundant assistant/admin surface is removed or consolidated; one clear entry point for “ask the assistant” (or clearly differentiated names/purposes); nav and in-app links updated; old route redirected or handled so no broken navigation.
- [ ] **Naming cleanup:** No remaining “My Dashboard” or “By Market” in user-facing copy; no BLOCKED or required-subtask wording; status and lifecycle copy align with NEW/IN_PROGRESS/RESOLVED and Stage 2; “Market” → “State” in labels where intended meaning is state.
- [ ] **Role-based UX:** Same concepts use same labels across admin/department/studio where appropriate; no unnecessary layout or naming drift; permissions unchanged.
- [ ] **Filter / control cleanup:** No outdated toggles or filters that imply BLOCKED or required subtasks; no redundant controls; filters match current data model; workflow analytics and reporting use only timing-based and current status wording.
- [ ] **Preservation:** Stage 1 visibility and feed correctness, Stage 2 workflow/timing truth, Stage 3 collaboration behavior, Stage 4 feed/panel polish, and Stage 5 dashboard/reporting structure unchanged.

---

## 14. Out of Scope (Explicit)

Stage 6 does **not** include:

- **New workflow or domain logic** — No changes to ticket state machine, subtask lifecycle, resolution gate, or visibility rules.
- **New analytics models** — No new metrics, new charts, or new analytics architecture.
- **Major app-wide redesign** — No broad visual or structural redesign beyond the cleanup described above.
- **New collaboration features** — No new comment, mention, or reply behavior.
- **Major infrastructure changes** — No new services, new queues, or new deployment model.
- **New product features** — No new capabilities beyond “clean up what exists.”

---

## 15. Final Product-Readiness Pass

### 15.1 Philosophy

Stage 6 is a **product cleanup and consistency pass**. The goal is to:

- **Remove prototype leftovers** — Redundant surfaces, duplicate entry points, and controls that no longer match the domain.
- **Align labels and controls** to the final architecture (Stages 1–5): canonical feed, NEW/IN_PROGRESS/RESOLVED, no BLOCKED, no required subtasks, dashboard/reporting as summary-only, location terminology consistent.
- **Reduce confusion** for real users and admins — One clear place for the assistant; consistent filter names and behavior; searchable state selection so configuration is easy.
- **Make the system feel finished and coherent** — No stray “Market” where we mean “State”; no “My Dashboard” or “By Market”; no filters that do nothing or that contradict the data model.

### 15.2 Constraints

- **Prefer removal and simplification** over adding new controls. When in doubt, remove or rename rather than add.
- **Keep the system aligned** with the final product model established in Stages 1–5. Do not re-open settled decisions.
- **Be explicit** in implementation about what is removed, renamed, or standardized so that the result is auditable and maintainable.

---

*Stage 6 focuses on admin filter and settings cleanup, location/state field UX, redundant surface removal, and final naming and role-based consistency. No new domain logic or analytics architecture.*
