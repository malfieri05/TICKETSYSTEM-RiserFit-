# Stage 6.5 — Workflow template “does not appear in list” investigation

## 1. Verify create request

- **POST fires:** The "Create template" button calls `mutation.mutate()`, which runs `workflowTemplatesApi.create({ ticketClassId, departmentId, supportTopicId, ... })` — i.e. `POST /api/subtask-workflow/templates` with the selected context. Confirmed.
- **API response:** Backend `createWorkflowTemplate` returns `this.prisma.subtaskWorkflowTemplate.create(...)`, i.e. the full created row (including `id`). Axios resolves to `AxiosResponse`; the frontend uses `res.data.id` for the redirect. So the API does return a valid template id in the response body.

## 2. Verify redirect

- **Redirect target:** `onSuccess` does `router.push(\`/admin/workflow-templates/${res.data.id}\`)`. The id comes from the create response body. Correct.
- **Detail fetch:** Detail page uses `queryKey: ['workflow-template', id]` and `workflowTemplatesApi.get(id)` → `GET /subtask-workflow/templates/:id`. So the detail page fetches the template by the same id we redirected to. Correct.

## 3. Verify list refresh

- **Invalidation:** On create success we call `qc.invalidateQueries({ queryKey: ['workflow-templates'] })`. The list page uses `queryKey: ['workflow-templates']` and `queryFn: () => workflowTemplatesApi.list()` (no params). So the cache key matches.
- **Stale data:** We only invalidate; we do not refetch or await. In React Query, invalidation marks the query stale and triggers a refetch only for queries that are currently observed. After redirect, the list page is unmounted, so the list query is no longer observed. Therefore the refetch may not run (or may run in the background). When the user navigates back to the list, the list mounts and the query runs again; at that moment the cache can still hold the previous result (e.g. empty array from the first visit). The user then sees the old list until the refetch completes. **This is the root cause:** the list cache is not updated before we leave the create flow, so returning to the list can show stale (e.g. empty) data until the refetch finishes.

## 4. Verify backend persistence

- **Create:** Service uses `this.prisma.subtaskWorkflowTemplate.create(...)`. On success the row is committed. No client-side-only state.
- **List:** `listWorkflowTemplates()` with no params builds `where = {}` and returns `findMany` with no `isActive` or other filter. So GET `/subtask-workflow/templates` returns all templates, including the newly created one.

## 5. Verify filtering

- **List endpoint:** Controller passes only optional `ticketClassId`, `supportTopicId`, `maintenanceCategoryId` from query params. The list page calls `workflowTemplatesApi.list()` with no arguments, so no filters are applied. The backend does not filter by `isActive` or `departmentId`. So the created template is not filtered out.

## 6. Verify error handling

- **Create failure:** The mutation has `onError` that sets `setError(err.response?.data?.message ?? 'Failed to create template.')`. There is no redirect in `onError`. So if creation fails, the user stays on the form and sees the error message. Correct.

---

## Root cause

**The list query is only invalidated on create success, not refetched before redirect.** After redirect, the list is unmounted so the invalidated list query may not refetch immediately. When the user goes back to the list, they see whatever was in the cache (often the pre-create state, e.g. empty) until the refetch completes. That makes it look like the template “did not persist or appear in the list.”

---

## Minimal fix

1. **Refetch the list and wait before redirecting** so the list cache includes the new template when the user later opens the list:
   - In create `onSuccess`: call `await qc.refetchQueries({ queryKey: ['workflow-templates'] })` (or equivalent), then `router.push(...)`.
2. **Guard redirect on valid id:** Only redirect if `res?.data?.id` is present; otherwise set an error and do not redirect.

No UX copy changes; no backend or filtering changes required.
