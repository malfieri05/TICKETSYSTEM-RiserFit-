-- Stage 2: Domain Model Cleanup (dev-phase — disposable data)
-- 1. Rewrite any BLOCKED subtasks to READY before removing the enum value
-- 2. Remove BLOCKED from SubtaskStatus enum
-- 3. Remove SUBTASK_BLOCKED from NotificationEventType enum
-- 4. Remove isRequired from subtasks and subtask_templates
-- 5. Rename readyAt → availableAt, add startedAt

-- Step 1: Rewrite existing BLOCKED subtasks to READY
UPDATE "subtasks" SET "status" = 'READY' WHERE "status" = 'BLOCKED';

-- Step 2: Remove BLOCKED from SubtaskStatus enum
ALTER TYPE "SubtaskStatus" RENAME TO "SubtaskStatus_old";
CREATE TYPE "SubtaskStatus" AS ENUM ('LOCKED', 'READY', 'IN_PROGRESS', 'DONE', 'SKIPPED');
ALTER TABLE "subtasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "subtasks" ALTER COLUMN "status" TYPE "SubtaskStatus" USING ("status"::text::"SubtaskStatus");
ALTER TABLE "subtasks" ALTER COLUMN "status" SET DEFAULT 'READY';
DROP TYPE "SubtaskStatus_old";

-- Step 3: Remove SUBTASK_BLOCKED from NotificationEventType enum
ALTER TYPE "NotificationEventType" RENAME TO "NotificationEventType_old";
CREATE TYPE "NotificationEventType" AS ENUM (
  'TICKET_CREATED',
  'TICKET_ASSIGNED',
  'TICKET_REASSIGNED',
  'TICKET_STATUS_CHANGED',
  'TICKET_RESOLVED',
  'TICKET_CLOSED',
  'COMMENT_ADDED',
  'MENTION_IN_COMMENT',
  'SUBTASK_ASSIGNED',
  'SUBTASK_COMPLETED',
  'SUBTASK_BECAME_READY',
  'ATTACHMENT_ADDED',
  'TICKET_SLA_BREACHED'
);
-- Delete any notification rows that used the removed event type
DELETE FROM "notification_deliveries" WHERE "notificationId" IN (
  SELECT "id" FROM "notifications" WHERE "eventType" = 'SUBTASK_BLOCKED'
);
DELETE FROM "notifications" WHERE "eventType" = 'SUBTASK_BLOCKED';
-- Delete notification preferences for the removed event type
DELETE FROM "notification_preferences" WHERE "eventType" = 'SUBTASK_BLOCKED';
ALTER TABLE "notifications" ALTER COLUMN "eventType" TYPE "NotificationEventType" USING ("eventType"::text::"NotificationEventType");
ALTER TABLE "notification_preferences" ALTER COLUMN "eventType" TYPE "NotificationEventType" USING ("eventType"::text::"NotificationEventType");
DROP TYPE "NotificationEventType_old";

-- Step 4: Remove isRequired from subtasks and subtask_templates
ALTER TABLE "subtasks" DROP COLUMN IF EXISTS "isRequired";
ALTER TABLE "subtask_templates" DROP COLUMN IF EXISTS "isRequired";

-- Step 5: Rename readyAt → availableAt, add startedAt
ALTER TABLE "subtasks" RENAME COLUMN "readyAt" TO "availableAt";
ALTER TABLE "subtasks" ADD COLUMN "startedAt" TIMESTAMP(3);

-- Backfill startedAt for already-completed subtasks
UPDATE "subtasks" SET "startedAt" = "completedAt" WHERE "completedAt" IS NOT NULL AND "startedAt" IS NULL;
-- Backfill startedAt for in-progress subtasks
UPDATE "subtasks" SET "startedAt" = "updatedAt" WHERE "status" = 'IN_PROGRESS' AND "startedAt" IS NULL;
