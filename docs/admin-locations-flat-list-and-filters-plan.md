# Admin Locations Page — Flat List + Search + State Filter (Implementation Plan)

**Status:** Plan only — not yet implemented.  
**Scope:** Admin → Locations (`/admin/markets`).  
**Goal:** Default to a flat list of all locations; search bar filters list smoothly as user types; state dropdown (searchable) to the right of search for fast state sifting.

---

## 1. Current State / Root Cause

- **Data:** Page loads `GET /admin/markets` → array of markets; each market has `studios` (the “locations”). In the UI, “market” is the state/region (e.g. Arizona, California).
- **UI:** Locations are **hidden by default** inside collapsible market (state) headers. User must expand each state to see its locations. A single “Search locations…” input filters which **markets** are shown (by market name or any studio name/address under that market), but the list remains accordion-style: you still have to expand to see studios.
- **Pain:** Finding a location requires expanding the right state, then scanning. Search helps narrow which states appear but does not surface a flat, filterable list of locations.

---

## 2. Desired Behavior (Summary)

| Aspect | Behavior |
|--------|----------|
| **Default list** | Show a **flat list of all locations** (all studios across all markets). No collapsed headers; every location is visible as a row. |
| **Search bar** | Filters the **displayed locations** (studio name + address, optionally market name). Updates **smoothly as the user types** (client-side, no debounce). |
| **State control** | A **dropdown to the right of the search bar**. User can select a state (market) to filter the list to that state only. Option for “All states” (default). |
| **State dropdown UX** | **Type-to-filter** inside the dropdown: user can type a state name to narrow the list of states (searchable combobox). No need to scroll through a long list of states. |

---

## 3. Data and Filtering Logic

- **Source:** Same as today — `useQuery(['markets'], () => api.get('/admin/markets'))`. No API changes.
- **Derived “flat” list:** Once `markets` is loaded, build a single array of “location items”:
  - Each item: `{ studio, marketId, marketName }` (or equivalent) so each row has studio fields + parent market name.
  - Order: e.g. by `marketName` then `studio.name` (or by `studio.name` globally). Define once and keep consistent.
- **Filters (both applied to this flat list):**
  1. **State filter:** If a state (market) is selected, keep only items where `marketId === selectedMarketId`. If “All states” (or empty), keep all.
  2. **Search text:** `searchQuery.trim().toLowerCase()`. Keep items where the query matches:
     - `studio.name`
     - `studio.formattedAddress`
     - Optionally `marketName` (so “California” in search shows all CA locations).
- **Smoothness:** Derive the filtered list in render (or with `useMemo`) from `searchQuery` and `selectedMarketId`. No async; no debounce. Typing immediately narrows the list. Avoid layout thrash by keeping the list in a scrollable container with stable structure (e.g. same container height or virtualize only if needed later).

---

## 4. UI Layout and Components

- **Toolbar row (unchanged left-to-right order, add one control):**
  - **Search:** Existing “Search locations…” input; behavior changes from “filter markets” to “filter flat location list” as above. Keep placeholder and styling.
  - **State dropdown:** **New**, to the right of the search input. Same row, e.g. flex with gap.
    - Label or placeholder: e.g. “State” or “All states”.
    - **Searchable:** User can type to filter the list of states (markets). Implement as a combobox:
      - Closed: shows selected state name or “All states”.
      - Open: list of market names; typing filters that list by `market.name` (case-insensitive).
      - Clicking an option selects that market and closes the dropdown; list below shows only locations in that state.
      - “All states” (or clear) option so user can reset the state filter.
- **List area:**
  - **Replace** the current accordion (markets with expand/collapse and nested studios) with a **single scrollable list** of location rows.
  - Each row: at least **location name**; optionally **state (market) name** (e.g. secondary text or a small label) so context is clear.
  - Clicking a row still selects that location and opens the **existing right-hand detail panel** (location details, edit, nearby locations). No change to the right panel behavior.
  - Preserve **hover and selection styling** (theme tokens) so the list feels consistent with the rest of the app.

---

