# Stage 6.5 — Manual sanity checklist

Run the app locally, then complete the following. If any step fails, fix before merging.

**Start services:**
```bash
# Terminal 1
cd apps/api && npx ts-node --transpile-only src/main.ts

# Terminal 2
cd apps/web && npx next dev
```
Open http://localhost:3000 and log in as ADMIN.

---

- [ ] **1. Create workflow template (SUPPORT → HR → New Hire)**  
  Admin → Workflow Templates → New workflow template. Select SUPPORT, department HR, support topic New Hire. Create. Template appears in list.

- [ ] **2. Add 3 subtasks**  
  Open the template. Add 3 subtask templates with different departments and required/optional. Save. All 3 appear in Subtask templates and in Workflow preview.

- [ ] **3. Add dependencies**  
  Add dependency: Task 2 depends on Task 1, Task 3 depends on Task 2. Dependencies list and preview show correct “depends on” relationships.

- [ ] **4. Workflow preview**  
  Preview shows correct order (1, 2, 3) and “(depends on: …)” for each. Edit a subtask title; preview updates after save.

- [ ] **5. New ticket — instantiation and notifications**  
  Create a new ticket (New Ticket) for same context: SUPPORT → HR → New Hire. Open ticket. Confirm: subtasks are present; Task 1 READY, Task 2 & 3 LOCKED. Complete Task 1 → Task 2 becomes READY; complete Task 2 → Task 3 becomes READY. Notifications fire as expected for upstream completion.

- [ ] **6. Inactive template**  
  Set the workflow template to Inactive. Create another ticket for SUPPORT → HR → New Hire. Open ticket. Confirm **no** subtasks are instantiated.

- [ ] **7. Delete template**  
  Set template back to Active (optional), then Delete workflow template. Confirm it disappears from list. Create a new ticket for same context; ticket creates normally but **no** subtasks.

---

When all boxes are checked, Stage 6.5 manual sanity check is complete and the branch is ready to merge.
