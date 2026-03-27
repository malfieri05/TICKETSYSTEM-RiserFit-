-- CreateTable
CREATE TABLE "studio_profiles" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    "studioType" TEXT,
    "squareFootage" INTEGER,
    "yearOpened" INTEGER,
    "operatingHours" TEXT,

    "ownerName" TEXT,
    "managingPartner" TEXT,
    "regionalManager" TEXT,

    "phoneNumber" TEXT,
    "emailAddress" TEXT,
    "emergencyContact" TEXT,

    "propertyCode" TEXT,
    "leaseId" TEXT,
    "internalNotes" TEXT,

    CONSTRAINT "studio_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_profiles_studioId_key" ON "studio_profiles"("studioId");

-- AddForeignKey
ALTER TABLE "studio_profiles" ADD CONSTRAINT "studio_profiles_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
