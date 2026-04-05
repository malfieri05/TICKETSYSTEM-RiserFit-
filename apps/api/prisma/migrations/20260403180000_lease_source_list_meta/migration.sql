-- Lease IQ: optional display metadata for source list (file size, text length)
ALTER TABLE "lease_sources" ADD COLUMN "uploadedBytes" INTEGER;
ALTER TABLE "lease_sources" ADD COLUMN "textCharCount" INTEGER;

UPDATE "lease_sources"
SET "textCharCount" = LENGTH("rawText")
WHERE "rawText" IS NOT NULL;
