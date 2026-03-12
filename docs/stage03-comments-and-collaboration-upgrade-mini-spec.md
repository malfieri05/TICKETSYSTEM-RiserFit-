# Stage 3: Comments and Collaboration Upgrade — Mini-Spec

## 1. Intent

Upgrade the comment system so it supports **modern internal-team collaboration** in a clean, production-grade way. This stage focuses on **collaboration behavior, data model, and structural UX**—not broad visual redesign. Goals:

- **@mentions** that are reliable, parseable, and notification-correct.
- **Reply-to-comment** with one-level threading and clear visibility rules.
- **Notification correctness** for mentions and comments, with no duplicate or incorrect fanout.
- **Real-time / refresh behavior** so the UI stays in sync after comments, replies, and mentions.

Stage 1 visibility and Stage 2 workflow/lifecycle behavior are **preserved** unless explicitly changed below. The backend remains the **single source of truth** for comment content, mentions, and threading.

---

## 2. Problem Statement

The current comment system provides basic commenting and mention parsing but lacks:

- **Structured reply model:** Comments are flat; there is no way to associate a reply with a parent comment or render threads.
- **Mention scope and UX:** The backend accepts structured mentions `@[Name](userId)` and persists them, but (a) the frontend may not offer a consistent typeahead/suggestion UX, (b) it is unclear whether users can mention anyone in the system or only users relevant to the ticket, and (c) mention notification recipients are **not** filtered by ticket visibility—so a mentioned user without access to the ticket could receive a notification (and then get 403 when opening the link).
- **Duplicate notification risk:** COMMENT_ADDED notifies requester/owner/watchers; MENTION_IN_COMMENT notifies mentioned users. A user who is both (e.g. owner and mentioned) can receive two notifications for the same comment unless deduplication is explicit.
- **Real-time clarity:** How the UI updates after a new comment, reply, or mention (invalidation, SSE, unread counts) is not fully specified, which can lead to stale or inconsistent views.
- **Reliability:** Double-submit, fragile frontend-only mention parsing, and failed notification delivery after persistence need to be addressed so the collaboration layer is trustworthy.

This stage defines the desired behavior, data model additions, API and notification contracts, and structural UX so the comment system becomes a strong collaboration layer without scope creep into unrelated UI polish.

---

## 3. Current System Issues

| Area | Current Issue |
|------|---------------|
| **Replies** | No reply-to-comment; all comments are top-level. No `parentCommentId` or thread structure. |
| **Mention scope** | Backend parses `@[Name](userId)` and validates that user IDs exist and are active; it does **not** restrict who can be mentioned (e.g. any user in DB). No rule that "only users with ticket visibility can be mentioned." |
| **Mention notifications** | MENTION_IN_COMMENT fanout adds all `mentionedUserIds` to recipients without checking ticket visibility. A user without access to the ticket can be notified and then get 403 on the ticket link. |
| **Comment vs mention dedupe** | COMMENT_ADDED → requester, owner, watchers; MENTION_IN_COMMENT → mentioned. If the owner is also mentioned, they can receive both a "comment" and a "mentioned you" notification for the same comment. No explicit deduplication. |
| **Mention UX** | Backend expects structured body with `@[Display Name](userId)`. If the frontend does not provide a typeahead that inserts this format, or if users type raw @username, parsing may miss or mis-resolve mentions. |
| **Real-time** | COMMENT_ADDED/MENTION_IN_COMMENT drive fanout and SSE; frontend invalidates ticket query on comment mutation. Exact expectations for SSE payloads, invalidation scope, and unread count updates are not fully codified. |
| **Reliability** | Stage 38 addressed double-submit and author display; idempotency for comment events is anchored to `commentId`. Mention fanout does not currently filter by visibility. |

---

## 4. Desired Behavior

