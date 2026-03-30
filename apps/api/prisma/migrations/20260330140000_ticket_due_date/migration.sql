-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "dueDate" TIMESTAMP(3);

UPDATE "tickets" SET "dueDate" = "createdAt" + interval '7 days' WHERE "dueDate" IS NULL;

ALTER TABLE "tickets" ALTER COLUMN "dueDate" SET NOT NULL;

CREATE INDEX "tickets_dueDate_idx" ON "tickets"("dueDate");
