# Stage 29 Phase 2: SSE Multi-Instance Readiness — Mini-Spec

## 1. Intent

- Enable **real-time SSE delivery** (notifications and ticket_update) to work when **multiple API instances** are running behind a load balancer.
- Use **Redis pub/sub** as the bridge so that whichever instance holds a user’s SSE connection can receive and forward messages published by any other instance (or by a worker).
- Preserve the **current API route**, event types, and frontend contract; no redesign, no WebSockets, no change to notification or ticket-update semantics.

## 2. Problem Statement

Today, SSE works only in a **single-instance** setup:

- **SseChannel** keeps an in-memory `Map<userId, Subject>`. Each open `GET /api/notifications/stream` registers that user’s Subject on the process that handled the request.
- **Notification fan-out** runs in the same process (or, if workers are split out, on the worker process). It calls `SseChannel.push(userId, …)` and `SseChannel.pushTicketUpdate(userId, …)`, which only affect the **local** Map.
- Once we run **multiple API instances**, the load balancer sends each client’s stream request to one of the instances. User X’s connection may be on instance A. When a domain event triggers fan-out, the job may run on instance B (or a dedicated worker). That process calls `push` / `pushTicketUpdate` for user X, but user X’s Subject exists only on instance A. Instance B has no connection for X, so the message is dropped and the user sees no live update.

So: **live updates silently fail** whenever the instance that publishes is not the instance that holds the user’s SSE connection. The same applies if workers run in a separate process from the API: the worker has no SSE connections at all.

## 3. Scope

**In scope**

- Designing and specifying the **Redis pub/sub** bridge so that any instance (or worker) can “push” to a user by publishing, and the instance that has that user’s SSE connection receives and forwards to the stream.
- Defining how **SseChannel** (or a small adapter layer) integrates with Redis: publish on push/pushTicketUpdate, subscribe per connected user, unsubscribe on disconnect.
- Subscription lifecycle, message shape, and **no duplicate delivery** at the single-connection level (one subscription per user per instance that has that user).
- **Operational** behavior: reconnect, instance startup/shutdown, Redis failure, cleanup, logging.
- Preserving **current route** (`GET /api/notifications/stream`) and **current event types** (`notification`, `ticket_update`) and payloads.

**Out of scope**

- Changing to WebSockets or other transport.
- Changing notification fan-out rules, visibility, or policy.
- Changing the frontend EventSource URL or event handling (except if we need a trivial adaptation).
- Adding new infrastructure beyond Redis (already used for BullMQ).

## 4. Current SSE Architecture

### 4.1 SseChannel (`apps/api/src/modules/notifications/channels/sse.channel.ts`)

- **State**: In-memory `Map<string, Subject<SseStreamMessage>>` keyed by `userId`.
- **subscribe(userId)**: Creates or returns the Subject for that user. Called by the stream controller when a client opens `GET /api/notifications/stream`.
- **unsubscribe(userId)**: Completes the Subject and removes it from the Map. Called when the HTTP request closes (`req.on('close')`).
- **push(userId, payload)**: If the user’s Subject exists and is not closed, emits `{ type: 'notification', data: payload }`.
- **pushTicketUpdate(userId, payload)**: Same, with `{ type: 'ticket_update', data: payload }`.
- **activeConnections**: Returns `streams.size` (number of open streams on this instance).

All of this is **local to one Node process**. No cross-process communication.

### 4.2 Notifications stream controller (`notifications.controller.ts`)

- **GET /api/notifications/stream**: Uses `@CurrentUser()` for auth, then `sseChannel.subscribe(user.id)`, and returns `subject.asObservable().pipe(map(msg => ({ type: msg.type, data: msg.data })))`. On `req.on('close')`, calls `sseChannel.unsubscribe(user.id)`.
- The client receives SSE messages with `event: notification` or `event: ticket_update` and `data` as JSON.

### 4.3 Notification fan-out processor (`notification-fanout.processor.ts`)

- Runs in the **same NestJS app** as the API today (WorkersModule imports NotificationsModule). For each recipient user:
  - If in-app: calls `notificationsService.createAndDeliver(...)`, which creates the DB notification and calls `sseChannel.push(userId, …)`.
  - Then calls `sseChannel.pushTicketUpdate(user.id, ticketUpdatePayload)` for every recipient (same list).
- So both **notification** and **ticket_update** are delivered by the same SseChannel that the stream controller uses—but only on the process where the job runs.

### 4.4 Connection tracking

- Connections are tracked **only** in the in-memory Map: key = `userId`, value = RxJS Subject. There is no shared registry. The instance that accepted `GET /api/notifications/stream` is the only one that can push to that user’s Subject.

