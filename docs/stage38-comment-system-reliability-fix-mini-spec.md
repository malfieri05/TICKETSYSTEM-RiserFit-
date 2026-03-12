# Stage 38: Comment System Reliability Fix — Mini-Spec

## 1. Intent

Ensure the "Add Comment" feature is robust, end-to-end reliable, and production-grade across UI, API, persistence, authorization, notification fanout, and real-time update behavior. Comments are a core product feature and drive notification behavior for users with visibility to the ticket; the fix must validate the full chain and address any root causes rather than applying narrow UI-only patches.

---

## 2. Problem Statement

The Add Comment functionality is reported as broken or unreliable. Without a single confirmed failure mode, the system must be investigated end-to-end so that:

- All likely failure points are identified (frontend, API, validation, auth, notifications, cache).
- Root causes are distinguished from symptoms.
- Fixes are architectural and durable, not one-off workarounds.
- Comment creation correctly drives notifications and real-time behavior for the right audience.

---

## 3. Current Observed Failure Mode(s)

(To be filled from user reports or testing; possible modes include:)

- **UI**: Button does nothing; comment appears to submit but does not persist; comment appears then disappears; author name blank after refetch.
- **API**: 400 (validation), 403 (forbidden), 404 (ticket not found), 500 (server error); errors not surfaced in UI.
- **Data**: Comment persists but does not show in list until manual refresh; duplicate comments from double submit; empty or truncated body.
- **Notifications**: Requester/owner/watchers not notified; duplicate notifications; wrong audience.
- **Real-time**: Unread count or comment list not updating after add; SSE not reflecting new comment.

The mini-spec and implementation must address the full chain so that any of these are either prevented or handled clearly.

---

## 4. Root-Cause Analysis

### 4.1 Frontend

| Area | Finding | Risk |
|------|--------|------|
| **Mutation wiring** | Ticket detail and TicketDrawer both use `commentMut` with `mutationFn: () => commentsApi.create(ticketId/id, { body: commentBody })`. Button is `disabled={!commentBody.trim()}` and `loading={commentMut.isPending}`. | If `ticketId`/`id` is undefined in drawer context, mutation would fail. Drawer only renders when `ticketId` is set, so likely OK. |
| **Double submit** | Button shows loading state but is not explicitly `disabled={commentMut.isPending}`. User can click again while request is in flight. | Risk of duplicate comments; no client-side debounce or disable on pending. |
| **Optimistic update** | Both pages patch `['ticket', id]` cache with an optimistic comment, then `onSettled` invalidate. Refetch replaces with server state. | Optimistic shape uses `author.displayName`; server returns `author.name` (Prisma User model). Ticket detail page already uses `displayName ?? name`; **TicketDrawer uses only `c.author.displayName`** — can show blank after refetch. |
| **Error handling** | `onError` rolls back cache to `context.prev`. No toast or inline error message; user may not see why submit failed. | Failures can be silent. |
| **Query key consistency** | Detail page uses `['ticket', id]`; drawer uses `['ticket', ticketId]`. Invalidation uses same key. Refetch uses `ticketsApi.get(id)` which returns full ticket with comments. | Consistent; no key mismatch found. |
| **Comment list source** | Both rely on `ticket.comments` from GET /tickets/:id (embedded in ticket). No separate GET /tickets/:id/comments call for the list. | If ticket query fails or is stale, comments could be missing. Drawer uses `ticket.comments` without `?? []` in one place — defensive coding recommended. |

### 4.2 Backend

| Area | Finding | Risk |
|------|--------|------|
| **Route** | POST /tickets/:ticketId/comments; controller calls `commentsService.create(ticketId, dto, user)`. Global JwtAuthGuard and ValidationPipe apply. | Correct. |
| **DTO** | CreateCommentDto: `body` @IsString() @IsNotEmpty(); `isInternal` optional. | Empty body → 400. Frontend disables submit when trim is empty. |
| **ValidationPipe** | main.ts uses forbidNonWhitelisted: true. Extra properties on body → 400. | Frontend sends only `{ body }`; OK. |
| **Service create()** | Loads ticket; evaluates COMMENT_ADD_PUBLIC (visibility); extracts mentions; runs transaction (comment + mentions + ticket.updatedAt); audit log; emits COMMENT_ADDED and optionally MENTION_IN_COMMENT. | Transaction and event order correct. Policy uses same visibility as ticket view. |
| **Author shape** | Prisma returns author with `name` (User model). Frontend types expect `displayName`. | Backend does not map `name` → `displayName`; ticket detail page handles both; drawer does not. |
| **Visibility** | COMMENT_ADD_PUBLIC uses TicketVisibilityService.assertCanView (requester, owner, studio, department rules). | Consistent with ticket view. |

### 4.3 Notifications / Real-Time

