# Stage 4: Ticket Panel and Feed Polish — Implementation Plan

This document translates the Stage 4 mini-spec (`docs/stage04-ticket-panel-and-feed-polish-mini-spec.md`) into a concrete engineering implementation plan. It does **not** prescribe code; it describes what will change, where, and in what order. A separate coding phase will implement these changes.

---

## 1. Ticket Feed Row Layout Standardization

### 1.1 Goal

All ticket feed rows (Admin tickets list, Department/Inbox, Studio Portal, Actionable) must use a **single shared grid layout** so presentation is consistent and there is no admin-vs-studio structural drift.

### 1.2 Conceptual structure

Standard column order:

| **Title** | **Created** | **Status** | **Progress** | **Requester** | **Comments** |
|-----------|-------------|------------|-------------|--------------|--------------|

- **ID:** Per Stage 1, ticket ID remains visible; it can be the **first column** (ID | Title | Created | Status | Progress | Requester | Comments) so the grid has seven columns where ID is optional for display but recommended for scanability and copy.
- **Title:** Primary text; one line, truncate with ellipsis.
- **Created:** Date (and optionally time if user preference is on). Format consistent (e.g. `MMM d, yyyy`; with time: `MMM d, yyyy, h:mm a`).
- **Status:** Single status badge. Styling: NEW = blue, IN_PROGRESS = yellow/amber, WAITING_* = orange, RESOLVED/CLOSED = green/muted per mini-spec.
- **Progress:** Progress bar (always green) + count (e.g. `3/5`). **Centered** within the Progress column; no comment icon in this cell.
- **Requester:** Display name (or email fallback); dedicated column.
- **Comments:** Icon (e.g. MessageCircle) + count; dedicated column; consistent placement (e.g. right side of row).

Priority may remain as an additional column where the product requires it (e.g. ID | Title | Created | Status | Priority | Progress | Requester | Comments); the **minimum** standard set is Title, Created, Status, Progress, Requester, Comments, with ID recommended as first column.

### 1.3 Existing feed components to update

- **`apps/web/src/components/tickets/TicketRow.tsx`**
  - **`TicketTableRow`** (used on `/tickets` and `/inbox`): Currently renders ID, Title, Status, Priority, Created, then a single cell that mixes **comment count + progress count + progress bar**, then Requester. Changes: (1) Reorder columns to match the standard grid (ID, Title, Created, Status, Priority if kept, Progress, Requester, Comments). (2) Split Progress and Comments into **separate columns**. (3) Progress cell: only progress count + bar, **centered**; progress bar **always green**. (4) Comments cell: icon + count only, consistent alignment.
  - **`PortalTicketTableRow`** (used on `/portal`): **Must adopt the same shared feed grid layout** used by the other feeds. Currently it has a different layout (ID, topic, created, title+requester+comments combined, studio, status, priority, updatedAt) and no progress bar. Standardization requires: Portal uses the **same grid structure** (same column order: ID, Title, Created, Status, Progress, Requester, Comments; Priority optional) and **preferably the same row component** as tickets and inbox. Portal-specific columns (e.g. Topic, Studio) may be added only if they do not break the shared structure; the canonical columns must be present and aligned. This avoids layout drift across all ticket list surfaces.

- **Pages that render the table and headers:**
  - **`apps/web/src/app/(app)/tickets/page.tsx`** — Uses `CANONICAL_HEADERS` and `TicketTableRow`. Update `CANONICAL_HEADERS` to match the chosen grid (e.g. ID, Title, Created, Status, Progress, Requester, Comments; add Priority if kept). Ensure `<th>` order and count match the row cells.
  - **`apps/web/src/app/(app)/inbox/page.tsx`** — Same; uses same `CANONICAL_HEADERS` and `TicketTableRow`. Must use the **same** header array and row component so the feed is identical.
  - **`apps/web/src/app/(app)/portal/page.tsx`** — Must use the **same shared grid and same row component** (or same grid structure with the shared row component). Replace current `PortalTicketTableRow` usage and custom headers with the canonical headers and shared row; add any Portal-only columns only within the shared structure.

