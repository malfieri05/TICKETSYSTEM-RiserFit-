# Stage 31: Full-App Theme (Light/Dark) — Implementation Plan

## 1. Problem

After Stage 31 Phase 1, only the **shell** (sidebar, header, main content area background) responds to the theme toggle. All **internal screens** still use hardcoded dark colors:

- **Tickets** (list, filters, tabs, table, banner)
- **Ticket detail** (drawer and full-page view: panels, tabs, subtasks, comments, attachments)
- **Dashboard** (page background, left rail, KPI cards, chart, ticket list, empty state)
- **Inbox** (page background, folder list, ticket rows, empty state)
- **Portal** (page background, table, rows)
- **Notifications** (page background, card list)
- **Admin** (dispatch, markets, workflow-templates, reporting, knowledge-base: page backgrounds, panels, filters, tables, modals)
- **Login** (page background, card, inputs, divider)
- **Shared components**: `Input`, `Select`, `Textarea` (background/border); `TicketRow` (borders, hover, selected); `TicketDrawer` (all surfaces); `AiChatWidget` (panel, messages, input); `SlaBadge` (neutral state); `InboxLayout` (uses POLISH)

Theme preference is already **per user session** in the sense that it is stored in **localStorage** (per browser/device). Each user toggling on their machine sees their choice. If “per account” means the preference should follow the user across devices, that would require a separate backend preference (e.g. user settings API) and is out of scope for this plan; we keep localStorage and can add API sync later.

---

## 2. Goal

- **Light mode** and **dark mode** apply to the **entire app**: every tab, list, panel, form, and drawer use theme tokens so the toggle changes the full UI.
- No new layout or behavior changes; only replace hardcoded colors with theme variables.
- Preference remains **per browser** (localStorage); optional future: persist per account via API.

---

## 3. Strategy

### 3.1 Token mapping

Use existing CSS variables from Phase 1 where they fit; add a small number of semantic aliases if needed.

| Current usage | Theme variable |
|---------------|----------------|
| Page / main area background | `var(--color-bg-page)` |
| Sidebar, “darker” panels | `var(--color-bg-surface)` |
| Header, cards, raised panels, table headers | `var(--color-bg-surface-raised)` |
| Borders (default) | `var(--color-border-default)` |
| Borders (subtle) | `var(--color-border-subtle)` |
| Primary text | `var(--color-text-primary)` |
| Secondary text | `var(--color-text-secondary)` |
| Muted / labels | `var(--color-text-muted)` |
| Accent (teal, links, active) | `var(--color-accent)` |
| Panel shadow | `var(--shadow-panel)` |
| Raised shadow | `var(--shadow-raised)` |

For one-off cases (e.g. progress bar track, dashed dropzone), use the closest token (e.g. `--color-border-default`) or a new variable only if clearly needed (e.g. `--color-fill-muted` for progress track).

### 3.2 polish.ts

- **Option A (recommended):** Add a **theme-aware** export (e.g. `POLISH_THEME`) whose values are CSS variable strings: `listBg: 'var(--color-bg-surface-raised)', listBorder: 'var(--color-border-default)', listBgHeader: 'var(--color-bg-surface)', innerBorder: 'var(--color-border-subtle)', rowBorder: 'var(--color-border-default)', rowHover: 'var(--color-bg-surface-raised)', rowSelected: 'var(--color-accent)' with low opacity or a dedicated token if we add one, metaSecondary: 'var(--color-text-secondary)', metaMuted: 'var(--color-text-muted)', metaDim: 'var(--color-text-muted)', theadText: 'var(--color-text-muted)', accent: 'var(--color-accent)', listContainerShadow: 'var(--shadow-panel)'`. Migrate components that currently use `POLISH` for colors to `POLISH_THEME` (or to direct `var(--...)` in JSX).
- **Option B:** Leave `POLISH` as-is for backward compatibility and replace only **inline** hex and **page-level** backgrounds with `var(...)`; then gradually replace `POLISH.*` color usages with theme vars in a second pass.

