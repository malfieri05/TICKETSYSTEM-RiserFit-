# Ticket tagging v1 — implementation summary

**Spec:** `docs/ticket-tagging-v1-spec.md` (approved operational-labels v1; filename `ticket-tagging-operational-labels-v1.md` was not present in-repo — content matches this doc).

## Migrations

- `apps/api/prisma/migrations/20260329140000_ticket_tagging_v1/migration.sql`
  - `NotificationEventType`: `TICKET_TAG_ADDED`
  - `AuditAction`: `TICKET_TAG_ADDED`
  - `ticket_tags.created_by_user_id` (NOT NULL, FK to `users`), indexes on `ticketId` and `created_by_user_id`
  - Backfill: existing junction rows (if any) set `created_by_user_id` from ticket `requesterId`

## Backend — files touched

| Area | Files |
|------|--------|
| Schema | `apps/api/prisma/schema.prisma` |
| Policy | `apps/api/src/policy/capabilities/capability-keys.ts`, `capability-groups.ts`, `rules/policy-rule-registry.ts`, `rules/ticket-tag.policy-rules.ts` (new) |
| Tickets | `tickets.service.ts`, `tickets.controller.ts`, `dto/add-ticket-tag.dto.ts` (new), `ticket-tag.utils.ts` (new), `ticket-tag.utils.spec.ts` (new) |
| Events | `apps/api/src/modules/events/domain-event.types.ts`, `domain-events.service.ts` |
| Workers | `apps/api/src/workers/processors/notification-fanout.processor.ts` |

## API

- **POST** `/api/tickets/:id/tags` — body `{ "label": string }` (max 80 chars on wire). **201** with `{ tag, createdAt, createdBy }`.
- **GET** list/detail unchanged routes; responses gain **`tags`**: `{ id, name, createdAt, createdBy: { id, name } }[]` (additive; `id` is global Tag id).

Structured error **codes** (HTTP as per spec): `INVALID_TAG_INPUT` (400), `TAG_LIMIT_REACHED` (400), `TAG_ALREADY_EXISTS_ON_TICKET` (409), `FORBIDDEN_TAG_CREATION` (403), `TICKET_NOT_FOUND` (404).

## Architecture notes

- **Capability** `ticket.add_tag`: studio users denied; visibility via `TicketVisibilityService` inside policy (same spirit as comment visibility, without studio create).
- **Add-tag flow:** validation → load ticket → `TICKET_VIEW` (404 if missing/invisible) → `TICKET_ADD_TAG` (403 if denied) → single `prisma.$transaction`: count ≤ 20, find-or-create `Tag` with **P2002** retry on `Tag.name`, create `TicketTag` (409 on composite duplicate), touch `ticket.updatedAt`, `audit_logs` with `TICKET_TAG_ADDED` → after commit **`DomainEventsService.emit`** `TICKET_TAG_ADDED`.
- **Notifications:** `FANOUT_RULES` mirrors `COMMENT_ADDED` (requester, owner, watchers); actor excluded; **`canUserViewTicket`** filter on candidates; **`pushTicketUpdate`** unchanged path; email idempotency includes `tagId` for this event type.
- **List hydration:** `tags` included in `TICKET_LIST_SELECT` / light / detail (`take` 20, ordered by `createdAt`); mapped to flat DTO in service (no N+1 for tags). Create/update/assign/transition returns also map `tags` for consistent shape.

## Frontend — files touched

| Area | Files |
|------|--------|
| Types / API | `apps/web/src/types/index.ts`, `apps/web/src/lib/api.ts` |
| Feed UI | `apps/web/src/components/tickets/TicketRow.tsx`, `ListSkeletons.tsx` |
| Pages | `tickets/page.tsx`, `inbox/page.tsx`, `portal/page.tsx`, `locations/[studioId]/page.tsx` |
| Drawer | `apps/web/src/components/tickets/TicketDrawer.tsx` (read-only tags) |

- **Tags** column between **Created** and **Status**; `+` / inline input / Save / Cancel; `stopPropagation` on tag cell.
- **Studio users:** no `+`; backend still enforces 403.
- **Cache:** `useMutation` `onSuccess` → `invalidateQueries` for `['ticket', id]` + `invalidateTicketLists` (same family as comments). **SSE:** existing `ticket_update` handler already invalidates lists; no new listener.

## Review / testing

1. Run migration: `cd apps/api && npx prisma migrate deploy`
2. **ADMIN / DEPARTMENT_USER:** add tag from `/tickets`, `/inbox`, portal, location profile; list + drawer refresh.
3. **STUDIO_USER:** tags visible, no `+`, POST returns 403 + `FORBIDDEN_TAG_CREATION`.
4. Duplicate normalized label on same ticket → 409 `TAG_ALREADY_EXISTS_ON_TICKET`.
5. 21st tag → 400 `TAG_LIMIT_REACHED`.
6. Notification: stakeholders receive in-app/email per prefs; SSE `ticket_update` with `eventType: TICKET_TAG_ADDED`.
7. Unit: `npx jest apps/api/src/modules/tickets/ticket-tag.utils.spec.ts`
