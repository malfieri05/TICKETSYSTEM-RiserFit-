-- Stage KB1: Ensure knowledge_documents has documentType, updatedAt, ingestionStatus, lastIndexedAt
-- Add columns if missing (idempotent for existing DBs)

-- documentType: may be missing if DB was created from original AI migration only
ALTER TABLE "knowledge_documents"
  ADD COLUMN IF NOT EXISTS "documentType" TEXT DEFAULT 'general';

-- updatedAt: original migration had it but without default; ensure it exists
ALTER TABLE "knowledge_documents"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ingestionStatus: pending | indexing | indexed | failed
ALTER TABLE "knowledge_documents"
  ADD COLUMN IF NOT EXISTS "ingestionStatus" TEXT NOT NULL DEFAULT 'pending';

-- lastIndexedAt: set when worker completes successfully
ALTER TABLE "knowledge_documents"
  ADD COLUMN IF NOT EXISTS "lastIndexedAt" TIMESTAMP(3);

-- Index for filtering by ingestion status (optional, for admin list)
CREATE INDEX IF NOT EXISTS "knowledge_documents_ingestionStatus_idx" ON "knowledge_documents"("ingestionStatus");

-- documentType index if not exists (Prisma schema has it)
CREATE INDEX IF NOT EXISTS "knowledge_documents_documentType_idx" ON "knowledge_documents"("documentType");