### 1.4 Grid layout implementation

- Use a **single source of truth** for column definitions: e.g. a shared constant or config (e.g. `FEED_GRID_COLUMNS` or `CANONICAL_FEED_HEADERS`) used by all three entry points (tickets, inbox, portal). Each page imports the same headers and passes the same props shape to the row component.
- **Layout:** CSS table layout (`<table>`) is already in use; keep it. Define column widths where needed (e.g. Title flexible, Created/Status fixed width, Progress fixed width and centered content, Comments fixed width) so alignment is consistent. Use `text-align: center` for Progress and optionally for Comments.
- **Spacing:** Use the existing `POLISH_CLASS.cellPadding` (e.g. `px-4 py-3`) for all cells so vertical rhythm and horizontal gaps are even. No extra margin that would misalign columns across pages.

### 1.5 Progress bar and comment count alignment

- **Progress column:** In `TicketTableRow`, the Progress cell must contain only: (1) numeric count (e.g. `3/5`), (2) green progress bar. Both should be **centered** within the cell (e.g. `flex justify-center items-center gap-2`). Progress bar color: always green (e.g. `#16a34a` or theme green); no accent color for in-progress.
- **Comments column:** Icon + count in a dedicated cell; same alignment (e.g. right-aligned or centered) on every feed. Do not place comment icon/count inside the Progress cell.

### 1.6 Optional time visibility toggle

- **Preference:** Add a user- or page-level preference for “Show time in feed” (date only vs date + time). Store in localStorage or context; default date-only. When on, format Created as `MMM d, yyyy, h:mm a`; when off, `MMM d, yyyy`. The toggle control can live in the feed toolbar (e.g. near filters on `/tickets` and `/inbox`) or in a shared feed options component. Portal can use the same preference if it shows a created column.

### 1.7 Files and components involved

| Item | Role |
|------|------|
| `apps/web/src/components/tickets/TicketRow.tsx` | Single place for feed row UI; shared row component used by all feeds (tickets, inbox, portal). |
| `apps/web/src/app/(app)/tickets/page.tsx` | Table wrapper, headers, filter bar; use shared headers and row. |
| `apps/web/src/app/(app)/inbox/page.tsx` | Same; shared headers and row. |
| `apps/web/src/app/(app)/portal/page.tsx` | Use same shared grid and same row component; no separate Portal row layout. |
| Shared constant (e.g. in `TicketRow.tsx` or `lib/feedGrid.ts`) | Canonical column keys and labels for headers. |
| `apps/web/src/components/ui/Badge.tsx` | Already has `StatusBadge`; ensure status colors match spec (NEW blue, IN_PROGRESS yellow, etc.). |

---

## 2. Ticket Panel Tab Transition Implementation

### 2.1 Goal

Switching between **Subtasks**, **Comments**, **Ticket Submission**, and **History** in the ticket panel should feel smooth: horizontal slide transition (~200–300 ms), no layout jump, panel header fixed.

### 2.2 Tabs in scope

- Subtasks  
- Comments  
- Ticket Submission  
- History  

Both the **drawer** (TicketDrawer) and the **full-page** ticket detail (`/tickets/[id]`) expose these four tabs and must behave consistently.

### 2.3 Shared container structure

- **Single scrollable content area:** All four tab contents should live inside **one** scrollable container (e.g. one `<div className="flex-1 overflow-y-auto">`). Do not mount/unmount four separate scroll regions per tab.
- **Content placement:** Use a **single content wrapper** that holds the four tab panels. Only one panel is “visible” at a time; the others are either off-screen (e.g. translated horizontally) or hidden (e.g. `visibility: hidden` + `position: absolute`) so that layout height is driven by the **active** tab content but the container does not collapse when switching (e.g. min-height on the wrapper or use a fixed-height viewport for the content area).
- **Prevent layout jumping:** Give the content wrapper a **minimum height** (e.g. `min-height: 300px` or similar) so that when switching from a tall tab (e.g. Comments) to a short one (e.g. History with one line), the panel does not snap. Alternatively, keep all four tab contents in the DOM and use horizontal translation so they sit side-by-side in a row; the viewport shows one at a time. That way the wrapper width is 4× panel width and the visible part is scrolled or transformed into view—this preserves consistent height if all tabs are given the same min-height.