Recommendation: **Option A** so one token layer drives both list/drawer and the rest of the app; keep `POLISH_CLASS` unchanged (layout only).

### 3.3 Where to change

| Area | Files | Action |
|------|--------|--------|
| **Tickets list** | `app/(app)/tickets/page.tsx` | Page background, banner, filter row, tabs, list container, table header/row styles → theme vars (or POLISH_THEME). |
| **Ticket detail (drawer)** | `components/tickets/TicketDrawer.tsx` | All `#111`, `#141414`, `#161616`, `#151515`, `POLISH.*` → theme vars / POLISH_THEME. |
| **Ticket detail (full page)** | `app/(app)/tickets/[id]/page.tsx` | Page background, sticky header, panels, progress bar track, dropzone, error/info boxes → theme vars. |
| **Ticket row** | `components/tickets/TicketRow.tsx` | Borders, hover, selected, meta colors → POLISH_THEME or vars. |
| **Dashboard** | `app/(app)/dashboard/page.tsx` | Page background, left rail, panel const, KPI cards, chart area, ticket list row, empty state, status dots → theme vars. |
| **Inbox** | `app/(app)/inbox/page.tsx`, `components/inbox/InboxLayout.tsx` | Page background, folder list, row hover, empty state, POLISH usage → theme vars / POLISH_THEME. |
| **Portal** | `app/(app)/portal/tickets/page.tsx` | Page background, card, table header/row, row hover → theme vars. |
| **Notifications** | `app/(app)/notifications/page.tsx` | Page background, card, read dot → theme vars. |
| **Admin – dispatch** | `app/(app)/admin/dispatch/page.tsx` | Page background, filter bar, SectionCard → theme vars. |
| **Admin – markets** | `app/(app)/admin/markets/page.tsx` | Page background, `panel` const, list/row/input borders and hovers, modals → theme vars. |
| **Admin – workflow-templates** | `app/(app)/admin/workflow-templates/page.tsx`, `new/page.tsx`, `[id]/page.tsx` | Page background, `panel` const, table, dependency graph, subtask list, modals, error/delete panels → theme vars. |
| **Admin – reporting** | `app/(app)/admin/reporting/page.tsx` | Page background, card panels, tab active, progress bar track → theme vars. |
| **Admin – knowledge-base** | `app/(app)/admin/knowledge-base/page.tsx` | Page background, `panel` const, toggle group, textarea, dropzone, type badges → theme vars. |
| **Login** | `app/(app)/auth/login/page.tsx` | Page background, card, divider, input/button → theme vars. |
| **App root redirect** | `app/(app)/page.tsx` | Full-screen background → `var(--color-bg-page)`. |
| **Forms** | `components/ui/Input.tsx` (Input, Select, Textarea) | background and border → `var(--color-bg-surface)`, `var(--color-border-default)`; keep colorScheme for native inputs or set per theme. |
| **AI widget** | `components/ai/AiChatWidget.tsx` | All panel, header, message, input surfaces and borders → theme vars. |
| **SLA badge** | `components/ui/SlaBadge.tsx` | Neutral state background/border → theme vars; semantic colors (green/amber/red) can stay or use vars if we add them. |
| **List skeletons** | `components/inbox/ListSkeletons.tsx` | If it uses POLISH or hex, switch to theme vars. |

---

## 4. Implementation order

1. **globals.css**  
   - Add any missing variables (e.g. progress bar track, dropzone border) only if needed; otherwise reuse existing tokens.

2. **polish.ts**  
   - Add `POLISH_THEME` (or equivalent) with all color/shadow values as `var(--...)` strings. Document that new code should use theme vars; POLISH can remain for non-color layout (POLISH_CLASS) or be deprecated for colors.

