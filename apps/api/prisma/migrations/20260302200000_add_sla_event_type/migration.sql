-- Add SLA breach notification event type to the NotificationEventType enum
-- AlterEnum: PostgreSQL requires ADD VALUE outside a transaction for enum changes
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'TICKET_SLA_BREACHED';
