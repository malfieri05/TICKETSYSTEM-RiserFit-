-- Stage 2: Ticket Taxonomy
-- Adds ticket_classes, departments, support_topics, maintenance_categories.
-- Adds ticket_class_id, department_id, support_topic_id, maintenance_category_id to tickets.
-- Keeps category_id temporarily (deprecated); backfill existing tickets to MAINTENANCE.
-- Enforces classification invariant via trigger.

-- ─── 1. Add RETAIL to Department enum (RBAC sync) ───────────────────────────────
ALTER TYPE "Department" ADD VALUE IF NOT EXISTS 'RETAIL';

-- ─── 2. Create ticket_classes ────────────────────────────────────────────────
CREATE TABLE "ticket_classes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ticket_classes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ticket_classes_code_key" ON "ticket_classes"("code");

INSERT INTO "ticket_classes" ("id", "code", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('tclass_support', 'SUPPORT', 'Support', 0, true, NOW(), NOW()),
    ('tclass_maintenance', 'MAINTENANCE', 'Maintenance', 1, true, NOW(), NOW());

-- ─── 3. Create departments (taxonomy config) ────────────────────────────────────
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

INSERT INTO "departments" ("id", "code", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('dept_hr', 'HR', 'HR', 0, true, NOW(), NOW()),
    ('dept_operations', 'OPERATIONS', 'Operations', 1, true, NOW(), NOW()),
    ('dept_marketing', 'MARKETING', 'Marketing', 2, true, NOW(), NOW()),
    ('dept_retail', 'RETAIL', 'Retail', 3, true, NOW(), NOW());

-- ─── 4. Create support_topics ─────────────────────────────────────────────────
CREATE TABLE "support_topics" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_topics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_topics_departmentId_name_key" ON "support_topics"("departmentId", "name");
CREATE INDEX "support_topics_departmentId_idx" ON "support_topics"("departmentId");

ALTER TABLE "support_topics"
    ADD CONSTRAINT "support_topics_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Support topics: HR
INSERT INTO "support_topics" ("id", "departmentId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('st_hr_1', 'dept_hr', 'New Hire', 0, true, NOW(), NOW()),
    ('st_hr_2', 'dept_hr', 'PAN / Change in Relationship', 1, true, NOW(), NOW()),
    ('st_hr_3', 'dept_hr', 'Resignation / Termination', 2, true, NOW(), NOW()),
    ('st_hr_4', 'dept_hr', 'New Job Posting', 3, true, NOW(), NOW()),
    ('st_hr_5', 'dept_hr', 'Workshop Bonus', 4, true, NOW(), NOW()),
    ('st_hr_6', 'dept_hr', 'Paycom', 5, true, NOW(), NOW());
-- Marketing
INSERT INTO "support_topics" ("id", "departmentId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('st_mkt_1', 'dept_marketing', 'Grassroots Spend Approval', 0, true, NOW(), NOW()),
    ('st_mkt_2', 'dept_marketing', 'Print Materials Request', 1, true, NOW(), NOW()),
    ('st_mkt_3', 'dept_marketing', 'General Support', 2, true, NOW(), NOW()),
    ('st_mkt_4', 'dept_marketing', 'Instructor Bio Update', 3, true, NOW(), NOW()),
    ('st_mkt_5', 'dept_marketing', 'Custom Marketing Material', 4, true, NOW(), NOW()),
    ('st_mkt_6', 'dept_marketing', 'Club Pilates App Instructor Name Changes', 5, true, NOW(), NOW());
-- Retail
INSERT INTO "support_topics" ("id", "departmentId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('st_ret_1', 'dept_retail', 'Missing / Update SKU', 0, true, NOW(), NOW()),
    ('st_ret_2', 'dept_retail', 'Retail Request', 1, true, NOW(), NOW()),
    ('st_ret_3', 'dept_retail', 'Damaged Product', 2, true, NOW(), NOW());
-- Operations
INSERT INTO "support_topics" ("id", "departmentId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
    ('st_ops_1', 'dept_operations', 'System Issues - CR, CRC, CP App, Netgym, Powerhouse, Riser U, other', 0, true, NOW(), NOW()),
    ('st_ops_2', 'dept_operations', 'CR, NetGym - add User and/or Locations', 1, true, NOW(), NOW()),
    ('st_ops_3', 'dept_operations', 'E-mail Reset/New/Microsoft Issues', 2, true, NOW(), NOW()),
    ('st_ops_4', 'dept_operations', 'Wipes Orders', 3, true, NOW(), NOW()),
    ('st_ops_5', 'dept_operations', 'Ops General Support ONLY - No Paycom', 4, true, NOW(), NOW());

-- ─── 5. Create maintenance_categories and copy from categories ─────────────────
CREATE TABLE "maintenance_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "maintenance_categories_pkey" PRIMARY KEY ("id")
);

INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT "id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt"
FROM "categories";

-- Insert required maintenance categories that may not exist in categories
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_safety', 'Safety', NULL, NULL, 100, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Safety');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_electrical', 'Electrical / Lighting', NULL, NULL, 101, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Electrical / Lighting');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_hvac', 'HVAC / Climate Control', NULL, NULL, 102, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'HVAC / Climate Control');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_plumbing', 'Plumbing', NULL, NULL, 103, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Plumbing');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_flooring', 'Flooring', NULL, NULL, 104, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Flooring');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_mirror', 'Mirror / Glass', NULL, NULL, 105, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Mirror / Glass');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_doors', 'Doors / Locks / Hardware', NULL, NULL, 106, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Doors / Locks / Hardware');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_walls', 'Walls / Paint / Mounted Items', NULL, NULL, 107, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Walls / Paint / Mounted Items');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_roof', 'Roof / Water Intrusion', NULL, NULL, 108, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Roof / Water Intrusion');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_pest', 'Pest Control', NULL, NULL, 109, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Pest Control');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_equipment', 'Equipment / Fixtures', NULL, NULL, 110, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Equipment / Fixtures');
INSERT INTO "maintenance_categories" ("id", "name", "description", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'mcat_other', 'Other', NULL, NULL, 111, true, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "maintenance_categories" WHERE "name" = 'Other');

-- PostgreSQL: INSERT...SELECT with WHERE NOT EXISTS returns 0 rows if no row inserted; need valid INSERT. Use:
-- INSERT INTO t SELECT a,b,c WHERE NOT EXISTS (...)
-- That works. But "SELECT 'mcat_safety', 'Safety', ... WHERE NOT EXISTS" - if WHERE is false, no row is inserted. Good.

-- ─── 6. Add new columns to tickets ────────────────────────────────────────────
ALTER TABLE "tickets" ADD COLUMN "ticketClassId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "supportTopicId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "maintenanceCategoryId" TEXT;

-- ─── 7. Make category_id nullable (deprecated, kept for safety) ─────────────────
ALTER TABLE "tickets" ALTER COLUMN "categoryId" DROP NOT NULL;

-- ─── 8. Backfill: existing tickets → MAINTENANCE + maintenance_category_id ───
UPDATE "tickets"
SET
    "ticketClassId" = 'tclass_maintenance',
    "maintenanceCategoryId" = "tickets"."categoryId"
WHERE "tickets"."categoryId" IS NOT NULL;

-- For tickets that had no category (shouldn't happen in current data), set a default MAINTENANCE category
UPDATE "tickets"
SET
    "ticketClassId" = 'tclass_maintenance',
    "maintenanceCategoryId" = (SELECT "id" FROM "maintenance_categories" WHERE "name" = 'Other' LIMIT 1)
WHERE "ticketClassId" IS NULL;

-- ─── 9. Set ticket_class_id NOT NULL ───────────────────────────────────────────
ALTER TABLE "tickets" ALTER COLUMN "ticketClassId" SET NOT NULL;

-- ─── 10. Add foreign keys and indexes ──────────────────────────────────────────
ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_ticketClassId_fkey"
    FOREIGN KEY ("ticketClassId") REFERENCES "ticket_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_supportTopicId_fkey"
    FOREIGN KEY ("supportTopicId") REFERENCES "support_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_maintenanceCategoryId_fkey"
    FOREIGN KEY ("maintenanceCategoryId") REFERENCES "maintenance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tickets_ticketClassId_idx" ON "tickets"("ticketClassId");
CREATE INDEX "tickets_departmentId_idx" ON "tickets"("departmentId");
CREATE INDEX "tickets_supportTopicId_idx" ON "tickets"("supportTopicId");
CREATE INDEX "tickets_maintenanceCategoryId_idx" ON "tickets"("maintenanceCategoryId");

-- ─── 11. Update category FK to allow SET NULL (category_id is now optional) ─────
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_categoryId_fkey";
ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 12. Trigger: enforce ticket classification invariant ──────────────────────
-- SUPPORT → department_id and support_topic_id must be present
-- MAINTENANCE → maintenance_category_id must be present
CREATE OR REPLACE FUNCTION "tickets_classification_invariant"()
RETURNS TRIGGER AS $$
DECLARE
    class_code TEXT;
BEGIN
    SELECT "code" INTO class_code FROM "ticket_classes" WHERE "id" = NEW."ticketClassId";
    IF class_code = 'SUPPORT' THEN
        IF NEW."departmentId" IS NULL OR NEW."supportTopicId" IS NULL THEN
            RAISE EXCEPTION 'Ticket with class SUPPORT must have departmentId and supportTopicId set';
        END IF;
    ELSIF class_code = 'MAINTENANCE' THEN
        IF NEW."maintenanceCategoryId" IS NULL THEN
            RAISE EXCEPTION 'Ticket with class MAINTENANCE must have maintenanceCategoryId set';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tickets_classification_invariant_trigger"
    BEFORE INSERT OR UPDATE ON "tickets"
    FOR EACH ROW
    EXECUTE FUNCTION "tickets_classification_invariant"();