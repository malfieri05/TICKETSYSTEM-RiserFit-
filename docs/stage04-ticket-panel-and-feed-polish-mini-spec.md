# Stage 4: Ticket Panel and Feed Polish — Mini-Spec

## 1. Intent

Refine the **ticket panel** and **ticket feed** experience so the product feels smoother, clearer, and more premium—without changing the underlying workflow or domain rules established in Stages 1–3. This stage is **UI, interaction, and presentation only**. Goals:

- **Smoother panel interactions** — tab switching, content transitions, and layout stability.
- **Better subtask interaction UX** — completion feel, status affordances, and removal of legacy Required/Blocked complexity from the UI.
- **Cleaner ticket feed presentation** — consistent row hierarchy, status badges, progress, and metadata.
- **Better progress and state signaling** — readable, aligned progress visuals and clear completion moment.
- **Subtle premium polish** — restrained depth, typography, and motion on ticket feed and panel surfaces only.

Stage 1 visibility and feed correctness, Stage 2 workflow and completion logic, and Stage 3 comment/reply/mention behavior are **preserved**. The backend remains the single source of truth. No domain-model or API changes are in scope.

---

## 2. Problem Statement

The ticket panel and ticket feed function correctly but feel utilitarian and occasionally rough:

- **Panel tabs** (Subtasks, Comments, Ticket Submission, History) switch with little or no transition; content can jump or reflow in a jarring way.
- **Subtask completion** relies on dropdown status changes, which do not feel satisfying or direct; READY / IN_PROGRESS / DONE / SKIPPED are not clearly differentiated in the UI; legacy Required/Blocked concepts may still appear or confuse.
- **Panel header** underuses horizontal space; ticket ID is not consistently visible; there is no optional metric (e.g. ticket-type average completion time) or clear close behavior.
- **Feed rows** vary in hierarchy, status styling, progress placement, and comment count; alignment and spacing are inconsistent; time visibility is all-or-nothing.
- **Progress** presentation can feel cluttered; progress bar color and alignment are not standardized; comment count placement drifts.
- **Completion moment** — when the final subtask is completed — lacks a clear confirmation and smooth transition out of the active feed.
- **Loading/refresh** causes the feed to shift when spinners or refresh indicators appear; layout is not stable during refreshes.
- **Micro-layout** — requester, comment icon/count, spacing — is inconsistent; admin vs studio feed structure may visually drift.

This stage defines the desired behavior, interaction model, and presentation rules so the ticket feed and panel feel polished and intentional while remaining strictly presentation-layer.

---

## 3. Current UX Issues

| Area | Current Issue |
|------|----------------|
| **Panel tabs** | Switching between Subtasks, Comments, Ticket Submission, and History causes instant content swap with no transition; panel height/layout can jump; no matched-geometry or slide feel. |
| **Subtask interaction** | Status changes via dropdown only; no direct “complete” affordance; READY/IN_PROGRESS/DONE/SKIPPED not clearly differentiated; old Required/Blocked UI may still appear despite Stage 2 removal. |
| **Panel header** | Ticket ID not always visible or prominent; information hierarchy is flat; no optional metric (e.g. avg completion time); close action not clearly defined; horizontal space underused. |
| **Feed row** | Title, date, status, progress, requester, comment count lack a single clear hierarchy; status badge styling inconsistent (NEW vs IN_PROGRESS); progress bar alignment and color vary; optional time toggle not defined. |
| **Progress** | Progress bar not always green; progress count/bar not consistently centered under Progress column; comment icon/count placement inconsistent; can feel cluttered. |
| **Completion moment** | Final subtask completion does not trigger a clear confirmation; ticket may linger in active feed; no satisfying transition into completed state/history. |
| **Loading/refresh** | Refresh or loading indicators cause feed to shift or reflow; spinner placement not fixed; layout instability during refresh. |
| **Micro-layout** | Requester display and comment icon/count placement inconsistent; spacing around progress and metadata uneven; panel readability and admin-vs-studio feed structure drift. |
| **Polish** | Surfaces are flat; no systematic depth, shadows, or refined hover/press states; typography and spacing not consistently elevated. |

---

## 4. Desired Behavior

