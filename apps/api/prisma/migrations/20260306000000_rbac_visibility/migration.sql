-- Migration: RBAC Visibility
-- Renames/consolidates Role enum values and adds department + studio scope tables.
--
-- Old → New role mapping:
--   REQUESTER → STUDIO_USER
--   AGENT     → DEPARTMENT_USER
--   MANAGER   → DEPARTMENT_USER  (collapsed)
--   ADMIN     → ADMIN            (unchanged)

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Create the new Role enum type
-- ────────────────────────────────────────────────────────────────────────────
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'DEPARTMENT_USER', 'STUDIO_USER');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Add a temporary column with the new type (nullable for now)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "role_new" "Role_new";

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill new column from old values
-- ────────────────────────────────────────────────────────────────────────────
UPDATE "users" SET "role_new" = 'ADMIN'          WHERE "role" = 'ADMIN';
UPDATE "users" SET "role_new" = 'DEPARTMENT_USER' WHERE "role" IN ('AGENT', 'MANAGER');
UPDATE "users" SET "role_new" = 'STUDIO_USER'    WHERE "role" = 'REQUESTER';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Make new column NOT NULL and set default
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ALTER COLUMN "role_new" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "role_new" SET DEFAULT 'STUDIO_USER'::"Role_new";

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Drop old role column and rename new one
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" DROP COLUMN "role";
ALTER TABLE "users" RENAME COLUMN "role_new" TO "role";

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Drop old enum, rename new enum to "Role"
-- ────────────────────────────────────────────────────────────────────────────
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Recreate the role index (was dropped with the column)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX "users_role_idx" ON "users"("role");

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Create Department enum
-- ────────────────────────────────────────────────────────────────────────────
CREATE TYPE "Department" AS ENUM ('HR', 'OPERATIONS', 'MARKETING');

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Create user_departments table
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE "user_departments" (
    "userId"     TEXT        NOT NULL,
    "department" "Department" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    CONSTRAINT "user_departments_pkey" PRIMARY KEY ("userId", "department")
);

ALTER TABLE "user_departments"
    ADD CONSTRAINT "user_departments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "user_departments_userId_idx" ON "user_departments"("userId");

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Create user_studio_scopes table
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE "user_studio_scopes" (
    "userId"    TEXT         NOT NULL,
    "studioId"  TEXT         NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    CONSTRAINT "user_studio_scopes_pkey" PRIMARY KEY ("userId", "studioId")
);

ALTER TABLE "user_studio_scopes"
    ADD CONSTRAINT "user_studio_scopes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_studio_scopes"
    ADD CONSTRAINT "user_studio_scopes_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "user_studio_scopes_userId_idx" ON "user_studio_scopes"("userId");

-- ────────────────────────────────────────────────────────────────────────────
-- 11. Backfill user_departments from existing team memberships
--     Maps team name → Department enum for all DEPARTMENT_USER records.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO "user_departments" ("userId", "department", "assignedAt", "assignedBy")
SELECT
    u.id,
    CASE t.name
        WHEN 'HR'         THEN 'HR'::"Department"
        WHEN 'Marketing'  THEN 'MARKETING'::"Department"
        WHEN 'Operations' THEN 'OPERATIONS'::"Department"
    END,
    NOW(),
    NULL
FROM "users" u
JOIN "teams" t ON u."teamId" = t.id
WHERE u."role" = 'DEPARTMENT_USER'
  AND u."teamId" IS NOT NULL
  AND t.name IN ('HR', 'Marketing', 'Operations')
ON CONFLICT DO NOTHING;
