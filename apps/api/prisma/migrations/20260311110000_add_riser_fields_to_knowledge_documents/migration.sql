ALTER TABLE "knowledge_documents"
ADD COLUMN "upstreamProvider" TEXT,
ADD COLUMN "upstreamId" TEXT,
ADD COLUMN "upstreamVersion" TEXT,
ADD COLUMN "reviewOn" TIMESTAMP(3),
ADD COLUMN "reviewDue" TIMESTAMP(3),
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE INDEX "knowledge_documents_upstream_idx"
ON "knowledge_documents" ("upstreamProvider", "upstreamId");