- **Panel tabs** switch with a smooth, horizontal slide–like transition; content area maintains stable height where possible; no jarring re-layout; matched-geometry feel when feasible (e.g. shared container, content slides left/right).
- **Subtask interaction** includes a clear, direct “complete” affordance (e.g. checkbox or primary action) in addition to or in place of dropdown-only flow; READY / IN_PROGRESS / DONE / SKIPPED have distinct, consistent visual treatment; no Required/Blocked UI—Stage 2 semantics (all subtasks participate in completion; no BLOCKED) are reflected cleanly.
- **Panel header** shows ticket ID prominently; information hierarchy is clear (e.g. title → ID → status → optional metric); ticket-type average completion time is displayable with an optional show/hide toggle (e.g. eye icon); close action is obvious and consistent; horizontal space is used effectively.
- **Feed row** follows a single premium presentation standard: title, created date (with optional time visibility toggle), status badge (NEW = blue, IN_PROGRESS = yellow, etc.), progress bar and counts, requester, comment count—with defined alignment and spacing rules.
- **Progress** is always a green progress bar; progress count and bar are centered under the Progress column; comment icon/count are positioned consistently; visuals are clean and readable.
- **Completion moment** offers a clear confirmation (and optional “Ticket completed?” prompt if still needed); satisfying visual removal from active feed and transition into completed state/history; no awkward lingering.
- **Loading/refresh** keeps layout stable: indicators (e.g. spinner) appear near filter controls, not in a way that shifts the feed; feed area does not jump or reflow during refresh.
- **Micro-layout** is consistent: requester shown clearly; comment icon/count placement standardized; spacing refined; panel readability improved; no admin-vs-studio structural drift in feed.
- **Premium polish** is applied only to ticket feed and panel: subtle depth, softer shadows, slightly elevated panel shell, sticky headers with light blur/glass where appropriate, smoother hover/press states, refined spacing and typography, tasteful motion—restrained and enterprise-professional.

---

## 5. Ticket Panel Interaction Model

### 5.1 Tab set

The ticket panel exposes four primary content tabs:

- **Subtasks**
- **Comments**
- **Ticket Submission** (create-time payload / form snapshot)
- **History** (audit / status and assignment history)

Switching between these tabs is a primary interaction; it must feel smooth and intentional.

### 5.2 Transition behavior

- **Matched-geometry feel (when feasible):** The content area for all four tabs should live in a **single shared container**. When the user switches tabs, the **content** (Subtasks / Comments / Ticket Submission / History) should transition as if sliding horizontally (e.g. “next” tab content enters from one side, “previous” exits to the other), or with a short crossfade, so that the **container** does not resize abruptly. The goal is to avoid the panel “jumping” or the header/footer shifting.
- **Horizontal slide / swipe-like feel:** Prefer a **horizontal slide** (left/right) for tab change: e.g. switching to “Comments” slides the Comments content in from the right and the previous tab content out to the left (or vice versa depending on tab order). Duration should be short (e.g. 200–300 ms); easing should be smooth (e.g. ease-out). This is structural interaction polish, not gratuitous animation.
- **Smooth tab/content transition:** The selected tab indicator (underline, pill, or background) should update in sync with the content transition. No double-update (tab label changes then content pops in); the transition should feel like one gesture.
- **No jarring panel re-layouts:** The panel’s overall height and width should not thrash. If different tab content has different natural height, either (a) give the content area a minimum height so the panel does not collapse, or (b) allow a smooth height change with a brief transition, but avoid instant snap. The close button and header should remain fixed (sticky) so they do not move during tab switch.

### 5.3 Constraints

- No change to **what** each tab shows (data and behavior remain as per Stages 1–3); only **how** the switch and layout behave.
- Backend remains source of truth; no new APIs required for tab behavior.

---

## 6. Subtask Interaction Model

### 6.1 Completion interaction

- **Current concern:** Dropdown-only status changes do not feel satisfying for completion.
- **Desired:** A **direct “complete” affordance** in addition to (or replacing) dropdown for the common case of marking a subtask DONE. Examples: a **checkbox** that toggles DONE, or a **primary button** (e.g. “Complete”) that sets the subtask to DONE in one action. The dropdown can remain for full state control (READY → IN_PROGRESS, DONE, SKIPPED) but should not be the only way to complete.
- **Rule:** The interaction model improves **feel** and **efficiency**; it does **not** change the underlying status rules (READY, IN_PROGRESS, DONE, SKIPPED only; no BLOCKED; resolution gate per Stage 2).

