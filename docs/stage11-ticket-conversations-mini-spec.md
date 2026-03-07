# Stage 11: Ticket Conversations — Step A Mini-Spec (Planning Only)

**Follows:** Task template Step A. No code until this plan is approved.

**References:** [Architecture](architecture.md), [CLAUDE.md](../CLAUDE.md), [Stage 10 Studio Ticket Portal](stage10-studio-ticket-portal-mini-spec.md), existing comments module, notification fan-out, `TicketVisibilityService`.

---

## 1. Intent

Address the client pain point that **studios and internal departments cannot communicate cleanly inside the ticket**, which forced a large Microsoft Teams workaround. Stage 10 gave studio users visibility into scoped tickets, progress, and “updates” (non-internal comments). This stage designs the **first clean version of in-ticket communication** so studio users and internal teams can converse directly inside the ticket instead of using Teams.

**Goals:**

- Formalize the **ticket conversation thread** as the single place for back-and-forth on a ticket.
- Keep **internal vs studio-visible** explicit (build on existing `isInternal` / comment visibility).
- Enable **studio replies** and **department/admin replies** (internal and studio-visible) with correct visibility and notifications.
- Integrate the conversation into the **existing ticket detail page** (no separate messaging app).
- Design **notifications** so the right side is notified: studio-visible messages → studio-side and internal side; internal-only messages → internal side only.

**Architectural rules:**

1. **Conversations stay in the ticket domain** — No separate messaging or chat domain; the conversation is the ticket’s comment thread.
2. **Internal vs visible stays explicit** — Use and extend the existing comment visibility model (e.g. internal vs non-internal); no separate permission model.
3. **Visibility remains scope-based** — Studio users only see messages they are allowed to see; department/admin may see both internal and studio-visible depending on role.

---

## 2. Scope

**In scope**

- **A. Ticket Conversation Thread**  
  Each ticket has a single **conversation thread** attached to it. This is the existing ordered list of `TicketComment` records for that ticket (chronological). No new entity; the “conversation” is the same comment thread, optionally presented and labeled as “Conversation” or “Updates” in the UI. Thread remains linear (no reply-to-parent in this stage).

- **B. Internal vs Studio-Visible Messages**  
  Messages support two visibility levels, matching current behavior:
  - **Internal-only** — Visible only to DEPARTMENT_USER and ADMIN (and not to STUDIO_USER). Implemented via existing `TicketComment.isInternal`.
  - **Studio-visible** — Visible to everyone who can see the ticket (requester, studio-scoped users, owner, watchers). Implemented as `isInternal: false`.
  No new schema for visibility; extend event payload and fan-out so notifications respect internal vs studio-visible.

- **C. Studio Reply Capability**  
  Studio users who can view the ticket (by scope) can **reply** in the thread. Replies are **studio-visible only** (non-internal). Backend already enforces: STUDIO_USER cannot set `isInternal: true`. No change to create-comment permission; ensure UX makes “reply” obvious (e.g. “Add update” or “Reply” in the conversation section).

- **D. Department / Admin Reply Capability**  
  Department and admin users can add:
  - **Internal notes** — Only visible to internal side; used for team/department discussion.
  - **Studio-visible replies** — Visible to studio and internal side; used to communicate with the studio.
  Existing API and roles already support this; ensure UI clearly offers both options (e.g. “Reply to studio” vs “Internal note”).

- **E. Ticket Detail Integration**  
  The conversation thread is shown **inside the existing ticket detail page** (`/tickets/[id]` and portal entry point). Use the current “Comments” / “Updates” tab: same list of comments, same add-comment form, with clearer labeling and optional grouping or labels (e.g. “Internal” badge for dept/admin). No separate “Conversation” or messaging route; no new top-level messaging UI.

