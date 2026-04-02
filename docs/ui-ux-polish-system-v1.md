# UI/UX Polish System — v1 (Mini-Spec + Implementation Plan)

**Status:** Draft for implementation  
**Audience:** Senior product designer + staff frontend engineer  
**Scope:** System-wide refinement (not redesign) for the internal operations web app (`apps/web`)

---

### 1. Objective

Deliver a **single coordinated refinement pass** that makes the platform feel:

- **Premium:** restrained surfaces, disciplined type, one accent, no “template UI” defaults.
- **Pleasant:** calm density, predictable motion, respectful whitespace.
- **Consistent:** same control = same look and behavior everywhere.
- **Calm:** less border noise, fewer competing weights, one focal hierarchy per view.
- **Intentional:** every spacing, radius, and color choice maps to a documented token or shared class.

**Non-goals:** New features, IA changes, rebranding, illustration systems, or animation-heavy marketing polish.

**Workflow protection (hard rule):** This pass changes **visual presentation only**. **No** changes to user flows, navigation order, default behaviors, API contracts, or business rules—unless a change is required solely to fix an accessibility regression introduced by polish. Any such exception must be called out explicitly in the PR.

**Hard constraint:** This is a **data-dense operations product**. Clarity, scan speed, and keyboard/mouse efficiency trump visual novelty.

---

### 2. Design System Foundations

All foundations **must** be expressed as CSS variables (see `apps/web/src/app/globals.css`) and/or shared TS tokens (`apps/web/src/lib/polish.ts`). **No raw hex in new UI** except inside token definitions.

**Strict token usage (non-negotiable):** **No arbitrary spacing, typography, or color values** in product UI (no ad-hoc `px`, `rem`, `text-[13px]`, `gap-[7px]`, `#...`, `rgb()`, or one-off Tailwind scales). Use **only** tokens from §2 tables, `POLISH_CLASS` / `POLISH_THEME`, or `var(--color-*)` / `var(--radius-*)` / `var(--shadow-*)`. **Documented exceptions** (e.g. legacy file pending migration) must list the file + line or ticket and be removed in a follow-up; PRs without that note are rejected.

#### Spacing system

Use a **4px base grid** only. Allowed spacing steps for layout and component internals:

| Token use | px | Tailwind equivalent (when used) |
|-----------|-----|-----------------------------------|
| `space-1` | 4 | `p-1`, `gap-1` |
| `space-2` | 8 | `p-2`, `gap-2` |
| `space-3` | 12 | `p-3`, `gap-3` |
| `space-4` | 16 | `p-4`, `gap-4` |
| `space-5` | 20 | `p-5`, `gap-5` (use sparingly) |
| `space-6` | 24 | `p-6`, `gap-6` |
| `space-8` | 32 | `p-8`, `gap-8` |

**Rules:**

- Page padding: **24px** (`p-6`) unless a legacy surface already uses a documented exception; document exceptions in PR.
- Between major blocks on a page: **24px** (`space-y-6`) — align with existing `POLISH_CLASS.blockGap`.
- Within forms: **12–16px** between fields (`space-y-3` / `space-y-4`).
- **Forbidden:** arbitrary spacing values **unless** they are exactly the **approved table cell contract** (`POLISH_CLASS.cellPadding`, including its `py-3.5`) documented in §4—no other exceptions.

#### Typography system

**Roles (max 4):**

| Role | Use | Spec |
|------|-----|------|
| **Display / page title** | `Header` title, major page H1 | `text-base` (16px) `font-semibold`, `var(--color-text-primary)` |
| **Section title** | Card headers, drawer section labels | `text-sm` `font-semibold`, primary or secondary per hierarchy |
| **Body** | Primary cell text, descriptions | `text-sm` (14px), `font-normal`, primary |
| **Meta** | IDs, timestamps, helper lines, table header labels | `text-xs` (12px) or **only** the approved uppercase header utility (`POLISH_CLASS.tableHeader` / `tableHeaderCenter`, 11px); `var(--color-text-muted)` or `var(--color-text-secondary)` |

**Rules:**

- **No** third body size between 12px and 14px except the **approved** uppercase table header pattern above—**no** other arbitrary `text-[…px]`.
- **Max two weights** in a single component shell: `font-medium` / `font-semibold` for emphasis; avoid `font-bold` + `font-semibold` in the same row.
- Titles **truncate** with tooltip only when necessary; never shrink below `text-sm` for readable body.