### 6.2 Status feel in the UI

- **READY** — Clearly “not started”: neutral or “available” treatment (e.g. light background, clear label). No “Required” or “Blocked” badge; Stage 2 removed those concepts.
- **IN_PROGRESS** — Clearly “in progress”: e.g. accent color (yellow/amber) or icon so it’s distinct from READY and DONE.
- **DONE** — Clearly “completed”: e.g. checkmark, strikethrough or muted text, green accent; consistent with progress bar green.
- **SKIPPED** — Clearly “skipped”: e.g. muted/gray, optional “Skipped” label or icon; distinct from DONE so analytics and scan-reading stay clear.

### 6.3 Removal of legacy complexity

- **Required/Blocked:** Stage 2 removed the required-subtask concept and BLOCKED from the domain. The UI must **not** show “Required” or “Blocked” on subtasks. Any legacy labels or filters for these must be removed so the UI reflects “all subtasks participate in completion” and “blocking is ticket-level (WAITING_ON_*).”

### 6.4 Constraints

- No new subtask statuses; no change to resolution gate logic or ticket state machine. Backend behavior is unchanged.

---

## 7. Ticket Feed Presentation Rules

### 7.1 Standard feed row structure

The ticket feed row is the primary list item for tickets. A **single, consistent** layout applies to all feed entry points (Admin Home, Department Home, Studio Home, Actionable) so there is no admin-vs-studio structural drift.

**Content hierarchy (left to right or in a defined grid):**

1. **Title** — Primary text; truncated with ellipsis if needed; one line preferred for scanability.
2. **Created date** — Secondary; format consistent (e.g. “Mar 10, 2026” or locale-equivalent). **Optional time visibility:** A user or system preference can show time (e.g. “Mar 10, 2026, 2:30 PM”); when off, date only. Toggle (e.g. in feed toolbar or settings) controls this; default can be date-only.
3. **Status badge** — One badge per ticket; styling by status:
   - **NEW** — Blue (or primary blue).
   - **TRIAGED** — Neutral (e.g. gray or soft blue).
   - **IN_PROGRESS** — Yellow/amber (distinct from NEW).
   - **WAITING_ON_REQUESTER** / **WAITING_ON_VENDOR** — Orange or amber variant.
   - **RESOLVED** — Green.
   - **CLOSED** — Muted/gray.
   Badge text should be short and consistent (e.g. “In progress”, “Waiting”, “Resolved”).
4. **Progress** — Progress bar (always green) plus count (e.g. “3/5” or “3 of 5”). Centered under or within the Progress column. Bar and count alignment: centered together; no misalignment with column header.
5. **Requester** — Display name (or email fallback); clearly visible; consistent placement (e.g. dedicated column or fixed position in row).
6. **Comment count** — Icon (e.g. comment bubble) + number; placement consistent (e.g. right side of row or in a dedicated “Comments” column). Same placement across all feeds.

### 7.2 Alignment and spacing

- **Row alignment:** All rows use the same column boundaries; alignment is consistent (e.g. title left-aligned, status center or left, progress center, requester left, comment count right or center).
- **Spacing:** Consistent padding and gap between columns; no cramped or uneven gaps. Vertical rhythm between rows should be even.

### 7.3 Progress presentation (detail)

- **Progress bar:** Always **green** (same green as DONE/subtask completion) so progress reads as “completion” at a glance.
- **Position:** Progress bar and numeric count (e.g. “3/5”) are **centered** under the Progress column (or within the progress cell).
- **Comment icon/count:** Placed consistently (e.g. same column or same relative position in every row); not overlapping progress; clean and readable.
- **Clutter avoidance:** Progress visuals should feel minimal and readable—no extra decoration that competes with the bar and count.

### 7.4 Constraints

- Feed **data** and **filtering** (visibility, status, actionable, etc.) remain per Stage 1; only **presentation** (layout, styling, hierarchy) is defined here.

---

## 8. Completion UX

### 8.1 When the final subtask is completed

Per Stage 2, the ticket becomes RESOLVED when all subtasks are DONE or SKIPPED (resolution gate). The **completion moment** in the UI should feel intentional and clear.