### 2.4 Horizontal slide transition

- **Mechanism:** When the user selects a different tab, the **content** should slide horizontally: e.g. “next” tab content enters from the right, “previous” exits to the left (or vice versa depending on tab order). Implement by:
  - **Option A:** Four panels in a row inside a horizontal scroll/overflow container; `transform: translateX(...)` or `scrollLeft` is updated so the active panel is in view; transition with `transition: transform 200ms ease-out` (or similar).
  - **Option B:** Single content area with one panel visible; on tab change, animate the outgoing panel (e.g. translate left) and the incoming panel (e.g. from right to center) with CSS transitions or a small animation library. Incoming content is mounted or moved into view; outgoing is moved out and then unmounted or hidden.
- **Duration:** 200–300 ms. **Easing:** ease-out (or equivalent).
- **Tab order for direction:** Define tab order as Subtasks → Comments → Submission → History. When moving “right” in that order (e.g. Subtasks → Comments), new content slides in from the right; when moving “left,” from the left. Direction can be derived from previous and next `activeTab` index.

### 2.5 Panel header remains fixed

- The **panel header** (title, ticket ID, metadata, optional metric, close button) and the **tab bar** must be **sticky** or in a fixed top section so they do not scroll with content. Structure:
  - **Outer:** `flex flex-col h-full overflow-hidden`
  - **Header block:** `shrink-0` (no scroll)
  - **Tab bar:** `shrink-0` (no scroll)
  - **Content area:** `flex-1 overflow-y-auto` (or the sliding viewport above) — only this part scrolls or slides.

Current `TicketDrawer` and `tickets/[id]/page.tsx` already have a top bar and tab bar; ensure they are both `shrink-0` and the content area is the only scrollable/sliding region.

### 2.6 Files and components involved

| Item | Role |
|------|------|
| `apps/web/src/components/tickets/TicketDrawer.tsx` | Drawer panel: header, tab bar, and tab content container; add slide wrapper and transition logic. |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Full-page ticket detail: same tab set and content; add same shared container and slide behavior. |
| Optional: `apps/web/src/components/tickets/TicketPanelTabs.tsx` (or similar) | Reusable tab content container + slide logic so drawer and page share one implementation. |

---

## 3. Subtask Interaction Improvements

### 3.1 Stage 4 rule (implementation plan constraint)

**Subtask completion remains dropdown-based. Status is changed only via the existing status dropdown.** **No checkbox or additional completion control (e.g. no “Complete” button) should be introduced in Stage 4.** The improvement is **visual feedback** when a subtask is marked DONE (or SKIPPED) via the dropdown, and immediate progress refresh.

### 3.2 Completion behavior

- **When the user selects DONE** (or SKIPPED) from the status dropdown:
  - The **subtask title text** becomes **crossed out** (e.g. `text-decoration: line-through`) and uses a **muted** color (e.g. `var(--color-text-muted)`).
  - The UI **visually indicates completion** (e.g. existing `SubtaskStatusBadge` for DONE/SKIPPED; no new interactive controls).
  - **Progress** (count and bar) **updates immediately** (optimistic update or refetch after mutation; both paths already exist in drawer and detail page; ensure list and panel both reflect new completed/total counts).

### 3.3 Crossed-out state

- **Render rule:** For any subtask with `status === 'DONE'` or `status === 'SKIPPED'`, apply:
  - **Title:** `line-through` and muted color.
  - **Container:** Optional subtle background or border change to distinguish from READY/IN_PROGRESS (e.g. slightly muted background). Do not add “Required” or “Blocked” labels; Stage 2 removed those.
