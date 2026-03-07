# Stage 6.5 — Workflow Template List & Create Debugging Investigation Report

**Date:** 2026-03-07  
**No code changes were made.** This report documents findings only.

---

## STEP 1 — Frontend API URL

**Source:** `apps/web/src/lib/api.ts`

- **API base URL:**  
  `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'`  
  So when `NEXT_PUBLIC_API_URL` is unset, the base URL is **`http://localhost:3001`**.

- **Axios baseURL:**  
  `baseURL: \`${API_URL}/api\``  
  So **`http://localhost:3001/api`** (when env is unset).

- **Resolved request URLs:**
  - **LIST:** `http://localhost:3001/api/subtask-workflow/templates` (GET, no query params when list page loads).
  - **CREATE:** `http://localhost:3001/api/subtask-workflow/templates` (POST, same path).

**Conclusion:** The frontend uses the Nest API at port 3001 when env is not set. It does **not** call the Next server for these endpoints (no rewrite/proxy to Next for `/api/subtask-workflow/*` in the code checked).

---

## STEP 2 — List Endpoint Response

**Manual call:** GET `http://localhost:3001/api/subtask-workflow/templates` with valid JWT (dev-login as ADMIN).

- **HTTP status:** **404 Not Found**
- **Response body:**  
  `{"message":"Cannot GET /api/subtask-workflow/templates","error":"Not Found","statusCode":404}`

**Whether templates exist:** Not observable from this call, because the list endpoint returns 404 and no body with data.

**Direct DB check (Prisma against Neon):**

- **Table:** `subtask_workflow_templates`
- **Row count:** **7**
- **Sample rows:**  
  - SUPPORT + HR + Workshop Bonus (id `cmmgmr0ry000r9ewvltdtppoh`)  
  - SUPPORT + HR + Resignation / Termination  
  - SUPPORT + HR + New Job Posting  
  - **SUPPORT + HR + New Hire** (id `cmmgkasb900099ewvce4s7m49`, supportTopicId `st_hr_1`)  
  - MAINTENANCE + Electrical (name "SKIP test A->B")  
  - etc.

**Conclusion:** The list endpoint returns **404** when called against the server on port 3001. The database has **7** workflow templates, including SUPPORT + HR + New Hire. So the empty list in the UI is consistent with the **list request failing with 404** (no successful array response).

---

## STEP 3 — Create Endpoint Error

**Manual call:** POST `http://localhost:3001/api/subtask-workflow/templates` with valid JWT and body for the **existing** context (SUPPORT + HR + New Hire):

```json
{
  "ticketClassId": "tclass_support",
  "departmentId": "dept_hr",
  "supportTopicId": "st_hr_1"
}
```

- **HTTP status:** **500 Internal Server Error**
- **Response body:**  
  `{"statusCode":500,"message":"Internal server error"}`

**Server console / Prisma error code:**  
The API process that was started during this investigation **failed to bind** to port 3001 (`EADDRINUSE`). So the requests above were served by **whatever Node process was already listening on port 3001** (e.g. an earlier run of the API). That process’s console was not available during the investigation, so the exact Prisma error code (e.g. P2002) was **not** captured from logs.

**Expected when duplicate:**  
In the **current repo code**, duplicate (unique constraint on `(ticketClassId, supportTopicId)`) is handled in `subtask-workflow.service.ts`: Prisma `P2002` is caught and a **409 Conflict** is thrown with message *"A workflow template already exists for this ticket context (same type and topic/category)."* So if the running server were this code, we would expect **409**, not 500.

**Conclusion:**  
- Create for an **existing** SUPPORT + HR + New Hire context returns **500**, not 409.  
- So either:  
  - The server on 3001 is **not** running the current code (e.g. no P2002 → 409 handling), or  
  - The error is **not** P2002 (e.g. another Prisma/DB error or uncaught exception).  
- Without that server’s console output we cannot confirm the Prisma error code (e.g. P2002).

---

## STEP 4 — Migrations

**Command:** `cd apps/api && npx prisma migrate status`

- **Result:** **Database schema is up to date.**  
- **Migrations:** 10 found; all applied.

**Table `subtask_workflow_templates`:**  
- Present in the migration `20260307000000_stage4_subtask_workflow`.  
- Expected fields (from schema and migration):  
  `id`, `ticketClassId`, `departmentId`, `supportTopicId`, `maintenanceCategoryId`, `name`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`.  
- Unique constraints: `(ticketClassId, supportTopicId)`, `(ticketClassId, maintenanceCategoryId)`.

**Conclusion:** Migrations are in sync; the table exists with the expected structure.

---

## Summary Table

| Item | Result |
|------|--------|
| **1. API base URL** | `http://localhost:3001` (when `NEXT_PUBLIC_API_URL` unset); axios baseURL = `http://localhost:3001/api`. |
| **2. Actual URLs used by frontend** | GET and POST: `http://localhost:3001/api/subtask-workflow/templates`. |
| **3. List endpoint** | **404**; body `{"message":"Cannot GET /api/subtask-workflow/templates",...}`. No array returned. |
| **4. Count of templates in DB** | **7** (including SUPPORT + HR + New Hire). |
| **5. Create endpoint (duplicate)** | **500**; body `{"statusCode":500,"message":"Internal server error"}`. |
| **6. Prisma error code** | **Not observed** (server on 3001 was a pre-existing process; its logs were not captured). |
| **7. Migration status** | **Up to date**; table `subtask_workflow_templates` exists with expected fields. |

---

## Root Cause Summary

1. **Why the list page shows “No workflow templates yet”**  
   The **GET** `/api/subtask-workflow/templates` request returns **404**. The UI treats a failed request as “no data,” so it shows the empty state. The DB has 7 templates, so the problem is the **list endpoint responding with 404**, not missing data.

2. **Why create returns 500 instead of expected behavior**  
   The **POST** to the same path returns **500** for the duplicate SUPPORT + HR + New Hire case. The current code would return **409** for a duplicate (P2002). So either the running server is an older build, or the error is not P2002 and is uncaught.

**Note:** During the test, the API started in this session failed to bind to port 3001 (EADDRINUSE). All curl requests hit the process already listening on 3001. To reproduce and capture the exact create error (e.g. P2002), run the API with no other process on 3001 and retry the duplicate create while watching the API console.