- **F. Notifications**  
  Design how new conversation messages trigger notifications:
  - **Studio-visible reply** — Notify: requester, owner, watchers; optionally **studio-scoped users** (users who have the ticket in scope by studio/location but are not requester/owner/watcher) so other studio staff see activity. Internal side (owner, dept watchers) already included.
  - **Internal-only message** — Notify only **internal side**: owner and watchers (exclude requester and studio-only users). Do not notify users who cannot see the message (e.g. requester).
  Implementation: extend `COMMENT_ADDED` payload with `isInternal`; in the notification fan-out processor, when resolving recipients for `COMMENT_ADDED`, if `payload.isInternal === true` then do not add requester to the recipient set; optionally add a “studioScoped” recipient rule for non-internal comments (users with ticket in scope by `TicketVisibilityService` for STUDIO_USER, excluding requester/owner/watchers to avoid duplicates).

**Out of scope**

- Reply-to-parent / threaded replies (stay linear).
- Attachments **in** conversation messages (ticket-level attachments remain; no “attach file to this message” in this stage).
- Real-time delivery (no WebSockets or new SSE for conversation; refresh/poll after post or existing SSE for notifications).
- Separate “inbox” or “conversations” list; conversation is only accessible from the ticket.
- New roles or new permission model; use existing RBAC and scope.

---

## 3. Files to Change

**Backend (NestJS, Prisma)**

- **Comments module**  
  `apps/api/src/modules/comments/comments.service.ts` — When emitting `COMMENT_ADDED`, include `isInternal` in the event payload so fan-out can branch on visibility.
- **Domain event types**  
  `apps/api/src/modules/events/domain-event.types.ts` — Extend `CommentAddedPayload` with `isInternal: boolean`.
- **Notification fan-out processor**  
  `apps/api/src/workers/processors/notification-fanout.processor.ts` — For `COMMENT_ADDED`: (1) if `payload.isInternal === true`, do not add `requester` to recipients (only owner, watchers); (2) optionally add a “studioScoped” rule for non-internal comments that resolves to users who have the ticket in scope (e.g. same studio) and are not already requester/owner/watcher, with a cap to avoid notification storms.
- **Comments controller**  
  No change required if create/update/list already enforce role and visibility; optional: ensure API docs or DTOs document “conversation” semantics.

**Frontend (Next.js, React Query)**

- **Ticket detail page**  
  `apps/web/src/app/(app)/tickets/[id]/page.tsx` — Conversation = existing Comments/Updates tab. Improve labeling: e.g. “Conversation” or “Updates & replies”; for department/admin, clearly distinguish “Reply (visible to studio)” vs “Internal note” in the add-comment form. Optionally show an “Internal” badge on internal comments for dept/admin view. Keep existing behavior: STUDIO_USER sees only non-internal; can add only non-internal.
- **Types**  
  `apps/web/src/types/index.ts` — No new types required if comment shape already includes `isInternal`; optional: add a short comment/conversation type alias for clarity.

**Shared / docs**

- Notification fan-out rules (in code or docs): document that COMMENT_ADDED recipients depend on `isInternal` and, if implemented, studioScoped.

Exact file list will be finalized in Step B.

---

## 4. Schema Impact

**No new tables and no new columns.**

- **Conversation thread** — Implemented as the existing `TicketComment` list per ticket; order by `createdAt`. No new table.
- **Internal vs studio-visible** — Existing `TicketComment.isInternal`; no schema change.
- **Mentions** — Existing `CommentMention`; no change.
- **Notifications** — Existing `notifications` and `notification_deliveries`; only fan-out logic and payload change.

If “studioScoped” recipients are implemented, resolution is done by querying users (e.g. by ticket’s `studioId` and user’s `studioId` / `scopeStudioIds`), not by new schema.

---

## 5. API Impact

- **POST /api/tickets/:ticketId/comments**  
  Already exists; body includes optional `isInternal`. STUDIO_USER cannot send `isInternal: true` (backend rejects). No change to contract; payload remains the same.
- **GET /api/tickets/:ticketId/comments**  
  Already exists; returns comments filtered by role (STUDIO_USER gets only non-internal). No change.
