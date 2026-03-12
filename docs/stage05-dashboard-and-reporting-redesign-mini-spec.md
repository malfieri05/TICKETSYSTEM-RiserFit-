# Stage 5: Dashboard and Reporting Redesign — Mini-Spec

## 1. Intent

Redesign the **dashboard** and **reporting** experience so they reflect the real workflow engine and timing system established in Stages 1–2, and present a clear information architecture for admins, department users, and studio users. This stage focuses on **dashboard/reporting structure, metric definitions, and clean presentation rules**—not broad app-wide polish or admin settings cleanup.

Goals:

- **Define what each dashboard shows** — Admin, Department, and Studio dashboards as **data/summary views**, not duplicate ticket feeds.
- **Define what each report measures** — Metrics must align with Stage 2 workflow and timing (availableAt, startedAt, completedAt; ticket resolvedAt; no BLOCKED, no “required” subtasks).
- **Clarify workflow timing metrics** — Average completion time, subtask cycle time, active work time, and bottlenecks with exact semantics.
- **Establish how ticket and subtask analytics are grouped** — By type (support vs maintenance), by location (studio/market), by workflow, by department.
- **Remove or replace outdated elements** — “My Dashboard” naming, secondary “My Tickets” panel, “My Tickets by Category,” “By Market” (→ “By Location”), any “blocked” subtask language.

Stage 1 visibility and feed correctness, Stage 2 workflow/timing truth, Stage 3 collaboration behavior, and Stage 4 feed/panel polish are **preserved**. The backend remains the source of truth for all metrics. No domain or API changes are specified beyond what is needed to support the redesigned dashboard and reporting contracts.

---

## 2. Problem Statement

The current dashboard and reporting surfaces have grown without a single source of truth for metric semantics and role-specific structure:

- **Admin dashboard** (/dashboard) is labeled “Dashboard — {displayName}” and behaves like a **personal** view: “My Tickets” KPI, “Recent tickets” panel (duplicate feed), and “My Tickets by Category.” It does not present a clear **org-wide** summary (new vs in progress vs resolved, by type, by location) aligned with the workflow engine.
- **Metric definitions** are implicit or inconsistent: “Open” vs “In Progress,” “Avg Completion” (created → resolved) vs “Avg Resolution,” and subtask timing are not formally defined in one place. Stage 2 introduced **availableAt**, **startedAt**, **completedAt** and clear completion rules; reporting and dashboards do not yet consistently use these.
- **Reporting page** uses “By Market” and aggregates that may mix market and studio; product language should standardize on **location** (studio and/or market) where appropriate. Workflow/subtask completion timing is not presented in a dedicated, readable way.
- **Workflow analytics** includes “Longest-running subtask types” (timing-based), which is valid, but there is no single definition of **bottleneck** (e.g. exceeds target vs baseline), and no clear split between what belongs on the **dashboard** vs the **reporting / workflow analytics** page.
- **Department and studio dashboards** are underspecified: department users see the same “My Dashboard” as admins; studio users see a Portal “dashboard” tab with stat cards and recent tickets. Neither has a clear “summary only, no duplicate feed” rule or location-filtering behavior for multi-location users.
- **Outdated concepts** may still appear: “blocked” subtask types (Stage 2 removed BLOCKED), or status breakdowns that conflict with NEW / IN_PROGRESS / RESOLVED semantics.

This stage defines the desired behavior, metric semantics, dashboard role definitions, reporting page structure, and data contracts so implementation can build dashboards and reports that are correct, consistent, and future-ready.

---

## 3. Current Dashboard / Reporting Issues

