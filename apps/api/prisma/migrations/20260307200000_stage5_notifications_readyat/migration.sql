-- Stage 5: SUBTASK_BECAME_READY event type + readyAt on subtasks

-- Add new notification event type for "it's your turn" workflow notifications
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SUBTASK_BECAME_READY';

-- Add readyAt timestamp (set when subtask transitions to READY) for SLA/escalation
ALTER TABLE "subtasks" ADD COLUMN "readyAt" TIMESTAMP(3);