#### Color system

**Semantic tokens only** (dark/light already defined in `globals.css`):

- **Backgrounds:** `--color-bg-page`, `--color-bg-surface`, `--color-bg-surface-raised`, `--color-bg-surface-inset`, `--color-bg-content-header`, `--color-bg-chrome`, `--color-bg-app-header`, `--color-row-selected`
- **Text:** `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- **Borders:** `--color-border-default`, `--color-border-subtle`
- **Accent:** `--color-accent`, `--color-accent-hover` — **primary actions, links, focus affordance, selection**
- **Danger:** `--color-danger` — destructive actions and critical errors only
- **Status badges:** keep existing semantic badge colors but **centralize** in one module; no new ad-hoc RGBA pills

**Rules:**

- **One accent** per screen for “I can click / this is selected.”
- **No decorative gradients** on tables, sidebars, or headers.
- **Orange tag capsules** (`POLISH_THEME.ticketTagCapsule`) are **exception** — reserved for ticket tags only.

#### Radius system

**Three radii only** (extend CSS if needed):

| Token | Value (current) | Use |
|-------|-----------------|-----|
| `sm` | **6px** (add `--radius-sm` if missing) | Inputs, small chips, inline controls |
| `md` | **10px** (`--radius-md`) | Buttons, default cards, modal shells |
| `lg` | **14px** (`--radius-lg`) | Drawer outer chrome, large panels, sidebar nav items |

**Rules:**

- **No** `rounded-full` except: avatar circles, notification dot, **explicit** pill badges where semantics require pills.
- **No** `rounded-xl` / `rounded-2xl` unless mapped to `lg` or documented as legacy to be migrated.

#### Elevation system

**Three levels only:**

| Level | Token / source | Use |
|-------|----------------|-----|
| **Flat** | border only (`--color-border-default`) | Rows, nested sections inside a card |
| **Panel** | `--shadow-panel` | Main ticket feed container, stacked cards on page |
| **Raised** | `--shadow-raised` or `--shadow-drawer` | Drawer, modal, sticky header that must separate from scroll |

**Rules:**

- **One shadow** per surface; do not stack `shadow` + heavy `border` + inner `shadow` on the same element.
- Table **rows** use **background** hover, not shadow.

---

### 3. Core UI Rules

1. **Token or shared class:** Any new UI must use `var(--color-*)`, `POLISH_THEME`, or `POLISH_CLASS`, per **strict token usage** in §2. PRs with inline `#rrggbb` / arbitrary spacing or type in TSX are rejected unless updating `globals.css` or a documented exception list.
2. **One focal point:** Each route has **one** primary action or primary scan column (usually ticket title). Secondary columns use meta color and lighter weight.
3. **Density contract:** Operational tables target **comfortable** density: minimum row tap height **44px** equivalent (padding + line height), not cramped 32px rows.
4. **Alignment:** Numeric counts and dates **tabular-nums** where alignment improves scan (`created`, IDs, counts).
5. **Click targets:** Minimum **40×40px** for icon-only controls; if visual is smaller, expand hit area with padding.
6. **Component reuse:** Same-purpose components **must** share **one** implementation (see §5). **No new visual variants** (colors, radii, shadows, layouts) unless absolutely necessary and approved—use existing `size` / `variant` props only; **no** copy-paste styling forks.
7. **Theme parity:** Every change verified in **dark and light** `data-theme`.
8. **Reduced noise:** Prefer **16px** (`space-4`) vertical gap between sections over new divider lines.

---

### 4. Table / Feed System

**Highest priority.** Applies to ticket list, inbox tables, admin tables, portal feeds.

**Table standardization:** All **table-based** views (semantic `<table>` or grid-as-table with the same UX) **must** share **identical structure and interaction patterns**: thead/body layout, row hover/selected/focus behavior, clickable-row semantics, empty/loading treatment, and header cell styling—differing **only** by column set and data. **No** one-off table UX per page.

**Shared row implementation:** Row chrome (padding, borders, hover, selected, transition) **must** come from **one** shared module or helper (e.g. canonical `TicketTableRow` + exported class helpers)—**no** duplicated row styling logic across tables; admin and portal feeds **consume** the same contract.