| Area | Current Issue |
|------|----------------|
| **Admin dashboard label** | “Dashboard — {displayName}” reads as “My Dashboard”; should be “Dashboard” for an org-wide view. |
| **Admin dashboard content** | “My Tickets” KPI and “Recent tickets” panel duplicate the ticket feed; “My Tickets by Category” is user-centric. Admin dashboard should show org-wide KPIs and breakdowns (by type, by location), not a second feed. |
| **Metric semantics** | “Open,” “In Progress,” “New,” “Resolved,” “Avg Completion” are not formally defined. Stage 2 defines NEW (no subtask activity), IN_PROGRESS (first subtask started/done), RESOLVED (all subtasks DONE/SKIPPED); dashboard/reporting must use consistent definitions. |
| **Reporting “By Market”** | Label and API name “By Market” should become “By Location” (studio and/or market) for consistent product language. |
| **Workflow timing on reporting** | No dedicated, clean workflow/subtask completion timing display; users cannot toggle by workflow or see fixed-size analytics box with internal scroll. |
| **“Blocked” language** | Stage 2 removed BLOCKED from subtasks. Any “Most blocked subtask types” or similar must be removed; bottleneck identification must be timing-based (e.g. completion time exceeds target or high cycle time vs baseline). |
| **Department / studio dashboards** | Department users get same dashboard as admin; studio dashboard mixes stats and recent list. No clear “summary only,” location filter, or role-appropriate KPIs. |
| **Dashboard vs reporting split** | Unclear what is a “dashboard” summary card vs “reporting” drilldown; workflow analytics (templates, departments, bottlenecks) lives on a separate page but structure and contracts are not fully aligned with Stage 2 timing. |

---

## 4. Desired Behavior

- **Dashboards** are **data/summary views**: KPI cards, small breakdowns, and optional short “recent activity” previews with a link to the full feed. They are **not** duplicate ticket feeds. Ticket lists live on dedicated routes (Tickets, Inbox, Portal My/Studio tabs).
- **Admin dashboard** is labeled “Dashboard” (not “My Dashboard”), shows **org-wide** top KPIs (New Tickets, In Progress, Resolved, Avg Completion), and replaces “My Tickets” / “My Tickets by Category” with **Support Tickets by Type** and **Maintenance Tickets by Location**. No secondary “My Tickets” panel.
- **Department dashboard** shows summary data relevant to the user’s department(s) and visibility; later supports timing/workflow stats for their department. **Studio dashboard** shows summary data for the user’s allowed location(s), with location name at top and optional location filter when the user has multiple locations.
- **Metrics** have **exact definitions** (see §8): New, In Progress, Resolved, Average Ticket Completion Time, Average Subtask Completion Time, Active Work Time, Bottleneck. Live/current vs historical and dependency on completed data are clarified.
- **Reporting page** replaces “By Market” with “By Location”; adds a clean **workflow/subtask completion timing** display with workflow toggle and fixed-size analytics box (internal scroll); removes “Most blocked subtask types” and any BLOCKED-based logic; reflects Stage 2 timing and removal of BLOCKED.
- **Workflow analytics** structure is defined so average completion by workflow, average subtask completion by step, department timing, and bottleneck identification can be implemented consistently; clear split between dashboard cards and dedicated reporting/workflow analytics page.
- **Data contracts** are identified: what can be derived from current Stage 2 data, what endpoints or aggregations are needed, and whether dashboard cards and reporting boxes share metric endpoints or use separate ones. No implementation of new APIs in this spec—only contract and requirement definition.

---

## 5. Dashboard Role Definitions

### 5.1 Purpose of each dashboard

- **Dashboard** = data/summary view. It answers “what is the state of work?” with counts, averages, and small breakdowns. It does **not** replace or duplicate the canonical ticket feed (Tickets, Inbox, Portal My/Studio).
- **Admin dashboard** — Org-wide summary: how many tickets are new, in progress, resolved; average completion; breakdowns by ticket type (support vs maintenance) and by location. Audience: admins who need a single at-a-glance view of the whole system.
- **Department user dashboard** — Summary of work visible to that user: counts and, where applicable, timing/workflow stats for their department(s). Not a full ticket list; links to Tickets and Inbox for lists.
- **Studio user dashboard** — Summary of the user’s requested tickets and/or their allowed studio(s): open vs completed counts, optional by-location breakdown. Location name shown clearly at top; if the user has multiple allowed locations, the dashboard can filter or toggle between them. No duplicate feed; “My tickets” and “By studio” lists live on Portal tabs.

### 5.2 Summary cards vs drilldown

- **Dashboard** shows: top KPI cards (counts, one or two averages), and optionally small breakdowns (e.g. by type, by location) that fit on one screen. No large tables or full list views.
- **Drilldown** (detailed breakdowns, tables, charts over time, workflow step timing, export) belongs on the **Reporting** page or **Workflow Analytics** page, not on the dashboard. Dashboard may link to “View full report” or “View tickets.”

