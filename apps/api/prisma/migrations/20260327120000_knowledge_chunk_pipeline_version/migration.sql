-- Bump chunking / ingestion pipeline without waiting for Riser metadata changes
ALTER TABLE "knowledge_documents" ADD COLUMN "chunkPipelineVersion" INTEGER NOT NULL DEFAULT 1;
