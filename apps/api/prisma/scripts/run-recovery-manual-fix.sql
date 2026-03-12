-- One-time manual fix for 20260309000000_remove_legacy_categories
-- Uses actual DB object names (camelCase). Run once, then: migrate resolve --applied "20260309000000_remove_legacy_categories" && migrate deploy

ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_categoryId_fkey";
DROP INDEX IF EXISTS "tickets_categoryId_idx";
DROP INDEX IF EXISTS "tickets_status_categoryId_idx";
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "categoryId";
DROP TABLE IF EXISTS "categories";