### 5.3 Location filtering (multi-location users)

- **Studio users** with multiple allowed studios: dashboard can show a **location filter** (e.g. “All” vs specific studio). Summary cards and any by-location breakdown respect the selected location. Default can be “All” or the user’s primary/default location if configured.
- **Department users** with visibility across multiple studios/markets: dashboard summary can be scoped to “all visible” or, if product supports it, to a selected location. Implementation detail: same visibility rules as Stage 1; filter is a UX overlay on top of already-visible data.
- **Admins** see org-wide data; location filter on admin dashboard is optional (e.g. “All locations” vs filter by market/studio for deeper drilldown that may live on reporting).

---

## 6. Admin Dashboard Redesign

### 6.1 Label and scope

- **Label:** “Dashboard” (not “My Dashboard,” not “Dashboard — {displayName}”). The admin dashboard is the **org-wide** summary view.
- **Scope:** All tickets the admin can see (global visibility per Stage 1). Metrics and breakdowns are system-wide unless a location filter is applied.

### 6.2 Top KPI cards

Four primary cards:

1. **New Tickets** — Count of tickets in status **NEW** (no subtask activity yet). Live/current count.
2. **In Progress** — Count of tickets in status **IN_PROGRESS** (or TRIAGED, WAITING_ON_*, as appropriate for “work has started”). For “In Progress” card, use tickets where at least one subtask has been started or completed (i.e. status IN_PROGRESS or beyond, excluding NEW). Semantics must match Stage 1/2: NEW = no subtask activity; IN_PROGRESS = first subtask marked IN_PROGRESS or DONE (or SKIPPED).
3. **Resolved** — Count of tickets in status **RESOLVED** (and optionally **CLOSED** if “Resolved” is meant to include closed). Prefer single “Resolved” count for “work complete”; if product separates, “Resolved” + “Closed” can be two cards or one combined.
4. **Avg Completion** — **Average Ticket Completion Time** (see §8): `resolvedAt - createdAt` over resolved tickets in a defined window (e.g. last 30 days or last 90 days). Historical average; depends on enough completed tickets.

All counts and averages must be **backend-derived** and exposed via a dashboard summary endpoint or equivalent; frontend only displays.

### 6.3 Remove

- **Secondary “My Tickets” panel** — The “Recent tickets” / “View all tickets” block that duplicates the ticket feed. Remove from admin dashboard. Link to “Tickets” or “Inbox” in nav or a single “View tickets” link is sufficient.
- **“My Tickets by Category”** — User-centric breakdown. Remove from admin dashboard.

### 6.4 Replace with

- **Support Tickets by Type** — Breakdown of **support** tickets (e.g. by support topic or category) that are in scope for the admin dashboard. Counts per type; can be “current open” or “all visible” depending on product choice. Reflects live/current tickets where appropriate.
- **Maintenance Tickets by Location** — Breakdown of **maintenance** tickets by location (studio and/or market). “By location” language (not “by market” only); data can group by studio, market, or both depending on schema. Reflects live/current tickets where appropriate.

If the product does not distinguish support vs maintenance in the schema, “Support Tickets by Type” and “Maintenance Tickets by Location” can be generalized to “Tickets by Type” and “Tickets by Location” with the same intent: type-based and location-based breakdowns replacing the old “My Tickets by Category.”

### 6.5 Language and location

- Where the product currently says “market,” prefer **“location”** (studio and/or market) in labels and copy for consistency. Backend may still use `marketId` / `studioId`; display label should be “By Location” or “By Studio” / “By Market” as appropriate to the data shown.

---

## 7. Department / Studio Dashboard Design

### 7.1 Department user dashboard

- **Purpose:** Summary data for the department user’s visible work (per Stage 1 visibility). Not a full ticket feed; feed lives on Tickets and Inbox.
- **Content:** KPI cards appropriate for non-admin roles: e.g. “My open,” “My resolved,” “Actionable count,” or department-scoped “Open” / “Resolved” counts. Exact cards can mirror a subset of admin KPIs scoped to the user’s visibility.
- **Future:** Department users should later be able to see **timing/workflow stats** relevant to their department (e.g. average completion time for their department’s tickets, workflow step timing). This stage defines the intent; implementation of department-level timing can follow in a later phase.
- **No duplicate feed:** No “Recent tickets” or “My Tickets” panel that replicates the Tickets or Inbox list.