| Area | Finding | Risk |
|------|--------|------|
| **Event emission** | CommentsService emits COMMENT_ADDED with commentId, authorId, authorName, requesterId, ownerId, bodyPreview, isInternal. DomainEventsService enqueues to NOTIFICATION_FANOUT with idempotent jobId. | Correct. |
| **Fan-out rules** | COMMENT_ADDED → requester, owner, watchers; actor is removed. Fanout processor loads ticket (title, requesterId, ownerId, watchers) and merges ticket.title into payload for buildNotificationContent. | Correct. |
| **Idempotency** | jobId = `${event.type}_${ticketId}_${occurredAt.getTime()}`. Same event within same ms could dedupe; rapid double-submit could produce two events (different occurredAt). | Duplicate comments → duplicate events → duplicate notifications unless jobId includes commentId (it does not). |
| **SSE / invalidation** | Fanout creates notification records and dispatches; SSE channel can broadcast. Frontend invalidates ['ticket', id] on comment mutation onSettled; list invalidations also run. | Refetch should update UI; no explicit SSE event for "comment added" required if invalidation is reliable. |

### 4.4 Summary of Likely Root Causes

1. **Author display in drawer**: Backend returns `author.name`, drawer renders `author.displayName` only → blank author after refetch.
2. **Double submit**: No disable when `commentMut.isPending`; user can submit twice → duplicate comments and possibly duplicate notifications.
3. **Silent errors**: No UI feedback on 4xx/5xx or network errors; user may think comment failed for no reason.
4. **Defensive nulls**: Drawer assumes `ticket.comments` is always an array; if ever undefined, `.length` / `.map` could throw.
5. **Optional**: Notification jobId does not include commentId; two comments in same ticket within same ms could theoretically dedupe (low probability).

---

## 5. Scope

**In scope**

- Comment input UI (ticket detail page + TicketDrawer).
- Mutation hook, API call, and error handling.
- Backend: controller, DTO, service create path, policy, and event emission.
- Notification fan-out for COMMENT_ADDED (recipients, payload, idempotency).
- Cache invalidation and refetch behavior; optimistic update shape vs server shape.
- Author display consistency (name vs displayName).
- Double-submit prevention and empty/invalid body handling.
- Defensive handling of missing or malformed comment list.

**Out of scope**

- Comment edit/delete (separate flow).
- Comment threading or reactions.
- Changing notification delivery channels or preferences logic beyond ensuring COMMENT_ADDED is correct.

---

## 6. Relevant Architecture Path End-to-End

```
[User types in Textarea]
       ↓
[Add Comment button click]
       ↓
commentMut.mutate()  ← disabled when !commentBody.trim(); should also disable when isPending
       ↓
commentsApi.create(ticketId, { body: commentBody })  ← POST /api/tickets/:ticketId/comments
       ↓
[Backend] JwtAuthGuard → ValidationPipe (CreateCommentDto) → CommentsController.create
       ↓
CommentsService.create(ticketId, dto, user)
  → find ticket (or 404)
  → policy COMMENT_ADD_PUBLIC (visibility) or 403
  → mentionParser.extractMentions(dto.body)
  → $transaction: ticketComment.create (+ mentions) + ticket.update(updatedAt)
  → auditLog.log COMMENTED
  → domainEvents.emit COMMENT_ADDED
  → if mentions: domainEvents.emit MENTION_IN_COMMENT
  → return comment (author: { id, name, email, avatarUrl } from Prisma)
       ↓
[Frontend] onMutate: optimistic update to ['ticket', id] cache; clear textarea
[Frontend] onError: rollback cache to prev
[Frontend] onSettled: invalidateQueries(['ticket', id]); invalidateTicketLists(qc)
       ↓
[Background] Fanout job: load ticket; recipientIds = requester, owner, watchers \ {actor}; create Notification + NotificationDelivery per recipient; enqueue dispatch; SSE broadcast if applicable
       ↓
[Frontend] Refetch of ['ticket', id] → ticket.comments includes new comment; UI must render author.name or displayName
```

---

## 7. Proposed Implementation Approach

### 7.1 Frontend

1. **TicketDrawer author display**  
   Render comment author using `(c.author as { name?: string; displayName?: string }).displayName ?? (c.author as { name?: string; displayName?: string }).name ?? 'Unknown'` (or equivalent) so that both API shape (`name`) and optimistic shape (`displayName`) work.

2. **Double-submit prevention**  
   Disable the Add Comment button when `commentMut.isPending` (in addition to `!commentBody.trim()`) on both ticket detail page and TicketDrawer.

3. **Error feedback**  
   In both surfaces, surface mutation error: e.g. inline message below the button or toast when `commentMut.isError` (using `commentMut.error` for message). Clear error when user edits the textarea or successfully submits.

4. **Defensive comments array**  
   In TicketDrawer, use `(ticket.comments ?? [])` for any `.length` or `.map` so that undefined `ticket.comments` does not throw.

5. **Optional**  
   In optimistic comment object, include `author.name` if available from `user` for consistency with server shape and to avoid flash of "Unknown" after refetch.

### 7.2 Backend

1. **No DTO/validation change required**  
   CreateCommentDto and ValidationPipe already enforce non-empty body.

2. **Optional consistency**  
   Consider mapping comment response `author.name` → `displayName` in a DTO or interceptor for frontend compatibility. Alternatively, document that frontend must support both `name` and `displayName` (current approach).

