# Stage 27: Ticket UI Polish — Mini-Spec

## 1. Intent

- Elevate the ticket system’s **visual coherence, hierarchy, and finish** so it feels premium and professional.
- Apply a **focused UI polish pass** across ticket feeds, detail, drawer, and portal without changing product behavior or architecture.
- Establish consistent spacing, typography, density, and surface treatment so the app feels intentional and cohesive before adding real-time or live-update features.

## 2. Problem Statement

The system is functionally strong (visibility, feed performance, policy layer, unified inbox/portal) but the UI still has:

- **Inconsistent visual hierarchy**: mixed use of inline styles, hex tokens, and Tailwind; section separation and header/meta treatment vary by page.
- **Uneven density and spacing**: table vs card layouts differ in padding and rhythm; list rows, filters, and empty states are not aligned to a shared system.
- **Polish gaps**: hover/active states and click affordance are inconsistent; loading skeletons and empty states feel utilitarian rather than intentional.
- **Detail/drawer friction**: subtask and comment sections could be easier to scan; progress and actions could be clearer without adding complexity.

These are **refinement** issues: the structure is right, but the finish does not yet feel premium or fully cohesive.

## 3. Scope

**In scope**

- **Surfaces**
  - `/tickets` (list, filters, table, empty state, pagination)
  - `/inbox` (InboxLayout, folders, list, empty state, pagination)
  - `/portal` (tabs my/studio/dashboard, filters, tables, stat cards, recent activity)
  - Shared **InboxLayout** (header, description, folders, list container, fetching indicator, skeletons)
  - **TicketDrawer** (header, tabs, subtasks, comments, submission, history)
  - **Ticket detail** `/tickets/[id]` (back, header panel, tabs, subtasks, comments, submission, history)
  - Sidebar/nav only where it affects overall polish consistency (e.g. active state, spacing)

- **Focus areas**
  - Visual hierarchy (spacing, typography, density, section separation, header/meta consistency)
  - Ticket feed/list polish (row spacing, metadata layout, badges/progress balance, table vs card consistency, hover/click affordance, empty/skeleton polish)
  - Drawer and detail polish (sticky subtask header, subtask/comment readability, tab hierarchy, progress placement, action area)
  - Portal/dashboard polish (consistency with inbox, tabs, filters, stat cards)
  - Design depth (subtle shadows/borders, hover/active states, intentional loading/empty states)

**Out of scope**

- Product or behavior changes unless required for polish (e.g. clearer empty-state copy).
- Architecture or data-model changes.
- New features or real-time/live-update work.
- Heavy animation frameworks or flashy effects.
- Full redesign or new design system.

## 4. Current UI Surfaces Involved