- **Confirmation moment:** When the user completes the last remaining subtask (e.g. marks it DONE), the UI should provide a **clear confirmation** that the ticket is now complete (e.g. a short toast or inline message: “All subtasks complete” or “Ticket ready to resolve”). This confirms the resolution gate has been satisfied without requiring the user to hunt for state.
- **Optional “Ticket completed?” prompt:** If the product still uses an explicit user step to move the ticket to RESOLVED (e.g. “Mark ticket resolved?”), that prompt should appear in a clean, non-blocking way (e.g. small modal or banner) and not feel like an error. If the backend auto-transitions to RESOLVED, the UI should reflect that immediately and show the confirmation above.
- **Satisfying removal from active feed:** Once the ticket is RESOLVED (and optionally CLOSED), it should **leave the active feed** per Stage 1 (active = not in [RESOLVED, CLOSED]). The transition should feel intentional: e.g. the row can briefly indicate “Resolved” or “Completed” before disappearing from the list, or the list can refresh and the ticket no longer appears, with no “flash” of empty space if the list is re-sorted/refetched smoothly.
- **Transition into completed state/history:** Where “completed” or “history” tickets are shown (e.g. Completed tab, History view), the ticket should appear there with the same feed row presentation rules (status = RESOLVED/CLOSED, progress = full). No awkward lingering in the **active** feed.

### 8.2 Constraints

- Must remain **compatible with Stage 2 backend completion rules** (resolution gate, state machine). No change to when RESOLVED is set or how the API behaves.

---

## 9. Loading / Refresh Behavior

### 9.1 Feed loading and updating

- **Remove clunky feed shifting:** When the feed is refreshing or loading, the **list content** (rows) should not jump, shift down, or reflow to make room for a full-width spinner or banner. Layout stability is priority.
- **Spinner placement:** Loading/spinner indicator should appear **near the filter controls** (e.g. top of the feed, next to filters or tab bar) or in a **fixed overlay** (e.g. small spinner in corner of the feed area) so that the feed row positions stay stable. Alternatively, a **skeleton row** pattern can be used so row height and position are preserved.
- **Preserve layout stability:** During refresh, existing rows can stay visible until new data replaces them (replace in place), or skeleton placeholders can hold space. Avoid “list collapses then repopulates” which causes a visible jump.

### 9.2 Panel loading

- When the ticket panel is loading (e.g. opening a ticket), the panel shell (header, tab bar) can appear with a loading state in the content area; again, avoid the panel resizing violently when content loads. A single content-area loader or skeleton is preferred over the whole panel shifting.

---

## 10. Premium Polish Layer

This section defines a **restrained, high-impact polish pass** for **ticket panel and feed surfaces only**. The goal is a more premium feel without flashy gimmicks or broad redesign.

### 10.1 Depth and surfaces

- **Subtle depth:** Use light elevation to separate feed rows from background and panel from page. Avoid flat “everything same plane” where it hurts hierarchy.
- **Layered surfaces:** Feed list on a slightly distinct surface (e.g. card or raised area); panel as a clearly elevated shell over the feed. Layers should be subtle (e.g. 1–2 elevation steps).

### 10.2 Shadows and elevation

- **Softer shadows:** Prefer soft, low-contrast shadows over hard borders for cards and panel; shadow should suggest elevation without drama.
- **Slightly elevated panel shell:** The ticket panel (drawer or modal) can have a slight elevation and soft shadow so it reads as “on top” of the feed.

### 10.3 Sticky headers and glass

- **Sticky headers:** Panel header and feed toolbar (if any) can stay fixed on scroll; content scrolls underneath.
- **Light blur/glass (where appropriate):** Optional light backdrop blur or “glass” effect on sticky panel header for separation from scrolling content—only if it fits the design system and remains subtle and professional.

### 10.4 Interaction states

- **Smoother hover/press states:** Buttons, rows, and tab targets should have clear hover and active (press) states—smooth transition (e.g. 100–150 ms), no abrupt color flip. Focus states for accessibility must remain clear.

### 10.5 Typography and spacing