- **@mentions:** Typing `@` opens a suggested-user search. Suggestions are filtered to **users who have (or can be granted) visibility to the ticket** (see §7). Selection inserts a **stable mention token** (`@[Display Name](userId)`) into the comment body. Backend parses and persists mentions reliably; comments with mentions trigger **mention notifications** only for users who have ticket visibility, with **no duplicate** "comment" + "mention" notification for the same user when both apply.
- **Replies:** User can click **Reply** on a comment. The reply is stored with a **parent comment** reference. Replies render **indented under the parent**. Only **one level** of threading (comment → replies; no nested replies to replies) for simplicity, readability, and maintainability.
- **Visibility:** Comment and reply visibility **inherit from ticket visibility**. Whoever can see the ticket can see all its comments and replies. No separate comment-level visibility model. Who can **post** (comment/reply) and who can **mention** follows the same permission as "can comment on this ticket" and is scoped to users who can see the ticket.
- **Notifications:** Mention notifications are sent only to mentioned users who **have ticket visibility**. When a user would receive both COMMENT_ADDED and MENTION_IN_COMMENT for the same comment, they receive **one** notification (prefer the mention variant for clarity: "X mentioned you").
- **Real-time / refresh:** After a new comment or reply, the client invalidates the ticket (and comment list) and refetches; SSE can carry a ticket-related event so other tabs/clients invalidate. Unread counts stay correct via existing notification pipeline and invalidation.
- **Reliability:** Backend is the source of truth for body and mentions. No fragile frontend-only parsing for who gets notified. Duplicate notification prevention and failed delivery handling (retries, dead-letter) remain as in the existing notification architecture.

---

## 5. Mention Model

### 5.1 Format and storage

- **Stable token format:** `@[Display Name](userId)` where `userId` is the system user id (e.g. CUID). This is the **canonical** form stored in the comment body and parsed by the backend.
- **Backend parsing:** The backend MUST parse the body for this pattern and resolve to a list of **unique, valid** user IDs (existing and active). Persisted `CommentMention` rows are the **source of truth** for "who was mentioned"; notification fanout uses these, not a re-parse of the body.
- **Body content:** The comment body stores the **raw text** as submitted (including the `@[Name](userId)` tokens). No separate "parsed tokens" table for the body itself; the `comment_mentions` table stores the mention relationship. This preserves readability and allows future display/export without re-parsing.

### 5.2 Who can be mentioned

- **Recommended rule (prioritize relevance and permissions):** Only users who **have visibility to the ticket** may be suggested and validly mentioned. This avoids:
  - Global spammy mentions (e.g. mentioning anyone in the company on a studio-scoped ticket).
  - Notifying users who would get 403 when opening the notification link.
- **Concrete rule:** The backend MUST treat a mention as valid only if the mentioned user (a) exists and is active, and (b) **would pass ticket visibility** for this ticket (same rules as Stage 1: ADMIN; DEPARTMENT_USER with owner/department/studio scope; STUDIO_USER as requester or ticket in allowed studios). Users who do not have ticket visibility MUST be **excluded** from mention notification fanout; optionally the backend can **reject** mentions of users without visibility (e.g. 400 "Cannot mention user without ticket access") or **strip** them and persist the rest. The spec **recommends** excluding from fanout and optionally stripping invalid mentions so the UX does not silently drop mentions—prefer validating at create time and returning an error for invalid mention targets so the composer can show an error or restrict the suggestion list.
- **Suggestion list:** The frontend MUST restrict the typeahead suggestion list to users that the backend considers **mentionable** for this ticket. This requires an API: e.g. `GET /api/tickets/:ticketId/mentionable-users` (or equivalent) that returns users who have ticket visibility, optionally filtered by search (name/email/display name). Matching by name, email, or display name is acceptable; the response must include `id`, and a display label so the client can insert `@[label](id)`.

### 5.3 Typing and selection UX (structural)

- Typing `@` opens a **suggested user search** (typeahead).
- Suggestions are **filtered** from valid system users who are **mentionable for this ticket** (see above).
- Matching by **name / email / display name** as appropriate (backend search or client-side filter of a preloaded mentionable list).
- **Selection** inserts the stable mention token `@[Display Name](userId)` into the comment body at the cursor position.
- No reliance on plain `@username` for notification purposes—only the structured token is parsed for mentions. (Plain @text can remain in body for display but is not used for notification.)

### 5.4 Notification behavior (see also §8)

- Tagged (mentioned) user receives **one** notification for the mention.
- Notification MUST NOT duplicate unnecessarily with the normal "comment" notification: if a user is in both the COMMENT_ADDED set (requester/owner/watcher) and the MENTION_IN_COMMENT set, they receive **one** notification—prefer MENTION_IN_COMMENT ("X mentioned you") over COMMENT_ADDED.
- Mention fanout MUST only include users who **have ticket visibility**. Department-level and studio-level users who have visibility to the ticket can be mentioned and notified; users without visibility must not receive mention notifications.

---

## 6. Reply / Threading Model

### 6.1 One-level replies only

