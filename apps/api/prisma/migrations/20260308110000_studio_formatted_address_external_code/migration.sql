-- AlterTable
ALTER TABLE "studios" ADD COLUMN "formattedAddress" TEXT,
ADD COLUMN "externalCode" TEXT;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "studios_externalCode_key" ON "studios"("externalCode");