### 7.2 Studio user dashboard

- **Purpose:** Summary for the studio user: their requested tickets and/or tickets for their allowed studio(s). Data dashboard only; ticket lists live under Portal “My tickets” and “By studio” tabs.
- **Location name:** The dashboard should show the **location name** clearly at the top (e.g. “Dashboard — {Studio Name}” or “Overview — {Studio Name}”). If the user has a single allowed studio, that name is shown; if multiple, see below.
- **Multiple locations:** If the user has **multiple allowed studios**, the dashboard can offer a **filter/toggle** (e.g. “All my locations” vs “Studio A” / “Studio B”). Summary cards and any breakdowns then reflect the selected location. Default can be “All” or a configured default location.
- **KPIs:** Appropriate for studio users: e.g. “Open tickets,” “Completed tickets,” or “Tickets I requested” open vs completed. No org-wide admin metrics; scope is the user’s visibility (requester + allowed studios per Stage 1).

### 7.3 Shared rules

- Dashboards show **summary data**, not full ticket feeds.
- All metrics are **backend-derived**; visibility rules (Stage 1) apply to any dashboard data.
- Presentation should feel **clean and summary-oriented**; preserve the polished feel from Stage 4 for cards and layout.

---

## 8. Metric Definitions

All metrics use the Stage 2 workflow and timing model. Definitions below are **authoritative** for dashboard and reporting implementation.

### 8.1 Ticket-level (live/current)

- **New Ticket** — A ticket in status **NEW** with **no subtask activity yet**. “No subtask activity” means no subtask has ever been set to IN_PROGRESS, DONE, or SKIPPED. Count of such tickets is **New Tickets**.
- **In Progress Ticket** — A ticket where **at least one subtask** has been marked **IN_PROGRESS** or **DONE** (or SKIPPED). In the ticket state machine this corresponds to status **IN_PROGRESS** (or TRIAGED, WAITING_ON_REQUESTER, WAITING_ON_VENDOR) after the automatic NEW → IN_PROGRESS transition. For dashboard “In Progress” count: tickets in status **IN_PROGRESS**, **TRIAGED**, **WAITING_ON_REQUESTER**, **WAITING_ON_VENDOR** (i.e. not NEW and not RESOLVED/CLOSED). So: **In Progress** = all active tickets that are not “New.” (Alternatively, “In Progress” can be restricted to status = IN_PROGRESS only; the spec prefers the broader “active but not new” for the top KPI so “New” and “In Progress” are disjoint and cover active work.)
- **Resolved Ticket** — A ticket in status **RESOLVED** or **CLOSED**. Count = **Resolved** (or split Resolved vs Closed if product needs two numbers).

### 8.2 Ticket-level (historical averages)

- **Average Ticket Completion Time** — For tickets that have been **resolved** (status RESOLVED or CLOSED and `resolvedAt` set):  
  **Average of (resolvedAt − createdAt)** over a defined time window (e.g. last 30 or 90 days), in hours or days.  
  **Semantic:** Time from ticket creation to resolution.  
  **Depends on:** Enough completed tickets in the window; if none, show “—” or “No data.”

### 8.3 Subtask-level (Stage 2 timing fields)

- **Average Subtask Completion Time (cycle time)** — For subtasks that have **completedAt** (and ideally **availableAt**):  
  **Average of (completedAt − availableAt)** per subtask, optionally by workflow or by subtask template.  
  **Semantic:** Time from “eligible to start” to “done.”  
  **Depends on:** availableAt and completedAt populated (Stage 2); enough completed subtasks for a meaningful average.
- **Active Work Time** — For subtasks that have **startedAt** and **completedAt**:  
  **completedAt − startedAt** (per subtask).  
  **Semantic:** Time from “work actually started” to “done.” If user went READY → DONE without IN_PROGRESS, startedAt may equal completedAt (zero or minimal active work time).  
  **Use:** Can be averaged by workflow step or department for “time spent working” vs “time in queue.”

### 8.4 Department and bottleneck

