# Stage 6.5 — Clean Runtime Verification Report

**Goal:** Verify current code works when frontend and backend use the same fresh API instance. No architecture changes; minimal env fix only.

---

## STEP 1 — API on clean port

- **Started:** Nest API on **port 3002** with current codebase (`PORT=3002 npx ts-node --transpile-only src/main.ts`).
- **Verified:**
  - **GET** http://localhost:3002/api/subtask-workflow/templates → **200** (with valid JWT).
  - **POST** http://localhost:3002/api/subtask-workflow/templates → tested in Step 2.

---

## STEP 2 — Endpoint behavior on clean server

**Auth:** JWT from `POST /api/auth/dev-login` with `malfieri05@gmail.com` (ADMIN).

### A. LIST

- **Call:** GET /api/subtask-workflow/templates (Host: localhost:3002).
- **HTTP status:** **200**
- **Response body count:** **7** templates (array length).
- **Existing templates returned:** Yes. Payload includes SUPPORT+HR+New Hire, SUPPORT+HR+Workshop Bonus, MAINTENANCE+Electrical, etc., with `ticketClass`, `department`, `supportTopic`, `_count.subtaskTemplates`.

### B. DUPLICATE CREATE

- **Call:** POST /api/subtask-workflow/templates with body  
  `{"ticketClassId":"tclass_support","departmentId":"dept_hr","supportTopicId":"st_hr_1"}` (SUPPORT + HR + New Hire).
- **HTTP status:** **409 Conflict**
- **Response body:**  
  `{"message":"A workflow template already exists for this ticket context (same type and topic/category).","error":"Conflict","statusCode":409}`
- **Duplicate handling:** Correct. Duplicate create returns **409**, not 500.

---

## STEP 3 — Frontend API target

- **Current local dev:** `apps/web/.env.local` contained  
  `NEXT_PUBLIC_API_URL=http://localhost:3001`.
- **Where set:** `apps/web/.env.local` (Next.js loads this in dev and at build).
- **Code default:** In `apps/web/src/lib/api.ts`, `API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'`. So if unset, frontend uses 3001.
- **Pointing to clean API:** Setting `NEXT_PUBLIC_API_URL=http://localhost:3002` in `.env.local` is enough so the frontend targets the API running on 3002. Restart `next dev` (or run a new build) so the env is picked up.

---

## STEP 4 — Minimal fix applied

- **Change:** Updated `apps/web/.env.local` so the frontend targets the clean API on 3002:
  - **Before:** `NEXT_PUBLIC_API_URL=http://localhost:3001`
  - **After:** `NEXT_PUBLIC_API_URL=http://localhost:3002` (with a short comment that 3002 is used when running the API on the clean port for workflow-templates testing).
- No API code, route structure, or business logic changed.

---

## STEP 5 — End-to-end retest (expected)

With API on 3002 and frontend using 3002:

1. **Open** `/admin/workflow-templates` — list request goes to http://localhost:3002/api/subtask-workflow/templates.
2. **List loads** — GET returns 200 with 7 templates; UI should show them (no “No workflow templates yet”).
3. **Duplicate create** — Create template for SUPPORT + HR + New Hire; API returns 409; UI should show the conflict message (e.g. “A workflow template already exists…”).
4. **Non-duplicate create** — Create template for a context that does not exist yet; expect 201 and redirect to template detail; list refetch before redirect should show the new template when returning to the list.

**Note:** E2E was not run in an automated browser; the API behavior above was confirmed via curl. Manual verification: restart `next dev` (so it picks up `.env.local`), ensure only the API on 3002 is running, then repeat steps 1–4 in the browser.

---

## RETURN — Summary

| # | Item | Result |
|---|------|--------|
| 1 | **GET /templates on clean server (3002)** | **Works.** Status 200, 7 templates in body. |
| 2 | **Duplicate create** | **409 Conflict** with message “A workflow template already exists for this ticket context (same type and topic/category).” |
| 3 | **Frontend API base URL in local dev** | Was `http://localhost:3001` (from `.env.local`). Now set to `http://localhost:3002` so it matches the clean API. |
| 4 | **Minimal fix applied** | **Yes.** `apps/web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3002` (and comment). |
| 5 | **End-to-end result** | API on 3002 behaves correctly (list 200, duplicate 409). With frontend pointing at 3002, `/admin/workflow-templates` should show the list and duplicate create should show the conflict message. Manual E2E: restart Next dev and test in browser. |
| 6 | **Files changed** | **1:** `apps/web/.env.local` (env value + comment only). |
| 7 | **Build/dev verification** | **Web build:** `npm run build` in `apps/web` completed successfully. |

---

**To run normal dev again with API on 3001:** Set `NEXT_PUBLIC_API_URL=http://localhost:3001` in `apps/web/.env.local` and restart `next dev`. Ensure only one API process is running on the chosen port to avoid 404/500 from a stale process.