3. **Logging**  
   Add a single debug or info log in CommentsService.create on success (e.g. ticketId, commentId) to aid operational debugging; avoid noisy logs.

### 7.3 Notifications / Events

1. **Idempotency**  
   Optionally include `commentId` in fan-out jobId so that two distinct comments never dedupe: e.g. `COMMENT_ADDED_${ticketId}_${payload.commentId}` (or similar). Ensures one notification per comment even if events are close together.

2. **No change to fan-out rules or payload**  
   COMMENT_ADDED → requester, owner, watchers is correct; payload already merged with ticket.title in processor.

### 7.4 Verification of Full Chain

- After implementation: confirm one successful comment add (from both detail and drawer), confirm author displays, confirm no duplicate on double-click, confirm error message on forced failure (e.g. invalid ticket or 403), confirm notification creation for requester/owner/watchers and no duplicate notifications, confirm refetch shows comment and unread/SSE behavior if applicable.

---

## 8. Risks / Regression Areas

| Risk | Mitigation |
|------|------------|
| Breaking optimistic update if we change author shape | Keep optimistic shape compatible with existing display logic; support both name and displayName everywhere. |
| Disabling button on pending could hide other bugs | Prefer disabling on pending; add error UI so failures are visible. |
| Changing jobId format could affect deduplication of other events | Only change jobId for COMMENT_ADDED (or add commentId only for this event type) so other event types unchanged. |
| Over-logging | Add at most one log line per comment create; use debug level if available. |

---

## 9. Verification Plan

1. **Happy path (ticket detail)**  
   Open a ticket; add a comment with body; submit. Expect: button disabled while loading; comment appears (optimistic then confirmed); author name visible; no duplicate on second click; ticket list invalidated.

2. **Happy path (drawer)**  
   Open ticket from list in drawer; add comment; submit. Same expectations; author name must show after refetch (name/displayName fix).

3. **Empty body**  
   Clear body; button disabled; do not submit. Backend: if body sent empty, 400 and error shown in UI.

4. **Invalid ticket / 403**  
   Force 403 (e.g. ticket user cannot see) or 404; expect error message in UI and no crash.

5. **Double submit**  
   Click Add Comment twice quickly; expect at most one comment (button disabled on first click), or document if second request is allowed and ensure no duplicate notifications (jobId includes commentId).

6. **Notifications**  
   As requester (or owner/watcher), add comment as different user; verify requester/owner/watchers receive in-app (and email/teams if configured) for COMMENT_ADDED; no duplicate for single comment.

7. **Refetch and real-time**  
   Add comment; verify refetched ticket includes it; verify unread count or SSE update if applicable.

8. **Defensive**  
   In a context where ticket.comments could be undefined (e.g. mock or edge case), verify drawer does not throw.

---

## 10. Acceptance Criteria

1. User with correct access can add a comment successfully from both ticket detail and TicketDrawer.
2. Comment persists and appears in the list immediately or after refetch; author name displays correctly (supporting both `name` and `displayName` from API).
3. Users without access receive 403 and see a clear error; no crash.
4. Empty or invalid comment body is rejected (backend 400) and/or prevented (frontend disable); no silent failure.
5. Notification fan-out runs for COMMENT_ADDED for requester, owner, watchers (excluding actor); no duplicate notifications for a single comment when jobId is updated.
6. Double submit is prevented or minimized (button disabled while pending); no duplicate comments from normal double-click.
7. Errors (4xx/5xx or network) are surfaced in the UI; user can retry or correct.
8. Optimistic update and invalidation leave UI in correct state; no stale or missing comments after refetch.
9. TicketDrawer does not throw when `ticket.comments` is undefined (defensive `?? []`).
10. No regression in dark/light mode or existing comment list/display behavior; logging is minimal and useful for ops.

---

## 11. Implementation Notes (Post-Implementation)

- **Canonical response:** `apps/api/src/common/serializers/comment-response.ts` defines `mapCommentToResponse()`; used in `CommentsService` (create, findByTicket, update) and `TicketsService.findById` so all comment responses expose `author.displayName` (from Prisma `name`). Frontend consumes `author.displayName` only.
- **Notification idempotency:** `DomainEventsService.emit()` uses `jobId = COMMENT_ADDED_${ticketId}_${payload.commentId}` (and same for MENTION_IN_COMMENT) when `payload.commentId` is present; otherwise timestamp-based. One persisted comment → one fan-out job per event type.
- **Transaction/side-effect:** Comment (and ticket.updatedAt) are written inside a Prisma transaction; audit log and emit run after commit. Emit failure is logged and not rethrown; comment creation remains successful. See comment block in `CommentsService.create`.
- **Tests:** `comments.service.spec.ts` — create returns canonical author shape (displayName); `domain-events.service.spec.ts` — COMMENT_ADDED/MENTION_IN_COMMENT jobId includes commentId, other events use timestamp jobId.

---

*End of mini-spec. Implementation should follow this document; any deviation (e.g. broader refactors) should be justified and documented.*