- **Where styling lives:** In the component that renders each subtask row:
  - **TicketDrawer:** The block that maps `ticket.subtasks.map((s) => ...)` — the `<p>` that shows `s.title` already has conditional `line-through` for DONE; extend to **SKIPPED** and ensure the same class/style is applied (e.g. `s.status === 'DONE' || s.status === 'SKIPPED'`).
  - **tickets/[id]/page.tsx:** The block that maps `(subtasksList ?? ticket.subtasks).map((subtask) => ...)` — same condition for strikethrough and muted color for DONE and SKIPPED.

### 3.4 Components that manage the subtask list

- **`apps/web/src/components/tickets/TicketDrawer.tsx`** — Renders subtasks in the “Subtasks” tab; contains the status dropdown and progress header. Ensure DONE and SKIPPED both get strikethrough; ensure progress counts **include SKIPPED** as complete (already done in backend; frontend should use same rule: done = DONE + SKIPPED).
- **`apps/web/src/app/(app)/tickets/[id]/page.tsx`** — Same: subtask list, status dropdown, progress block. Same strikethrough and progress rules.
- **`apps/web/src/components/ui/Badge.tsx`** — `SubtaskStatusBadge`; already has styles for READY, IN_PROGRESS, DONE, SKIPPED. No BLOCKED or Required; leave as is. Ensure READY and IN_PROGRESS are visually distinct (neutral vs amber/yellow).

### 3.5 Progress refresh

- After `subtasksApi.update(..., { status })` (or equivalent), the mutation’s `onSuccess` / `onSettled` already invalidates `['ticket', ticketId]` and `invalidateTicketLists(qc)`. Ensure:
  - **Optimistic update:** If used, the local state for that ticket’s subtasks and progress (e.g. `done of total`) updates immediately so the user sees the new count and bar without waiting for refetch.
  - **Panel progress block:** The “X of Y complete” and progress bar in the panel recalc from the same subtask list (DONE + SKIPPED count). No separate progress state; derive from `ticket.subtasks` (or list query) so it stays in sync.

### 3.6 Files involved

| Item | Role |
|------|------|
| `apps/web/src/components/tickets/TicketDrawer.tsx` | Subtask list render; DONE/SKIPPED strikethrough; progress derivation. |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Same. Remove any “Blocked by dependency” or Required wording if still present; keep LOCKED treatment only. |
| `apps/web/src/components/ui/Badge.tsx` | SubtaskStatusBadge; no new controls. |

---

## 4. Panel Header Improvements

### 4.1 Goals

- Ticket ID always visible.  
- Clear hierarchy (title → metadata).  
- Optional ticket-type average completion time with show/hide toggle.  
- Clear close action.  
- Better use of horizontal space.

### 4.2 Ticket ID visibility

- **Drawer:** Currently the ticket ID appears as a small “Ticket #xxxx” copy button below the title. Change so that the **ticket ID is always visible** in the header block (e.g. first line or second line, not buried). For example: first row = title; second row = ID (with copy) + status + optional metric. Or: left = title + ID; right = close. Ensure the ID is readable at a glance (e.g. first 8 chars of CUID or full ID in monospace).

- **Full-page detail:** Same; ensure ticket ID is in the top header block (e.g. next to or below title), with copy affordance.

### 4.3 Information hierarchy

- **Primary:** Ticket title (largest, bold).  
- **Secondary:** Ticket ID, status, created date, requester (e.g. “Created … · Requested by …”).  
- **Tertiary:** Location (studio/market), progress summary (“Progress X/Y”), optional avg completion time.  
Use type size and color (e.g. `POLISH_THEME.metaSecondary`, `metaDim`) to create clear hierarchy; avoid everything same weight.

### 4.4 Optional ticket-type average completion time

- **Data:** If the backend or an existing API exposes “average completion time” per ticket type/category (e.g. from workflow analytics), the header can display it (e.g. “Avg. completion: 2.5 days”). If no API exists, this can be a placeholder or skipped until data is available; the **UI slot and toggle** are still implementable.
- **Placement:** One line in the header (e.g. next to or below progress), in a muted style.
- **Show/hide toggle:** An **eye icon** (or “Show metric” / “Hide metric”) toggles visibility of this metric. State can be localStorage or component state. Default can be hidden to reduce clutter.

