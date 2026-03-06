/**
 * Stage 3 Form schemas & seed verification.
 * Run: npx ts-node -r dotenv/config scripts/verify-stage3-forms.ts
 * Requires DATABASE_URL. Run after: prisma migrate deploy, prisma db seed (or seed script).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  console.log('=== Stage 3 Form Schemas & Seed Verification ===\n');

  // ─── 1. Counts ───────────────────────────────────────────────────────────
  const [schemaCount, fieldCount, optionCount] = await Promise.all([
    prisma.ticketFormSchema.count({ where: { isActive: true } }),
    prisma.ticketFormField.count(),
    prisma.ticketFormFieldOption.count(),
  ]);
  console.log('1. Counts:');
  console.log(`   ticket_form_schemas (active): ${schemaCount}`);
  console.log(`   ticket_form_fields:           ${fieldCount}`);
  console.log(`   ticket_form_field_options:   ${optionCount}`);

  // ─── 2. Every support topic has a schema ───────────────────────────────────
  const supportTopics = await prisma.supportTopic.findMany({
    where: { isActive: true },
    select: { id: true, name: true, departmentId: true },
  });
  const supportSchemaCount = await prisma.ticketFormSchema.count({
    where: { ticketClassId: (await prisma.ticketClass.findFirst({ where: { code: 'SUPPORT' }, select: { id: true } }))?.id, supportTopicId: { not: null }, isActive: true },
  });
  const supportTopicsWithSchema = await prisma.ticketFormSchema.findMany({
    where: { supportTopicId: { not: null }, isActive: true },
    select: { supportTopicId: true },
  });
  const topicIdsWithSchema = new Set(supportTopicsWithSchema.map((s) => s.supportTopicId).filter(Boolean));
  const missingTopicSchemas = supportTopics.filter((t) => !topicIdsWithSchema.has(t.id));
  console.log('\n2. Support topics vs schemas:');
  console.log(`   Support topics (active): ${supportTopics.length}`);
  console.log(`   Schemas for SUPPORT:      ${supportSchemaCount}`);
  if (missingTopicSchemas.length > 0) {
    console.log(`   ❌ Missing schema for topics: ${missingTopicSchemas.map((t) => t.name).join(', ')}`);
  } else {
    console.log('   ✅ Every support topic has a schema');
  }

  // ─── 3. Every maintenance category has a schema ────────────────────────────
  const maintenanceCats = await prisma.maintenanceCategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const maintSchemaCount = await prisma.ticketFormSchema.count({
    where: { maintenanceCategoryId: { not: null }, isActive: true },
  });
  const maintSchemas = await prisma.ticketFormSchema.findMany({
    where: { maintenanceCategoryId: { not: null }, isActive: true },
    select: { maintenanceCategoryId: true },
  });
  const maintIdsWithSchema = new Set(maintSchemas.map((s) => s.maintenanceCategoryId).filter(Boolean));
  const missingMaintSchemas = maintenanceCats.filter((c) => !maintIdsWithSchema.has(c.id));
  console.log('\n3. Maintenance categories vs schemas:');
  console.log(`   Maintenance categories (active): ${maintenanceCats.length}`);
  console.log(`   Schemas for MAINTENANCE:          ${maintSchemaCount}`);
  if (missingMaintSchemas.length > 0) {
    console.log(`   ❌ Missing schema for categories: ${missingMaintSchemas.map((c) => c.name).join(', ')}`);
  } else {
    console.log('   ✅ Every maintenance category has a schema');
  }

  const ok = missingTopicSchemas.length === 0 && missingMaintSchemas.length === 0;
  console.log(ok ? '\n✅ Stage 3 seed verification passed.' : '\n❌ Stage 3 seed verification failed.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
