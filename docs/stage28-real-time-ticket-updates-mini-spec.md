# Stage 28: Real-Time Ticket Updates — Mini-Spec

## 1. Intent

- Make the ticketing system feel **alive and instantly up to date** when tickets, comments, assignments, or subtasks change—without relying solely on manual refresh or broad list invalidation.
- Preserve **minimal architecture disruption**: backend remains source of truth, visibility and policy guarantees stay intact, and real-time delivery integrates cleanly with React Query and the existing API.
- Prefer the **simplest transport** that satisfies the use cases; avoid WebSockets unless bidirectional real-time behavior is required.

## 2. Problem Statement

Today:

- **Notifications** are already pushed in real time over SSE: when a notification is created for a user, it is pushed to their open SSE connection and the client invalidates `['notifications']` and `['notifications', 'count']`. Ticket lists and detail views are **not** updated from that stream.
- **Ticket data** (lists, detail, drawer, inbox, portal) only updates when:
  - The user performs a mutation (create/update/comment/subtask) and the client invalidates the relevant queries, or
  - The user refetches (e.g. refocus, navigation) or a refetchInterval runs.
- As a result, if another user (or another tab) updates a ticket, the current view can stay stale until the user refreshes or triggers a mutation. Inbox “readiness” and list counts (e.g. comment count, status) can lag.

The goal is to **selectively** add real-time behavior so that:

- Relevant list and detail surfaces react to **server-authoritative** events (new tickets, status/assignment changes, new comments, subtask progress, inbox readiness).
- Visibility and permissions are **never** bypassed: real-time events only inform the client that something may have changed; the client still refetches or patches using existing APIs that enforce TicketVisibilityService and policy.
- No duplicate updates, race conditions, or stale UI from out-of-order or redundant events.

## 3. Scope

**In scope**

- Defining which **events** warrant real-time delivery (ticket created/updated, comment added, subtask status/readiness, assignment, etc.).
- Deciding which **surfaces** react to which events (e.g. list vs detail vs inbox).
- **Transport**: evaluate SSE vs WebSockets; recommend one and describe integration with the existing SSE notification stream or a dedicated stream.
- **Backend**: event emission (reuse domain events / fan-out path or add a separate “ticket update” push path), and ensuring only **visible** updates are sent (or sent in a way that doesn’t leak data).
- **Frontend**: how React Query consumes real-time events (invalidate vs targeted refetch vs optimistic patch), and how to avoid duplicates and races.
- **Operational**: single-instance in-memory vs multi-instance (Redis pub/sub) and rollout risk.

**Out of scope**

- Changing ticket visibility rules, policy layer, or RBAC.
- Rewriting list or detail APIs.
- Real-time typing indicators, presence, or chat-style bidirectional flows (unless we explicitly justify WebSockets for them).
- Full “live document” collaboration (e.g. multiple users editing the same ticket form in real time).

## 4. Current System Surfaces Involved

| Surface | Route / Component | Data / Query Keys | Notes |
|--------|--------------------|-------------------|--------|
| Global list | `/tickets` | `useTicketListQuery('list', params)` → `['tickets', 'list', ...]` | Active/Completed, filters, search |
| Actionable queue | `/inbox` | `useTicketListQuery('actionable', params)` → `['tickets', 'actionable', ...]` | `actionableForMe`, folders |
| Portal My | `/portal?tab=my` | `useTicketListQuery('portal-my', params)` → `['tickets', 'portal-my', ...]` | Requester = me |
| Portal Studio | `/portal?tab=studio` | `useTicketListQuery('portal-studio', params)` → `['tickets', 'portal-studio', ...]` | Studio-scoped |
| Portal legacy list | `/portal/tickets` | `['tickets', 'portal-legacy', filters, search]` | Alternative portal list |
| Ticket detail | `/tickets/[id]` | `['ticket', id]`, `['ticket', id, 'subtasks']`, `['ticket', id, 'history']`, `['ticket', id, 'attachments']` | Full detail page |
| Ticket drawer | `TicketDrawer` (from `/tickets`) | Same as detail: `['ticket', ticketId]`, subtasks, history, attachments | Slide-in from list |
| Notifications | `/notifications`, bell count | `['notifications']`, `['notifications', 'count']` | Already SSE-driven invalidate |
| Inbox folders | `/inbox` | `['inbox-folders']` | Folder counts (actionable by topic) |
| Dashboard / my-summary | `/dashboard` | `['my-summary']` | KPI counts |

**Existing real-time**

- **SSE**: `GET /api/notifications/stream` (auth via query token or header as implemented). One stream per user; in-memory `SseChannel`; each “notification” push triggers frontend `invalidateQueries(['notifications'])` and `['notifications', 'count']`. No ticket list or ticket detail invalidation from SSE today.
- **Domain events**: Emitted after DB writes (ticket create/update, comment, subtask, etc.) → BullMQ fan-out job → notification creation + SSE push to recipients. Events are **recipient-scoped** (fan-out decides who gets a notification); they are not “broadcast to all viewers of this ticket.”

