/**
 * One-time cleanup: remove studios that do NOT have externalCode (legacy test data).
 * Only studios from the CSV import have externalCode set. This script deletes all
 * studios where externalCode IS NULL and reports dependents before deletion.
 * Run with: npm run cleanup:studios (from apps/api).
 */
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

const EXPECTED_CSV_STUDIO_COUNT = 102;

async function main() {
  console.log('🧹 Legacy studio cleanup (remove studios where externalCode IS NULL)\n');

  const legacy = await prisma.studio.findMany({
    where: { externalCode: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (legacy.length === 0) {
    console.log('No legacy studios found (all studios have externalCode). Nothing to do.');
    const total = await prisma.studio.count();
    console.log(`Total studios: ${total}`);
    return;
  }

  console.log(`Found ${legacy.length} legacy studio(s) (externalCode IS NULL):`);
  legacy.forEach((s) => console.log(`  - ${s.name}`));

  const legacyIds = legacy.map((s) => s.id);

  // Report dependents before any deletion
  const [ticketsCount, usersCount, scopesCount] = await Promise.all([
    prisma.ticket.count({ where: { studioId: { in: legacyIds } } }),
    prisma.user.count({ where: { studioId: { in: legacyIds } } }),
    prisma.userStudioScope.count({ where: { studioId: { in: legacyIds } } }),
  ]);

  if (ticketsCount > 0 || usersCount > 0 || scopesCount > 0) {
    console.log('\n⚠️  Dependent records (will be updated or removed before studio deletion):');
    if (ticketsCount > 0) console.log(`  - Tickets referencing these studios: ${ticketsCount} (studioId will be set to null)`);
    if (usersCount > 0) console.log(`  - Users with primary studio in these: ${usersCount} (studioId will be set to null)`);
    if (scopesCount > 0) console.log(`  - UserStudioScope grants: ${scopesCount} (will be cascade-deleted with studio)`);
  }

  // Null out FKs so we can delete studios (Ticket and User have no onDelete for Studio)
  if (ticketsCount > 0) {
    await prisma.ticket.updateMany({
      where: { studioId: { in: legacyIds } },
      data: { studioId: null },
    });
    console.log('\n  Updated tickets: studioId set to null.');
  }
  if (usersCount > 0) {
    await prisma.user.updateMany({
      where: { studioId: { in: legacyIds } },
      data: { studioId: null },
    });
    console.log('  Updated users: studioId set to null.');
  }

  // Delete legacy studios (UserStudioScope has onDelete: Cascade, so those rows go away with the studio)
  const deleteResult = await prisma.studio.deleteMany({
    where: { id: { in: legacyIds } },
  });
  console.log(`\n✅ Removed ${deleteResult.count} legacy studio(es).`);

  // Verification
  const remaining = await prisma.studio.count();
  const withoutCode = await prisma.studio.count({ where: { externalCode: null } });
  const withCode = await prisma.studio.count({ where: { externalCode: { not: null } } });

  console.log('\n--- Verification ---');
  console.log(`Studios remaining: ${remaining}`);
  console.log(`  With externalCode: ${withCode}`);
  console.log(`  Without externalCode: ${withoutCode}`);

  if (withoutCode > 0) {
    console.error('\n❌ Verification failed: some studios still have externalCode IS NULL.');
    process.exit(1);
  }
  if (Math.abs(remaining - EXPECTED_CSV_STUDIO_COUNT) > 2) {
    console.warn(`\n⚠️  Expected ~${EXPECTED_CSV_STUDIO_COUNT} studios (CSV import). Actual: ${remaining}.`);
  } else {
    console.log(`\n✅ All remaining studios have externalCode set. Count matches CSV import (~${EXPECTED_CSV_STUDIO_COUNT}).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