## 5. Multi-Instance Failure Mode

- **Horizontal scaling**: N API instances behind a load balancer. Each instance has its own SseChannel and its own `Map<userId, Subject>`. User X’s EventSource is bound to one instance (e.g. A); their Subject exists only on A.
- **Fan-out runs elsewhere**: The BullMQ fan-out job can run on any instance that runs workers (e.g. instance B or a dedicated worker process). It calls `sseChannel.push(X, …)` and `sseChannel.pushTicketUpdate(X, …)` on **that** process. That process’s Map either has no entry for X (if X is on A) or has X (if by chance the job ran on A). In the typical case (X on A, job on B), B’s `streams.get(X)` is undefined, so the push is a no-op and the user gets nothing.
- **Result**: Notifications and ticket_update events are **silently not delivered** to clients whose SSE connection is on a different instance (or when the worker is separate from the API). The DB still has the notification record; email/Teams still send; only in-app SSE fails.
- **Code paths affected**: Every call to `SseChannel.push` and `SseChannel.pushTicketUpdate`—today only from (1) NotificationsService.createAndDeliver (fan-out processor) and (2) fan-out processor’s pushTicketUpdate loop. No other callers.

## 6. Recommended Redis Pub/Sub Architecture

### 6.1 Channel design: per-user channels

- **One Redis channel per user**: `sse:user:{userId}`.
- **Publish**: When any instance (or worker) needs to send a message to user X, it **PUBLISH**es to `sse:user:X` a single serialized payload (e.g. JSON) that encodes the message type and data: `{ type: 'notification' | 'ticket_update', data: ... }`.
- **Subscribe**: Only the API instance that **has** user X’s SSE connection subscribes to `sse:user:X`. When that instance receives a message on the channel, it pushes the parsed message into the local Subject for X, which is already wired to the HTTP response. So the client receives the event as today.
- **Why per-user**: Keeps delivery simple and targeted. Only one instance (the one with X’s connection) subscribes to `sse:user:X`, so only that instance receives the message. No need for a shared “broadcast” channel that every instance would receive and then filter; that would require each instance to know which user IDs it holds, and then filter—equivalent to subscribing only to those IDs, which is the per-user model. Per-user channels also avoid one slow consumer blocking others.

### 6.2 Flow

1. **Client connects** (GET /api/notifications/stream on instance A): Controller calls `sseChannel.subscribe(userId)`. SseChannel (or adapter) creates the local Subject, **subscribes to Redis channel `sse:user:{userId}`**, and returns the Subject. Messages received from Redis are pushed to the Subject.
2. **Client disconnects** (req closes): Controller calls `sseChannel.unsubscribe(userId)`. SseChannel **unsubscribes from Redis `sse:user:{userId}`**, completes the Subject, and removes it from the Map.
3. **Fan-out (or any caller) pushes to user X**: Calls `sseChannel.push(X, payload)` or `sseChannel.pushTicketUpdate(X, payload)`. SseChannel **PUBLISH**es to Redis `sse:user:X` the serialized message. It does **not** push directly to a local Subject (or only does so if X is on this instance—see below).
4. **Instance that has X’s connection**: Its Redis subscriber receives the message on `sse:user:X`, parses it, and pushes to the local Subject for X. The SSE response sends the event to the browser.

### 6.3 Single-instance behavior and optional local shortcut

- When only one instance runs, every push is for a user who (if connected) is on this instance. We can either:
  - **Always publish**: Publish to Redis and also have this instance subscribed to its own connected users; it receives its own publish and forwards. No special case; works for 1 or N instances.
  - **Optimization**: If “we are the only subscriber” or “we have this user locally,” push locally and optionally also publish (so that if another instance had the user, it would get it—but with one instance there is no other). To avoid duplicate delivery when we both publish and push locally, the rule must be: **either** publish **or** push locally, not both. So the minimal, consistent rule is: **always publish**. The instance that has the user is subscribed and will receive; the instance that doesn’t have the user publishes and no one is subscribed (message dropped, which is correct). No need for a “local shortcut” unless we want to avoid Redis traffic on single-instance; that can be a later, optional optimization (e.g. env USE_REDIS_SSE=false for single-instance).

### 6.4 Message shape on Redis

- Same as current in-memory message: `{ type: 'notification', data: SseNotificationPayload } | { type: 'ticket_update', data: SseTicketUpdatePayload }`. Serialize as JSON. No need for a separate envelope; type and data are enough for the subscriber to re-emit as the same MessageEvent shape the controller already uses.

