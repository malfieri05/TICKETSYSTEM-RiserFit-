# Admin Users Page — UI Tweaks Mini-Spec (Planning Only)

**Purpose:** Plan layout, copy, and behavior changes for the Admin → Users table and Deactivate flow. No implementation until approved.

**Context:** Stage 23 added a "Locations" button in the Actions column for studio users and a Manage locations modal. This spec refines column order, renames the locations column to "Visibility" with a count, right-aligns Status and Deactivate, and adds a Deactivate confirmation dialog.

---

## 1. Intent

- **Column order and naming:** Insert a dedicated **Visibility** column between the Role column (with its Saved button) and the Status column. The Locations control moves into this column and displays as **Locations (#)** where # is the number of locations the user has visibility to.
- **Alignment:** Right-align the Status column content and the Deactivate button, with clear spacing so the row reads well.
- **Deactivate safety:** Require a "Deactivate user?" confirmation before deactivating a user, with explicit subtext that the user will no longer be able to sign in and that ticket history remains.

---

## 2. Scope

**In scope**

- Admin Users table: column order, Visibility column (header + per-row content), Status and Deactivate alignment.
- Deactivate flow: confirmation modal with specified title and subtext; no change to backend deactivate behavior.

**Out of scope**

- Changes to the Manage locations modal (default + additional locations, add/remove).
- Backend API or deactivate logic (user is deactivated, not hard-deleted; ticket history already remains).
- Other admin pages or user management features.

---

## 3. Column Layout (Final Order)

| Column     | Header    | Content / behavior |
|-----------|-----------|---------------------|
| 1         | Name      | User display name (unchanged). |
| 2         | Email     | User email (unchanged). |
| 3         | Role      | Role dropdown, department dropdown when DEPARTMENT_USER, Pencil (Edit), Save/Saved. Unchanged behavior; Locations control is **not** in this column. |
| 4         | **Visibility** | **New column.** For users with role STUDIO_USER: a single button/link labeled **Locations (#)** where # = number of **unique** locations the user has visibility to (see count rule below). Click opens the existing "Manage locations" modal. For users who are not STUDIO_USER: display **—** (em dash) as a quiet placeholder; they have no location-based visibility. |
| 5         | Status    | Active / Inactive badge. **Right-align** this cell's content (e.g. `text-right` or `text-align: right`). |
| 6         | Actions   | **Deactivate** button only (Locations moved to Visibility). **Right-align** this cell with comfortable spacing from the Status column (e.g. padding/margin so Status and Deactivate don’t touch). Button remains red/destructive style; only visible when user is active. |

**Visibility column — count rule**

- Count = number of **unique** locations the user has visibility to. Do **not** use `(user.studioId ? 1 : 0) + scopeStudioIds.length`, which can double-count when the default studio also appears in scopes.
- **Correct calculation:** Collect the default studio id (if present), collect all scope studio ids, then count the **unique set** (e.g. `new Set([...(studioId ? [studioId] : []), ...(scopeStudioIds ?? [])]).size`). Use this value for # in "Locations (#)".
- Always show "Locations (#)" for STUDIO_USER with the computed # (0 or more); "Locations (0)" still opens the modal so they can add a default.

---

## 4. Deactivate Confirmation Modal

**Trigger:** User clicks "Deactivate" in the Actions column (no direct API call until confirmed).

**Modal content (exact copy):**

- **Title (heading):** `Deactivate user?`
- **Body / subtext:** `This user will no longer be able to sign in or access the system. Their ticket history will remain in the system.`
- **Actions:** 
  - **Cancel** — closes modal, no API call.
  - **Deactivate** (primary destructive) — closes modal and calls existing deactivate API (e.g. `usersApi.deactivate(userId)`), then invalidate users list.

**Behavior**

- No change to what the API does (deactivate user; ticket history is already preserved).
- After confirmation, existing success/error handling (e.g. list refresh, error message) unchanged.

---

## 5. Files to Change

| File | Changes |
|------|--------|
| `apps/web/src/app/(app)/admin/users/page.tsx` | (1) Table: add **Visibility** column header between Role and Status; add a table cell between Role and Status containing "Locations (#)" for STUDIO_USER (with count) or "—" for others. (2) Remove Locations button from the current Actions cell. (3) Status cell: add right-align class/style. (4) Actions cell: only Deactivate, right-aligned with spacing. (5) Add state for "user to deactivate" (e.g. `deactivateConfirmUserId`). (6) On Deactivate click, set that state to open confirmation modal instead of calling API. (7) Add a small confirmation modal: title "Deactivate user?", body "This user will no longer be able to sign in or access the system. Their ticket history will remain in the system.", Cancel and Deactivate buttons; on Deactivate, call `deactivateMut.mutate(userId)` and clear state. |

No backend or API changes.

---

## 6. UI Detail Summary

- **Visibility column:** Header "Visibility". Row: STUDIO_USER → "Locations (#)" button (MapPin optional); non–studio user → **—** (em dash only). # = size of unique set of default studioId (if present) + scopeStudioIds (no double-counting).
- **Status column:** Same Active/Inactive badge; cell content right-aligned.
- **Actions column:** Only Deactivate; cell right-aligned; spacing (e.g. `pl-6` or `margin-left`) so there is a clear gap between Status and Deactivate.
- **Deactivate modal:** Title "Deactivate user?"; body "This user will no longer be able to sign in or access the system. Their ticket history will remain in the system."; Cancel + Deactivate; Deactivate calls existing deactivate API then closes and refreshes list.

---

## 7. Risks / Notes

- **Count source:** The users list from `usersApi.list()` must include `studioId` and `scopeStudioIds` (or equivalent) so the Visibility count can be computed without an extra request. Use the unique-set logic so the default studio is not double-counted when it also appears in scopes. Current API already returns these; confirm and use.
- **Deactivate copy:** Modal reflects actual behavior (deactivate, not delete): user cannot sign in or access the system; ticket history remains. No backend change.

---

## 8. Test Plan (Manual)

- Admin Users: confirm column order is Name, Email, Role, **Visibility**, Status, Actions.
- Visibility: for a studio user with default + 2 additional locations (all unique), label shows "Locations (3)"; if default is also in scopes, count is 2. For studio user with no default and no scopes, "Locations (0)". For DEPARTMENT_USER/ADMIN, — (em dash).
- Click "Locations (#)" opens existing Manage locations modal; count in list updates after adding/removing in modal.
- Status and Deactivate are right-aligned with clear spacing.
- Click Deactivate → confirmation modal appears: title "Deactivate user?", body as specified. Cancel closes without deactivating. Deactivate proceeds and list refreshes; user shows Inactive.

---

*End of mini-spec. Do not implement until approved.*
