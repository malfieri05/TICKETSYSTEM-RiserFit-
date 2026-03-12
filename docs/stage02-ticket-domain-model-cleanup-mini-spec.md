# Stage 2: Ticket Domain Model Cleanup — Mini-Spec

## 1. Intent

Clean up and strengthen the ticket and subtask domain model so it behaves like a predictable workflow engine, supports clear progress and completion semantics, and lays the foundation for workflow timing analytics. This stage focuses on **domain logic and data model consistency**—no UI polish, no comment/reply features. The goal is a simpler, more consistent workflow that remains the single source of truth (backend) and stays compatible with Stage 1 lifecycle and feed correctness.

---

## 2. Problem Statement

Today the ticket/subtask model has accumulated complexity and inconsistency:

- Ticket status (NEW vs IN_PROGRESS) is not always driven automatically by subtask activity; the relationship is partially documented in Stage 1 but implementation may be incomplete or inconsistent.
- Subtask states include **BLOCKED**, which conflates “blocked” with workflow state; blocking/waiting is better expressed at the **ticket** level (e.g. WAITING_ON_REQUESTER, WAITING_ON_VENDOR).
- The **required subtask** concept (isRequired) adds conditional resolution logic: only “required” subtasks block RESOLVED. This complicates the mental model and analytics (“completion” becomes “all required done” instead of “all work done”).
- Subtask timing is partial: `completedAt` and `readyAt` exist, but there is no clear **availableAt** or **startedAt**, and no single definition for “completion time” vs “active work time,” which limits future analytics.
- Progress (completed vs total subtasks, percent) is computed in multiple places (backend list annotation, frontend) and may diverge; the source of truth should be server-side only.
- Completion is defined as “all required subtasks DONE or SKIPPED”; removing “required” simplifies to “all subtasks DONE or SKIPPED” and makes analytics straightforward.

This stage defines the desired behavior, simplifies the state model, introduces a clear subtask timer system, and ensures ticket progress and completion rules are unambiguous and backend-driven.

### Dev-phase migration philosophy

This stage assumes a **dev-phase environment** with **disposable** ticket and subtask data. Existing records are development/test data and do **not** require backwards-compatibility protection. Schema cleanup should prioritize the **clean final domain model**. Migrations may be **direct or destructive** where appropriate; no production records need preservation. Implementation should not add temporary compatibility layers or bridge logic solely to protect test records.

---

## 3. Current System Issues

| Area | Current Issue |
|------|----------------|
| **Ticket NEW → IN_PROGRESS** | Stage 1 spec says it should happen when the first subtask has activity (IN_PROGRESS or DONE); implementation may not consistently auto-transition or may require TRIAGED first. |
| **Subtask BLOCKED** | BLOCKED exists as a subtask status; it overlaps with ticket-level WAITING_ON_* and adds state without clear workflow benefit at the subtask level. |
| **Required subtasks** | `isRequired` on Subtask and SubtaskTemplate; resolution gate counts only required subtasks; optional subtasks do not block RESOLVED. This splits “workflow” into two classes and complicates “all work done” semantics. |
| **Subtask timing** | Only `completedAt` and `readyAt` (and createdAt/updatedAt). No `availableAt` (when work could start) or `startedAt` (when work actually started). Completion time and active work time are not consistently defined. |
| **Progress calculation** | Backend annotates list with completedSubtasks/totalSubtasks via groupBy; frontend may also compute progress. No single canonical progressPercent from API. |
| **Completion rule** | “All required subtasks DONE or SKIPPED” → RESOLVED. Changing to “all subtasks” requires removing isRequired and updating resolution gate logic. |
| **Analytics foundation** | Workflow analytics exist (e.g. workflow-analytics.service) but rely on readyAt/completedAt and isRequired; no standard availableAt/startedAt/completedAt and duration semantics. |

---

## 4. Desired Behavior

