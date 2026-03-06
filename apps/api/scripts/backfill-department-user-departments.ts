/**
 * Backfill: Assign MARKETING to any DEPARTMENT_USER with no department.
 * Safe default per Stage 1 requirement. Run once.
 * npx ts-node --transpile-only -r dotenv/config scripts/backfill-department-user-departments.ts
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
  const users = await prisma.user.findMany({
    where: {
      role: 'DEPARTMENT_USER',
      isActive: true,
      departments: { none: {} },
    },
    select: { id: true, email: true, name: true },
  });

  if (users.length === 0) {
    console.log('No DEPARTMENT_USER without department; nothing to do.');
    return;
  }

  console.log(`Backfilling MARKETING for ${users.length} user(s):`);
  for (const u of users) {
    await prisma.userDepartment.upsert({
      where: { userId_department: { userId: u.id, department: 'MARKETING' } },
      create: { userId: u.id, department: 'MARKETING', assignedBy: null },
      update: {},
    });
    console.log(`  - ${u.email} (${u.id}) -> MARKETING`);
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