- **Refined spacing and typography hierarchy:** Consistent vertical rhythm; title vs metadata vs secondary text clearly differentiated by size/weight/color. Spacing (padding, gaps) should follow a simple scale (e.g. 4/8/16/24 px) for consistency.

### 10.6 Motion

- **Tasteful motion only:** Use motion for tab transitions, completion confirmation, and optional row enter/exit; keep duration short and easing smooth. No decorative or distracting animation. Motion must not harm usability (e.g. no long delays before interaction).

### 10.7 Constraints

- **Restrained and enterprise-professional.** No flashy gimmicks; no broad redesign outside ticket feed and panel.
- Apply only to **ticket feed** and **ticket panel**; other areas (dashboard, admin settings, reporting) are out of scope.

---

## 11. Comment / Feed Micro-Layout Improvements

### 11.1 Requester

- Requester (display name or email) must be **shown clearly** in the feed row, in a consistent position (e.g. “Requester” column or fixed slot in the row).

### 11.2 Comment icon and count

- **Placement:** Comment icon and count in a **consistent** position across all feed rows (e.g. same column, same alignment). No drift between Admin vs Department vs Studio feed.
- **Readability:** Icon and number should be legible and not cramped; spacing from adjacent elements consistent.

### 11.3 Spacing and panel readability

- **Spacing:** Cleaner spacing around progress, status, and metadata in the row; consistent padding in the panel content areas (Subtasks, Comments, etc.).
- **Panel readability:** Adequate contrast and line-height in panel content; section headings (if any) clearly separated from body.

### 11.4 Admin vs studio feed structure

- **No legacy drift:** The same feed row structure and column order apply to all roles (Admin, Department, Studio) where a ticket list is shown. No separate “admin feed” vs “studio feed” layout that creates visual or structural inconsistency.

---

## 12. Panel Header Improvements

### 12.1 Ticket ID visibility

- **Ticket ID** (e.g. CUID or display ID like T-1042 if implemented) must be **visible** in the panel header. Prefer a dedicated, readable slot (e.g. next to title or in a secondary line). Copy-to-clipboard affordance (as in Stage 1) remains; placement should be obvious.

### 12.2 Information hierarchy

- **Clear hierarchy:** Title as primary; then ID, status, and optional metric in a logical order (e.g. title → ID + status on one line, or title large, metadata row below). Avoid everything same weight.

### 12.3 Ticket-type average completion time

- **Display:** When the product has “average completion time” per ticket type (or category), it can be shown in the panel header (e.g. “Avg. completion: 2.5 days” or similar). Data source and calculation are out of scope; only placement and visibility are in scope.
- **Optional show/hide:** A **toggle** (e.g. eye icon or “Show metric”) allows the user to show or hide this metric so the header is not cluttered for users who do not care. Default can be show or hide per product preference.

### 12.4 Close action

- **Clear close behavior:** The panel close control (X or “Close”) must be **obvious and consistent** (e.g. top-right of header). Behavior: closing returns to the feed or previous context without ambiguity.

### 12.5 Horizontal space

- **Better use of space:** Header should use horizontal space effectively: no large empty gaps; ID, status, and optional metric arranged in a compact but readable way; close button always accessible.

---

## 13. Risks and Edge Cases

| Risk / Edge Case | Mitigation |
|------------------|------------|
| **Tab transition feels slow** | Keep duration to 200–300 ms; use ease-out; allow preference to reduce motion if needed. |
| **Progress “always green” conflicts with status colors** | Green is for “completion progress” only; status badge uses its own palette (blue/yellow/green/gray). No overlap in meaning. |
| **Completion moment not seen** | Confirmation (toast or inline) should be visible without being blocking; optional prompt for “Mark resolved?” must be dismissible. |
| **Loading near filters obscures filters** | Spinner or skeleton should not cover filter controls; place to the side or in a small, fixed area. |
| **Premium polish looks inconsistent with rest of app** | Limit polish to feed and panel only; use design tokens so future app-wide alignment is easier. |
| **Sticky header + long content** | Ensure sticky header does not consume too much vertical space on small viewports; content area remains scrollable. |
| **Optional time toggle adds complexity** | Implement as a single preference (show time in feed: yes/no); default to date-only to avoid clutter. |

---

## 14. Verification Plan