- **Ticket status** is driven by subtask activity: NEW until any subtask has activity; then IN_PROGRESS (or TRIAGED if explicitly set). RESOLVED when all subtasks are DONE or SKIPPED (no “required” distinction).
- **Subtask states** are reduced to four: READY, IN_PROGRESS, DONE, SKIPPED. LOCKED remains for dependency ordering (subtask not yet eligible). BLOCKED is removed; blocking is a ticket-level concern.
- **Required-subtask concept removed entirely:** All subtasks participate in completion. Ticket becomes RESOLVED only when every subtask is DONE or SKIPPED. There are no “optional” subtasks; **isRequired** is removed from the workflow model, template model, API contracts, and UI. This is a **direct cleanup**, not a phased deprecation—no compatibility behavior is preserved around “optional” subtasks.
- **Subtask timing** is explicit: availableAt, startedAt, completedAt, with clear rules so that Completion Time and Active Work Time can be computed for analytics.
- **Progress** is computed server-side only (completedSubtasks, totalSubtasks, progressPercent) and exposed via API; frontend consumes these values and does not compute progress independently.
- **Backend remains the single source of truth**; no parallel frontend-only workflow model. Stage 1 lifecycle and feed rules (active vs completed, deterministic feed, visibility) are preserved.

---

## 5. Ticket State Logic

### 5.1 NEW

- A ticket remains **NEW** until **any** subtask has activity.
- “Activity” means: the subtask is marked **IN_PROGRESS** or **DONE** (or SKIPPED). Moving directly from READY to DONE counts as activity.

### 5.2 NEW → IN_PROGRESS (automatic)

- **Trigger:** The **first** time any subtask on the ticket is set to **IN_PROGRESS** or **DONE** (or SKIPPED).
- **Rule:** If the ticket is currently NEW (or TRIAGED), the system MUST transition it to **IN_PROGRESS** when this trigger fires. No user action on the ticket status is required.
- **IN_PROGRESS on subtask is optional:** Users may move a subtask directly from READY to DONE. That still counts as activity and still triggers NEW → IN_PROGRESS on the ticket. IN_PROGRESS is useful for signaling “work in progress” but is not required for workflow correctness.

### 5.3 Other ticket transitions (unchanged)

- NEW → TRIAGED, CLOSED (manual or triage flow).
- TRIAGED → IN_PROGRESS, CLOSED.
- IN_PROGRESS → WAITING_ON_REQUESTER, WAITING_ON_VENDOR, RESOLVED (manual or automatic for RESOLVED per §9).
- WAITING_ON_* → IN_PROGRESS, RESOLVED, CLOSED.
- RESOLVED → CLOSED, IN_PROGRESS (re-open).
- CLOSED → (none).

Only the existing ticket state machine (and code that invokes it) may perform ticket status transitions. Automatic transitions (NEW → IN_PROGRESS, IN_PROGRESS → RESOLVED) are triggered from subtask lifecycle handlers that call the state machine.

---

## 6. Subtask State Model

### 6.1 Canonical subtask states

After this stage, the canonical subtask states are:

- **LOCKED** — Not yet eligible to start (dependency not satisfied). Used internally for dependency ordering; when all dependencies are DONE or SKIPPED, the subtask becomes READY.
- **READY** — Eligible to be worked on; not yet started.
- **IN_PROGRESS** — Work has started. Optional: users may go READY → DONE without ever setting IN_PROGRESS.
- **DONE** — Work completed.
- **SKIPPED** — Explicitly skipped (e.g. not applicable).

### 6.2 Removal of BLOCKED

- **BLOCKED** must be removed **entirely** from the subtask domain model. It must be removed from the enum/state options as part of Stage 2.
- Blocking and waiting belong **only** at the **ticket** level (e.g. WAITING_ON_REQUESTER, WAITING_ON_VENDOR). A “blocked” situation is represented by ticket status, not by a subtask status. The subtask model does not retain any BLOCKED concept.
- **Migration:** Existing development/test rows using BLOCKED do **not** need special preservation. Current data is disposable. Migration can **directly rewrite or remove** BLOCKED usage (e.g. set existing BLOCKED rows to READY or another valid state, then remove the enum value). No compatibility layer for BLOCKED is required.