- **Decision:** **One-level threaded replies only.** A comment may have zero or more **replies**; each reply has exactly one **parent** comment. There are **no** replies to replies (no unlimited nesting). This keeps the model simple, readable, and maintainable and avoids deep thread UI and permission complexity.
- **Data model:** A reply is a `TicketComment` with `parentCommentId` set to the parent comment's id. Top-level comments have `parentCommentId = null`. The same table holds both; no separate "reply" table.

### 6.2 Behavior

- User can click **Reply** on a comment (or on a top-level comment).
- The reply is **associated** to that parent via `parentCommentId`.
- Replies **render indented** under the parent (structural UX). Ordering: parent first, then its replies in chronological order; then next parent, then its replies; etc.
- **Who can reply:** Anyone who can comment on the ticket can reply to any (visible) comment. No separate "reply" permission; comment visibility inherits from ticket visibility (§7).

### 6.3 Collapse/expand (structural)

- If the number of replies under a comment is large (e.g. > N, where N is a small constant like 5 or 10), the UI MAY show "N replies" with a control to **expand** to show all, or **collapse** to hide. This is a structural UX rule; exact N and visual treatment are implementation details. No requirement for nested collapse levels beyond one.

---

## 7. Comment Permissions and Visibility

### 7.1 Alignment with ticket visibility

- **Rule:** Comment and reply **visibility** MUST inherit from **ticket visibility**. There is no separate comment-level visibility model. If a user can see the ticket (per Stage 1: ADMIN; DEPARTMENT_USER with scope; STUDIO_USER as requester or ticket in allowed studio), they can see **all** comments and replies on that ticket. If they cannot see the ticket, they must not see any comment or reply.
- **Enforcement:** The existing pattern holds: comment list is loaded only after the API has verified the actor can see the ticket (e.g. COMMENT_ADD_PUBLIC or equivalent). Comments are returned in the context of a ticket the user is allowed to view. No change to that contract; replies are simply part of the same comment list, ordered by thread (parent then replies).

### 7.2 Who can comment and reply

- **Who can comment:** Same as today: users who pass the **comment-add** policy for the ticket (e.g. COMMENT_ADD_PUBLIC evaluated with ticket context). That policy already aligns with ticket visibility (requester, owner, department/studio scope). No new permission; reply is treated as "comment with a parent."
- **Who can reply:** Same as comment. Any user who can add a comment can add a reply (set `parentCommentId`). No separate "reply" capability.

### 7.3 Who can mention

- **Who can mention:** Any user who can comment (and thus has ticket visibility) can mention. **Whom** they can mention is restricted to **users who have ticket visibility** (see §5.2). So: same "can comment" permission; mentionable set = users who can see the ticket (plus ADMIN who can see all, but mentionable list for a ticket is still best limited to ticket-visible users for relevance).

### 7.4 Summary

- **See comments/replies:** Inherit from ticket visibility. Backend returns comments/replies only when the ticket is visible to the actor.
- **Post comment/reply:** Governed by existing comment-add policy (ticket visibility + COMMENT_ADD_PUBLIC).
- **Mention:** Same as comment permission; mentionable targets = users with ticket visibility only.

---

## 8. Notification Model

### 8.1 COMMENT_ADDED

- **Recipients:** Requester, owner, watchers (unchanged). Actor is excluded.
- **Purpose:** "Someone commented on a ticket you care about."
- **Deduplication with mentions:** If a user is in the mention set for this comment, they MUST NOT also receive COMMENT_ADDED for this comment. They receive only MENTION_IN_COMMENT (see below). Implementation: when building COMMENT_ADDED recipients, subtract the set of `mentionedUserIds` for this comment so that mentioned users get a single notification (the mention one).

### 8.2 MENTION_IN_COMMENT

- **Recipients:** Only **mentioned users who have ticket visibility**. The fanout processor MUST filter `mentionedUserIds` through the ticket visibility rule: for each mentioned user, determine if they would be allowed to see this ticket (e.g. by reusing TicketVisibilityService or an equivalent check). Only then add them to recipients. Users without ticket visibility MUST NOT receive a mention notification.
- **Deduplication:** Mentioned users do not receive COMMENT_ADDED (see §8.1). They receive exactly one MENTION_IN_COMMENT notification per comment in which they are mentioned (idempotency already anchored to commentId).
- **Department and studio users:** When they have visibility to the ticket (department scope or studio scope), they can be mentioned and must receive the mention notification. No change to visibility rules; only the fanout filter is added so that "mentioned" recipients are restricted to visible users.