#### Row geometry

- **Cell padding (canonical):** Use `POLISH_CLASS.cellPadding` (`px-4 py-3.5`) for **body** rows unless migrating entire table in one PR.
- **Header padding:** `POLISH_CLASS.tableHeader` / `tableHeaderCenter` — **11px** uppercase labels; **do not** mix random `py-2` / `py-4` in the same table.
- **Row min height:** Implicit from padding + **single-line title** default; multi-line title allowed but **metadata columns** stay single-line with truncation.

#### Row states

| State | Visual rule |
|-------|-------------|
| **Default** | Background: inherit surface; bottom border `var(--color-border-default)` **or** row divider via `border-top` on `tbody > tr` — **one pattern per table**, not both double-lined. |
| **Hover** | `POLISH_THEME.rowHover` + `POLISH_CLASS.rowTransition` (`duration-150 ease-out`). **No** shadow on row hover. |
| **Selected** | `POLISH_THEME.rowSelected` (theme token). **No** additional accent border unless spec’d for accessibility. |
| **Keyboard focus** | Visible `focus-visible` ring on the **interactive** element (row button/link), not the whole `<tr>` unless row is a single focusable widget. |

#### Clickable rows

- If the whole row navigates: **one** `button` or `link` semantics with `aria-label` including ticket id/title; inner links (e.g. location) **stopPropagation** and have distinct focus rings.
- **Cursor:** `cursor-pointer` only on interactive rows; header rows `default`.

#### Column rules

- **Title column:** Left-aligned, **primary** color, `font-medium` for title line only.
- **Metadata columns** (dates, ids, counts): **muted** color, `text-xs` or `text-sm` per §2.
- **Status / priority / SLA:** Badges **aligned consistently** (all center or all left per table); pick one per product area and document.
- **Tags column:** Capsule components only from shared `TicketTagCapsule` (or successor); max **3 visible** + overflow indicator.
- **Column width consistency:** Across table views that share the same **product family** (e.g. all ticket feeds, or all admin data tables), **equivalent columns** (title, status, dates, actions) **must** use the **same width strategy**—same `colgroup` / `%` / `min-w` tokens per column index—so users develop a stable visual scan path. Document the canonical column map in code (single source) when feeds are aligned in phase 1.

#### Striping and zebra

- **No zebra striping** unless user research demands it; rely on hover + spacing.

#### Horizontal scroll

- If table overflows: **sticky first column** (title) optional phase-2; minimum is **scrollbar** + preserved header background `--color-bg-content-header`.

#### Empty / loading

- **No blank tbody:** use shared empty state (§8) or skeleton rows matching final row height.

---

### 5. Component Standardization

**Reuse rule:** Prefer extending existing components over adding parallel implementations. **No new visual variants** unless there is no viable existing `variant`/`size` and the exception is recorded in the PR.

#### Buttons (`Button`)

- **Variants:** `primary`, `secondary`, `ghost`, `danger` only.
- **Sizes:** `sm`, `md`, `lg` with fixed heights (**32 / 36 / 40px** target)—these are the **only** approved control heights for buttons in forms and toolbars.
- **States:** `hover`, `active` (translate **0.5px** max already in component), `disabled` (opacity + `cursor-not-allowed`), `focus-visible` ring using `--color-focus-ring`.
- **Loading:** spinner replaces icon slot; **width** stable (no layout jump).

#### Inputs (`Input`, `Select`, `ComboBox`, `MultiComboBox`)

- **Height & alignment:** In any **form row or toolbar**, adjacent **inputs, selects, combo boxes, and buttons** **must** share **one** canonical height per row: use **`sm`** button height with inputs that match **`h-9`** (36px), or **`md`** with **`h-10`** (40px)—pick the pair per surface and apply **consistently**; **no** mixed `h-8` inputs beside `md` buttons. **Baseline alignment:** controls align on **one** horizontal centerline (flex `items-center` on the row).
- **Focus:** Ring only; **border color** may shift but **box dimensions must not** change (no `focus:border-2` unless compensated).
- **Error:** Message below field, `text-sm`, danger color; input border **one** consistent error style.
- **ComboBox / MultiComboBox:** Dropdown z-index above modals/drawers per stacking doc; **portal** lists where overflow clips (pattern already used for `MultiComboBox`).

