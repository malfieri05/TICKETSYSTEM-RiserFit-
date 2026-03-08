/**
 * One-time cleanup: remove empty market records (Aliso Viejo, Costa Mesa, Los Angeles, San Diego).
 * These were left over after legacy studios were removed. Run from apps/api.
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

const NAMES_TO_REMOVE = ['Aliso Viejo', 'Costa Mesa', 'Los Angeles', 'San Diego'];

async function main() {
  const markets = await prisma.market.findMany({
    where: { name: { in: NAMES_TO_REMOVE } },
    include: { _count: { select: { studios: true } } },
  });

  const toDelete = markets.filter((m) => m._count.studios === 0);
  if (toDelete.length === 0) {
    console.log('No empty markets found with those names. Nothing to do.');
    return;
  }

  const ids = toDelete.map((m) => m.id);
  console.log('Removing empty markets:', toDelete.map((m) => m.name).join(', '));

  await prisma.ticket.updateMany({ where: { marketId: { in: ids } }, data: { marketId: null } });
  await prisma.user.updateMany({ where: { marketId: { in: ids } }, data: { marketId: null } });
  const result = await prisma.market.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${result.count} market(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