- **Average Department Completion Time** — Average ticket completion time (resolvedAt − createdAt) or average subtask completion time (completedAt − availableAt) **grouped by department** (e.g. ticket’s department or subtask’s department). Same semantics as above; grouping is by department for department-level reporting.
- **Bottleneck** — A **subtask type or workflow step** that either:  
  (1) **Subtask completion time exceeds its defined acceptable target** (if targets exist), or  
  (2) **Consistently exhibits high cycle time** (completedAt − availableAt) **relative to a baseline** (e.g. same workflow, other steps; or historical average).  
  **Not** based on BLOCKED status (Stage 2 removed BLOCKED). Bottleneck identification is **timing-based** only.

### 8.5 Live vs historical

- **Live/current:** New Tickets, In Progress, Resolved **counts** — reflect current state of tickets (today’s snapshot).
- **Historical averages:** Average Ticket Completion Time, Average Subtask Completion Time, Average Department Completion Time — computed over a time window (e.g. last 30/90 days) and require sufficient completed data.
- **Bottlenecks:** Derived from historical subtask completion data; not “current” but “recent period.”

---

## 9. Reporting Page Redesign

### 9.1 Replace “By Market” with “By Location”

- **Label and data:** The reporting page section currently labeled “By Market” shall be replaced with **“By Location.”**  
- **Data:** Counts (or other metrics) grouped by **location** — i.e. by studio and/or market, depending on schema and product choice. API and UI should use “location” in naming where possible; backend may still expose `marketId`/`marketName` or `studioId`/`studioName`; display label is “By Location” (or “By Studio” / “By Market” if the breakdown is specifically one of those).

### 9.2 Workflow / subtask completion timing display

- **Add** a **workflow/subtask completion timing** section:
  - Users can **toggle between workflows** (e.g. by workflow template or ticket type).
  - **Average completion time by workflow** and **average subtask completion time by workflow step** (using completedAt − availableAt, and optionally active work time) are shown.
  - The **analytics box** (the container for this section) has **fixed size** (fixed height or max-height) so layout does not jump when switching workflows. **Internal scroll** is allowed inside the box when content (e.g. different number of steps) is taller than the box.
  - Presentation: clear hierarchy (workflow name, then steps with timing); readable and aligned with §8 metric definitions.

### 9.3 Remove “Most blocked subtask types”

- **Remove** any section or metric named “Most blocked subtask types” or similar that implies BLOCKED status. Stage 2 removed BLOCKED; bottleneck or “longest-running” must be defined by **timing** (e.g. longest average completion time, or steps exceeding target), not by a blocked state.

### 9.4 Status breakdowns

- Any status breakdown on the reporting page must use **NEW / IN_PROGRESS / RESOLVED** (and other ticket statuses) per Stage 1/2. No status that conflicts with the current state machine (e.g. no BLOCKED for subtasks). Resolved/Closed can be combined or separate as needed.

---

## 10. Workflow Analytics Structure

### 10.1 What workflow analytics should present

- **Average completion time by workflow** — Per workflow template (or workflow type): average ticket completion time (resolvedAt − createdAt) for tickets that used that workflow.
- **Average subtask completion time by workflow step** — Per step (subtask template or order): average of (completedAt − availableAt) for subtasks in that step; optionally average active work time (completedAt − startedAt).
- **Department timing contributions** — Where appropriate: average completion time or subtask cycle time **by department** (e.g. which department owns the subtask or ticket). Supports “department performance” and staffing insights later.
- **Bottleneck identification** — Subtask types or steps that exceed a target or show high cycle time relative to baseline (see §8.4). Presented as a list or table (e.g. “Longest-running subtask types” or “Steps exceeding target”). No BLOCKED-based metric.

### 10.2 Dashboard vs reporting / workflow analytics page

- **Dashboard (admin):** Top KPIs (New, In Progress, Resolved, Avg Completion) and small breakdowns (Support by Type, Maintenance by Location). No workflow-step-level timing; no bottleneck table.
- **Reporting page:** Volume, by status, by priority, by category, **by location**, resolution time by category, completion by owner, and the **workflow/subtask completion timing** section (with workflow toggle and fixed-size scrollable box).
- **Workflow Analytics page (admin):** Dedicated place for workflow template analytics, department workflow metrics, and **bottleneck** (longest-running or exceeding-target) subtask types. Structure should allow charts/cards to be built cleanly from the same metric definitions (§8) and shared or dedicated endpoints.