### 6.3 State transitions (subtask)

- LOCKED → READY (when dependencies are satisfied).
- READY → IN_PROGRESS, DONE, SKIPPED.
- IN_PROGRESS → DONE, SKIPPED (and possibly back to READY if product allows “unstart”).
- DONE, SKIPPED → (terminal for that subtask unless re-open is supported; re-open is out of scope for this stage).

---

## 7. Subtask Timer System

### 7.1 Timing fields

The following timing fields and semantics apply to **Subtask** (and optionally to SubtaskTemplate for defaults; template timing is out of scope for this stage).

| Field | Type | Meaning |
|-------|------|--------|
| **availableAt** | DateTime | When the subtask became eligible to be started. For the first subtask(s) with no dependencies, this is set at ticket creation (or when the subtask is created). For a subtask with dependencies, availableAt is set when the last dependency becomes DONE or SKIPPED. |
| **startedAt** | DateTime? | First time the subtask is marked IN_PROGRESS or DONE. If the user goes directly READY → DONE, startedAt is set at that moment (same as completion moment for that case). |
| **completedAt** | DateTime? | When the subtask is marked DONE or SKIPPED. Already exists; semantics unchanged. |
| **durationSeconds** | Optional derived | Can be computed as (completedAt - availableAt) in seconds for “time in queue + work”; or stored as a denormalized value for reporting. |

**readyAt vs availableAt:** **availableAt** is the canonical “eligible to start” timestamp. **readyAt** must be **removed or replaced**—it is not kept as a parallel concept. The final model uses only **availableAt**, **startedAt**, and **completedAt**. Migration can directly rename/replace readyAt with availableAt (or drop readyAt and add availableAt); old data is disposable, so no backwards-compatibility protection is required.

### 7.2 Timing behavior

- **availableAt**
  - First subtask(s) (no dependencies): set when the subtask is created (or when the ticket is created if the subtask is created with the ticket). If the ticket is created with multiple subtasks and no dependencies, all have availableAt = creation time.
  - Subsequent subtasks (with dependencies): set when the **last** dependency transitions to DONE or SKIPPED. If multiple subtasks become eligible at the same time (same dependency set), they all get the same availableAt.

- **startedAt**
  - Set the **first** time the subtask’s status becomes IN_PROGRESS or DONE. If the user skips IN_PROGRESS and sets DONE directly, startedAt is set at that same moment. Once set, startedAt is not cleared (unless the product supports “re-open” and resets the subtask; that is out of scope).

- **completedAt**
  - Set when the subtask’s status becomes DONE or SKIPPED. Already present in schema; semantics unchanged.

### 7.3 Timing metrics (derived)

Two metrics that must be computable for analytics:

- **Completion Time (cycle time)** = `completedAt - availableAt` (in seconds or appropriate unit). Represents total time from “could start” to “done.”
- **Active Work Time** = `completedAt - startedAt` (only when startedAt is not null). Represents time from “actually started” to “done.” If the user went directly to DONE, this may be zero or near-zero.

If a user skips IN_PROGRESS and goes directly to DONE, analytics still work: startedAt and completedAt are set together, so Active Work Time is zero or minimal; Completion Time still reflects availableAt → completedAt. IN_PROGRESS remains optional but useful for measuring “time in progress” when used.

---

## 8. Ticket Progress Calculation

### 8.1 Server-side only

- **completedSubtasks** — Count of subtasks in status DONE or SKIPPED.
- **totalSubtasks** — Count of all subtasks on the ticket.
- **progressPercent** — `totalSubtasks === 0 ? 0 : floor((completedSubtasks / totalSubtasks) * 100)`. Use **floor** (not round) to avoid overstating progress.

These MUST be computed on the backend and exposed in the API (e.g. ticket list response, ticket detail response). The frontend MUST consume these values and MUST NOT compute progress independently (e.g. no client-side “completed count / total count” that could diverge from the server).

