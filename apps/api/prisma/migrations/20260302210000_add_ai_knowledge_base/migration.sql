-- Phase 4: AI Knowledge Base with pgvector RAG
-- Enable the pgvector extension (must be done before creating vector columns)
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge Documents table (stores original doc metadata)
CREATE TABLE "knowledge_documents" (
    "id"           TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "sourceType"   TEXT NOT NULL DEFAULT 'manual',
    "sourceUrl"    TEXT,
    "s3Key"        TEXT,
    "mimeType"     TEXT,
    "sizeBytes"    INTEGER,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- Document Chunks table (stores text chunks with 1536-dim embeddings)
CREATE TABLE "document_chunks" (
    "id"         TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content"    TEXT NOT NULL,
    "embedding"  vector(1536),
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_chunks"
    ADD CONSTRAINT "document_chunks_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for knowledge_documents
CREATE INDEX "knowledge_documents_uploadedById_idx" ON "knowledge_documents"("uploadedById");
CREATE INDEX "knowledge_documents_isActive_idx"     ON "knowledge_documents"("isActive");

-- Index for document_chunks
CREATE INDEX "document_chunks_documentId_idx" ON "document_chunks"("documentId");

-- IVFFlat index for approximate nearest-neighbour vector search (cosine distance)
-- lists=100 is a good default for datasets up to ~1M vectors
-- Re-index with higher lists value if the corpus grows significantly
CREATE INDEX "document_chunks_embedding_ivfflat_idx"
    ON "document_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