### 10.3 Fixed-size analytics box and workflow toggle

- The workflow timing section (on reporting or workflow analytics) must have:
  - A **workflow selector** (dropdown or tabs) to switch between workflows.
  - A **fixed-height or max-height container** so that when different workflows have different numbers of steps, the page layout does not jump. **Internal scroll** inside the container when content overflows.
  - Consistent semantics: same metric definitions (completion time, active work time) across workflows.

---

## 11. Data / Contract Considerations

### 11.1 What can be derived from current Stage 2 data

- **Ticket status counts** (NEW, IN_PROGRESS, RESOLVED, etc.) — From existing ticket table and status; no new schema.
- **Average ticket completion time** — resolvedAt − createdAt; requires resolvedAt set (already in schema).
- **Subtask completion time** — completedAt − availableAt; requires **availableAt** and **completedAt** (Stage 2). **startedAt** for active work time (Stage 2).
- **By location** — From ticket.studioId / ticket.marketId (or equivalent); grouping and display as “By Location.”
- **By type** — From ticket taxonomy (support topic, maintenance category, ticket class); “Support by Type” and “Maintenance by Location” depend on existing taxonomy and location fields.

### 11.2 Backend endpoints that may be needed or changed

- **Dashboard summary** — A single endpoint (or set) that returns counts for New, In Progress, Resolved, and average completion time, plus optional breakdowns (by type, by location). May be role-aware (admin vs department vs studio) so each dashboard gets the right scope. Current “my-summary” is user-centric; admin dashboard likely needs an **org-wide summary** endpoint or parameters.
- **Reporting** — Existing reporting APIs (byStatus, byPriority, byCategory, volume, resolution time, completion by owner) may need: (1) **byMarket → byLocation** rename or alias and (2) **workflow/subtask timing** endpoint(s) that return average completion by workflow and by step (using availableAt, startedAt, completedAt).
- **Workflow analytics** — Templates, departments, bottlenecks (longest-running subtask types by avg duration). Bottleneck must use **timing only** (e.g. avg completion time per subtask template), not BLOCKED. Contracts should expose: workflow template id/name, step/subtask template id/name, avg duration, count; and for bottlenecks: subtask template id/name, avg duration, sample size.

### 11.3 Aggregation contracts

- **Counts:** Exact definition of “New,” “In Progress,” “Resolved” (see §8) must be implemented in backend aggregation so dashboard and reporting never guess.
- **Averages:** Window (e.g. last 30/90 days) and denominator (e.g. only resolved tickets with resolvedAt set) must be defined; null/missing data (e.g. availableAt not backfilled) should be handled (exclude or “No data”).
- **Dashboard vs reporting:** Either (a) **shared metric endpoints** that accept scope (e.g. global vs department vs studio) and return the same shape, or (b) **separate endpoints** for dashboard summary vs reporting drilldown. Spec does not mandate one; contracts must be clear so dashboard cards and reporting boxes get consistent numbers.

### 11.4 No implementation in this spec

- This section **identifies** required data and contracts only. Implementation of new or changed endpoints, aggregations, or database views is **out of scope** for the Stage 5 spec; a later implementation plan or backend task will implement them.

---

## 12. Risks and Edge Cases

| Risk / Edge Case | Mitigation |
|------------------|------------|
| **Backfill of availableAt/startedAt** | Older subtasks may have NULL. Analytics and UI should exclude NULL from averages or show “No data” / “Insufficient data.” Document backfill policy elsewhere. |
| **Zero completed tickets** | Avg completion and resolution time show “—” or “No data.” No division by zero. |
| **Department vs studio visibility** | Dashboard data must respect Stage 1 visibility; same visibility service or rules applied to dashboard queries. |
| **Multiple locations (studio user)** | Default to “All” or first location; filter state (e.g. in URL or local state) so switching location does not lose context. |
| **Workflow toggle and fixed height** | Design the analytics box with min-height and max-height (or fixed height) and overflow-y: auto so different workflow lengths do not cause layout jump. |
| **Naming “By Market” vs “By Location”** | Backend can keep byMarket internally; API response and UI label use “By Location” (or “By Studio”/“By Market” if that’s the actual grouping). |
| **Bottleneck definition** | Implementations must use timing (completion time vs target or vs baseline); no reference to BLOCKED. |