#### Modals

- **Backdrop:** Single opacity token (e.g. `rgba(0,0,0,0.5)` dark / adjust for light).
- **Shell:** `radius-lg`, `shadow-raised`, max-width tiers: **sm 420 / md 512 / lg 640** for content type.
- **Header:** Title `text-base font-semibold`; close icon **40px** hit area.
- **Scroll:** **Header + footer sticky**, body scrolls — avoids double scrollbars.

#### Badges / tags / status

- **StatusBadge / PriorityBadge / SLA:** Single source file; map enum → style object; **no** inline styles in feature pages.
- **Ticket tags:** Orange capsule token only; tooltip content from shared pattern.
- **New badge types:** Must go through tokens; max **one** non-neutral hue per semantic family.

#### Drawers (`TicketDrawer`)

- **Width:** Keep current `min(828px, 68vw)` unless usability test says otherwise; any change is **phase 2**.
- **Chrome:** Single `bg-chrome` header strip; **tab selector** matches documented sliding outline pattern (already implemented).
- **Section separation:** Prefer **24px gap** or `1px` `innerBorder` — not both stacked redundantly.

#### Sidebar / navigation

- **Active state:** `sidebar-nav-active-*` tokens only.
- **Hover:** `sidebar-nav-hover` only.
- **Brand mark:** Rounded-square accent tile (current `BrandMark`); **no** mixed logo treatments.

---

### 6. Interaction Model

| State | Requirement |
|-------|-------------|
| **Hover** | All clickable elements change **background or text** within **140ms** (`--duration-fast`). Tables: row background only. |
| **Active / pressed** | Buttons: subtle translate or opacity; links: optional underline darken only. |
| **Focus** | **Always** visible `focus-visible` ring for keyboard; mouse click may suppress ring per `focus-ring` utility if already implemented. |
| **Disabled** | Reduced opacity + `not-allowed`; no hover color change. |
| **Loading** | Prefer **skeleton** for lists; **inline spinners** for buttons and small fetches; **full-page** spinner only on auth gate. |

---

### 7. Visual Noise Reduction Strategy

1. **Border audit:** Remove duplicate borders (container + table + row). Target **one** enclosing border per card.
2. **Divider audit:** Replace `border-b` stacks with **spacing** or single hairline between **major** sections only.
3. **Shadow audit:** Restrict to §2 elevation levels; remove ad-hoc `shadow-lg` on inner widgets.
4. **Typography audit:** Demote noisy labels to `meta` role; one weight change per row maximum.
5. **Color audit:** Replace raw blues/oranges in TSX with tokens; align “edit” affordances to accent or documented semantic.

---

### 8. High-Impact Refinement Areas

**Implementation priority order (mandatory):** Work **must** proceed in impact order: complete **Priority 1** surfaces to exit criteria before starting Priority 2, then Priority 3—**no** skipping ahead to polish low-traffic admin pages while ticket feed / drawer contracts remain inconsistent.

**Priority 1 (ship first):**

1. Ticket feed + `TicketTableRow` — row height, hover, selected, header alignment, metadata color discipline.
2. Inbox / portal ticket lists — **same** rules as admin feed; diff only where role permissions demand.
3. `POLISH_CLASS` / `POLISH_THEME` adoption sweep in hot paths (grep for `#`, `rgb`, `rgba` in `apps/web/src/components/tickets`).

**Priority 2:**

4. Admin tables (users, markets, email automation, etc.) — align thead/body padding to §4.
5. Forms on ticket create + admin modals — input height, error pattern, toolbar alignment.
6. Modals — sticky header/footer, empty states.

**Priority 3:**

7. Badge consolidation and SLA/tag contrast check in light theme.
8. Sidebar sub-nav density and icon alignment.

---

### 9. Implementation Plan

#### Rollout strategy

- **Incremental PRs** by surface (feed, drawer, admin table X), each **themable** and **reversible**.
- **Order:** Follow §8 priority order strictly—**high-impact surfaces first** (feed, inbox, portal list, shared row module) before admin forms and secondary chrome.
- **Feature flag:** Not required; use **small PRs** instead.
- **QA:** Checklist (§12) per PR.

