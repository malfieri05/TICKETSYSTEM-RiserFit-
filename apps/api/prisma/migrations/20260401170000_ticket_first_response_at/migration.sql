-- First response time: earliest non-requester comment or first status change on first-ordered subtask (application-maintained).
ALTER TABLE "tickets" ADD COLUMN "firstResponseAt" TIMESTAMP(3);

CREATE INDEX "tickets_firstResponseAt_idx" ON "tickets"("firstResponseAt");