---

## 13. Verification Plan

1. **Admin dashboard:** Label is “Dashboard”; no “My Dashboard.” Top KPIs are New Tickets, In Progress, Resolved, Avg Completion. No “My Tickets” panel; no “My Tickets by Category.” Support by Type and Maintenance by Location (or equivalent) present.
2. **Department dashboard:** Shows summary only; no duplicate feed. KPIs scoped to user’s visibility. Link to Tickets/Inbox for lists.
3. **Studio dashboard:** Location name at top; if multiple locations, filter/toggle works. Summary only; no duplicate feed; ticket lists on Portal tabs.
4. **Reporting:** “By Market” replaced with “By Location.” Workflow/subtask timing section exists with workflow toggle and fixed-size scrollable box. No “Most blocked subtask types.”
5. **Workflow analytics:** Bottleneck or longest-running subtask types use timing only (avg duration); no BLOCKED. Structure supports average completion by workflow and by step.
6. **Metrics:** New = no subtask activity; In Progress = not NEW and not RESOLVED/CLOSED; Avg Completion = resolvedAt − createdAt. Backend returns these per §8.
7. **Stage 1–4 preserved:** Visibility, feed correctness, workflow/timing truth, collaboration behavior, and feed/panel polish unchanged.

---

## 14. Acceptance Criteria

- [ ] **Dashboard role definitions:** Admin, department, and studio dashboards are defined as data/summary views; no duplicate ticket feed on any dashboard. Drilldown lives on reporting/workflow analytics.
- [ ] **Admin dashboard:** Label “Dashboard”; top KPIs New Tickets, In Progress, Resolved, Avg Completion; no “My Tickets” panel; no “My Tickets by Category”; replaced by Support Tickets by Type and Maintenance Tickets by Location (or Tickets by Type / by Location). “By location” language where applicable.
- [ ] **Department dashboard:** Summary data only; appropriate KPIs for department visibility; no duplicate feed. Ready for future department timing stats.
- [ ] **Studio dashboard:** Summary only; location name at top; multi-location filter when applicable; no duplicate feed.
- [ ] **Metric definitions:** New, In Progress, Resolved, Average Ticket Completion Time, Average Subtask Completion Time, Active Work Time, Bottleneck (timing-based), and Average Department Completion Time defined exactly per §8. Live vs historical clarified.
- [ ] **Reporting page:** “By Market” replaced with “By Location”; workflow/subtask completion timing display with workflow toggle and fixed-size analytics box with internal scroll; “Most blocked subtask types” removed; status breakdowns align with NEW/IN_PROGRESS/RESOLVED semantics.
- [ ] **Workflow analytics structure:** Average completion by workflow, average subtask completion by step, department timing where appropriate, bottleneck identification (timing-based only). Clear split between dashboard and reporting/workflow analytics page.
- [ ] **Data contracts:** Required metrics, aggregations, and endpoint expectations documented; no BLOCKED-based metrics; backend as source of truth.
- [ ] **Outdated items removed:** “My Dashboard” naming, secondary “My Tickets” panel, “My Tickets by Category,” “By Market” (→ “By Location”), “Most blocked subtask types,” and any BLOCKED or conflicting status semantics.
- [ ] **Preservation:** Stage 1 visibility and feed correctness, Stage 2 workflow/timing truth, Stage 3 collaboration behavior, and Stage 4 feed/panel polish preserved.

---

## 15. Future-Ready Thinking

This stage enables later:

- **Workflow optimization** — Clear timing by step and workflow so teams can shorten cycle time.
- **Staffing insights** — Department and owner completion times support capacity and workload decisions.
- **Department performance tracking** — Department-level averages and trends.
- **SLA / target tracking** — Bottleneck and “exceeds target” definitions support SLA dashboards and alerts.
- **Bottleneck detection** — Timing-based identification of steps that need process or resource changes.
- **More advanced reporting** — Consistent metric definitions and contracts allow additional charts, exports, and filters without redefining semantics.

---

*Stage 5 focuses on dashboard and reporting information architecture and metric semantics. Implementation of backend endpoints and UI changes will follow in a separate implementation phase.*
