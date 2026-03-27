-- Dispatch Intelligence V1 — enums, ticket fields, dispatch_groups, dispatch_group_items

-- Enums
CREATE TYPE "DispatchTradeType" AS ENUM ('HANDYMAN', 'PLUMBER', 'HVAC', 'ELECTRICIAN', 'LOCKSMITH', 'GENERAL_MAINTENANCE');
CREATE TYPE "DispatchReadiness" AS ENUM ('NOT_READY', 'READY_FOR_DISPATCH', 'WAITING_ON_DELIVERY', 'WAITING_ON_APPROVAL');
CREATE TYPE "DispatchGroupStatus" AS ENUM ('DRAFT', 'READY_TO_SEND', 'SENT_TO_VENDOR', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- Ticket additions (nullable; existing rows remain valid)
ALTER TABLE "tickets" ADD COLUMN "dispatchTradeType" "DispatchTradeType";
ALTER TABLE "tickets" ADD COLUMN "dispatchReadiness" "DispatchReadiness";

-- Composite index for recommendation queries
CREATE INDEX "tickets_studioId_dispatchTradeType_dispatchReadiness_status_idx"
  ON "tickets"("studioId", "dispatchTradeType", "dispatchReadiness", "status");

-- dispatch_groups table
CREATE TABLE "dispatch_groups" (
  "id" TEXT NOT NULL,
  "tradeType" "DispatchTradeType" NOT NULL,
  "createdBy" TEXT NOT NULL,
  "status" "DispatchGroupStatus" NOT NULL DEFAULT 'DRAFT',
  "targetDate" TIMESTAMP(3),
  "notes" TEXT,
  "vendorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dispatch_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispatch_groups_status_idx" ON "dispatch_groups"("status");
CREATE INDEX "dispatch_groups_createdBy_idx" ON "dispatch_groups"("createdBy");
CREATE INDEX "dispatch_groups_createdAt_idx" ON "dispatch_groups"("createdAt");

ALTER TABLE "dispatch_groups"
  ADD CONSTRAINT "dispatch_groups_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- dispatch_group_items table
CREATE TABLE "dispatch_group_items" (
  "id" TEXT NOT NULL,
  "dispatchGroupId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "stopOrder" INTEGER NOT NULL DEFAULT 0,
  "estimatedDurationMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dispatch_group_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_group_items_dispatchGroupId_ticketId_key"
  ON "dispatch_group_items"("dispatchGroupId", "ticketId");

CREATE INDEX "dispatch_group_items_dispatchGroupId_idx"
  ON "dispatch_group_items"("dispatchGroupId");

CREATE INDEX "dispatch_group_items_ticketId_idx"
  ON "dispatch_group_items"("ticketId");

ALTER TABLE "dispatch_group_items"
  ADD CONSTRAINT "dispatch_group_items_dispatchGroupId_fkey"
  FOREIGN KEY ("dispatchGroupId") REFERENCES "dispatch_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dispatch_group_items"
  ADD CONSTRAINT "dispatch_group_items_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