## 5. Real-Time Use Cases

Evaluated by **need** (high = clear value, low = nice-to-have or refetch-sufficient) and **complexity** (invalidation vs patch, visibility).

| # | Use case | Surfaces affected | Need | Notes |
|---|----------|-------------------|------|--------|
| 1 | **New tickets** appearing in relevant views | `/tickets`, `/inbox`, `/portal?tab=my`, `/portal?tab=studio` | High | Must respect visibility: only push “a ticket in your scope was created” or include ticket id and let client refetch list (server re-applies visibility). |
| 2 | **Comment count / new comments** | List rows (comment count), detail/drawer (comment list) | High | List: invalidate or refetch list query so row count updates. Detail: invalidate `['ticket', id]` or only comments slice. |
| 3 | **Ticket status changes** | List rows, detail, drawer, inbox (readiness can change) | High | Same as above; status is on list payload. Inbox: status/subtask changes can make a ticket (in)eligible for actionable queue. |
| 4 | **Assignment changes** | List rows, detail, drawer | High | Owner shown on list and detail; reassignment should update both. |
| 5 | **Subtask status / progress** | Detail, drawer, list (progress indicator), inbox | High | Progress bar and “actionable” state depend on subtasks; inbox especially needs to update when a subtask becomes READY or is completed. |
| 6 | **Inbox / actionable queue** updates when ticket readiness changes | `/inbox`, inbox folder counts | High | When SUBTASK_BECAME_READY fires, department inbox and folder counts should refresh so “It’s your turn” is reflected without manual refresh. |
| 7 | **Notification-adjacent live UI** | Bell count, notification list | Already done | Already handled by existing SSE + invalidate. |

**Conclusion**

- All of (1)–(6) deserve real-time treatment for a “live” feel; (7) is already in place.
- **No bidirectional** requirement: client never needs to push real-time data to the server over the same channel (mutations stay REST). **SSE is sufficient** as the transport.

## 6. Transport Options Evaluation

| Option | Pros | Cons | Verdict |
|--------|------|------|--------|
| **SSE (extend existing stream)** | Already in use for notifications; one connection per user; auth already in place; server→client only; simple reconnect (EventSource). | Single stream must carry both “notification” and “ticket update” semantics; need a clear event model so client can branch. | **Preferred.** |
| **SSE (second stream)** | Clear separation: one stream for notifications, one for ticket updates. | Two long-lived connections per user; more connection and auth handling. | Only if event model on a single stream becomes too complex. |
| **WebSockets** | Full duplex; could send acks or client commands. | Unnecessary for “server pushes updates”; more infra and reconnect logic; no current requirement for client push over same channel. | **Not recommended** for this stage. |
| **Polling (short interval)** | No new transport. | Latency, load, and still “not real time.” | Out of scope for “real-time” spec. |

**Recommendation: single SSE stream per user**, extended to carry a second event type (e.g. `ticket_update` or `ticket_event`) in addition to the existing notification payload. Client already has `useNotificationStream()` in app layout; we extend the same connection to listen for the new event type and drive React Query invalidation/refetch (and optionally targeted patch) for ticket-related queries.

## 7. Recommended Architecture

- **One SSE connection per user** (existing `GET /api/notifications/stream`), reused for:
  - **Notification** events (current behavior): payload as today; client keeps invalidating `['notifications']` and `['notifications', 'count']`.
  - **Ticket update** events (new): payload includes at least `ticketId`, `eventType` (e.g. `TICKET_CREATED`, `TICKET_STATUS_CHANGED`, `COMMENT_ADDED`, `SUBTASK_BECAME_READY`, …), and optionally minimal context (e.g. `newStatus`) so the client can decide what to invalidate or patch.
- **Backend**: Do **not** push ticket payloads that bypass visibility. Two safe approaches:
  - **A (recommended): “Hint” only.** Push only that “ticket X had event Y”; recipient list is the same as (or a subset of) notification fan-out. Client reacts by invalidating or refetching the relevant React Query keys; all actual data comes from existing APIs (list, get by id), which enforce TicketVisibilityService and policy. No risk of leaking invisible ticket data.
  - **B: Scoped push.** Only send ticket-update events to users who have already been determined to receive a notification for that event (reuse fan-out). So the same recipient set that gets “New comment” gets “ticket_update” for that ticket. Client still refetches/invalidates; we do not send full ticket JSON over SSE to avoid consistency and visibility edge cases.
