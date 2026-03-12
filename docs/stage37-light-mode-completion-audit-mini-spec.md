# Stage 37: Light Mode Completion Audit — Mini-Spec

## 1. Intent

Make the light/dark theme toggle produce a **premium, intentional light mode** across the entire application — every page, panel, drawer, modal, form, table, badge, button, card, map overlay, empty state, and workflow step.

Currently, dark mode is the de facto primary theme. Light mode was added in Stage 31 via CSS variables and a theme toggle, but the rollout was incomplete. Many surfaces, text colors, borders, and interactive states still use hardcoded dark-mode hex values that ignore the CSS variable system entirely. The result: switching to light mode exposes black panels, invisible text, wrong borders, and generally broken UI across roughly 60% of the application.

---

## 2. Problem Statement

- Stage 31 introduced `[data-theme="dark"]` / `[data-theme="light"]` CSS variables and a `POLISH_THEME` token map.
- However, the majority of pages and components still reference the **old `POLISH` constant** (hardcoded dark hex values) or use **inline hardcoded hex** in `style={{}}` / Tailwind class literals.
- Shared UI primitives (`Input`, `Select`, `Textarea`, `Sidebar`) are already theme-aware, but the `Button`, `Badge`, and many page-level components are not.
- The result is a patchwork: some surfaces respond to the theme toggle, others remain locked to dark.

---

## 3. Scope

### In scope
- Every `.tsx` file under `apps/web/src/app/` and `apps/web/src/components/`
- CSS variable definitions in `globals.css`
- Token constants in `polish.ts`
- Shared UI primitives: `Button.tsx`, `Badge.tsx`, `SlaBadge.tsx`
- All page routes (21 pages), all components (19 files)
- Text readability in both modes (primary, secondary, muted text)

### Out of scope
- Backend changes
- New features or layout changes
- Login page background (brand-specific, acceptable to keep dark)
- Brand logo colors (Microsoft logo, Riser logo icon)
- Semantic status/priority colors (green/yellow/red/blue hues) — these are intentionally vivid in both themes; only their **container backgrounds** need theme-awareness

---

## 4. Root-Cause Analysis

### Why is light mode coverage incomplete?

1. **Incremental build history**: The app was built dark-first over 30+ stages. Theme variables were introduced at Stage 31 but only retrofitted onto a subset of files.
2. **Two competing token systems**: `POLISH` (hardcoded hex) and `POLISH_THEME` (CSS vars) coexist in `polish.ts`. Many files still import and use `POLISH`.
3. **No enforcement mechanism**: There is no lint rule, CI check, or design system constraint preventing hardcoded colors.
4. **Inline style patterns**: Many components use `style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}` — these completely bypass theme variables.
5. **Tailwind dark-only classes**: Classes like `bg-neutral-700`, `text-gray-300`, `bg-neutral-800` are hardcoded Tailwind palette references that don't respond to `[data-theme]`.
6. **Shared component gaps**: `Button` and `Badge` use hardcoded Tailwind colors. Since they're used everywhere, the problem propagates app-wide.

---

## 5. Theming Architecture Currently in Use

| Layer | Mechanism | Status |
|-------|-----------|--------|
| CSS variables | `globals.css` `[data-theme="dark"]` / `[data-theme="light"]` | ✅ Well-defined |
| Theme toggle | `Sidebar.tsx` toggle + `layout.tsx` hydration script | ✅ Working |
| Token constants | `POLISH_THEME` in `polish.ts` | ✅ Defined but under-used |
| Legacy constants | `POLISH` in `polish.ts` | ⚠️ Still imported in many files |
| Shared inputs | `Input.tsx`, `Select.tsx`, `Textarea.tsx` | ✅ Theme-aware |
| Shared Button | `Button.tsx` | ❌ Hardcoded Tailwind palette |
| Shared Badge | `Badge.tsx` | ❌ Hardcoded dark palette |
| Sidebar | `Sidebar.tsx` | ✅ Theme-aware |
| Header | `Header.tsx` | ⚠️ Mostly OK, minor issues |
| Page-level styles | 21 route pages | ❌ Most use hardcoded hex |
| Component-level styles | 19 components | ⚠️ Mixed |

### CSS Variable Tokens Available