### 8.2 Where exposed

- List endpoints (e.g. GET /tickets): include completedSubtasks, totalSubtasks, and progressPercent on each ticket (or ensure existing annotations are renamed/standardized to these names).
- Ticket detail (GET /tickets/:id): include the same so the detail view uses the same source of truth.

---

## 9. Ticket Completion Rules

### 9.1 Completion condition

- A ticket becomes **RESOLVED** automatically when **all** of its subtasks are in status **DONE** or **SKIPPED**.
- There is no “required” vs “optional” distinction: every subtask must be DONE or SKIPPED for the ticket to be considered complete.
- No manual “mark ticket resolved” step is required for workflow completion; the system transitions the ticket to RESOLVED when the last subtask is marked DONE or SKIPPED.

### 9.2 Single authoritative path for automatic resolution

Automatic resolution (transition to RESOLVED when all subtasks are DONE or SKIPPED) must occur in **one authoritative place** in the backend—**subtask lifecycle handling** in **SubtasksService** (or an equivalent single domain path). The flow is:

1. **Subtask status change** (e.g. update to DONE or SKIPPED) is handled in the subtask service.
2. The service **checks whether all subtasks** on the ticket are DONE or SKIPPED.
3. **If yes,** the service calls the **ticket state machine** (or centralized ticket transition path) to transition the ticket to RESOLVED.

Automatic resolution must **not** be duplicated across controllers, frontend, or multiple backend services. There is one workflow-engine path: subtask lifecycle → completion check → ticket state machine. Other callers (e.g. ticket controller) do not perform automatic resolution; they rely on this single path.

### 9.3 Compatibility with Stage 1

- Stage 1 defines: completed tickets (RESOLVED, CLOSED) leave active feeds immediately and appear only in Completed/History views; active = status not in [RESOLVED, CLOSED]. This stage does not change that. The only change is the **definition** of when RESOLVED is reached: “all subtasks DONE or SKIPPED” instead of “all required subtasks DONE or SKIPPED.”
- Re-open (RESOLVED → IN_PROGRESS) and RESOLVED → CLOSED remain as in the existing state machine.

---

## 10. Data Model Changes

### 10.1 Subtask (live)

- **Remove entirely:** **BLOCKED** from the SubtaskStatus enum. Existing BLOCKED rows are disposable; migration can directly rewrite them to a valid state (e.g. READY) and remove the enum value.
- **Remove entirely:** **isRequired** column. All subtasks participate in completion; no optional bypass. Remove from schema and all code paths—direct cleanup, not deprecation.
- **Add:** **availableAt** (DateTime, nullable for backfill) — when the subtask became eligible to start. This is the canonical “eligible to start” timestamp.
- **Add:** **startedAt** (DateTime, nullable) — first time status became IN_PROGRESS or DONE.
- **Keep:** **completedAt** (DateTime, nullable).
- **Remove/replace:** **readyAt**. Do not keep two overlapping timestamps. **readyAt** is removed or replaced by **availableAt**; migration can directly rename or drop readyAt and populate availableAt (disposable data, no compatibility layer needed).
- **Optional:** **durationSeconds** (Int, nullable) — denormalized for reporting; can be computed on read if preferred.

Final timing model: **availableAt**, **startedAt**, **completedAt** only.

### 10.2 SubtaskTemplate

- **Remove entirely:** **isRequired** from the template model, API, and admin UI. Admin workflow template UI must not expose a “required” checkbox. All subtasks created from templates participate in completion. Direct removal—no phased deprecation or compatibility behavior.

### 10.3 Ticket

- No new columns required for this stage. Ticket already has status, resolvedAt, closedAt. Progress and completion are derived from subtask state and (after this stage) from server-side progress fields exposed in API responses.

### 10.4 Migration implications (dev-phase)