- **Event source**: Reuse **domain events** already emitted by TicketsService, CommentsService, SubtasksService. Today they only go to the fan-out queue → create notification + SSE push. We add a second path: when a domain event is enqueued (or when the fan-out job runs), we also push a **ticket_update** SSE message to each recipient (or broadcast a single message per event and let the client filter—see Visibility below). Prefer reusing the fan-out job so we don’t double-write: fan-out already has the list of recipient user IDs; for each recipient we can call an SSE “ticket update” push in addition to creating the notification record.
- **Single-instance**: Keep in-memory `SseChannel` per instance. When we scale to multiple instances, introduce Redis pub/sub: fan-out (or a dedicated worker) publishes “user X: ticket_update payload”; the API instance that holds user X’s SSE connection subscribes and pushes to that connection. No change to client contract.

## 8. Event Model Proposal

- **Existing**: SSE message with (current) notification payload; client listens for `notification` (or default `message`) and invalidates notification queries.
- **New**: SSE message with `type: 'ticket_update'` (or equivalent) and a payload such as:

```ts
{
  ticketId: string;
  eventType: NotificationEventType;  // e.g. TICKET_CREATED, COMMENT_ADDED, SUBTASK_BECAME_READY
  occurredAt: string;                 // ISO
  // Optional minimal context to avoid refetch when not needed:
  commentId?: string;
  subtaskId?: string;
  newStatus?: string;
  ownerId?: string;
}
```

- **Recipient rule**: Same as notification fan-out—only users who would receive a notification for this event receive the ticket_update SSE. That preserves visibility (we only tell users about tickets they’re already allowed to see via the notification pipeline). No need to send to “everyone watching the ticket” separately; the fan-out already encodes “requester, owner, watchers, mentioned, subtask owner, department users” per event type.
- **Idempotency**: Include a server-side event or message id so the client can dedupe (e.g. same event delivered after reconnect).

## 9. Frontend Integration Strategy

- **Single subscription**: Keep one `EventSource` in app layout (e.g. inside `useNotificationStream()` or a new `useTicketUpdateStream()` that shares the same connection if we add a named event type). If the backend uses one stream with two event types, the client subscribes to both `notification` and `ticket_update`.
- **React Query**:
  - **Default: invalidation.** On `ticket_update`, invalidate the minimal set of query keys that could be stale:
    - Always: `['ticket', ticketId]` (detail + drawer), and `['ticket', ticketId, 'subtasks']`, `['ticket', ticketId, 'history']` when event implies comments/subtasks changed.
    - List-like keys: `['tickets', 'list']`, `['tickets', 'actionable']`, `['tickets', 'portal-my']`, `['tickets', 'portal-studio']`, and optionally `['tickets', 'portal-legacy']` so that list rows (status, owner, comment count, progress) and inbox both refresh. Use **predicate-based** invalidation (e.g. `queryKey[0] === 'tickets'`) to avoid refetching every list variant at once if we want to optimize later; for v1, invalidating all ticket list keys is acceptable.
    - Inbox folders: invalidate `['inbox-folders']` on SUBTASK_BECAME_READY (and related) so counts update.
    - Optional: invalidate `['my-summary']` on ticket/assignment events so dashboard KPIs refresh.
  - **No optimistic patch from SSE.** Treat SSE as a “hint” that data may have changed; do not merge payload into cache unless we add a dedicated “patch” API and spec it. Prefer **invalidate → refetch** so the backend remains the single source of truth and visibility is re-applied on each fetch.
- **Deduplication**: If the client receives multiple `ticket_update` events for the same ticket in quick succession (e.g. comment + status change), debounce invalidation (e.g. 200–500 ms) so we don’t trigger five refetches; one refetch after the burst is enough.
- **Reconnect**: On EventSource reconnect, the client may receive no immediate replay of missed events. Rely on existing behavior: next time the user focuses the window or navigates, React Query refetches. Optionally invalidate ticket list and open ticket detail on stream `onopen` after reconnect to catch up.

## 10. Backend Integration Strategy

- **Where to emit ticket_update**: In the **notification fan-out processor**, after determining recipients and creating the notification record (and pushing the notification SSE), for each recipient also push a **ticket_update** SSE message with `ticketId`, `eventType`, and optional minimal context. Reuse the same recipient list; no extra visibility logic.
- **SseChannel**: Extend `push()` to accept an optional event type and payload shape, or add `pushTicketUpdate(userId, payload)` that sends a MessageEvent with `type: 'ticket_update'` and the payload. NestJS SSE controller returns an observable that merges notification and ticket_update subjects, or we keep one subject per user and emit two “formats” (notification vs ticket_update) with a `type` on the MessageEvent so the client can distinguish.
- **Payload**: Do not include full ticket or comment body; only ids and event type (and optional newStatus/ownerId) so the client can invalidate and refetch. Keeps SSE payloads small and avoids leaking data.
- **No new API routes**: Reuse `GET /api/notifications/stream`; only the shape of some emitted messages changes.