- **PATCH /api/tickets/:ticketId/comments/:commentId**  
  Already exists; no change to visibility (edit does not change `isInternal` in this stage).
- **Domain event**  
  `COMMENT_ADDED` payload is extended with `isInternal` so the notification fan-out processor can choose recipients. No new HTTP API.

**Optional (implementation detail):**  
If fan-out adds “studioScoped” recipients, that logic is entirely inside the fan-out processor (and possibly a small helper that returns user IDs in scope for a ticket); no new public endpoint.

---

## 6. UI Impact

- **Ticket detail — Conversation thread**  
  The existing Comments/Updates tab is the **ticket conversation**. Optionally rename or subtitle to “Conversation” or “Updates & replies” so it’s clear this is the in-ticket communication channel. Thread remains a single chronological list; no nested threads.

- **Studio user**  
  Sees only studio-visible messages; “Add update” or “Reply” with no “Internal” option. No change to current Stage 10 behavior beyond possible label tweaks.

- **Department / Admin**  
  When adding a message, two clear actions or toggles: **“Reply (visible to studio)”** (non-internal) and **“Internal note”** (internal). Internal comments show an “Internal” badge so the thread clearly separates internal discussion from studio-visible replies.

- **No new routes or layouts**  
  Conversation is only visible from the ticket detail page; no dedicated “Conversations” or “Messages” page in this stage.

- **Notifications**  
  Users receive existing in-app (and email/Teams if configured) notifications for new comments; after this stage, internal comments will not notify the requester, and optionally studio-visible comments will notify other studio-scoped users. No change to notification center UI beyond the fact that fewer irrelevant (internal-only) notifications are sent to studio users.

---

## 7. Risks

- **Studio-scoped notification volume** — If “studioScoped” is implemented, every studio-visible reply could notify all users with that ticket in scope (e.g. whole studio). That might be noisy. Mitigation: cap recipients (e.g. reuse `MAX_RECIPIENTS_PER_EVENT`), and consider notifying only requester + owner + watchers in a first version and adding studioScoped in a follow-up if needed.
- **Terminology** — “Conversation” vs “Comments” vs “Updates” must be consistent so studio and internal users understand what is visible to whom. Use clear labels and, for dept/admin, explicit “Internal” vs “Reply to studio.”
- **Editing and internal** — If later the product allows toggling a comment from internal to non-internal (or vice versa), notification and visibility rules become more complex; out of scope for this stage.
- **Mentions in internal comments** — Mentioned users should be able to see the comment; today mentions are in the same comment, so if the comment is internal, only users who can see internal comments can see the mention. No change in this stage; document that @mentions in internal notes only notify/visible to internal-side users.

---

## 8. Test Plan

- **Visibility**  
  - STUDIO_USER: can post only non-internal; sees only non-internal comments in the thread.  
  - DEPARTMENT_USER / ADMIN: can post internal or non-internal; sees full thread including internal with clear “Internal” indicator.  
  - Out-of-scope STUDIO_USER: cannot view ticket and therefore cannot load conversation (existing ticket visibility).

- **Notifications**  
  - When DEPARTMENT_USER adds an **internal** comment: requester does **not** receive COMMENT_ADDED notification; owner and watchers (internal side) do.  
  - When DEPARTMENT_USER or STUDIO_USER adds a **studio-visible** comment: requester, owner, and watchers receive COMMENT_ADDED notification.  
  - If “studioScoped” is implemented: a studio-visible comment notifies at least one other in-scope studio user (when applicable), respecting cap.

- **API**  
  - POST comment with `isInternal: true` as STUDIO_USER → 403.  
  - GET comments as STUDIO_USER returns only non-internal.  
  - Event payload: COMMENT_ADDED includes `isInternal` after implementation.

- **Regression**  
  - Existing comment create/edit/list and mention behavior unchanged aside from notification recipients and payload.  
  - Ticket detail and portal ticket detail still load conversation (comments) as today.

