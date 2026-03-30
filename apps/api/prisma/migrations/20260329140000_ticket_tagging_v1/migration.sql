-- Ticket tagging v1: notification + audit enums, TicketTag.createdByUserId, indexes

ALTER TYPE "NotificationEventType" ADD VALUE 'TICKET_TAG_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'TICKET_TAG_ADDED';

ALTER TABLE "ticket_tags" ADD COLUMN "created_by_user_id" TEXT;

UPDATE "ticket_tags" AS tt
SET "created_by_user_id" = t."requesterId"
FROM "tickets" AS t
WHERE tt."ticketId" = t."id" AND tt."created_by_user_id" IS NULL;

ALTER TABLE "ticket_tags" ALTER COLUMN "created_by_user_id" SET NOT NULL;

ALTER TABLE "ticket_tags" ADD CONSTRAINT "ticket_tags_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ticket_tags_ticketId_idx" ON "ticket_tags"("ticketId");
CREATE INDEX "ticket_tags_created_by_user_id_idx" ON "ticket_tags"("created_by_user_id");
