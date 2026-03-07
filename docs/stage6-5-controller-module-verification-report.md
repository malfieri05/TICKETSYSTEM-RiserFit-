# Stage 6.5 — Controller & Module Wiring Verification Report

**Purpose:** Verify why GET /api/subtask-workflow/templates returns 404. No code was modified.

---

## STEP 1 — Controller

**File:** `apps/api/src/modules/subtask-workflow/subtask-workflow.controller.ts`

**@Controller() decorator value:** `'subtask-workflow'`

**All route decorators:**

| Method | Path (suffix) | Handler |
|--------|----------------|---------|
| `@Get('templates')` | GET /templates | listWorkflowTemplates |
| `@Post('templates')` | POST /templates | createWorkflowTemplate |
| `@Get('templates/:id')` | GET /templates/:id | getWorkflowTemplate |
| `@Patch('templates/:id')` | PATCH /templates/:id | updateWorkflowTemplate |
| `@Delete('templates/:id')` | DELETE /templates/:id | deleteWorkflowTemplate |
| `@Post('subtask-templates')` | POST /subtask-templates | createSubtaskTemplate |
| `@Patch('subtask-templates/:id')` | PATCH /subtask-templates/:id | updateSubtaskTemplate |
| `@Delete('subtask-templates/:id')` | DELETE /subtask-templates/:id | deleteSubtaskTemplate |
| `@Post('template-dependencies')` | POST /template-dependencies | addTemplateDependency |
| `@Delete('template-dependencies')` | DELETE /template-dependencies | removeTemplateDependency |

**GET route for /templates:** **Yes.** The controller defines `@Get('templates')` at lines 15–26, with `@Roles('ADMIN')`, calling `listWorkflowTemplates(...)`.

**Example structure match:**

```ts
@Controller('subtask-workflow')
export class SubtaskWorkflowController {

  @Get('templates')
  @Roles('ADMIN')
  listWorkflowTemplates(...) { ... }

  @Post('templates')
  ...
}
```

---

## STEP 2 — Module registration

**File:** `apps/api/src/modules/subtask-workflow/subtask-workflow.module.ts`

- **SubtaskWorkflowController in controllers[]:** **Yes** — `controllers: [SubtaskWorkflowController]`
- **SubtaskWorkflowService in providers[]:** **Yes** — `providers: [SubtaskWorkflowService]`
- **exports:** `exports: [SubtaskWorkflowService]`

**Example structure match:**

```ts
@Module({
  controllers: [SubtaskWorkflowController],
  providers: [SubtaskWorkflowService],
  exports: [SubtaskWorkflowService],
})
export class SubtaskWorkflowModule {}
```

---

## STEP 3 — AppModule import

**File:** `apps/api/src/app.module.ts`

- **SubtaskWorkflowModule imported:** **Yes.** It appears in the `imports` array (line 79), in the section “Subtask workflow (Stage 4 templates + dependencies)”.

---

## STEP 4 — Registered routes at runtime

**Method:** Nest CLI has no `nest routes` command. The API was started on **PORT=3002** (to avoid conflict with any process on 3001) and bootstrap logs were captured.

**Routes that include `subtask-workflow` (as printed by Nest at startup):**

```
[RoutesResolver] SubtaskWorkflowController {/api/subtask-workflow}: +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/templates, GET} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/templates, POST} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/templates/:id, GET} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/templates/:id, PATCH} route +1ms
[RouterExplorer] Mapped {/api/subtask-workflow/templates/:id, DELETE} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/subtask-templates, POST} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/subtask-templates/:id, PATCH} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/subtask-templates/:id, DELETE} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/template-dependencies, POST} route +0ms
[RouterExplorer] Mapped {/api/subtask-workflow/template-dependencies, DELETE} route +0ms
```

**Expected routes present:**

- **GET /api/subtask-workflow/templates** — **Yes**
- **POST /api/subtask-workflow/templates** — **Yes**

---

## RETURN — Summary

| # | Item | Result |
|---|------|--------|
| 1 | **Controller decorator value** | `'subtask-workflow'` |
| 2 | **All route decorators** | GET/POST `templates`, GET/PATCH/DELETE `templates/:id`, POST/PATCH/DELETE `subtask-templates` and `:id`, POST/DELETE `template-dependencies`. GET `templates` exists. |
| 3 | **Module registration** | SubtaskWorkflowController in `controllers[]`, SubtaskWorkflowService in `providers[]`. |
| 4 | **SubtaskWorkflowModule in AppModule** | Yes, imported in `app.module.ts`. |
| 5 | **Actual registered routes** | Nest logs show **GET /api/subtask-workflow/templates** and **POST /api/subtask-workflow/templates** registered when this codebase starts. |

---

## Conclusion

Controller and module wiring are **correct**. The route **GET /api/subtask-workflow/templates** is defined and registered when the application starts from the current source.

The 404 observed earlier occurred when calling **port 3001**. In that run, the newly started API **failed to bind** to 3001 (EADDRINUSE), so the server actually responding on 3001 was a **different, pre-existing process** (likely an older or different build). That process may not have had this route or may have had different routing.

**Recommendation:** Ensure only one API process is running and that it is the one started from the current repo (e.g. stop any existing Node process on 3001, then start the API again). With the current code running, GET /api/subtask-workflow/templates should respond (e.g. 200 with an array), not 404.
