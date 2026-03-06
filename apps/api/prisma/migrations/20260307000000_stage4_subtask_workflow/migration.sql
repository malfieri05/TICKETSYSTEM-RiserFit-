-- Stage 4: Subtask workflow engine — templates, dependencies, LOCKED/READY/SKIPPED, backfill TODO→READY

-- ─── 1. New enum (remove TODO; add LOCKED, READY, SKIPPED) ───────────────────
CREATE TYPE "SubtaskStatus_new" AS ENUM ('LOCKED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED');

-- ─── 2. Workflow template tables (must exist before subtasks.subtaskTemplateId FK) ─
CREATE TABLE "subtask_workflow_templates" (
    "id" TEXT NOT NULL,
    "ticketClassId" TEXT NOT NULL,
    "departmentId" TEXT,
    "supportTopicId" TEXT,
    "maintenanceCategoryId" TEXT,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subtask_workflow_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subtask_workflow_templates_ticketClassId_supportTopicId_key" ON "subtask_workflow_templates"("ticketClassId", "supportTopicId");
CREATE UNIQUE INDEX "subtask_workflow_templates_ticketClassId_maintenanceCategoryId_key" ON "subtask_workflow_templates"("ticketClassId", "maintenanceCategoryId");
CREATE INDEX "subtask_workflow_templates_ticketClassId_idx" ON "subtask_workflow_templates"("ticketClassId");
CREATE INDEX "subtask_workflow_templates_supportTopicId_idx" ON "subtask_workflow_templates"("supportTopicId");
CREATE INDEX "subtask_workflow_templates_maintenanceCategoryId_idx" ON "subtask_workflow_templates"("maintenanceCategoryId");

ALTER TABLE "subtask_workflow_templates"
    ADD CONSTRAINT "subtask_workflow_templates_ticketClassId_fkey" FOREIGN KEY ("ticketClassId") REFERENCES "ticket_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "subtask_workflow_templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "subtask_workflow_templates_supportTopicId_fkey" FOREIGN KEY ("supportTopicId") REFERENCES "support_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "subtask_workflow_templates_maintenanceCategoryId_fkey" FOREIGN KEY ("maintenanceCategoryId") REFERENCES "maintenance_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "subtask_templates" (
    "id" TEXT NOT NULL,
    "workflowTemplateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subtask_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subtask_templates_workflowTemplateId_idx" ON "subtask_templates"("workflowTemplateId");
CREATE INDEX "subtask_templates_departmentId_idx" ON "subtask_templates"("departmentId");

ALTER TABLE "subtask_templates"
    ADD CONSTRAINT "subtask_templates_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "subtask_workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "subtask_templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subtask_templates_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "subtask_template_dependencies" (
    "subtaskTemplateId" TEXT NOT NULL,
    "dependsOnSubtaskTemplateId" TEXT NOT NULL,
    CONSTRAINT "subtask_template_dependencies_pkey" PRIMARY KEY ("subtaskTemplateId", "dependsOnSubtaskTemplateId")
);
ALTER TABLE "subtask_template_dependencies"
    ADD CONSTRAINT "subtask_template_dependencies_subtaskTemplateId_fkey" FOREIGN KEY ("subtaskTemplateId") REFERENCES "subtask_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "subtask_template_dependencies_dependsOnSubtaskTemplateId_fkey" FOREIGN KEY ("dependsOnSubtaskTemplateId") REFERENCES "subtask_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. Add columns to subtasks (departmentId, subtaskTemplateId) ─────────────
ALTER TABLE "subtasks" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "subtasks" ADD COLUMN "subtaskTemplateId" TEXT;

-- ─── 4. Migrate status: new column, backfill TODO→READY, swap enum ───────────
ALTER TABLE "subtasks" ADD COLUMN "status_new" "SubtaskStatus_new";
UPDATE "subtasks" SET "status_new" = CASE
    WHEN "status"::text = 'TODO' THEN 'READY'::"SubtaskStatus_new"
    WHEN "status"::text = 'IN_PROGRESS' THEN 'IN_PROGRESS'::"SubtaskStatus_new"
    WHEN "status"::text = 'BLOCKED' THEN 'BLOCKED'::"SubtaskStatus_new"
    WHEN "status"::text = 'DONE' THEN 'DONE'::"SubtaskStatus_new"
    ELSE 'READY'::"SubtaskStatus_new"
END;
ALTER TABLE "subtasks" DROP COLUMN "status";
ALTER TABLE "subtasks" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "subtasks" ALTER COLUMN "status" SET DEFAULT 'READY';
ALTER TABLE "subtasks" ALTER COLUMN "status" SET NOT NULL;
DROP TYPE "SubtaskStatus";
ALTER TYPE "SubtaskStatus_new" RENAME TO "SubtaskStatus";

-- ─── 5. Live subtask dependencies table ─────────────────────────────────────
CREATE TABLE "subtask_dependencies" (
    "subtaskId" TEXT NOT NULL,
    "dependsOnSubtaskId" TEXT NOT NULL,
    CONSTRAINT "subtask_dependencies_pkey" PRIMARY KEY ("subtaskId", "dependsOnSubtaskId")
);
CREATE INDEX "subtask_dependencies_dependsOnSubtaskId_idx" ON "subtask_dependencies"("dependsOnSubtaskId");

ALTER TABLE "subtask_dependencies"
    ADD CONSTRAINT "subtask_dependencies_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "subtasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "subtask_dependencies_dependsOnSubtaskId_fkey" FOREIGN KEY ("dependsOnSubtaskId") REFERENCES "subtasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 6. FKs and indexes on subtasks ──────────────────────────────────────────
ALTER TABLE "subtasks"
    ADD CONSTRAINT "subtasks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "subtasks_subtaskTemplateId_fkey" FOREIGN KEY ("subtaskTemplateId") REFERENCES "subtask_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "subtasks_ticketId_status_idx" ON "subtasks"("ticketId", "status");
CREATE INDEX "subtasks_departmentId_idx" ON "subtasks"("departmentId");
CREATE INDEX "subtasks_departmentId_status_idx" ON "subtasks"("departmentId", "status");