- **E2E / manual**  
  - Studio user: open ticket, add reply, confirm it appears and is visible; confirm internal notes (if any) are not shown.  
  - Dept user: add internal note, then add studio-visible reply; confirm requester gets notification only for the reply, and conversation shows both with correct labels.

---

*End of Step A mini-spec. Implementation in Step B after architecture review.*

---

## Implementation Summary (Stage 11 Complete)

### Files changed

**Backend**
- `apps/api/src/modules/events/domain-event.types.ts` — Extended `CommentAddedPayload` with `isInternal: boolean`.
- `apps/api/src/modules/comments/comments.service.ts` — When emitting `COMMENT_ADDED`, include `isInternal` in the payload (from `dto.isInternal` / created comment).
- `apps/api/src/workers/processors/notification-fanout.processor.ts` — For `COMMENT_ADDED`, compute recipients from payload: `isInternal === true` → `['owner', 'watchers']`; otherwise → `['requester', 'owner', 'watchers']`. No studioScoped recipients.

**Frontend**
- `apps/web/src/app/(app)/tickets/[id]/page.tsx` — Conversation section: tab label **"Updates & Replies (n)"**; section comment **"Conversation (Updates & Replies)"**; internal messages show **[Internal]** badge (no Lock icon); add-comment form: placeholder and checkbox **"Internal note (not visible to studio)"** for dept/admin; button label **"Reply"** / **"Add internal note"** / **"Add update"** by role and internal state. Removed unused `Lock` import.

### Event payload update

- **CommentAddedPayload** now includes `isInternal: boolean`.
- Emitted on comment create with the same value as the created comment’s `isInternal`.

### Notification fan-out logic

- **Studio-visible comment** (`isInternal === false`): notify **requester**, **owner**, **watchers**.
- **Internal comment** (`isInternal === true`): notify **owner**, **watchers** only (requester not notified).
- Implemented in `notification-fanout.processor.ts` by overriding rules for `eventType === 'COMMENT_ADDED'` using `payload.isInternal` before the generic rule loop.

### UI changes

- **Tab:** "Updates & Replies" with count (replaces "Updates").
- **Conversation section:** Explicit "Conversation (Updates & Replies)" comment; empty state "No replies yet." for dept/admin, "No updates yet." for studio.
- **Internal messages:** Clear **[Internal]** label (amber styling retained).
- **Add reply (dept/admin):** Checkbox "Internal note (not visible to studio)"; button "Reply" (studio-visible) or "Add internal note" (internal); placeholder explains "Reply (visible to studio) or check Internal note below".
- **Studio user:** Unchanged — only non-internal comments visible; single "Add update" action; no internal option.

### Build status

- **API:** `npm run build` — success.
- **Web:** `npm run build` — success.

### Manual verification checklist

- [ ] **STUDIO_USER cannot create internal comment** — As STUDIO_USER, open ticket; confirm no "Internal note" checkbox; POST with `isInternal: true` (e.g. via API) returns 403.
- [ ] **STUDIO_USER sees only non-internal comments** — As STUDIO_USER, open ticket that has internal + non-internal comments; only non-internal appear in "Updates & Replies".
- [ ] **DEPARTMENT_USER / ADMIN can create internal and studio-visible** — As dept/admin, add reply with checkbox unchecked → appears as normal; add reply with "Internal note" checked → appears with [Internal] badge; studio user does not see the internal one.
- [ ] **Internal comment → requester not notified** — As dept/admin, add internal note; confirm requester does **not** receive COMMENT_ADDED notification; owner/watchers do.
- [ ] **Studio-visible comment → requester notified** — As studio or dept/admin, add studio-visible reply; confirm requester **does** receive COMMENT_ADDED notification.
- [ ] **Labels** — Tab shows "Updates & Replies (n)"; internal messages show "[Internal]"; form shows "Internal note (not visible to studio)" and Reply / Add internal note button text.
