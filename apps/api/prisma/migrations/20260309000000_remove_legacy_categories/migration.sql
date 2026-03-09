-- Remove legacy Category: drop ticket.category_id and categories table.
-- Taxonomy (support topics + maintenance categories) is the source of truth.

-- Drop FK and indexes on tickets
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_category_id_fkey";
DROP INDEX IF EXISTS "tickets_category_id_idx";
DROP INDEX IF EXISTS "tickets_status_category_id_idx";

-- Drop column
ALTER TABLE "tickets" DROP COLUMN IF EXISTS "category_id";

-- Drop legacy table
DROP TABLE IF EXISTS "categories";