## 7. Backend Integration Strategy

### 7.1 Where publish happens

- **Same call sites as today**: All delivery goes through SseChannel. So `push(userId, payload)` and `pushTicketUpdate(userId, payload)` remain the only API. Internally, SseChannel (or an adapter) will **publish** to Redis `sse:user:{userId}` instead of (or in addition to) writing to a local Subject. No change to NotificationsService or the fan-out processor; they keep calling the same methods.

### 7.2 How SseChannel should change

- **Option A — SseChannel owns Redis**: SseChannel gets a Redis client (or a small “SSE Redis” service) injected. On subscribe(userId): create Subject, subscribe to `sse:user:{userId}`, on message → parse and subject.next(…). On unsubscribe(userId): Redis UNSUBSCRIBE, complete Subject, delete from Map. On push / pushTicketUpdate: Redis PUBLISH to `sse:user:{userId}` with JSON.stringify({ type, data }). No direct local push.
- **Option B — Adapter**: Keep current SseChannel as “local only” and introduce an SseBridge (or RedisSseChannel) that implements the same interface: subscribe/unsubscribe/push/pushTicketUpdate. The bridge uses Redis for publish and for per-user subscription; it holds the Map of local Subjects and wires Redis messages into them. The controller and NotificationsService depend on the interface; we swap in the bridge when Redis is configured. Either way, the **behavior** is as above; the choice is whether to evolve SseChannel in place or wrap it.

Recommendation: **Evolve SseChannel in place** (Option A) with a Redis client dependency that is optional or gated by config (e.g. REDIS_SSE_ENABLED or “if Redis URL present”). When Redis is not configured, keep current in-memory-only behavior (push/pushTicketUpdate only to local Subject). When Redis is configured, use publish + subscribe as above. This avoids a second implementation of the same interface and keeps a single place for “how we deliver SSE.”

### 7.3 Subscription lifecycle

- **On subscribe(userId)**: Create Subject; subscribe to Redis channel `sse:user:${userId}`; store in Map; return Subject. The Redis subscription callback: on message, parse JSON, call subject.next(parsed). If parse fails, log and skip.
- **On unsubscribe(userId)**: Remove from Map; Redis UNSUBSCRIBE `sse:user:${userId}`; subject.complete(). Order: stop receiving Redis messages, then complete the Subject, so no race where a late message is pushed after complete.
- **Connection count**: activeConnections remains the size of the local Map (streams on this instance). No need to report “global” connection count unless we add a separate metric later.

### 7.4 Avoiding duplicate delivery

- Each user ID has at most **one** SSE connection per browser (one EventSource per tab; each tab is a separate connection). The load balancer typically binds a given client to one instance (sticky or not). So for a given userId, either zero or one instance has that user in its Map. Only that instance subscribes to `sse:user:{userId}`. So each PUBLISH is received by **at most one** subscriber. No duplicate at the “one user, one connection” level. If the same user had two connections (e.g. two tabs on two different instances), we would have two subscribers to `sse:user:X` and each would get the message once—one per connection. That is correct (each tab should get the update). So no extra deduplication is required.

### 7.5 Preserving event types

- The payload on Redis is `{ type, data }`. The subscriber parses and passes that object to subject.next(...). The controller already maps each message to `{ type: msg.type, data: msg.data }` for the SSE response. So **notification** and **ticket_update** remain unchanged; the client still receives SSE events with the same `event` type and `data` body.

## 8. Operational / Reliability Considerations

### 8.1 Reconnect behavior

- **Client**: The browser EventSource will reconnect to the same or another instance. If it reconnects to a different instance, that instance’s SseChannel will call subscribe(userId) and subscribe to Redis `sse:user:{userId}`. No change needed on the client; reconnection is already handled by EventSource.
- **Redis**: If Redis is temporarily unavailable, publish may fail. Options: log and drop (current “silently ignore if user not connected” is similar), or retry once. Prefer **log and drop** for Phase 2; the notification is still in the DB and the user will see it on next load or when they open the notifications list. Optionally, we can add a small in-memory retry for publish (e.g. one retry after 1s) without adding a queue.

### 8.2 Instance startup / shutdown

- **Startup**: No need to “recover” existing SSE connections; they are per-connection. New connections land on instances and subscribe to Redis as they come.
- **Shutdown**: On graceful shutdown, we should unsubscribe from all Redis channels for users in the Map and complete Subjects so the client sees a clean close. If we don’t, the client will see a connection drop and reconnect (EventSource behavior).

### 8.3 Redis dependency and failure mode