- **SubtaskStatus enum:** Remove BLOCKED entirely. Existing BLOCKED rows are disposable; rewrite to READY (or another valid state) and drop the enum value. No preservation of BLOCKED.
- **Subtask.isRequired / SubtaskTemplate.isRequired:** Remove the columns and all references. Resolution and progress use “all subtasks” only. Direct cleanup—no transition period or compatibility behavior.
- **readyAt:** Remove or replace with availableAt. Migration can directly rename or drop and backfill availableAt (e.g. from readyAt or createdAt). No parallel readyAt/availableAt.
- **availableAt / startedAt:** Add columns; backfill as needed (e.g. availableAt = createdAt or ex-readyAt; startedAt = completedAt where completedAt is set). Dev data allows direct/destructive migration where appropriate.
- **Resolution gate:** Single rule—count all subtasks not DONE/SKIPPED. When count reaches zero, the **subtask lifecycle path** (e.g. SubtasksService) calls the ticket state machine to transition the ticket to RESOLVED.

---

## 11. API / Contract Changes

### 11.1 Ticket list and detail responses

- Ensure **completedSubtasks**, **totalSubtasks**, and **progressPercent** are present and authoritative. Align naming with existing list annotations (Stage 1 already returns completedSubtasks/totalSubtasks; add or standardize progressPercent).
- Any client that currently computes progress from raw subtask lists should be updated to use these fields only.

### 11.2 Subtask responses

- Include **availableAt**, **startedAt**, **completedAt** in subtask DTOs so clients and future analytics can consume them.
- **durationSeconds** (or equivalent) may be included as a computed field in responses.
- **Remove entirely:** **isRequired** from subtask and template API responses and request bodies. No backward compatibility—direct removal.

### 11.3 Admin workflow template API

- Create/update subtask template endpoints must **not** accept or return **isRequired**. Admin UI must **not** show a “required” checkbox. Direct removal from contracts and UI.

### 11.4 DTOs

- Subtask DTOs: add availableAt, startedAt; keep completedAt; add optional durationSeconds; **remove** isRequired (no deprecation period).
- SubtaskTemplate DTOs: **remove** isRequired.
- Ticket list/detail DTOs: ensure progress fields (completedSubtasks, totalSubtasks, progressPercent) are documented and stable.

---

## 12. Risks and Edge Cases

- **Migration of BLOCKED:** In dev-phase, existing BLOCKED rows are disposable; direct rewrite to READY (or another valid state) and enum removal is acceptable. Blocking is ticket-level only going forward.
- **Migration of isRequired:** With disposable data, isRequired is removed entirely. All subtasks now participate in completion; no optional bypass. Direct schema and contract removal.
- **Backfill of availableAt/startedAt:** Old subtasks may have NULL availableAt/startedAt. Analytics and reports should handle NULL (e.g. “unknown” or exclude from averages). Backfill rules should be defined (e.g. availableAt = createdAt, startedAt = completedAt when completed).
- **Re-open:** If a ticket is re-opened (RESOLVED → IN_PROGRESS), subtasks are not automatically reset. Timing and “all DONE/SKIPPED” rule still hold; no change to re-open behavior beyond the completion rule.
- **Zero subtasks:** A ticket with zero subtasks: completion rule “all DONE or SKIPPED” is vacuously true. The system may allow RESOLVED when there are no subtasks (implementation decision; spec does not require tickets to have subtasks).

---

## 13. Verification Plan