3. **Shared components**  
   - Input, Select, Textarea: use `var(--color-bg-surface)` and `var(--color-border-default)`.  
   - SlaBadge: use theme vars for neutral state.  
   - TicketRow: use POLISH_THEME or vars for border, hover, selected, meta text.  
   - TicketDrawer: replace every POLISH and hex with POLISH_THEME or vars.  
   - AiChatWidget: replace all surfaces/borders with theme vars.  
   - InboxLayout: use POLISH_THEME (or vars) for borders and backgrounds.

4. **Pages (by route)**  
   - Login → tickets → ticket detail (drawer + full page) → dashboard → inbox → portal → notifications → admin (dispatch, markets, workflow-templates, reporting, knowledge-base) → app root page.  
   For each: replace page-level `background: '#000000'` (or similar) with `var(--color-bg-page)`; replace panel/card/table styles with theme vars or a shared `panel` object that uses vars.

5. **Verification**  
   - Toggle light/dark: every tab (Tickets, Dashboard, Inbox, Portal, Notifications, Admin sections, Login) and the ticket drawer and full ticket view should switch.  
   - No layout or behavior change; no new flash (script still runs before paint).  
   - Preference persists across reload (localStorage).

---

## 5. Per-user preference (current and optional)

- **Current:** Theme is stored in **localStorage** under the key `theme` (`'light' | 'dark'`). Each browser/device has its own value; the user toggles in the sidebar and the choice applies to the whole app for that session/device.
- **Optional later:** To make preference “per account” (same theme on every device), add a user setting (e.g. PATCH `/users/me` or `/users/me/preferences` with `theme: 'light' | 'dark'`) and on login or app load, if the user is authenticated, optionally overwrite localStorage from the API so the UI and toggle reflect the saved preference; and on toggle, persist to the API as well. This plan does not include that; it only ensures the **entire UI** respects the existing localStorage + `data-theme` toggle.

---

## 6. Acceptance criteria

- [ ] With theme set to **light**, every screen (tickets, ticket detail/drawer, dashboard, inbox, portal, notifications, all admin pages, login) uses light backgrounds, dark text, and theme-appropriate borders/shadows.
- [ ] With theme set to **dark**, the same screens match the current dark look (no regressions).
- [ ] Toggle in the sidebar updates the full app immediately; reload keeps the chosen theme (localStorage).
- [ ] No flash of wrong theme on load (existing no-flash script unchanged).
- [ ] No intentional layout or behavior changes; only color/surface/shadow tokens are switched to theme variables.

---

## 7. Files to touch (checklist)

- [ ] `app/globals.css` (add vars only if needed)
- [ ] `lib/polish.ts` (add POLISH_THEME / theme-aware tokens)
- [ ] `components/ui/Input.tsx`
- [ ] `components/ui/SlaBadge.tsx`
- [ ] `components/tickets/TicketRow.tsx`
- [ ] `components/tickets/TicketDrawer.tsx`
- [ ] `components/ai/AiChatWidget.tsx`
- [ ] `components/inbox/InboxLayout.tsx`
- [ ] `components/inbox/ListSkeletons.tsx` (if it has colors)
- [ ] `app/(app)/page.tsx`
- [ ] `app/(app)/tickets/page.tsx`
- [ ] `app/(app)/tickets/[id]/page.tsx`
- [ ] `app/(app)/dashboard/page.tsx`
- [ ] `app/(app)/inbox/page.tsx`
- [ ] `app/(app)/portal/tickets/page.tsx`
- [ ] `app/(app)/notifications/page.tsx`
- [ ] `app/(app)/admin/dispatch/page.tsx`
- [ ] `app/(app)/admin/markets/page.tsx`
- [ ] `app/(app)/admin/workflow-templates/page.tsx`
- [ ] `app/(app)/admin/workflow-templates/new/page.tsx`
- [ ] `app/(app)/admin/workflow-templates/[id]/page.tsx`
- [ ] `app/(app)/admin/reporting/page.tsx`
- [ ] `app/(app)/admin/knowledge-base/page.tsx`
- [ ] `app/(auth)/login/page.tsx`

(Total: 24 files, with polish.ts and globals as optional small edits.)