### 4.5 Close action

- **Drawer:** Close (X) button must be **obvious** (e.g. top-right of the first header bar). Current implementation already has a top bar with X; ensure it is clearly visible and has a hover state. No other primary action competes with it in the same area.
- **Full-page:** “Back” or “Close” (e.g. to return to list) should be clearly visible (e.g. ArrowLeft or X in header). Same clarity as drawer.

### 4.6 Horizontal space

- Use a **flex** or **grid** layout for the header so that title, ID, status, progress, and optional metric sit in a compact row (or two rows) without large empty gaps. Right-align close and optional actions; left-align title and metadata.

### 4.7 Components responsible

| Item | Role |
|------|------|
| `apps/web/src/components/tickets/TicketDrawer.tsx` | Drawer header block: title, ID, created, requester, progress, optional metric + toggle, close. |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Full-page header: same hierarchy, back/close, optional metric + toggle. |

---

## 5. Progress Display Standardization

### 5.1 Rules

- Progress bar is **always green** (no accent color for in-progress).  
- Progress count and bar are **centered** under (or within) the **Progress** column in the feed.  
- Progress updates **immediately** when subtasks change (optimistic or refetch).  
- Progress visuals are **clean and minimal** (no extra decoration).

### 5.2 Where progress is rendered

- **Feed row:** `TicketRow.tsx` → `TicketTableRow`. The Progress **cell** should contain only: (1) text “X / Y” (or “X of Y”), (2) green progress bar. Both centered in the cell. Bar color: e.g. `#16a34a` or `var(--color-success)` if defined; same for 0% and 100%.
- **Panel (drawer):** `TicketDrawer.tsx` — “Subtask Progress” block inside the Subtasks tab. Bar is already green; ensure it uses the same green token and that **SKIPPED** is included in the “done” count (e.g. `done = DONE + SKIPPED`).
- **Panel (full-page):** `tickets/[id]/page.tsx` — “Workflow Progress” block. Same: always green bar; done = DONE + SKIPPED; centered layout.

### 5.3 Styling location

- **Feed:** In `TicketRow.tsx`, set the progress bar `background` to a single green value (no conditional accent). Use a shared constant or theme token (e.g. in `polish.ts` or `globals.css`) for “progress green” so feed and panel match.
- **Panel:** Already green; ensure the same token or hex value. Remove any gradient if it distracts; a flat green is sufficient.

### 5.4 Components involved

| Item | Role |
|------|------|
| `apps/web/src/components/tickets/TicketRow.tsx` | Feed progress cell: green bar + count, centered. |
| `apps/web/src/components/tickets/TicketDrawer.tsx` | Panel progress block: green bar, done/total, SKIPPED included. |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Same panel progress block. |
| `apps/web/src/lib/polish.ts` or theme | Optional: `progressGreen` or `--color-progress` for reuse. |

---

## 6. Completion Moment UX

### 6.1 When the final subtask is marked DONE

- **Backend:** Stage 2 rules unchanged. The ticket becomes RESOLVED when all subtasks are DONE or SKIPPED (resolution gate). No frontend change to that logic.
- **Frontend behavior:**
  1. **Confirmation toast:** When the user sets a subtask to DONE (or SKIPPED) and that action causes **all** subtasks to be complete (done count === total), trigger a **toast** from the ticket panel (e.g. “All subtasks complete” or “Ticket ready to resolve”). The toast should be short-lived (e.g. 3–5 seconds) and non-blocking. Implement by: after the subtask status mutation succeeds, check (client-side) if `done === total`; if so, show the toast. Use the app’s existing toast mechanism if one exists, or a small inline toast component limited to the ticket panel/detail area.
  2. **Ticket leaving active feed:** Once the ticket is RESOLVED (backend may auto-transition), the **list** query (e.g. `useTicketListQuery` with `statusGroup: 'active'`) will no longer return this ticket. Ensure that after the mutation, **invalidateTicketLists** (or equivalent) is called so the feed refetches. The ticket will then disappear from the active list on next load; no extra “removal” animation required unless the product adds one.
  3. **Feed refresh:** Refetch or invalidate the ticket list so the UI shows the updated set. Avoid a full-page reload; use React Query invalidation so the list updates in place and the drawer closes or the user is redirected if they were on the detail page.
  4. **Completed / history views:** Tickets that are RESOLVED/CLOSED appear in the “Completed” tab or history view; they use the **same** feed row presentation (same grid, status badge, progress full). No special “completion” animation for the row; consistency with the rest of the feed is enough.