1. **Ticket NEW → IN_PROGRESS:** Create a ticket with subtasks; leave ticket NEW. Mark one subtask IN_PROGRESS (or DONE). Assert ticket status becomes IN_PROGRESS. Repeat with READY → DONE directly; assert same result.
2. **Subtask BLOCKED removed:** Confirm SubtaskStatus enum no longer includes BLOCKED. Existing BLOCKED rows have been directly rewritten; no 500s or broken UI. Blocking/waiting is ticket-level only.
3. **Completion rule:** Create a ticket with N subtasks. Mark N-1 as DONE or SKIPPED; assert ticket is not RESOLVED. Mark the last subtask DONE or SKIPPED; assert ticket transitions to RESOLVED and resolvedAt is set.
4. **Progress:** For a ticket with subtasks, assert list and detail return completedSubtasks, totalSubtasks, progressPercent (using floor); assert values match server-side counts. Change subtask status; assert progress updates. Frontend does not compute progress from raw subtask list.
5. **Timing:** Create a ticket with one subtask; set availableAt at creation. Mark subtask DONE; assert startedAt and completedAt set. Assert Completion Time = completedAt - availableAt and Active Work Time = completedAt - startedAt (or equivalent) are computable.
6. **Templates:** Create/update a subtask template via admin API; confirm isRequired is not in the contract (removed). Admin UI has no “required” checkbox for subtask templates.
7. **Single resolution path:** Automatic RESOLVED transition occurs only from the subtask lifecycle path (e.g. SubtasksService); not from controllers, frontend, or other services.
8. **Stage 1 compatibility:** Active feed still excludes RESOLVED/CLOSED; completed feed still shows them; deterministic sort and visibility unchanged.

---

## 14. Acceptance Criteria

- [ ] **Ticket status logic:** A ticket remains NEW until any subtask has activity (IN_PROGRESS or DONE/SKIPPED). NEW → IN_PROGRESS occurs automatically when the first subtask is set to IN_PROGRESS or DONE (or SKIPPED). Users may go READY → DONE without using IN_PROGRESS; IN_PROGRESS is optional.
- [ ] **Subtask state model:** Canonical subtask states are LOCKED, READY, IN_PROGRESS, DONE, SKIPPED. BLOCKED is removed entirely from the enum and domain; existing BLOCKED usage is directly rewritten (disposable data). Blocking is ticket-level only.
- [ ] **Required subtask removed:** The required-subtask concept is removed entirely. isRequired is removed from workflow model, template model, API contracts, and UI. Direct cleanup—no compatibility behavior. Ticket completion is based on all subtasks being DONE or SKIPPED.
- [ ] **Subtask timer system:** availableAt, startedAt, completedAt (and optional durationSeconds or equivalent) are defined and implemented. readyAt is removed/replaced by availableAt; final model has only availableAt, startedAt, completedAt. availableAt for first subtask(s) at creation; for others when dependencies are satisfied. startedAt on first IN_PROGRESS or DONE. completedAt on DONE/SKIPPED. Completion Time and Active Work Time are defined and computable; direct READY → DONE still produces correct analytics.
- [ ] **Ticket progress:** completedSubtasks, totalSubtasks, and progressPercent (using floor) are computed server-side and exposed in list and detail APIs. Frontend consumes these values and does not compute progress independently.
- [ ] **Ticket completion rule:** Ticket becomes RESOLVED automatically when all subtasks are DONE or SKIPPED. No manual resolution step. Automatic resolution occurs in one authoritative place only (subtask lifecycle in SubtasksService or equivalent); not duplicated in controllers, frontend, or multiple backend services. Compatible with Stage 1 lifecycle and feed rules.
- [ ] **Data model / API:** Schema and API changes (BLOCKED removed from enum, isRequired removed, readyAt removed/replaced by availableAt, timing fields) are implemented. Migrations are direct/destructive where appropriate (dev-phase, disposable data). DTOs and admin template API updated. No regression in Stage 1 behavior.

---

## 15. Future Analytics Foundation

This stage explicitly lays the foundation for:

- **Average ticket completion time** — from ticket creation (or first subtask availableAt) to resolvedAt.
- **Average subtask completion time** — Completion Time (completedAt - availableAt) per subtask or per template.
- **Department completion analytics** — aggregation of completion times by department (subtask or ticket level).
- **Bottleneck detection** — subtasks with long Completion Time or long time in READY (availableAt to startedAt).
- **Workflow analytics** — consistency of timing fields (availableAt, startedAt, completedAt) across all subtasks enables downstream reporting and dashboards without further schema churn.

Analytics implementation is out of scope for this stage; this spec ensures the domain model and timing fields are in place so that future stages or separate services can compute these metrics reliably.
