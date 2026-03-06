/**
 * Stage 2 Taxonomy verification script.
 * Run: npx ts-node -r dotenv/config scripts/verify-stage2-taxonomy.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

const REQUIRED_MAINTENANCE_NAMES = [
  'Safety',
  'Electrical / Lighting',
  'HVAC / Climate Control',
  'Plumbing',
  'Flooring',
  'Mirror / Glass',
  'Doors / Locks / Hardware',
  'Walls / Paint / Mounted Items',
  'Roof / Water Intrusion',
  'Pest Control',
  'Equipment / Fixtures',
  'Other',
];

const REQUIRED_DEPARTMENT_CODES = ['HR', 'OPERATIONS', 'MARKETING', 'RETAIL'];

async function main() {
  console.log('=== Stage 2 Taxonomy Verification ===\n');

  // ─── 1. Data integrity: tickets by ticketClassId ─────────────────────────
  const byClass = await prisma.ticket.groupBy({
    by: ['ticketClassId'],
    _count: { id: true },
  });
  const classIds = await prisma.ticketClass.findMany({
    select: { id: true, code: true },
  });
  const classMap = Object.fromEntries(classIds.map((c) => [c.id, c.code]));

  console.log('1. Tickets by ticket class:');
  byClass.forEach((r) => {
    console.log(`   ${classMap[r.ticketClassId] ?? r.ticketClassId}: ${r._count.id}`);
  });

  const totalTickets = byClass.reduce((s, r) => s + r._count.id, 0);
  const maintenanceClassId = classIds.find((c) => c.code === 'MAINTENANCE')?.id;
  const maintenanceCount = byClass.find((r) => r.ticketClassId === maintenanceClassId)?._count.id ?? 0;

  const invalidMissingMaintenanceCategory = await prisma.ticket.count({
    where: {
      ticketClassId: maintenanceClassId,
      maintenanceCategoryId: null,
    },
  });

  const invalidSupportMissingDeptOrTopic = await prisma.ticket.count({
    where: {
      ticketClass: { code: 'SUPPORT' },
      OR: [{ departmentId: null }, { supportTopicId: null }],
    },
  });

  console.log('\n2. Data integrity:');
  console.log(`   Total tickets: ${totalTickets}`);
  console.log(`   MAINTENANCE with maintenanceCategoryId set: ${maintenanceCount - invalidMissingMaintenanceCategory}/${maintenanceCount}`);
  console.log(`   Invalid MAINTENANCE (missing maintenanceCategoryId): ${invalidMissingMaintenanceCategory}`);
  console.log(`   Invalid SUPPORT (missing departmentId or supportTopicId): ${invalidSupportMissingDeptOrTopic}`);

  // ─── 3. Taxonomy API shape (replicate getTicketTaxonomy) ──────────────────
  const [ticketClasses, departments, supportTopics, maintenanceCategories] = await Promise.all([
    prisma.ticketClass.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, sortOrder: true },
    }),
    prisma.taxonomyDepartment.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, sortOrder: true },
    }),
    prisma.supportTopic.findMany({
      where: { isActive: true },
      orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        sortOrder: true,
        departmentId: true,
        department: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.maintenanceCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, description: true, color: true, sortOrder: true },
    }),
  ]);

  const supportTopicsByDepartment = departments.map((dept) => ({
    ...dept,
    topics: supportTopics
      .filter((t) => t.departmentId === dept.id)
      .map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
  }));

  const taxonomyShape = {
    ticketClasses,
    departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name, sortOrder: d.sortOrder })),
    supportTopicsByDepartment,
    maintenanceCategories,
  };

  console.log('\n3. GET /api/admin/config/ticket-taxonomy structure (shape):');
  console.log('   ticketClasses:', taxonomyShape.ticketClasses.length, '→', taxonomyShape.ticketClasses.map((c) => c.code).join(', '));
  console.log('   departments:', taxonomyShape.departments.length, '→', taxonomyShape.departments.map((d) => d.code).join(', '));
  console.log('   supportTopicsByDepartment: [', supportTopicsByDepartment.map((d) => `${d.code}: ${d.topics.length} topics`).join(', '), ']');
  console.log('   maintenanceCategories:', taxonomyShape.maintenanceCategories.length, 'items');

  const deptCodes = new Set(taxonomyShape.departments.map((d) => d.code));
  const missingDepts = REQUIRED_DEPARTMENT_CODES.filter((c) => !deptCodes.has(c));
  console.log('\n4. Required department codes present:', missingDepts.length === 0 ? 'YES' : `MISSING: ${missingDepts.join(', ')}`);

  const maintNames = new Set(taxonomyShape.maintenanceCategories.map((c) => c.name));
  const missingMaint = REQUIRED_MAINTENANCE_NAMES.filter((n) => !maintNames.has(n));
  console.log('5. Required 12 maintenance categories present:', missingMaint.length === 0 ? 'YES' : `MISSING: ${missingMaint.join(', ')}`);

  if (missingMaint.length > 0) {
    console.log('   Present:', Array.from(maintNames).sort().join(', '));
  }

  console.log('\n=== Done ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
