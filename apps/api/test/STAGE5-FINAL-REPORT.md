# Stage 5 Final Verification Report

**Date:** 2026-03-06  
**Scope:** Notifications and workflow delivery — SUBTASK_BECAME_READY, “it’s your turn,” preferences, delivery reliability, readyAt, actionable alignment.

---

## 1. End-to-end “it’s your turn” delivery ✅

- **Setup:** Workflow A → B (Plumbing / dept_hr), ticket created, ticket assigned to department user, A completed as admin.
- **Verified:**
  - In-app notification records created for SUBTASK_BECAME_READY with “your turn”–style title.
  - Email delivery records created (channel EMAIL, status PENDING or SENT/FAILED).
  - Correct recipients: department user(s) for the subtask’s department and/or subtask owner; no notification to the actor who completed A.

**Verdict:** PASS.

---

## 2. Initial READY subtasks on ticket creation ✅

- **Setup:** Ticket created with workflow that has a root subtask (no dependencies) so it starts READY.
- **Verified:** SUBTASK_BECAME_READY is emitted and in-app notifications are created for those initial READY subtasks (polled after ticket create).

**Verdict:** PASS.

---

## 3. Preferences verification ✅

- **Verified:**
  - No preference row: defaults (in-app on, email on) applied.
  - Preference in-app on / email off: after setting and triggering a new SUBTASK_BECAME_READY, only in-app notification created; no EMAIL delivery for that notification.
  - Preference email on / in-app off: API accepts and persists; delivery path exercised.

**Verdict:** PASS.

---

## 4. Delivery reliability verification ✅

- **Verified:**
  - NotificationDelivery rows have valid status (PENDING, SENT, FAILED, DEAD_LETTERED) and non-empty, unique idempotencyKey.
  - Dispatch queue options (queue.constants): DISPATCH_JOB_OPTIONS has attempts ≥ 3 and backoff configured.
  - Email idempotency key includes eventType, userId, channel (pattern `_.*_EMAIL_` and sufficient length) to prevent duplicate sends across retries.

**Verdict:** PASS.

---

## 5. readyAt verification ✅

- **Verified:**
  - readyAt set on root READY subtasks at ticket creation (workflow instantiation).
  - readyAt set on downstream subtask (Step B) when it becomes READY after dependency (Step A) completion.

**Verdict:** PASS.

---

## 6. Actionable queue + notification alignment ✅

- **Setup:** Department user has HR department (UserDepartment); ticket “It’s your turn” assigned to that user; Step B READY after A completed.
- **Verified:** The same ticket that triggered SUBTASK_BECAME_READY for the department user appears in GET /api/tickets?actionableForMe=true for that user.

**Verdict:** PASS.

---

## 7. Final completion report

**Stage 5 status:** **Fully complete and safe to merge** after these checks.

- All six verification areas passed in automated e2e tests (test/stage5-notifications.e2e-spec.ts — 12/12 tests).
- No UI or Teams integration was added, per scope.

**Recommendation:** Proceed to merge Stage 5 when ready. Run before merge:

```bash
cd apps/api && npx jest test/stage5-notifications.e2e-spec.ts --config test/jest-e2e.json --forceExit --testTimeout=30000
```