#### Tokenization strategy

1. Add **`--radius-sm`** in `globals.css` (dark + light) if not present; map to Tailwind in `tailwind` config if project uses arbitrary radius utilities.
2. Document **spacing** in `docs/` or `CLAUDE.md` pointer — single table §2.
3. Expand `POLISH_CLASS` **only** when a pattern repeats **3+** times after PR 1.

#### Component refactors

1. **`TicketRow` / `TicketTableRow`:** **Single** shared implementation for all table rows: extract row container styles to one **`getRowClassNames(selected, hover)`** (or equivalent) used by **every** feed/admin table row—**zero** duplicated row styling logic in feature files.
2. **`Button` / `Input`:** Audit focus/hover against §6; enforce **§5 input/button height and alignment** on every form toolbar; fix any layout shift.
3. **Admin pages:** Replace per-page table header classes with `POLISH_CLASS.tableHeader*`.
4. **Modals:** Create thin `ModalFrame` wrapper (title, close, scroll body) — **optional** if duplication > 3 modals after audit.

#### Sequencing

| Phase | Scope | Exit criterion |
|-------|--------|------------------|
| **0** | Token gaps (`radius-sm`), docs | All new work references §2 |
| **1** | Ticket feed + inbox + portal list | §12 feed checklist green |
| **2** | Ticket drawer + detail page tables | Drawer checklist green |
| **3** | Admin tables + forms | No raw color in new/edited lines |
| **4** | Badges + edge cases | Badge map centralized |

---

### 10. Constraints / Non-Goals

- **No** redesign of information architecture or ticket workflow.
- **Workflow protection:** **No** intentional changes to user flows, click paths, default selections, or validation behavior—**visual refinement only** (see §1). Unintended behavior changes are bugs and must be reverted or fixed before merge.
- **No** new animation libraries; CSS transitions only, **≤ 200ms** default.
- **No** illustration system or marketing hero imagery.
- **No** breaking API or route changes.
- **No** removal of accessibility attributes for visual minimalism.
- **Defer** mobile-specific layouts unless already in scope elsewhere.

---

### 11. Acceptance Criteria

- [ ] **100%** of new/changed UI in scoped PRs uses **strict token usage** from §2 (`globals.css` / `POLISH_THEME` / `POLISH_CLASS` only; **no** arbitrary spacing, typography, or color except documented exceptions).
- [ ] Ticket feed and inbox rows meet §4 geometry, **table standardization**, **shared row implementation**, and **column width consistency** (per family) in **both** themes.
- [ ] All buttons/inputs in scoped surfaces meet §6 interaction states and **§5 height/alignment** rules in form rows and toolbars.
- [ ] **Zero** blank loading areas in scoped routes — skeleton or explicit empty state.
- [ ] Lighthouse **Accessibility** score not regressed on `/tickets` and `/inbox` (baseline recorded before phase 1).
- [ ] Design review sign-off on **one** reference screen (ticket feed + drawer) before phase 3 broad admin sweep.

---

### 12. Verification Checklist

**Per PR (self-serve):**

- [ ] Dark theme: ticket feed — hover, selected, focus visible on row action.
- [ ] Light theme: same.
- [ ] Table header: uppercase 11px, muted color, alignment matches body columns.
- [ ] No double borders between card edge and first row.
- [ ] Primary button visible on page has **one** clear hierarchy vs secondary.
- [ ] Modal: ESC closes; focus trap reasonable; first focus not lost.
- [ ] Empty state: title + one line guidance + optional CTA.
- [ ] Loading: skeleton or spinner; **no** empty white/black blocks.
- [ ] Grep PR diff: no new `#` hex / `rgb()` / arbitrary spacing or `text-[…]` in TSX outside allowed files (§2 strict token usage).
- [ ] **Workflow:** No user-flow or behavior change vs baseline (§1 / §10)—visual-only diff for polish PRs.

**Release gate (phase 1 complete):**

- [ ] Spot-check: `/tickets`, `/tickets/[id]`, `/inbox`, `/portal` (if applicable).
- [ ] Keyboard: tab through feed filters, first row, open drawer, close drawer.
- [ ] Reduced motion: UI remains usable with `prefers-reduced-motion` (no required motion to convey state).

---

*End of spec — v1*
