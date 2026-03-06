-- Stage 3: Ticket form schemas (schema-driven forms)
-- Adds ticket_form_schemas (with version), ticket_form_fields (unique formSchemaId+fieldKey),
-- ticket_form_field_options, ticket_form_responses.

-- ─── 1. ticket_form_schemas ───────────────────────────────────────────────────
CREATE TABLE "ticket_form_schemas" (
    "id" TEXT NOT NULL,
    "ticketClassId" TEXT NOT NULL,
    "departmentId" TEXT,
    "supportTopicId" TEXT,
    "maintenanceCategoryId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ticket_form_schemas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_form_schemas_ticketClassId_supportTopicId_key" ON "ticket_form_schemas"("ticketClassId", "supportTopicId");
CREATE UNIQUE INDEX "ticket_form_schemas_ticketClassId_maintenanceCategoryId_key" ON "ticket_form_schemas"("ticketClassId", "maintenanceCategoryId");
CREATE INDEX "ticket_form_schemas_ticketClassId_idx" ON "ticket_form_schemas"("ticketClassId");
CREATE INDEX "ticket_form_schemas_supportTopicId_idx" ON "ticket_form_schemas"("supportTopicId");
CREATE INDEX "ticket_form_schemas_maintenanceCategoryId_idx" ON "ticket_form_schemas"("maintenanceCategoryId");

ALTER TABLE "ticket_form_schemas"
    ADD CONSTRAINT "ticket_form_schemas_ticketClassId_fkey"
    FOREIGN KEY ("ticketClassId") REFERENCES "ticket_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_form_schemas"
    ADD CONSTRAINT "ticket_form_schemas_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_form_schemas"
    ADD CONSTRAINT "ticket_form_schemas_supportTopicId_fkey"
    FOREIGN KEY ("supportTopicId") REFERENCES "support_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_form_schemas"
    ADD CONSTRAINT "ticket_form_schemas_maintenanceCategoryId_fkey"
    FOREIGN KEY ("maintenanceCategoryId") REFERENCES "maintenance_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2. ticket_form_fields ────────────────────────────────────────────────────
CREATE TABLE "ticket_form_fields" (
    "id" TEXT NOT NULL,
    "formSchemaId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "conditionalFieldKey" TEXT,
    "conditionalValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ticket_form_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_form_fields_formSchemaId_fieldKey_key" ON "ticket_form_fields"("formSchemaId", "fieldKey");
CREATE INDEX "ticket_form_fields_formSchemaId_idx" ON "ticket_form_fields"("formSchemaId");

ALTER TABLE "ticket_form_fields"
    ADD CONSTRAINT "ticket_form_fields_formSchemaId_fkey"
    FOREIGN KEY ("formSchemaId") REFERENCES "ticket_form_schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. ticket_form_field_options ────────────────────────────────────────────
CREATE TABLE "ticket_form_field_options" (
    "id" TEXT NOT NULL,
    "formFieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ticket_form_field_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_form_field_options_formFieldId_idx" ON "ticket_form_field_options"("formFieldId");

ALTER TABLE "ticket_form_field_options"
    ADD CONSTRAINT "ticket_form_field_options_formFieldId_fkey"
    FOREIGN KEY ("formFieldId") REFERENCES "ticket_form_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 4. ticket_form_responses ────────────────────────────────────────────────
CREATE TABLE "ticket_form_responses" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_form_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_form_responses_ticketId_fieldKey_key" ON "ticket_form_responses"("ticketId", "fieldKey");
CREATE INDEX "ticket_form_responses_ticketId_idx" ON "ticket_form_responses"("ticketId");

ALTER TABLE "ticket_form_responses"
    ADD CONSTRAINT "ticket_form_responses_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
