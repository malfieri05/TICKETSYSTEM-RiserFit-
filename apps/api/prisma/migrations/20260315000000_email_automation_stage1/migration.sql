-- Email-triggered assembly automation (Stage 1): data model + config

-- Enums
CREATE TYPE "VendorOrderState" AS ENUM ('ORDER_CONFIRMED', 'REVIEW_REQUIRED');
CREATE TYPE "DeliveryEventStatus" AS ENUM ('DELIVERY_RECORDED', 'ASSEMBLY_TRIGGERED', 'COMPLETE_NO_ASSEMBLY', 'REVIEW_REQUIRED');
CREATE TYPE "AssemblyTriggerMatchMode" AS ENUM ('SUBSTRING', 'EXACT_OR_FUZZY_ALIAS');
CREATE TYPE "EmailAutomationReviewReason" AS ENUM ('PENDING_ORDER_MATCH', 'NO_STUDIO_MATCH', 'LOW_CONFIDENCE', 'AMBIGUOUS_ADDRESS', 'TICKET_CREATE_FAILED', 'OTHER');
CREATE TYPE "EmailAutomationReviewStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- Raw email store
CREATE TABLE "inbound_emails" (
    "id"                      TEXT NOT NULL,
    "messageId"               TEXT NOT NULL,
    "threadId"                TEXT,
    "historyId"               TEXT,
    "subject"                 TEXT,
    "fromAddress"            TEXT,
    "receivedAt"             TIMESTAMP(3) NOT NULL,
    "bodyPlain"               TEXT,
    "bodyHtml"                TEXT,
    "rawStorageRef"           TEXT,
    "classification"         TEXT,
    "classificationConfidence" DOUBLE PRECISION,
    "processedAt"             TIMESTAMP(3),
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inbound_emails_messageId_key" ON "inbound_emails"("messageId");
CREATE INDEX "inbound_emails_receivedAt_idx" ON "inbound_emails"("receivedAt");
CREATE INDEX "inbound_emails_processedAt_idx" ON "inbound_emails"("processedAt");

-- Config (singleton row for Gmail + thresholds)
CREATE TABLE "email_automation_config" (
    "id"                         TEXT NOT NULL,
    "gmailLabel"                 TEXT,
    "gmailPollWindowHours"       INTEGER NOT NULL DEFAULT 24,
    "assemblyCategoryId"         TEXT,
    "systemRequesterId"          TEXT,
    "minOrderNumberConfidence"   DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "minAddressConfidence"       DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "minItemConfidence"          DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "isEnabled"                  BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"                  TIMESTAMP(3) NOT NULL,
    "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_automation_config_pkey" PRIMARY KEY ("id")
);

-- Order records
CREATE TABLE "vendor_order_records" (
    "id"                        TEXT NOT NULL,
    "orderNumber"               TEXT NOT NULL,
    "vendorIdentifier"          TEXT NOT NULL,
    "vendorDomain"              TEXT,
    "shippingAddressRaw"        TEXT,
    "shippingAddressNormalized" TEXT,
    "emailId"                   TEXT NOT NULL,
    "state"                     "VendorOrderState" NOT NULL DEFAULT 'ORDER_CONFIRMED',
    "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                 TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_order_records_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vendor_order_records" ADD CONSTRAINT "vendor_order_records_emailId_fkey"
    FOREIGN KEY ("emailId") REFERENCES "inbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "vendor_order_records_orderNumber_vendorIdentifier_key"
    ON "vendor_order_records"("orderNumber", "vendorIdentifier");
CREATE INDEX "vendor_order_records_state_idx" ON "vendor_order_records"("state");

-- Order line items
CREATE TABLE "order_line_items" (
    "id"         TEXT NOT NULL,
    "orderId"    TEXT NOT NULL,
    "itemName"   TEXT NOT NULL,
    "quantity"   INTEGER NOT NULL DEFAULT 1,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_line_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "vendor_order_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "order_line_items_orderId_idx" ON "order_line_items"("orderId");

-- Delivery events
CREATE TABLE "delivery_events" (
    "id"                TEXT NOT NULL,
    "orderId"           TEXT,
    "emailId"           TEXT NOT NULL,
    "deliveryTimestamp" TIMESTAMP(3),
    "deliverySource"    TEXT,
    "deliveryStatus"    "DeliveryEventStatus" NOT NULL DEFAULT 'DELIVERY_RECORDED',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "vendor_order_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_emailId_fkey"
    FOREIGN KEY ("emailId") REFERENCES "inbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "delivery_events_orderId_idx" ON "delivery_events"("orderId");
CREATE INDEX "delivery_events_emailId_idx" ON "delivery_events"("emailId");
CREATE INDEX "delivery_events_deliveryStatus_idx" ON "delivery_events"("deliveryStatus");

-- Normalized studio addresses
CREATE TABLE "studio_address_normalized" (
    "id"                TEXT NOT NULL,
    "studioId"          TEXT NOT NULL,
    "normalizedAddress" TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_address_normalized_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "studio_address_normalized" ADD CONSTRAINT "studio_address_normalized_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "studio_address_normalized_studioId_idx" ON "studio_address_normalized"("studioId");

-- Assembly trigger list
CREATE TABLE "assembly_trigger_items" (
    "id"              TEXT NOT NULL,
    "keywordOrPhrase" TEXT NOT NULL,
    "displayName"      TEXT,
    "matchMode"       "AssemblyTriggerMatchMode" NOT NULL DEFAULT 'SUBSTRING',
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"       INTEGER NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assembly_trigger_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assembly_trigger_items_isActive_idx" ON "assembly_trigger_items"("isActive");

-- Review queue
CREATE TABLE "email_automation_review_items" (
    "id"               TEXT NOT NULL,
    "emailId"           TEXT NOT NULL,
    "orderId"           TEXT,
    "deliveryEventId"   TEXT,
    "reason"            "EmailAutomationReviewReason" NOT NULL,
    "extractedPayload"  JSONB,
    "status"           "EmailAutomationReviewStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt"       TIMESTAMP(3),
    "resolvedBy"       TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_automation_review_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_automation_review_items" ADD CONSTRAINT "email_automation_review_items_emailId_fkey"
    FOREIGN KEY ("emailId") REFERENCES "inbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_automation_review_items" ADD CONSTRAINT "email_automation_review_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "vendor_order_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_automation_review_items" ADD CONSTRAINT "email_automation_review_items_deliveryEventId_fkey"
    FOREIGN KEY ("deliveryEventId") REFERENCES "delivery_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "email_automation_review_items_emailId_idx" ON "email_automation_review_items"("emailId");
CREATE INDEX "email_automation_review_items_orderId_idx" ON "email_automation_review_items"("orderId");
CREATE INDEX "email_automation_review_items_status_idx" ON "email_automation_review_items"("status");
CREATE INDEX "email_automation_review_items_reason_idx" ON "email_automation_review_items"("reason");

-- Automation events (log)
CREATE TABLE "email_automation_events" (
    "id"              TEXT NOT NULL,
    "eventType"       TEXT NOT NULL,
    "emailId"         TEXT NOT NULL,
    "orderId"         TEXT,
    "deliveryEventId"  TEXT,
    "payload"         JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_automation_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_automation_events" ADD CONSTRAINT "email_automation_events_emailId_fkey"
    FOREIGN KEY ("emailId") REFERENCES "inbound_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "email_automation_events_emailId_idx" ON "email_automation_events"("emailId");
CREATE INDEX "email_automation_events_orderId_idx" ON "email_automation_events"("orderId");
CREATE INDEX "email_automation_events_eventType_idx" ON "email_automation_events"("eventType");
CREATE INDEX "email_automation_events_createdAt_idx" ON "email_automation_events"("createdAt");

-- Idempotency: one ticket per (orderNumber, vendor)
CREATE TABLE "email_automation_ticket_created" (
    "orderNumber"      TEXT NOT NULL,
    "vendorIdentifier" TEXT NOT NULL,
    "ticketId"         TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_automation_ticket_created_pkey" PRIMARY KEY ("orderNumber", "vendorIdentifier")
);

-- Automation lock (orderNumber + vendor)
CREATE TABLE "email_automation_locks" (
    "id"         TEXT NOT NULL,
    "lockKey"    TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "email_automation_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_automation_locks_lockKey_key" ON "email_automation_locks"("lockKey");
CREATE INDEX "email_automation_locks_expiresAt_idx" ON "email_automation_locks"("expiresAt");