## 5. “Add Location” and “Add Market”

- **Add Market:** Keep as-is (e.g. header action or top-of-page block). No change.
- **Add Location:** Today “Add Location” lives inside each expanded market. With a flat list there are no per-state expandable sections.
  - **Proposed:** A single **“Add Location”** action (e.g. button above or below the list, or in the toolbar). On click, show the same add-location form (name, formatted address, lat, lng), but **require selecting a market (state) first** (e.g. a dropdown at top of the form, or pre-filled if state filter is set). Reuse existing `createStudioMut` and form validation; on success, invalidate `['markets']` and keep UX (e.g. close form, optionally scroll to or highlight the new location). No new API.

---

## 6. State Dropdown (Searchable) — Implementation Notes

- **Option A — Reuse pattern:** If the codebase has a searchable select (e.g. `UserSearchSelect`-style), introduce a small **MarketSearchSelect** or **StateSearchSelect** that takes `markets` and `value`/`onChange` (market id or empty for “All”). Internal: input + dropdown; filter markets by name as user types; select market or “All states.” Keeps patterns consistent.
- **Option B — Inline:** Implement the combobox directly on the Locations page: one controlled input/button for “State”, open state for dropdown, filter `markets` by typed query, keyboard (Escape to close, optional Arrow keys). Prefer A if a reusable component is quick; otherwise B is acceptable with a note to extract later if needed elsewhere.
- **Accessibility:** Ensure the state control has a clear label, and that “All states” is selectable and announced (e.g. option text “All states”).

---

## 7. Edge Cases and Consistency

- **Empty states:**
  - No markets: keep current empty state (e.g. “No markets yet”, CTA to add market).
  - Markets but no studios: flat list is empty; show a single empty state (e.g. “No locations yet” + Add Location).
  - Filtered list empty (search or state): “No locations match your search” (or “No locations in this state”) with optional hint to clear filters.
- **URL / state:** No requirement to sync search or state filter to the URL for this scope. Local component state is sufficient.
- **Performance:** With hundreds of locations, client-side filtering is still fine. If the list grows very large (e.g. 1000+), consider virtualizing the list later; not required for the first iteration.
- **Theme:** All new or touched UI must use existing theme tokens (e.g. `var(--color-bg-surface)`, `var(--color-text-primary)`, borders) so light/dark and existing polish are preserved.

---

## 8. Files to Touch

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/admin/markets/page.tsx` | Main change: derive flat list; apply state + search filters; replace accordion with flat location list; add state dropdown (searchable) next to search; relocate “Add Location” to a single form with market choice. Remove or repurpose `expanded` state if no longer needed. |
| Optional: `apps/web/src/components/ui/MarketSearchSelect.tsx` (or similar) | New small component for searchable state/market picker if we want reuse and consistency with `UserSearchSelect`. |

No backend or API changes. No changes to the detail panel (right side), edit flow, or nearby locations logic.

---

## 9. Verification (Manual)

- Load Locations as admin; see a **flat list of all locations** by default (no expanding).
- Type in **search**; list narrows **immediately** (smooth) by location name/address (and optionally state name).
- Clear search; list returns to full (or to state-filtered set).
- Open **state** dropdown; select a state; list shows only that state’s locations.
- In state dropdown, **type** a state name; list of states filters; select one; list updates.
- Select “All states”; list shows all locations again.
- **Add Market** still works.
- **Add Location** works (with market/state chosen in form); new location appears in list and can be selected.
- Click a location → **detail panel** opens; edit and nearby locations behave as today.
- No regressions in theme (light/dark) or layout on small viewports; state dropdown and search sit in one row (wrap if needed).

---

## 10. Out of Scope (Explicitly)

- Backend or API changes.
- Changing the data model (markets/studios).
- URL persistence of search or state filter.
- Virtualization or pagination of the list (unless we discover a real need).
- Changes to the ticket creation flow, portal, or other consumers of markets/studios.

---

*Plan approved for implementation. Implement in the order above; keep filters and flat list logic in one place for clarity and testability.*
