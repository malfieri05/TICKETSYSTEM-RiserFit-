/**
 * One-off migration sanity check for Stage 1 RBAC.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/verify-rbac-migration.ts
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
  console.log('=== RBAC migration sanity check ===\n');

  const roleCounts = await prisma.user.groupBy({
    by: ['role'],
    _count: { id: true },
    where: { isActive: true },
  });
  console.log('1. Users by role (active only):');
  roleCounts.forEach((r) => console.log(`   ${r.role}: ${r._count.id}`));

  const deptUsersWithoutDept = await prisma.user.findMany({
    where: {
      role: 'DEPARTMENT_USER',
      isActive: true,
      departments: { none: {} },
    },
    select: { id: true, email: true, name: true },
  });
  console.log('\n2. DEPARTMENT_USER with no department assigned:', deptUsersWithoutDept.length);
  deptUsersWithoutDept.forEach((u) => console.log(`   - ${u.email} (${u.id})`));

  const scopes = await prisma.userStudioScope.findMany({
    select: { userId: true, studioId: true },
  });
  const studioIds = new Set((await prisma.studio.findMany({ select: { id: true } })).map((s) => s.id));
  const invalidScopes = scopes.filter((s) => !studioIds.has(s.studioId));
  console.log('\n3. Studio scope overrides with invalid/missing studio:', invalidScopes.length);
  invalidScopes.forEach((s) => console.log(`   - userId=${s.userId} studioId=${s.studioId}`));

  console.log('\n=== Done ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