### 6.2 Optional “Ticket completed?” prompt

- If the product still wants an explicit step like “Mark ticket resolved?” after all subtasks are done, that can be a **small modal or banner** (e.g. “All subtasks complete. Mark ticket as resolved?” with [Resolve] [Later]). This is optional; the implementation plan leaves it to product. If implemented, it should be non-blocking and dismissible.

### 6.3 Files involved

| Item | Role |
|------|------|
| `apps/web/src/components/tickets/TicketDrawer.tsx` | After subtask mutation, if done === total → show toast; invalidate list. |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Same. |
| Toast component / context | If not present, add a minimal toast (e.g. panel-level or app-level) for this message. |
| `apps/web/src/lib/api.ts` or list hook | Ensure `invalidateTicketLists` is called on subtask update so feed refetches. |

---

## 7. Loading / Refresh Stability Improvements

### 7.1 Goals

- **No feed shifting** when a refresh or loading indicator appears.  
- **Spinner placement** near filter controls (or in a fixed position), not inside the table in a way that pushes rows down.  
- **Layout stability** during updates (skeleton rows or overlay spinner; existing rows stay in place until replaced).

### 7.2 Current behavior

- On `/tickets`, when `isFetching && tickets.length > 0`, a “Fetching…” bar with spinner is rendered **inside** the table wrapper, **above** the `<thead>`, which can cause the table to shift (the bar takes vertical space).  
- On initial load, skeleton rows are shown; column count in `TicketsTableSkeletonRows` may not match the final grid (skeleton currently has 4 `<td>`s; table has 7 headers). Fix skeleton to match standardized column count.

### 7.3 Spinner placement

- **Preferred:** Place the loading indicator **near the filter controls** (e.g. in the same row as search and filters, right-aligned) or in a **fixed** strip above the table that does not change height: e.g. a thin bar with “Updating…” and spinner, with **fixed height** (e.g. 32px) so the table below does not jump. When not loading, the bar is either hidden or collapses to zero height without reflow (e.g. reserve the space always, or use overlay).
- **Alternative:** **Overlay** a small spinner on the corner of the feed container (e.g. top-right) so the table content does not move.  
- **Avoid:** Inserting a full-width “Fetching…” row that pushes the table body down.

### 7.4 Skeleton rows

- **TicketsTableSkeletonRows:** Update to render the **same number of columns** as the standardized grid (e.g. 7 or 8). Each row can have one skeleton bar per column (or a single full-width bar with correct colspan) so that when switching from skeleton to real rows, **column boundaries align** and there is no horizontal jump.
- **Inbox:** Same table and skeleton; same column count.  
- **Portal:** Portal table uses the same shared grid; update its skeleton to match the same column count.

### 7.5 Preserve layout during refresh

- When **refetching** (e.g. `isFetching` true but `tickets.length > 0`), keep showing **existing rows** until the new data arrives, then replace in place. Do not clear the table and show a spinner in the body; that causes a visible collapse. Optionally show a subtle “Updating…” near filters or in the fixed strip above, as above.

### 7.6 Files involved

| Item | Role |
|------|------|
| `apps/web/src/app/(app)/tickets/page.tsx` | Move or fix loading indicator; ensure fixed placement; skeleton column count. |
| `apps/web/src/app/(app)/inbox/page.tsx` | Same if it has its own loading strip; skeleton column count. |
| `apps/web/src/components/inbox/ListSkeletons.tsx` | `TicketsTableSkeletonRows`: match column count to standardized grid. |

