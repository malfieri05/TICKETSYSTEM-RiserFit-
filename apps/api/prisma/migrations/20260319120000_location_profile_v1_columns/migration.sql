-- Add Location Profile V1 columns to studio_profiles

ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "maturity" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "studioSize" INTEGER;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "priceTier" INTEGER;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "openType" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "studioOpenDate" TIMESTAMP(3);
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "rfSoftOpenDate" TIMESTAMP(3);

ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "dm" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "gm" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "agm" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "edc" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "li" TEXT;

ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "studioEmail" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "gmEmail" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "gmTeams" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "liEmail" TEXT;

ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "studioCode" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "netsuiteName" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "ikismetName" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "crName" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "crId" TEXT;
ALTER TABLE "studio_profiles" ADD COLUMN IF NOT EXISTS "paycomCode" TEXT;