1. **Panel tabs:** Manually switch between Subtasks, Comments, Ticket Submission, History; verify horizontal slide (or defined transition), no jarring re-layout, stable header/footer.
2. **Subtask interaction:** Mark subtasks READY → IN_PROGRESS → DONE (and SKIPPED); verify direct complete affordance, status differentiation, no Required/Blocked UI.
3. **Panel header:** Open ticket panel; verify ticket ID visible, hierarchy clear, optional metric and toggle, close action obvious, horizontal space used well.
4. **Feed row:** Check Admin, Department, and Studio feeds; verify title, date (and optional time), status badge (NEW blue, IN_PROGRESS yellow), green progress bar and count, requester, comment count—all per hierarchy and alignment rules.
5. **Progress:** Verify progress bar green, centered under Progress column; comment icon/count consistent; no clutter.
6. **Completion moment:** Complete last subtask on a ticket; verify confirmation (and optional “Ticket completed?” if applicable), ticket leaves active feed, appears in completed/history as expected.
7. **Loading/refresh:** Trigger feed refresh; verify no feed shift, spinner near filters (or stable placement), layout stable.
8. **Micro-layout:** Verify requester and comment count placement consistent; spacing and panel readability; no admin-vs-studio structural drift.
9. **Premium polish:** Verify subtle depth, soft shadows, sticky header (and optional blur), hover/press states, typography/spacing, and tasteful motion only on feed and panel; no gimmicks.

---

## 15. Acceptance Criteria

- [ ] **Panel tabs:** Switching between Subtasks, Comments, Ticket Submission, and History uses a smooth, horizontal slide–like (or defined) transition; no jarring panel re-layout; matched-geometry feel where feasible.
- [ ] **Subtask interaction:** Direct “complete” affordance (e.g. checkbox or primary action) available; READY/IN_PROGRESS/DONE/SKIPPED clearly differentiated; no Required or Blocked UI.
- [ ] **Panel header:** Ticket ID visible; clear information hierarchy; ticket-type average completion time displayable with show/hide toggle; close action clear; horizontal space used well.
- [ ] **Feed row:** Single standard presentation: title, created date (optional time toggle), status badge (NEW = blue, IN_PROGRESS = yellow, etc.), green progress bar and count (centered), requester, comment count—with defined alignment and spacing.
- [ ] **Progress:** Progress bar always green; progress count and bar centered under Progress column; comment icon/count positioned consistently; clean and readable.
- [ ] **Completion moment:** Clear confirmation when final subtask is completed; optional “Ticket completed?” prompt if applicable; satisfying removal from active feed and transition to completed/history; compatible with Stage 2 completion rules.
- [ ] **Loading/refresh:** No clunky feed shifting; loading indicator near filter controls (or stable placement); layout stable during refresh.
- [ ] **Micro-layout:** Requester clear; comment icon/count placement consistent; spacing and panel readability improved; no admin-vs-studio feed structure drift.
- [ ] **Premium polish:** Restrained depth, soft shadows, elevated panel shell, sticky headers (optional blur), smoother hover/press states, refined spacing/typography, tasteful motion—only on ticket feed and panel; enterprise-professional; no flashy gimmicks.
- [ ] **Preservation:** Stage 1 visibility and feed correctness, Stage 2 workflow and completion logic, and Stage 3 comment/reply/mention behavior unchanged.

---

## 16. Out of Scope

This stage does **not** include:

- **Dashboard or reporting redesign** — No changes to dashboard layout, KPI cards, or reporting pages.
- **Admin settings cleanup** — No changes to admin panels, user management, categories, or workflow template UI beyond any already in scope elsewhere.
- **Deep analytics work** — No new analytics architecture, new charts, or analytics-specific UI.
- **Major comment system redesign** — Comment/reply/mention behavior and structure remain as Stage 3; only micro-layout and placement (e.g. comment count in feed row, panel readability) are in scope.
- **Broad app-wide visual redesign** — Polish and presentation rules apply **only** to the ticket feed and ticket panel (detail/drawer). Login, global nav, reporting, admin, and other surfaces are out of scope unless a small, consistent touch (e.g. shared button style) is needed to avoid obvious mismatch.

---

*Stage 4 focuses exclusively on ticket panel and ticket feed polish. Domain rules from Stages 1–3 are preserved; the backend remains the source of truth.*