- **Dependency**: Redis is already required for BullMQ. Using it for SSE does not add a new infrastructure dependency; we use the same Redis (or a dedicated connection from the same host). If we use a separate connection for pub/sub, it avoids blocking the BullMQ connection.
- **Redis down**: If Redis is down, PUBLISH fails. We log and do not deliver in-app SSE for that message. Subscriptions also fail; new SSE connections might not receive any messages until Redis is back. Existing connections would still be open but would stop receiving. Acceptable for Phase 2; we can add health-check impact (e.g. /api/health considers Redis) which we already do.

### 8.4 Memory and cleanup

- **Per-user subscription**: We only subscribe to Redis for userIds that are in our Map. When we unsubscribe(userId), we Redis UNSUBSCRIBE and remove from Map. No long-lived subscription leak.
- **Redis client**: Use one subscriber connection per instance (pattern: one Redis client that subscribes to many channels, or a dedicated “subscriber” client). Avoid one connection per user.

### 8.5 Logging / observability

- **Log**: When publish fails (e.g. Redis error), log at warn level with userId (or hash) and reason. When a Redis message fails to parse, log and skip.
- **Metrics** (optional for Phase 2): Count of publish success/failure, or number of active Redis subscriptions per instance. Can be added later; not required for minimal Phase 2.

## 9. Files / Modules / Infra Likely Involved

| Area | Files / modules | Infra |
|------|------------------|--------|
| Redis client for pub/sub | New small service or use existing Redis connection; NotificationsModule or common | Redis (existing) |
| SseChannel | `apps/api/src/modules/notifications/channels/sse.channel.ts` | — |
| Stream controller | `apps/api/src/modules/notifications/notifications.controller.ts` | — (no change to route or handler signature) |
| Fan-out / NotificationsService | No change; they keep calling push / pushTicketUpdate | — |
| Config | Env or config: enable Redis SSE (e.g. REDIS_SSE_ENABLED or derive from REDIS_HOST) | — |
| NotificationsModule | Wire Redis SSE client and pass to SseChannel | — |

No new infrastructure beyond Redis (already used). Optionally a second Redis connection for pub/sub to avoid sharing with BullMQ (recommended to avoid blocking).

## 10. Safe Improvements vs Overengineering

**Safe and minimal**

- Per-user Redis channel `sse:user:{userId}`; single message shape `{ type, data }`.
- SseChannel (or single implementation) handles both “local only” and “Redis pub/sub” via config.
- Publish on every push/pushTicketUpdate when Redis is enabled; subscribe only for connected users on this instance; unsubscribe on disconnect.
- Reuse existing Redis host/port; single subscriber connection per instance for all user channels.

**Avoid**

- Multiple channel topics (e.g. per-event-type channels) unless we need to scale subscribers differently; one channel per user is enough.
- Storing connection state in Redis (e.g. “which instance has user X”); subscription is the natural representation.
- Changing the HTTP route, event names, or payloads.
- Adding a message queue for SSE (pub/sub is enough; no persistence needed for live delivery).

## 11. Test / Validation Plan

- **Unit**: SseChannel (or Redis adapter) with a mock Redis client: subscribe(userId) leads to subscribe call for `sse:user:userId`; unsubscribe leads to unsubscribe; push/pushTicketUpdate lead to publish with correct payload; received message is pushed to the correct Subject.
- **Integration (single instance)**: Enable Redis SSE; open EventSource; trigger fan-out (e.g. create ticket or add comment); assert client receives notification and ticket_update events.
- **Integration (two instances)**: Run two API instances, same Redis. Connect client to instance A (e.g. sticky or force port). Trigger fan-out from instance B (or worker). Assert client on A receives the events (message published by B, received by A via Redis).
- **Failure**: Simulate Redis down; trigger push; assert no throw, log present, client does not receive (or disconnect behavior as designed).

## 12. Acceptance Criteria

- **AC1** When multiple API instances run with the same Redis and Redis SSE is enabled, a client connected to instance A receives notification and ticket_update events when the event is published by instance B (or by a worker process).
- **AC2** The public API remains GET /api/notifications/stream; event types remain notification and ticket_update with unchanged payload shapes.
- **AC3** NotificationsService and the fan-out processor do not change their call sites; they still call sseChannel.push and sseChannel.pushTicketUpdate.
- **AC4** When Redis is unavailable or disabled, behavior degrades gracefully (no crash; optional fallback to local-only when single instance).
- **AC5** On client disconnect, the instance unsubscribes from Redis for that user and cleans up the local Subject; no leak.
- **AC6** Single-instance deployment continues to work (with or without Redis enabled; if enabled, publish/subscribe still works with one instance).
