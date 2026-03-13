# ComboBox Standardization Report

## Shared component

- **File:** `apps/web/src/components/ui/ComboBox.tsx`
- **API:** `options: ComboBoxOption[]` (`{ value: string; label: string }`), `value: string`, `onChange: (value: string) => void`, `placeholder?`, `label?`, `id?`, `className?`, `disabled?`, `error?`, `clearable?` (default true).
- **Behavior:** Click opens list; when open, a filter input appears and typing filters options in real time. Dropdown arrow remains visible. Click to select; Arrow Up/Down to move highlight; Enter to select; Escape to close. Selected value is shown in the trigger when closed. Same styling as existing Select (border, focus ring, theme variables).

---

## Dropdowns upgraded to ComboBox

| Location | Field(s) | Notes |
|----------|----------|--------|
| `apps/web/src/app/(app)/tickets/page.tsx` | Department, Type, Location filters | Taxonomy and location lists; type is support/maintenance options. |
| `apps/web/src/app/(app)/portal/tickets/page.tsx` | Department, Studio (location) filters | Status filter left as Select (small fixed set). |
| `apps/web/src/app/(app)/admin/dispatch/page.tsx` | Studio, State (market), Maintenance category filters | All three filter dropdowns. |
| `apps/web/src/app/(app)/tickets/new/page.tsx` | Ticket type, Department, Support topic, Maintenance category, Employee location | Create-ticket taxonomy and studio list. |
| `apps/web/src/app/(app)/admin/workflow-templates/new/page.tsx` | Ticket type, Department, Support topic, Maintenance category | Template context selection. |
| `apps/web/src/app/(app)/admin/workflow-templates/[id]/page.tsx` | Department (edit subtask), Department (add subtask), “This subtask”, “Depends on” | Department and dependency dropdowns. |
| `apps/web/src/app/(app)/admin/markets/page.tsx` | State (market) when adding location | Market list in add-location form. |
| `apps/web/src/app/(app)/admin/reporting/page.tsx` | Workflow selector (Workflow / Subtask Completion Timing) | Replaced native `<select>` with ComboBox; `clearable={false}`. |

---

## Dropdowns left as simple Select

| Location | Reason |
|----------|--------|
| `TicketDrawer.tsx` | Subtask status (READY, IN_PROGRESS, DONE, SKIPPED) — 4 options, compact. |
| `apps/web/src/app/(app)/tickets/[id]/page.tsx` | Subtask status — same 4-option set. |
| `apps/web/src/app/(app)/admin/users/page.tsx` | Role (3 options), Department (HR, OPERATIONS, MARKETING) — very small fixed sets. |
| `apps/web/src/app/(app)/portal/tickets/page.tsx` | Status filter — small fixed set (e.g. All statuses, New, Triaged, …). |
| `apps/web/src/app/(app)/tickets/new/page.tsx` | Schema-driven “select” fields in `SchemaFieldRenderer` | Dynamic form fields; option count varies; left as Select to avoid scope creep. |
| `CommentThread.tsx` | Mention typeahead is a custom search dropdown, not a select. |
| `UserSearchSelect.tsx` | Already a searchable user picker; not replaced. |
| `MarketSearchSelect.tsx` | Already a searchable market/state picker; not replaced. |

---

## Confirmation

- **Typing/filtering:** All upgraded dropdowns use the shared ComboBox. When open, the filter input is focused and options are filtered in real time by label (case-insensitive substring).
- **Keyboard:** Arrow Up/Down, Enter (select), Escape (close) are supported.
- **Values:** No API or domain logic changes. All components still receive and submit the same `value` shape (string; e.g. id or composite key like `studio-{id}`).

---

## Edge cases / deferred

- **Schema-driven select fields** on the create-ticket form (`SchemaFieldRenderer` for `field.type === 'select'`) remain native `<Select>`. They could be upgraded in a follow-up if schema-driven option lists are long.
- **ComboBox with empty options:** If `options` is empty, the list shows “No matches” when open; the trigger still shows `placeholder` when `value === ''`.
- **Reporting workflow ComboBox:** Uses `clearable={false}` so the value is always one of the workflow ids when the section is visible (`workflowTimingData.length > 1`).
