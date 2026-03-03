-- DropIndex
DROP INDEX "document_chunks_embedding_ivfflat_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordHash" TEXT;
