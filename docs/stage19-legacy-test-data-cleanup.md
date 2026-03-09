# Stage 19 — Legacy Test Data Cleanup (Manual)

Stage 19 removes priority and assign-to from the create-ticket UI. Any test tickets created with legacy workflows may still exist in your local database.

**No automated deletion script is provided.** To clean legacy test tickets manually:

1. From the repo root:
   ```bash
   cd apps/api
   npx prisma studio
   ```
2. In Prisma Studio, open the **tickets** table.
3. Delete the test tickets you no longer need (e.g. by selecting rows and using the delete action, or by filtering and removing in bulk).

This keeps your local data in sync with the current taxonomy-driven create flow without modifying schema or migrations.