- **Global list** (`/tickets`): Header + view-purpose copy strip + Active/Completed tabs + filters bar + table (TicketTableRow) + pagination; list container has rounded card, border `#2a2a2a`, background `#1a1a1a`.
- **Inbox** (`/inbox`): Header + InboxLayout (title, description, vertical/horizontal folders, filters slot, list container with optional “Fetching…” bar, empty state or ticket list, pagination); inbox uses card-style rows (buttons) with border-top separation.
- **Portal** (`/portal`): Header + tab-driven content (my / studio / dashboard). My and studio use InboxLayout with table + PortalTicketTableRow; dashboard uses stat cards (panel style), location filter chips, and recent-activity list. Stat cards use `panel` object, teal/amber/green accents.
- **InboxLayout**: Max-width content area, local h2 + description, folder strip (vertical nav or horizontal chips), filters slot, single list container (rounded, bordered), optional fetching bar, initialSkeleton or spinner, emptyState or ticketList + pagination.
- **TicketDrawer**: Fixed right-side panel, close button, ticket header (title, created, requester, location, progress, ticket #), pill-style tab bar (subtasks, comments, submission, history), scrollable tab content; panels use `#1a1a1a` / `#252525` borders; comment avatars, subtask progress bar, add-subtask/compose areas.
- **Ticket detail** (`/tickets/[id]`): Back button, single header panel (title, created, requester, location, progress, ticket #), underline tab nav (subtasks, comments, submission, history), same tab content patterns as drawer; `panel` and `panelSection` style objects.
- **Shared tokens** (from code comments): Tier 1 `#f0f0f0`, Tier 2 `#aaaaaa`, Tier 3 `#666666`; surfaces `#141414`, `#111111`, `#1e1e1e`; teal accent `#14b8a6`. In practice, many inline hex values are used (e.g. `#888888`, `#555555`, `#222222`) without a single token file.

## 5. Observed / Likely Polish Gaps

- **Spacing and rhythm**: `px-4 py-3` vs `p-5` vs `p-6` vs `space-y-4`/`space-y-5` used inconsistently; no shared spacing scale (e.g. 4/8/12/16/24) applied systematically.
- **Typography**: Mix of `text-xs`, `text-sm`, `text-base`, `text-xl` and inline `font-medium`/`font-semibold` without clear hierarchy (e.g. page title vs section title vs meta).
- **Table vs card**: Table rows use `px-4 py-3`; inbox card rows use `px-4 py-3` + border-top. Header cells and body cells could use a shared padding constant; progress bar width (`w-16`) and comment icon size are hardcoded in row components.
- **Hover and selection**: Row hover uses inline `onMouseEnter`/`onMouseLeave` setting `background`; selected row uses `#1e2a1e`. No shared transition duration or focus-visible treatment.
- **Empty states**: Centered blocks with icon, short copy, and sometimes a button; padding and icon size vary (e.g. `py-16` vs `h-48`).
- **Skeletons**: ListSkeletons use a single shimmer keyframe and one gradient; table skeletons use a single full-width bar in one column; no variation for “multiple cells” in portal table.
- **Drawer/detail tabs**: Tab bar is functional; no clear “sticky” subtask progress when scrolling long subtask list; comment thread spacing is uniform but could breathe more between threads.
- **Portal dashboard**: Stat cards and recent-activity list are clear but visually heavier than inbox list container; filter chips and “Recent activity” heading could align with InboxLayout title/description treatment.
- **Borders and depth**: Borders are mostly `1px solid #2a2a2a` or `#222222`; no subtle shadow or elevation system, which is acceptable but could be standardized (e.g. list container vs inner panels).

## 6. Design Consistency Issues

- **Color**: Many hex values live inline (`#555555`, `#777777`, `#888888`, `#aaaaaa`, `#cccccc`, etc.); teal `#14b8a6` is the main accent but opacity variants (`rgba(20,184,166,0.15)`) are inline; no shared palette or CSS variables.
- **Section separation**: Some sections use `space-y-4`, others `space-y-5`, others `borderTop` + padding; no single rule for “section gap” or “content block separation.”
- **Headers**: Page-level Header is `text-base font-semibold`; InboxLayout title is `text-base font-semibold`; ticket detail title is `text-xl font-semibold`; drawer title is `text-xl font-bold`. Inconsistent for “page title” vs “pane title.”
- **Meta text**: Created dates, “Requested by,” “Owner,” “Progress X/Y” use a mix of `text-xs`/`text-sm` and various grays; could be one “meta” style (size + color).
- **Buttons and inputs**: Button variants (ghost, secondary, etc.) and Input/Select are shared but filter bars and action areas sometimes use different gaps or alignment.
- **List container**: InboxLayout and /tickets both use rounded-xl, same border and background; portal tables use the same container. Good base; only internal spacing and header/footer treatment need alignment.

## 7. Files / Components Likely Involved

- **Layout and structure**
  - `apps/web/src/components/layout/Header.tsx`
  - `apps/web/src/components/layout/Sidebar.tsx` (if polish touches nav)
  - `apps/web/src/components/inbox/InboxLayout.tsx`
  - `apps/web/src/components/inbox/ListSkeletons.tsx`

- **Ticket list and rows**
  - `apps/web/src/components/tickets/TicketRow.tsx` (TicketTableRow, PortalTicketTableRow)
  - `apps/web/src/app/(app)/tickets/page.tsx`
  - `apps/web/src/app/(app)/inbox/page.tsx`
  - `apps/web/src/app/(app)/portal/page.tsx`

- **Ticket detail and drawer**
  - `apps/web/src/components/tickets/TicketDrawer.tsx`
  - `apps/web/src/app/(app)/tickets/[id]/page.tsx`

- **Shared UI**
  - `apps/web/src/components/ui/Button.tsx`
  - `apps/web/src/components/ui/Input.tsx` (and Select, Textarea)
  - `apps/web/src/components/ui/Badge.tsx` (StatusBadge, PriorityBadge, SubtaskStatusBadge)

- **Optional**
  - A small **design tokens** or **polish constants** file (e.g. spacing scale, meta text style, list container class) if we want a single source for spacing/color used across these surfaces—only if it reduces duplication and keeps polish maintainable.

## 8. Proposed UI Polish Strategy

1. **Introduce a minimal polish token set (optional but high leverage)**  
   - Define a small set of spacing values (e.g. `space-list = 12`, `space-section = 16`, `space-block = 24`) and 2–3 meta text styles (size + color) used for “secondary” and “muted” copy.  
   - Use them in InboxLayout, TicketRow, ticket detail, and drawer so section gaps and meta text feel consistent.  
   - Do **not** introduce a full design system; keep it to a few constants or a single small file.

2. **Unify list container and list header treatment**  
   - InboxLayout and /tickets list container: same border-radius, border color, background; ensure the “Fetching…” bar height and padding match the list header rhythm.  
   - Table thead: consistent `th` padding (e.g. `px-4 py-3`) and one shared “table header” text style (e.g. `text-xs font-semibold uppercase tracking-wide` + one gray).  
   - Apply the same thead style in /tickets, portal my, and portal studio so table headers look like one family.

3. **Ticket row polish**  
   - Standardize row cell padding (e.g. `px-4 py-3`) and ensure comment count + progress bar alignment is consistent between TicketTableRow and PortalTicketTableRow.  
   - Use a single hover background token (e.g. `#222222` or a variable) and, where possible, a short transition (e.g. `transition-colors duration-150`) for row hover and selection.  
   - Ensure focus-visible outline for keyboard users on interactive rows.

4. **Empty and loading states**  
   - Empty state: one standard padding (e.g. `py-12` or `py-16`), one icon size (e.g. `h-10 w-10`), and consistent copy hierarchy (primary line + optional secondary).  
   - Skeletons: keep current shimmer; optionally refine table skeletons so multi-column tables show multiple placeholder bars per row (e.g. portal) for a more realistic load.  
   - Do not add heavy animation; keep loading minimal and recognizable.

5. **Drawer and detail: hierarchy and stickiness**  
   - Drawer: consider making the “progress” line (X/Y complete) or the tab bar sticky on scroll so context stays visible in long tickets.  
   - Detail page: same idea—optional sticky ticket header or tab bar (with care not to obscure content).  
   - Subtask section: ensure each subtask block has consistent padding and a clear separator; comment blocks: slightly more space between comments (e.g. `space-y-4` for the thread).  
   - One clear “primary action” area (e.g. add comment, add subtask) with consistent padding and alignment.

6. **Portal and dashboard**  
   - Stat cards: align padding and title style with InboxLayout “title + description” so dashboard feels like the same app.  
   - Portal tab content: use same list container and table header styles as inbox/tickets where tables are used.  
   - Filter bar (search, studio select): same vertical rhythm and gap as other filter bars (e.g. /tickets).

7. **Depth and borders**  
   - Standardize list container border (e.g. `1px solid #2a2a2a`) and, if desired, one very subtle shadow (e.g. `shadow-sm` with a dark shadow) for the main list card only—no heavy shadows.  
   - Keep panel/card surfaces to 1–2 border colors (e.g. `#2a2a2a` for outer, `#252525` for inner dividers) so the system stays flat and clean.

8. **Sidebar/nav**  
   - Only if time: ensure active state and hover state for nav items use the same teal accent and transition as the rest of the app; ensure “Notifications (N)” and other labels align with the chosen meta text size.

## 9. Safe Improvements vs Risky Over-Polish

**Safe (preferred)**

- Adding a small set of spacing or typography constants and using them in shared components (InboxLayout, TicketRow, detail, drawer).
- Unifying table header and cell padding across /tickets, inbox (if table is used), and portal tables.
- Standardizing empty-state padding, icon size, and copy hierarchy.
- Subtle row hover transition and consistent hover/selected background.
- Sticky tab bar or progress in drawer/detail when content is long.
- Slightly increased spacing between comment blocks and between subtask blocks.
- One consistent border and optional single shadow for the main list container.

**Risky (avoid or limit)**

- Introducing a full design system or many new tokens.
- Large visual or layout changes that alter perceived information hierarchy (e.g. moving progress or key actions).
- Heavy shadows, glass effects, or animation that could feel out of place or hurt performance.
- One-off page-specific styles that diverge from shared components.
- Redesigning components (e.g. new tab design) instead of polishing the current ones.
- Changing interaction behavior (e.g. click targets, keyboard flow) except for clear accessibility wins (e.g. focus-visible).

## 10. Test / Review Plan

- **Visual review**: Walk /tickets, /inbox, /portal (all tabs), TicketDrawer, and ticket detail in one browser; check spacing, alignment, and hierarchy across breakpoints if relevant.
- **Consistency check**: Compare table headers, row padding, empty states, and filter bars across surfaces; confirm they use the same or token-driven values.
- **Interaction check**: Hover and keyboard focus on list rows, drawer close, tab switches, and primary actions; ensure no regressions and that affordances are clear.
- **Loading and empty**: Trigger loading (slow network or refresh) and empty states; confirm skeletons and empty copy look intentional and consistent.
- **No behavior change**: Confirm no change to filters, navigation, or data display logic except where explicitly improving polish (e.g. empty-state copy).

## 11. Acceptance Criteria

- **Visual hierarchy**: Spacing and typography feel consistent across ticket list, inbox, portal, drawer, and detail; section separation and header/meta treatment follow a small set of rules or tokens.
- **List polish**: Row spacing, metadata layout, and badges/progress are balanced; table and card list treatments are consistent where they share the same role; hover and selection states are clear and consistent.
- **Drawer and detail**: Subtask and comment sections are easy to scan; progress and primary actions are clearly visible; optional sticky tab or progress where it helps long content.
- **Portal/dashboard**: Stat cards and filters align with the rest of the app; no visual clash with inbox/ticket list.
- **Depth and finish**: Borders and optional light shadow are consistent; loading and empty states look intentional.
- **Constraints**: No product or architecture changes; no heavy animation or inconsistent new patterns; polish is achievable via shared components and a minimal token set where useful.
- **Maintainability**: New or updated styles are centralized in shared components or a small constants/token set rather than scattered one-off overrides.