## 11. Visibility / Permission Considerations

- **Who receives ticket_update**: Only users who are recipients of the notification for that domain event (fan-out rules). So visibility is preserved by reusing the same logic that already restricts notifications (e.g. COMMENT_ADDED → requester, owner, watchers).
- **What is sent**: Only ticket id, event type, and minimal non-sensitive context (e.g. new status enum, owner id). No ticket title, description, or comment body in the ticket_update payload if we want to minimize any risk of leaking info on the wire; client refetches via authenticated API.
- **Detail view**: When the client invalidates `['ticket', id]` and refetches, `TicketsService.findById` (and policy) still enforces `assertCanView`; if the user lost access, they get 403 and the UI can handle it. No need to “revoke” via SSE.

## 12. Risks / Edge Cases

- **Duplicate events**: Fan-out can create multiple notifications (e.g. requester + owner + watchers). Each gets a ticket_update. So one ticket change can cause one user to receive one SSE message (good). If the same event is retried or replayed, include an event id and let the client dedupe by id or (ticketId + eventType + occurredAt).
- **Reconnect and missed events**: After reconnect, no replay. Rely on invalidate-on-reconnect or on next refetch when user interacts. Acceptable for v1.
- **Multiple tabs**: Each tab has its own SSE connection and its own React Query cache. Both will receive the same ticket_update and both will invalidate; each refetches. No shared cache between tabs; that’s acceptable.
- **Race with mutation**: User A submits a comment; client invalidates and refetches. User B’s client receives ticket_update and also invalidates. No conflict; last refetch wins. Optimistic updates on the mutating client are already reverted on refetch.
- **Load**: More invalidations can mean more refetches. Mitigate with debouncing and with limiting ticket_update to “relevant” list keys (e.g. only invalidate lists that are likely mounted: e.g. current route). We can start broad (invalidate all ticket list keys) and narrow later.
- **Multi-instance**: In-memory SseChannel only reaches the instance that has the user’s connection. When we add horizontal scaling, we must add Redis pub/sub (or similar) so that any instance can publish “user X: ticket_update” and the instance holding X’s SSE pushes it. Document this as the upgrade path.

## 13. Test Plan

- **Unit (backend)**: Fan-out processor, after creating notifications, also calls SseChannel with ticket_update payload for each recipient. SseChannel (or adapter) sends MessageEvent with correct `type` and payload. Visibility: only recipients from fan-out receive the push (no new visibility logic; reuse fan-out).
- **Unit (frontend)**: Mock EventSource; fire `ticket_update` events; assert React Query invalidate calls with expected keys (and optional debounce).
- **Integration**: Create/update ticket, add comment, complete subtask from one client; assert second client (same or different user, depending on visibility) receives SSE and list/detail invalidate and refetch (or assert invalidation and one refetch after debounce).
- **E2E**: Two users; user A creates ticket or adds comment; user B has list/detail open; assert user B’s list or detail updates without manual refresh (within a short timeout).
- **Visibility**: User without access to a ticket must not receive ticket_update for that ticket (covered by reusing fan-out recipients only).
- **Reconnect**: Disconnect SSE, trigger an event, reconnect; assert client can reconnect and subsequent events still cause invalidation (and optionally invalidate on connect).

## 14. Acceptance Criteria

- **AC1** (Transport): One SSE stream per user carries both notification and ticket_update events; client subscribes to both and reacts accordingly.
- **AC2** (Events): Ticket create, status/assignment change, comment add, subtask status/readiness (and other domain events that today trigger notifications) also trigger a ticket_update SSE to the same recipients.
- **AC3** (Visibility): Only users who receive the notification for that event receive the ticket_update; no full ticket payload that could leak invisible data.
- **AC4** (Lists): When a ticket_update is received, the client invalidates the relevant ticket list query keys so that `/tickets`, `/inbox`, `/portal?tab=my`, `/portal?tab=studio` (and drawer when open) refetch and show updated status, owner, comment count, progress.
- **AC5** (Detail/Drawer): When a ticket_update is received for a ticket that is currently open (detail page or drawer), the client invalidates `['ticket', id]` (and related subtasks/history) so the view refreshes.
- **AC6** (Inbox): SUBTASK_BECAME_READY (and related) invalidate inbox list and inbox folder counts so actionable queue and folder badges update without manual refresh.
- **AC7** (No regression): Existing notification SSE behavior (bell count, notification list) continues to work.
- **AC8** (Deduplication): Rapid successive events for the same ticket do not cause unbounded refetches; debouncing or coalescing is applied.
- **AC9** (Backend source of truth): All visible data after an update still comes from REST (list/detail APIs); SSE only triggers invalidation/refetch.
