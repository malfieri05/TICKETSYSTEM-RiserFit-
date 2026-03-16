-- Lease IQ V1: lease responsibility rules and ticket evaluation

-- Enums
CREATE TYPE "LeaseRuleSetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "LeaseSourceType" AS ENUM ('UPLOADED_PDF', 'PASTED_EXTRACTION');
CREATE TYPE "LeaseRuleType" AS ENUM ('LANDLORD_RESPONSIBILITY', 'TENANT_RESPONSIBILITY', 'SHARED_OR_AMBIGUOUS');
CREATE TYPE "LeaseRuleTermType" AS ENUM ('KEYWORD', 'PHRASE', 'ALIAS');
CREATE TYPE "SuggestedResponsibility" AS ENUM ('LIKELY_LANDLORD', 'LIKELY_TENANT', 'NEEDS_HUMAN_REVIEW');
CREATE TYPE "LeaseIQResultState" AS ENUM ('RESOLVED', 'AMBIGUOUS', 'NO_MATCH', 'NO_RULES_CONFIGURED');
CREATE TYPE "LeaseIQConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "EvaluationTrigger" AS ENUM ('CREATE', 'MANUAL', 'RULESET_UPDATE');

-- lease_sources
CREATE TABLE "lease_sources" (
    "id"                TEXT NOT NULL,
    "studioId"          TEXT NOT NULL,
    "sourceType"        "LeaseSourceType" NOT NULL,
    "rawText"           TEXT,
    "fileStoragePath"   TEXT,
    "originalFileName"  TEXT,
    "uploadedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId"  TEXT,

    CONSTRAINT "lease_sources_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lease_sources" ADD CONSTRAINT "lease_sources_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "lease_sources_studioId_sourceType_uploadedAt_idx" ON "lease_sources"("studioId", "sourceType", "uploadedAt");

-- lease_rule_sets
CREATE TABLE "lease_rule_sets" (
    "id"                  TEXT NOT NULL,
    "studioId"            TEXT NOT NULL,
    "sourceId"            TEXT,
    "status"              "LeaseRuleSetStatus" NOT NULL,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt"         TIMESTAMP(3),
    "publishedByUserId"   TEXT,

    CONSTRAINT "lease_rule_sets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lease_rule_sets" ADD CONSTRAINT "lease_rule_sets_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lease_rule_sets" ADD CONSTRAINT "lease_rule_sets_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "lease_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "lease_rule_sets_studioId_status_idx" ON "lease_rule_sets"("studioId", "status");
-- Only one PUBLISHED ruleset per studio at a time
CREATE UNIQUE INDEX "lease_rule_sets_studioId_published_unique" ON "lease_rule_sets"("studioId") WHERE "status" = 'PUBLISHED';

-- lease_rules
CREATE TABLE "lease_rules" (
    "id"              TEXT NOT NULL,
    "ruleSetId"       TEXT NOT NULL,
    "ruleType"        "LeaseRuleType" NOT NULL,
    "categoryScope"   TEXT,
    "clauseReference" TEXT,
    "notes"           TEXT,
    "priority"        INTEGER NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lease_rules" ADD CONSTRAINT "lease_rules_ruleSetId_fkey"
    FOREIGN KEY ("ruleSetId") REFERENCES "lease_rule_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lease_rules" ADD CONSTRAINT "lease_rules_categoryScope_fkey"
    FOREIGN KEY ("categoryScope") REFERENCES "maintenance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "lease_rules_ruleSetId_ruleType_categoryScope_idx" ON "lease_rules"("ruleSetId", "ruleType", "categoryScope");

-- lease_rule_terms
CREATE TABLE "lease_rule_terms" (
    "id"        TEXT NOT NULL,
    "ruleId"    TEXT NOT NULL,
    "term"      TEXT NOT NULL,
    "termType"  "LeaseRuleTermType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_rule_terms_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lease_rule_terms" ADD CONSTRAINT "lease_rule_terms_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "lease_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "lease_rule_terms_ruleId_idx" ON "lease_rule_terms"("ruleId");

-- ticket_lease_iq_result
CREATE TABLE "ticket_lease_iq_result" (
    "id"                       TEXT NOT NULL,
    "ticketId"                 TEXT NOT NULL,
    "ruleSetId"                TEXT,
    "suggestedResponsibility"  "SuggestedResponsibility" NOT NULL,
    "internalResultState"      "LeaseIQResultState",
    "confidence"               "LeaseIQConfidence" NOT NULL,
    "matchedRuleIds"           TEXT[] NOT NULL,
    "matchedTerms"             TEXT[] NOT NULL,
    "matchedCategory"          TEXT,
    "explanation"              TEXT NOT NULL,
    "evaluatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluationTrigger"        "EvaluationTrigger" NOT NULL,

    CONSTRAINT "ticket_lease_iq_result_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ticket_lease_iq_result" ADD CONSTRAINT "ticket_lease_iq_result_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_lease_iq_result" ADD CONSTRAINT "ticket_lease_iq_result_ruleSetId_fkey"
    FOREIGN KEY ("ruleSetId") REFERENCES "lease_rule_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ticket_lease_iq_result_ticketId_key" ON "ticket_lease_iq_result"("ticketId");
CREATE INDEX "ticket_lease_iq_result_ticketId_idx" ON "ticket_lease_iq_result"("ticketId");
CREATE INDEX "ticket_lease_iq_result_ruleSetId_idx" ON "ticket_lease_iq_result"("ruleSetId");