---

## 8. Premium Polish Layer

### 8.1 Scope

Apply **restrained** polish **only** to:
- Ticket **feed** (list container and rows), and  
- Ticket **panel** (drawer and full-page detail).

No changes to dashboard, reporting, admin settings, or other app surfaces.

### 8.2 Elements to apply

- **Subtle elevation and depth:** Feed list container and panel shell use a light elevation (e.g. `box-shadow` from `polish.ts` or theme). One level for the list card, one for the panel so they feel layered.
- **Softer shadows:** Prefer soft, low-contrast shadows (e.g. `0 1px 3px rgba(0,0,0,0.08)` for light theme) so surfaces are distinct without heavy borders.
- **Slightly elevated panel shell:** Drawer and full-page panel: slightly stronger shadow or border so the panel reads as “on top” of the feed.
- **Sticky headers:** Panel header and tab bar stay fixed on scroll; content scrolls underneath. Optional: **light backdrop blur** or “glass” on the sticky header for separation (only if it fits the design system and stays subtle).
- **Smoother hover and press states:** Buttons, table rows, and tab buttons: transition on background/color (e.g. 100–150 ms ease). Ensure focus states remain for accessibility.
- **Refined spacing and typography:** Use a consistent spacing scale (e.g. 4/8/16/24 px) in feed and panel; title vs metadata vs secondary text differentiated by size and color. Reuse `POLISH_CLASS` and `POLISH_THEME` where possible.

### 8.3 Constraints

- **Restrained and enterprise-professional.** No flashy animation (e.g. no decorative motion). Tab transition is the only notable motion; keep it short.  
- **No broad redesign** outside ticket feed and panel.

### 8.4 Where to implement

- **`apps/web/src/lib/polish.ts`** — Add or adjust tokens for shadow, elevation, and optional blur.  
- **`apps/web/src/components/tickets/TicketRow.tsx`** — Row hover/active and border; use theme tokens.  
- **`apps/web/src/components/tickets/TicketDrawer.tsx`** — Panel shell shadow, header bar, tab bar; sticky and optional blur.  
- **`apps/web/src/app/(app)/tickets/[id]/page.tsx`** — Same for full-page panel.  
- **`apps/web/src/app/(app)/tickets/page.tsx`** and **inbox/page.tsx** — List container shadow and spacing; use shared tokens.  
- **`apps/web/src/app/globals.css`** or theme — If using CSS variables for shadows (e.g. `--shadow-raised`), ensure they are defined and used by feed and panel only where appropriate.

---

## 9. Implementation Order

Recommended order for implementation:

1. **Feed row layout standardization** — Define shared grid, update `TicketRow.tsx` (columns, Progress vs Comments split, green bar, alignment). Update tickets, inbox, and portal pages to use same headers and row. Optional time toggle. Establishes the baseline for all feeds.
2. **Panel tab transition implementation** — Add shared content container and horizontal slide (200–300 ms) in `TicketDrawer` and `tickets/[id]/page.tsx`. Fix sticky header and tab bar. Prevents jarring tab switches.
3. **Subtask completion visual behavior** — DONE/SKIPPED strikethrough and muted style in both panel locations; ensure progress includes SKIPPED; no new controls. Improves completion feel without changing workflow.
4. **Panel header improvements** — Ticket ID always visible; hierarchy; optional avg completion time + show/hide toggle; clear close; horizontal layout. Improves scanability and clarity.
5. **Progress display standardization** — Green bar everywhere; centered in Progress column; same token in feed and panel; clean and minimal.
6. **Completion toast behavior** — On last subtask DONE, show toast; invalidate list; ensure ticket leaves active feed and appears in completed view. Completion moment UX.
7. **Loading / refresh stabilization** — Spinner near filters or fixed strip; skeleton column count; no feed shift during refresh.
8. **Premium polish layer** — Shadows, elevation, sticky header, hover/press transitions, spacing/typography on feed and panel only. Final visual pass.