### 8.3 REPLY (new event, if needed)

- **Optional:** A reply may be treated as COMMENT_ADDED for notification purposes (requester/owner/watchers get "new comment") so that no new event type is required. Mention rules apply to reply bodies the same way: parse mentions, persist CommentMention, emit MENTION_IN_COMMENT for visible mentioned users, and exclude them from COMMENT_ADDED. The only addition is that the payload may include `parentCommentId` for future use (e.g. "X replied to a comment"). No separate REPLY_ADDED event is required unless product explicitly wants distinct copy ("replied" vs "commented"); the spec leaves that to implementation and recommends reusing COMMENT_ADDED with optional parentCommentId in payload for simplicity.

### 8.4 Idempotency and reliability

- **Duplicate notification prevention:** JobId for COMMENT_ADDED and MENTION_IN_COMMENT remains anchored to `commentId` (existing behavior). One comment → one COMMENT_ADDED job, one MENTION_IN_COMMENT job (if mentions). Recipients are deduplicated: mentioned users are removed from COMMENT_ADDED recipients.
- **Duplicate mention prevention:** Backend stores unique (commentId, userId) in `comment_mentions`; same user mentioned twice in one body results in one row per user. Fanout uses the stored list, so no duplicate mention notification per user per comment.
- **Failed notification delivery:** Unchanged: persistence (comment + mentions) is in a transaction; domain events are emitted after commit. If fanout or dispatch fails, existing retry and dead-letter behavior apply. Backend remains source of truth; no reliance on frontend for who gets notified.

---

## 9. Data Model Changes

### 9.1 Schema

- **TicketComment**
  - Add **`parentCommentId`** (optional, nullable). If null, the comment is top-level; if set, it is a reply to that comment. FK to `TicketComment.id`, ON DELETE CASCADE (or SET NULL if replies should remain when parent is deleted—spec recommends CASCADE so deleting a comment removes its replies, consistent with "one-level" and moderation expectations). Index on `parentCommentId` for efficient "replies of this comment" queries.
- **CommentMention**
  - No schema change. Existing table (commentId, userId, unique (commentId, userId)) remains the source of truth for mentions.
- **No new tables** for "reply" or "mention body"; replies are rows in `ticket_comments` with parentCommentId set; mentions are in `comment_mentions` and body stores raw text with `@[Name](userId)`.

### 9.2 API response implications

- **Comment list (e.g. GET ticket by id with comments, or GET /tickets/:id/comments):** Return comments with a **thread shape**: e.g. top-level comments first (parentCommentId = null), each with a **replies** array (or `children`) containing comments where parentCommentId = that comment's id, ordered by createdAt. Alternatively return a flat list with parentCommentId on each and let the client group; the spec recommends a **structured thread** in the response (e.g. `{ id, author, body, createdAt, mentions, replies: [...] }`) for clarity and to avoid client-side grouping errors.
- **Create comment:** Request body may include optional **`parentCommentId`**. If present and valid (exists, belongs to same ticket), the new comment is stored as a reply. Validation: parent must exist and parent.ticketId === ticketId.
- **Mentions:** Response continues to include mention data (e.g. mentions array with user id/name) so the UI can highlight or resolve mentions. No change to response shape for mentions beyond ensuring replies are included.

### 9.3 Notification implications

- COMMENT_ADDED and MENTION_IN_COMMENT payloads may include **parentCommentId** when the comment is a reply, for optional "X replied to a comment" copy. Fanout and visibility filtering are unchanged; only the payload is extended.

### 9.4 Comment body storage

- **Store raw text** as submitted (including `@[Display Name](userId)` tokens). Parsed mention data lives in `comment_mentions`. No "parsed body" or separate token table. Backend parses body on create/update to populate `comment_mentions`; display uses body as-is (with optional linkification of mentions in the UI).

---

## 10. API / Contract Changes

### 10.1 Create comment

- **POST /api/tickets/:ticketId/comments**
  - Request: `{ body: string; parentCommentId?: string }`. Optional `parentCommentId`; if provided, must reference a comment that belongs to `ticketId` and exists.
  - Validation: Same as today for body; add validation that when `parentCommentId` is set, the parent exists and parent.ticketId === ticketId. Optionally validate that parent has no parent (so we do not allow reply-to-reply if the backend ever allowed it); with one-level model, parent must have parentCommentId = null.
  - Response: Comment (and replies in thread shape if API returns nested). Include `parentCommentId` and `mentions` in response.

