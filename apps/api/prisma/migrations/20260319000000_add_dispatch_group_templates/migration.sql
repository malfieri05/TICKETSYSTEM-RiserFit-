-- Dispatch Group Templates (Grouping Workspace — rule-only, no ticket IDs)

CREATE TABLE "dispatch_group_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "dispatchTradeType" "DispatchTradeType" NOT NULL,
  "maintenanceCategoryId" TEXT,
  "anchorStudioId" TEXT,
  "radiusMiles" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dispatch_group_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispatch_group_templates_createdBy_idx" ON "dispatch_group_templates"("createdBy");
CREATE INDEX "dispatch_group_templates_dispatchTradeType_idx" ON "dispatch_group_templates"("dispatchTradeType");

ALTER TABLE "dispatch_group_templates"
  ADD CONSTRAINT "dispatch_group_templates_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dispatch_group_templates"
  ADD CONSTRAINT "dispatch_group_templates_maintenanceCategoryId_fkey"
  FOREIGN KEY ("maintenanceCategoryId") REFERENCES "maintenance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dispatch_group_templates"
  ADD CONSTRAINT "dispatch_group_templates_anchorStudioId_fkey"
  FOREIGN KEY ("anchorStudioId") REFERENCES "studios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