| Token | Dark | Light |
|-------|------|-------|
| `--color-bg-page` | `#000000` | `#f5f5f5` |
| `--color-bg-surface` | `#111111` | `#ffffff` |
| `--color-bg-surface-raised` | `#1a1a1a` | `#ffffff` |
| `--color-text-primary` | `#f0f0f0` | `#171717` |
| `--color-text-secondary` | `#cccccc` | `#525252` |
| `--color-text-muted` | `#888888` | `#737373` |
| `--color-border-default` | `#2a2a2a` | `#e5e5e5` |
| `--color-border-subtle` | `#252525` | `#eeeeee` |
| `--color-accent` | `#14b8a6` | `#0d9488` |

---

## 6. Proposed Implementation Approach

### Strategy: Systematic token migration, not page-by-page patches

#### Step 1 — Extend CSS variables with semantic tokens

Add to `globals.css` for both themes:
- `--color-bg-input` (for form controls not using the `Input` component)
- `--color-bg-overlay` (for modal backdrops)
- `--color-bg-surface-inset` (for sections inside surfaces, e.g. code blocks, table headers — slightly darker/lighter than surface)

#### Step 2 — Fix shared primitives first (highest leverage)

- **`Button.tsx`**: Replace hardcoded Tailwind palette classes with CSS variable inline styles
- **`Badge.tsx`**: Status/priority badge containers need theme-aware backgrounds (keep vivid text hues, but adapt container opacity/ring for light mode)
- **`SlaBadge.tsx`**: Same treatment as Badge
- **`AiChatWidget.tsx`**: Chat bubbles, input area, FAB button

#### Step 3 — Migrate all `POLISH.*` references to `POLISH_THEME.*`

Every file that imports `POLISH` and uses its hardcoded hex values should switch to `POLISH_THEME`. After migration, `POLISH` can be deprecated (kept but unused).

#### Step 4 — Convert inline hardcoded hex to CSS vars

All `style={{ background: '#1a1a1a', ... }}` patterns → `style={{ background: 'var(--color-bg-surface-raised)', ... }}`

#### Step 5 — Convert hardcoded Tailwind classes to CSS var equivalents

- `bg-neutral-700` → `bg-[var(--color-bg-surface-raised)]`
- `text-gray-300` → `text-[var(--color-text-primary)]`
- `text-gray-400` / `text-gray-500` → `text-[var(--color-text-muted)]`
- `border-gray-700` → `border-[var(--color-border-default)]`
- `bg-black` (page bg) → `bg-[var(--color-bg-page)]`

#### Step 6 — Special surfaces

- Modal overlays: `rgba(0,0,0,0.7)` is acceptable for both themes (dims content behind)
- Map detail panel: use `var(--color-bg-surface)` instead of `#000000`
- Login page: keep dark aesthetic (brand page, not part of app chrome)

---

## 7. Correct Fix Type

**All of the above**, applied in priority order:

1. **Token cleanup** — add 3 missing semantic CSS variables
2. **Shared component cleanup** — fix `Button`, `Badge`, `SlaBadge`, `AiChatWidget`
3. **Theme variable standardization** — migrate all `POLISH.*` → `POLISH_THEME.*`
4. **Utility class refactor** — convert hardcoded Tailwind palette classes to CSS var bracket notation

This is a **one-time systematic migration**, not an ongoing patchwork exercise.

---

## 8. Files Requiring Changes

### Shared primitives (highest impact)
- `apps/web/src/app/globals.css` — add 3 semantic tokens
- `apps/web/src/components/ui/Button.tsx` — theme-aware variants
- `apps/web/src/components/ui/Badge.tsx` — theme-aware status/priority containers
- `apps/web/src/components/ui/SlaBadge.tsx` — theme-aware containers
- `apps/web/src/components/ai/AiChatWidget.tsx` — chat surfaces, FAB

### Page routes (21 pages)
- `admin/users/page.tsx` — **worst offender**, fully hardcoded
- `admin/markets/page.tsx` — map panel, add-location button
- `admin/knowledge-base/page.tsx` — badge containers, icons
- `admin/reporting/page.tsx` — chart colors (leave vivid), surfaces
- `admin/system-monitoring/page.tsx` — status cards
- `admin/workflow-templates/[id]/page.tsx` — modals, text classes
- `admin/workflow-templates/page.tsx` — text classes
- `admin/workflow-templates/new/page.tsx` — text classes
- `admin/workflow-analytics/page.tsx` — text classes
- `admin/dispatch/page.tsx` — text classes
- `tickets/new/page.tsx` — panel, form sections, borders
- `tickets/[id]/page.tsx` — avatar, text classes
- `tickets/page.tsx` — text classes
- `portal/page.tsx` — **heavy POLISH usage**, surfaces
- `portal/tickets/page.tsx` — text classes
- `dashboard/page.tsx` — KPI cards, status colors
- `assistant/page.tsx` — chat bubbles, input, backgrounds
- `handbook/page.tsx` — chat bubbles, input, backgrounds
- `inbox/page.tsx` — accent containers
- `notifications/page.tsx` — accent containers
- `(auth)/login/page.tsx` — minor text classes (low priority, brand page)

