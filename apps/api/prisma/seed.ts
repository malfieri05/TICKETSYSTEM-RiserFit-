import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

const BCRYPT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Password123!';

const USERS = [
  // Admin
  { email: 'malfieri05@gmail.com',      name: 'Michael Alfieri',   role: 'ADMIN'      as const },
  // Agents (work the tickets)
  { email: 'sarah.johnson@riserfitness.dev', name: 'Sarah Johnson',     role: 'AGENT'      as const },
  { email: 'marcus.chen@riserfitness.dev',   name: 'Marcus Chen',       role: 'AGENT'      as const },
  { email: 'priya.patel@riserfitness.dev',   name: 'Priya Patel',       role: 'AGENT'      as const },
  { email: 'tom.wright@riserfitness.dev',    name: 'Tom Wright',        role: 'AGENT'      as const },
  // Requesters (employees submitting tickets)
  { email: 'emma.davis@riserfitness.dev',    name: 'Emma Davis',        role: 'REQUESTER'  as const },
  { email: 'james.miller@riserfitness.dev',  name: 'James Miller',      role: 'REQUESTER'  as const },
  { email: 'lisa.nguyen@riserfitness.dev',   name: 'Lisa Nguyen',       role: 'REQUESTER'  as const },
  { email: 'carlos.ruiz@riserfitness.dev',   name: 'Carlos Ruiz',       role: 'REQUESTER'  as const },
  { email: 'ashley.kim@riserfitness.dev',    name: 'Ashley Kim',        role: 'REQUESTER'  as const },
];

const CATEGORIES = [
  { name: 'Plumbing',    color: '#3b82f6' },
  { name: 'HVAC',        color: '#f59e0b' },
  { name: 'Electrical',  color: '#ef4444' },
  { name: 'IT Support',  color: '#8b5cf6' },
  { name: 'Facilities',  color: '#10b981' },
  { name: 'Cleaning',    color: '#06b6d4' },
  { name: 'Security',    color: '#f97316' },
  { name: 'General',     color: '#6b7280' },
];

async function main() {
  console.log('🌱 Seeding database...\n');

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  // Upsert users
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash: hash, isActive: true },
      create: { email: u.email, name: u.name, role: u.role, passwordHash: hash },
    });
    console.log(`✅ User: ${user.name} <${user.email}> [${user.role}]`);
  }

  // Upsert categories
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { color: c.color, isActive: true },
      create: { name: c.name, color: c.color },
    });
    console.log(`📂 Category: ${cat.name}`);
  }

  console.log('\n✅ Seed complete!');
  console.log(`\n🔑 All accounts use password: ${DEFAULT_PASSWORD}`);
  console.log('\nAccounts seeded:');
  USERS.forEach((u) => console.log(`  ${u.role.padEnd(12)} ${u.email}`));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