---

## 10. Verification Checklist

After implementation, verify the following. Use this list to confirm the stage is complete and that Stages 1–3 behavior is preserved.

### Feed and grid

- [ ] **Shared grid:** All feeds (Admin tickets, Inbox, Portal) use the same column order and the same row component. Portal uses the same shared feed grid layout; no separate Portal row layout. No structural drift between admin and studio views.
- [ ] **Columns:** Title, Created, Status, Progress, Requester, Comments are present and in the agreed order; ID as first column where used. Progress and Comments are separate columns.
- [ ] **Progress:** Progress bar is always green; count and bar are centered in the Progress column. Comment icon/count are in the Comments column only.
- [ ] **Status badges:** NEW = blue, IN_PROGRESS = yellow/amber, others per spec. Consistent across feeds.
- [ ] **Optional time:** Toggle shows/hides time in Created column; default date-only.

### Panel tabs

- [ ] **Tab transition:** Switching between Subtasks, Comments, Ticket Submission, and History uses a horizontal slide (~200–300 ms); no instant swap.
- [ ] **No layout jump:** Panel content area does not collapse or snap when changing tabs; header and tab bar stay fixed.
- [ ] **Both surfaces:** Behavior is the same in TicketDrawer and full-page ticket detail.

### Subtasks

- [ ] **DONE/SKIPPED:** When status is DONE or SKIPPED, subtask title is crossed out and muted. No Required or Blocked labels.
- [ ] **Progress:** Progress count and bar update immediately after status change; SKIPPED counts as complete.
- [ ] **Dropdown only:** No new checkbox or “Complete” button; status change is via dropdown only.

### Panel header

- [ ] **Ticket ID:** Visible in the header (drawer and full-page); copy affordance works.
- [ ] **Hierarchy:** Title primary; metadata (ID, status, created, requester) secondary; optional metric tertiary.
- [ ] **Optional metric:** Avg completion time (if implemented) has show/hide toggle (e.g. eye icon).
- [ ] **Close:** Close (or back) action is obvious and consistent.

### Progress

- [ ] **Green only:** Feed and panel progress bars use green only (no accent for in-progress).
- [ ] **Centered:** Feed progress cell content is centered under Progress column.
- [ ] **Minimal:** No extra decoration; clean and readable.

### Completion moment

- [ ] **Toast:** When the last subtask is marked DONE (or SKIPPED) and all are complete, a confirmation toast appears (e.g. “All subtasks complete”).
- [ ] **Feed update:** Ticket disappears from active feed after list invalidation/refetch; appears in Completed tab or history with same row presentation.
- [ ] **Backend unchanged:** Stage 2 resolution gate and state machine behavior unchanged.

### Loading / refresh

- [ ] **No shift:** Loading indicator does not push feed rows down; it is near filters or in a fixed strip/overlay.
- [ ] **Skeleton:** Skeleton row column count matches the standardized grid.
- [ ] **Stability:** During refetch, existing rows remain visible until replaced; no collapse then repopulate.

### Polish

- [ ] **Elevation/shadows:** Feed list and panel have subtle depth; panel slightly elevated.
- [ ] **Sticky header:** Panel header and tab bar stay fixed on scroll.
- [ ] **Hover/press:** Buttons and rows have smooth transition (100–150 ms); focus states intact.
- [ ] **Restrained:** No flashy animation; only tab slide and subtle transitions. Polish limited to feed and panel.

### Regressions

- [ ] **Stage 1:** Visibility and feed correctness unchanged; canonical feed query and filters still apply; ticket ID still in list and header.
- [ ] **Stage 2:** Workflow and completion logic unchanged; no BLOCKED or Required in UI; progress from backend.
- [ ] **Stage 3:** Comment/reply/mention behavior unchanged; thread shape and notification behavior intact.

---

*End of Stage 4 Implementation Plan. Proceed to implementation only after review and approval; do not implement code in the planning phase.*