### Components (files beyond pages)
- `components/tickets/TicketDrawer.tsx` — avatar, gradient
- `components/tickets/TicketRow.tsx` — minor
- `components/tickets/TicketAttachmentsSection.tsx` — error state
- `components/tickets/AttachmentRow.tsx` — hover state
- `components/uploads/UploadDropzone.tsx` — error text
- `components/inbox/InboxLayout.tsx` — accent containers
- `components/layout/Header.tsx` — minor (notification badge OK)
- `components/admin/LocationsMap.tsx` — check popup styling

---

## 9. Risk Areas

| Risk | Mitigation |
|------|-----------|
| Breaking dark mode while fixing light mode | Every replacement is a 1:1 token swap — dark values are unchanged |
| Badge/status readability in light mode | Use `/20` opacity backgrounds which work on both white and dark surfaces |
| Accent contrast on light backgrounds | Light theme accent is already `#0d9488` (darker teal), tested |
| Modal overlay visibility | Keep `rgba(0,0,0,0.5-0.7)` — works universally |
| Chart/reporting vivid colors | Leave semantic status/priority hues unchanged — they're designed to pop |
| Input focus rings (teal-500) | Teal-500 is visible on both light and dark — no change needed |

---

## 10. Verification Plan

### Systematic visual QA checklist

For each of these surfaces, verify in **both** light and dark mode:

#### Core navigation
- [ ] Sidebar: bg, text, hover, active states, theme toggle
- [ ] Header: bg, text, notification badge
- [ ] Mobile/responsive (if applicable)

#### Ticket workflows
- [ ] Ticket list (`/tickets`)
- [ ] Ticket detail (`/tickets/[id]`)
- [ ] Ticket creation (`/tickets/new`) — all steps
- [ ] Ticket drawer (open from list)

#### Admin pages
- [ ] Users management (`/admin/users`) — table, modals, badges
- [ ] Locations (`/admin/markets`) — list view, map view, detail panel, add button
- [ ] Workflow Templates — list, create, edit
- [ ] Workflow Analytics
- [ ] Reporting — KPI cards, charts, tables
- [ ] Vendor Dispatch
- [ ] Knowledge Base — document list, upload, sync
- [ ] System Monitoring — service cards

#### User-facing
- [ ] Dashboard — KPI cards, status charts
- [ ] Portal — ticket list, studio view
- [ ] Inbox — topic folders, notification items
- [ ] Notifications — list items
- [ ] Handbook chat
- [ ] Assistant chat
- [ ] AI Chat Widget (floating button)

#### Shared components
- [ ] Button variants: primary, secondary, ghost, danger
- [ ] Badge variants: status, priority, subtask
- [ ] SLA badges and progress bars
- [ ] Input, Select, Textarea
- [ ] Attachment upload dropzone
- [ ] Attachment rows
- [ ] Empty states
- [ ] Loading states
- [ ] Error states
- [ ] Modal overlays

---

## 11. Acceptance Criteria

1. Switching to light mode produces a clean, readable, premium-feeling UI on **every** page
2. No black panels, invisible text, or broken borders in light mode
3. Dark mode remains unchanged (all replacements are 1:1 CSS var swaps)
4. All text is readable in both modes (primary, secondary, muted hierarchy maintained)
5. Shared components (`Button`, `Badge`, `SlaBadge`) render correctly in both themes
6. Forms, inputs, selects, and textareas are readable in both modes
7. Map overlay panel uses theme-aware background
8. Modal/drawer overlays are visible in both modes
9. Status/priority badge colors remain vivid and distinguishable in both modes
10. No hardcoded dark hex values remain in inline styles (except brand colors and intentional semantic hues)
11. `POLISH` constant is no longer used for colors — all references migrated to `POLISH_THEME`
12. Build passes with zero TypeScript errors