### 10.2 List comments

- **GET /api/tickets/:ticketId/comments** (if used) or comments embedded in **GET /api/tickets/:id**
  - Return comments in **thread order**: top-level comments (parentCommentId = null) ordered by createdAt; each with a **replies** array (comments where parentCommentId = that id), ordered by createdAt. No nesting beyond one level.
  - Each comment includes: id, ticketId, authorId, author, body, isInternal, createdAt, updatedAt, editedAt, mentions, **parentCommentId**, and (for top-level) **replies**.

### 10.3 Mentionable users

- **GET /api/tickets/:ticketId/mentionable-users** (or equivalent, e.g. query param on an existing endpoint)
  - Query params: optional `search` (string) for name/email/display name filter.
  - Returns users who **have visibility to the ticket** (and are active), optionally filtered by search. Response shape: e.g. `{ id, name, email, displayName? }` so the client can build `@[displayName](id)`.
  - Used by the frontend to populate the @ typeahead. Only these users should be insertable as mentions; backend will reject or strip mentions of users not in this set (recommend reject with 400 and clear error so UX can restrict the list).

### 10.4 Backward compatibility

- Existing clients that do not send `parentCommentId` continue to work (top-level comment). Existing comment list consumers must handle the new thread shape (replies array or flat list with parentCommentId). API versioning or gradual rollout can be used if needed; the spec does not require a new API version, only additive fields and one new endpoint for mentionable users.

---

## 11. Real-Time / Refresh Behavior

### 11.1 After new comment or reply

- **Client that submitted:** On successful POST response, the client MUST invalidate the ticket query (e.g. `['ticket', ticketId]`) and refetch so the new comment (or reply) appears in the list. Optimistic update is optional; if used, it must be replaced by server state on refetch. No reliance on optimistic state as the only update.
- **Other clients / tabs:** SSE can carry a **ticket update** or **comment added** event (existing or new event type) so that other sessions listening for that ticket invalidate and refetch. The existing notification fanout already pushes to recipients; the spec requires that when a comment (or reply) is created, the **same invalidation contract** applies: either (a) SSE event includes enough for clients to invalidate `['ticket', ticketId]`, or (b) clients invalidate on receiving a "comment" or "ticket" notification type. Exact event name is implementation-defined; the requirement is that **query invalidation** happens so that comment list and reply counts stay correct.

### 11.2 After mention

- Mentioned users receive a notification (in-app and/or email/Teams). When they open the app or the ticket, they must see the updated comment list (with the new comment and correct mentions). No separate "mention" real-time event is required beyond the same invalidation as §11.1: the notification drives them to the ticket; loading the ticket refetches and shows the comment.

### 11.3 Unread counts

- Unread counts are driven by the existing **notification** pipeline (notification records, delivery, and GET /api/notifications or equivalent). When COMMENT_ADDED or MENTION_IN_COMMENT creates notification records, unread counts update via existing mechanisms. Invalidation of notification list query (e.g. on SSE or on focus) keeps counts correct. No new real-time contract for unread beyond what exists.

### 11.4 Summary

- **Query invalidation:** Ticket query (and comment list) invalidated after create; refetch replaces state. SSE used so other tabs/clients can invalidate the same ticket query.
- **SSE:** Existing reliance on SSE for live updates (notification events and/or ticket_update) is sufficient; ensure comment/reply creation triggers the same invalidation path.
- **Unread:** Existing notification pipeline and list invalidation keep unread counts correct.

---

## 12. Risks and Edge Cases

| Risk / Edge Case | Mitigation |
|------------------|------------|
| **Mentioning user without visibility** | Backend filters mention fanout to ticket-visible users only; optionally reject create with 400 and clear message. Frontend restricts typeahead to mentionable-users endpoint. |
| **Reply to deleted comment** | If parent is deleted (CASCADE), replies are deleted. If SET NULL is used, replies remain but parentCommentId set to null (then treat as top-level). Spec recommends CASCADE. |
| **Reply-to-reply** | Backend validation: when parentCommentId is set, parent must have parentCommentId = null. Reject otherwise with 400. |
| **Duplicate notifications** | Remove mentioned users from COMMENT_ADDED recipients; one notification per user per comment (mention takes precedence). |
| **Very long threads** | One-level cap limits depth. For many replies under one comment, structural UX (collapse/expand) and pagination of replies if needed (future) can be added. Not required in Stage 3. |
| **Mention in reply** | Same parsing and fanout as top-level comment; visibility and deduplication rules apply. |
| **Backend parse failure** | If body contains malformed tokens, backend parses only valid `@[.*](userId)`; invalid or non-existent userIds are dropped (or reject with 400 if strict). No silent partial mention. |
| **Frontend sends plain @username** | Backend does not treat plain @username as mention; only structured token is parsed. Frontend must use typeahead to insert token. Document this so UX is consistent. |

