-- Stage 3: Comment threads (one-level replies)
-- Add parentCommentId for reply-to-comment support

ALTER TABLE "ticket_comments" ADD COLUMN "parentCommentId" TEXT;

ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_parentCommentId_fkey"
    FOREIGN KEY ("parentCommentId") REFERENCES "ticket_comments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite thread index for efficient stable-ordered thread reads
CREATE INDEX "ticket_comments_ticketId_parentCommentId_createdAt_id_idx"
    ON "ticket_comments"("ticketId", "parentCommentId", "createdAt", "id");