---

## 13. Verification Plan

1. **Mention parsing:** Unit tests for MentionParserService: structured token only; invalid userIds excluded; duplicate userIds yield unique list. Integration: create comment with mixed valid/invalid mentions; assert only valid, ticket-visible users get CommentMention rows and MENTION_IN_COMMENT notifications.
2. **Mentionable users:** GET mentionable-users for a ticket as ADMIN, DEPARTMENT_USER, STUDIO_USER; assert list is restricted to users who have ticket visibility. Assert search filter narrows by name/email.
3. **Reply model:** Create top-level comment; create reply with parentCommentId; assert reply appears under parent in list. Create reply with parentCommentId pointing to another ticket's comment → 400. Create reply with parentCommentId pointing to a reply → 400.
4. **Visibility:** User A (no ticket access) is not in mentionable-users; if frontend somehow sends mention of A, backend strips or rejects. User B (has access) is mentioned; B receives one MENTION_IN_COMMENT and not COMMENT_ADDED. User C (owner, mentioned) receives one notification (MENTION_IN_COMMENT).
5. **Notifications:** Comment with mentions: requester/owner/watchers who are not mentioned get COMMENT_ADDED; mentioned users with visibility get MENTION_IN_COMMENT only. No duplicate for mentioned owner.
6. **Real-time:** After POST comment/reply, ticket query refetched and list shows new item. SSE (or equivalent) causes another client to invalidate and refetch; no stale list.
7. **Reliability:** Double-submit still results in one notification set (idempotency by commentId). Failed fanout does not remove comment from DB; retries and dead-letter as today.

---

## 14. Acceptance Criteria

- [ ] **@mention:** Typing `@` opens suggested user search; suggestions are restricted to users who have ticket visibility (mentionable-users API). Selection inserts `@[Display Name](userId)` into the body.
- [ ] **Backend mentions:** Backend parses body for `@[.*](userId)`, persists CommentMention rows, and uses them for fanout. Only valid, active, **ticket-visible** users receive mention notifications.
- [ ] **No duplicate notifications:** A user who is both in COMMENT_ADDED set and in mentioned set receives exactly one notification (MENTION_IN_COMMENT preferred).
- [ ] **Reply:** User can reply to a comment; reply has parentCommentId; replies render one level indented under parent; no reply-to-reply.
- [ ] **Visibility:** Comment and reply visibility inherit from ticket visibility. Who can comment/reply and who can be mentioned align with ticket visibility.
- [ ] **Data model:** TicketComment has optional parentCommentId; comment list API returns thread shape (top-level + replies). Create comment accepts optional parentCommentId with validation.
- [ ] **Real-time/refresh:** After new comment or reply, ticket (and comment list) invalidated and refetched; SSE or notification event allows other clients to invalidate and refetch; unread counts remain correct.
- [ ] **Reliability:** No fragile frontend-only mention parsing for notifications; duplicate mention prevention (one row per user per comment); failed notification delivery handled by existing retry/dead-letter; backend is source of truth.
- [ ] **Stage 1 and 2 preserved:** Ticket visibility, feed, and workflow/lifecycle behavior unchanged except where explicitly extended (e.g. mentionable-users and mention fanout filter).

---

## 15. Future Extensibility (Note)

This stage enables:

- **Richer collaboration:** Threading and mentions are the base for @-thread follow-ups, inline discussions, and clearer context.
- **Auditability:** Comments and replies are stored with author and timestamp; mention records support "who was notified."
- **Activity feeds:** Comment and reply events can feed into activity or timeline views later.
- **Advanced notification preferences:** Users may later control "notify me when mentioned" vs "notify me on any comment" per ticket or globally.
- **Attachment-to-comment:** A future stage can add attachments to comments (and replies) using the same visibility and notification patterns.

**Out of scope for Stage 3:** Comment edit/delete (existing update remains; delete not in scope unless explicitly added later). Broad UI polish beyond structural collaboration UX. Unlimited reply nesting. Attachment-in-comment (future stage).
