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
  { email: 'malfieri05@gmail.com',      name: 'Michael Alfieri',   role: 'ADMIN'           as const },
  // Department users (work the tickets)
  { email: 'sarah.johnson@riserfitness.dev', name: 'Sarah Johnson',     role: 'DEPARTMENT_USER' as const },
  { email: 'marcus.chen@riserfitness.dev',   name: 'Marcus Chen',       role: 'DEPARTMENT_USER' as const },
  { email: 'priya.patel@riserfitness.dev',   name: 'Priya Patel',       role: 'DEPARTMENT_USER' as const },
  { email: 'tom.wright@riserfitness.dev',    name: 'Tom Wright',        role: 'DEPARTMENT_USER' as const },
  // Studio users (employees submitting tickets)
  { email: 'emma.davis@riserfitness.dev',    name: 'Emma Davis',        role: 'STUDIO_USER'     as const },
  { email: 'james.miller@riserfitness.dev',  name: 'James Miller',      role: 'STUDIO_USER'     as const },
  { email: 'lisa.nguyen@riserfitness.dev',   name: 'Lisa Nguyen',       role: 'STUDIO_USER'     as const },
  { email: 'carlos.ruiz@riserfitness.dev',   name: 'Carlos Ruiz',       role: 'STUDIO_USER'     as const },
  { email: 'ashley.kim@riserfitness.dev',    name: 'Ashley Kim',        role: 'STUDIO_USER'     as const },
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

// Stage 2 taxonomy: stable ids aligned with migration for idempotent upsert
const TICKET_CLASSES = [
  { id: 'tclass_support', code: 'SUPPORT', name: 'Support', sortOrder: 0 },
  { id: 'tclass_maintenance', code: 'MAINTENANCE', name: 'Maintenance', sortOrder: 1 },
];
const TAXONOMY_DEPARTMENTS = [
  { id: 'dept_hr', code: 'HR', name: 'HR', sortOrder: 0 },
  { id: 'dept_operations', code: 'OPERATIONS', name: 'Operations', sortOrder: 1 },
  { id: 'dept_marketing', code: 'MARKETING', name: 'Marketing', sortOrder: 2 },
  { id: 'dept_retail', code: 'RETAIL', name: 'Retail', sortOrder: 3 },
];
const SUPPORT_TOPICS: { departmentCode: string; name: string; sortOrder: number }[] = [
  ...['New Hire', 'PAN / Change in Relationship', 'Resignation / Termination', 'New Job Posting', 'Workshop Bonus', 'Paycom'].map((name, i) => ({ departmentCode: 'HR', name, sortOrder: i })),
  ...['Grassroots Spend Approval', 'Print Materials Request', 'General Support', 'Instructor Bio Update', 'Custom Marketing Material', 'Club Pilates App Instructor Name Changes'].map((name, i) => ({ departmentCode: 'MARKETING', name, sortOrder: i })),
  ...['Missing / Update SKU', 'Retail Request', 'Damaged Product'].map((name, i) => ({ departmentCode: 'RETAIL', name, sortOrder: i })),
  ...[
    'System Issues - CR, CRC, CP App, Netgym, Powerhouse, Riser U, other',
    'CR, NetGym - add User and/or Locations',
    'E-mail Reset/New/Microsoft Issues',
    'Wipes Orders',
    'Ops General Support ONLY - No Paycom',
  ].map((name, i) => ({ departmentCode: 'OPERATIONS', name, sortOrder: i })),
];
const MAINTENANCE_CATEGORY_NAMES = [
  'Safety', 'Electrical / Lighting', 'HVAC / Climate Control', 'Plumbing', 'Flooring',
  'Mirror / Glass', 'Doors / Locks / Hardware', 'Walls / Paint / Mounted Items',
  'Roof / Water Intrusion', 'Pest Control', 'Equipment / Fixtures', 'Other',
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

  // Upsert categories (legacy)
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { name: c.name },
      update: { color: c.color, isActive: true },
      create: { name: c.name, color: c.color },
    });
    console.log(`📂 Category: ${cat.name}`);
  }

  // Stage 2: Taxonomy (idempotent; migration may have already populated)
  for (const tc of TICKET_CLASSES) {
    await prisma.ticketClass.upsert({
      where: { id: tc.id },
      update: { name: tc.name, sortOrder: tc.sortOrder, isActive: true },
      create: { id: tc.id, code: tc.code, name: tc.name, sortOrder: tc.sortOrder },
    });
  }
  console.log('📋 Ticket classes: SUPPORT, MAINTENANCE');

  for (const d of TAXONOMY_DEPARTMENTS) {
    await prisma.taxonomyDepartment.upsert({
      where: { id: d.id },
      update: { name: d.name, sortOrder: d.sortOrder, isActive: true },
      create: { id: d.id, code: d.code, name: d.name, sortOrder: d.sortOrder },
    });
  }
  console.log('📋 Departments: HR, OPERATIONS, MARKETING, RETAIL');

  const deptById = Object.fromEntries(TAXONOMY_DEPARTMENTS.map((d) => [d.code, d.id]));
  for (const t of SUPPORT_TOPICS) {
    const departmentId = deptById[t.departmentCode];
    if (!departmentId) continue;
    await prisma.supportTopic.upsert({
      where: { departmentId_name: { departmentId, name: t.name } },
      update: { sortOrder: t.sortOrder, isActive: true },
      create: { departmentId, name: t.name, sortOrder: t.sortOrder },
    });
  }
  console.log(`📋 Support topics: ${SUPPORT_TOPICS.length} topics`);

  for (let i = 0; i < MAINTENANCE_CATEGORY_NAMES.length; i++) {
    const name = MAINTENANCE_CATEGORY_NAMES[i];
    const existing = await prisma.maintenanceCategory.findFirst({ where: { name } });
    if (!existing) {
      await prisma.maintenanceCategory.create({
        data: { name, sortOrder: 100 + i, isActive: true },
      });
    }
  }
  console.log('📋 Maintenance categories: ensured 12 required');

  // Stage 3: Form schemas (one per support topic, one per maintenance category)
  const supportTopics = await prisma.supportTopic.findMany({ where: { isActive: true }, select: { id: true, name: true, departmentId: true } });
  for (const topic of supportTopics) {
    const existing = await prisma.ticketFormSchema.findFirst({
      where: { ticketClassId: 'tclass_support', supportTopicId: topic.id },
    });
    if (!existing) {
      await prisma.ticketFormSchema.create({
        data: {
          ticketClassId: 'tclass_support',
          departmentId: topic.departmentId,
          supportTopicId: topic.id,
          name: `Support: ${topic.name}`,
          sortOrder: 0,
          isActive: true,
        },
      });
    }
  }
  const maintenanceCats = await prisma.maintenanceCategory.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  for (const mcat of maintenanceCats) {
    const existing = await prisma.ticketFormSchema.findFirst({
      where: { ticketClassId: 'tclass_maintenance', maintenanceCategoryId: mcat.id },
    });
    if (!existing) {
      await prisma.ticketFormSchema.create({
        data: {
          ticketClassId: 'tclass_maintenance',
          maintenanceCategoryId: mcat.id,
          name: `Maintenance: ${mcat.name}`,
          sortOrder: 0,
          isActive: true,
        },
      });
    }
  }
  console.log('📋 Form schemas: one per support topic + one per maintenance category');

  // Stage 3: Add one default field per schema (idempotent by formSchemaId + fieldKey)
  const schemas = await prisma.ticketFormSchema.findMany({ where: { isActive: true }, select: { id: true } });
  for (const schema of schemas) {
    const hasDetails = await prisma.ticketFormField.findFirst({
      where: { formSchemaId: schema.id, fieldKey: 'additional_details' },
    });
    if (!hasDetails) {
      await prisma.ticketFormField.create({
        data: {
          formSchemaId: schema.id,
          fieldKey: 'additional_details',
          type: 'textarea',
          label: 'Additional details',
          required: false,
          sortOrder: 100,
        },
      });
    }
  }
  console.log('📋 Form fields: default "additional_details" per schema');

  // Schema-driven: HR → New Hire topic fields (from ticket-form.seed spec)
  const newHireTopic = await prisma.supportTopic.findFirst({
    where: { name: 'New Hire', departmentId: 'dept_hr', isActive: true },
    select: { id: true },
  });
  if (newHireTopic) {
    const newHireSchema = await prisma.ticketFormSchema.findFirst({
      where: { ticketClassId: 'tclass_support', supportTopicId: newHireTopic.id, isActive: true },
      select: { id: true },
    });
    if (newHireSchema) {
      const newHireFields: Array<{
        fieldKey: string;
        type: string;
        label: string;
        required: boolean;
        sortOrder: number;
        conditionalFieldKey?: string;
        conditionalValue?: string;
        options?: Array<{ value: string; label: string; sortOrder: number }>;
      }> = [
        { fieldKey: 'legal_first_name', type: 'text', label: 'Legal first name', required: true, sortOrder: 10 },
        { fieldKey: 'legal_last_name', type: 'text', label: 'Legal last name', required: true, sortOrder: 11 },
        { fieldKey: 'alternate_name', type: 'text', label: 'Alternate name', required: false, sortOrder: 12 },
        { fieldKey: 'employee_phone', type: 'text', label: 'Employee phone', required: false, sortOrder: 13 },
        { fieldKey: 'employee_personal_email', type: 'text', label: 'Personal email', required: false, sortOrder: 14 },
        {
          fieldKey: 'position',
          type: 'select',
          label: 'Position',
          required: true,
          sortOrder: 15,
          options: [
            'Corporate', 'RM', 'DM', 'GM', 'AGM', 'SA', 'EDC', 'Lead Instructor', 'Instructor',
            'Junior Instructor', 'Apprentice Instructor', 'Junior Apprentice Instructor', 'Pilates Trainer',
          ].map((label, i) => ({ value: label.replace(/\s+/g, '_').toUpperCase(), label, sortOrder: i })),
        },
        { fieldKey: 'reports_to', type: 'text', label: 'Reports to (Supervisor)', required: false, sortOrder: 16 },
        { fieldKey: 'date_of_offer', type: 'date', label: 'Date of offer', required: false, sortOrder: 17 },
        { fieldKey: 'start_date', type: 'date', label: 'Start date', required: true, sortOrder: 18 },
        { fieldKey: 'pay_rate', type: 'text', label: 'Pay rate ($)', required: false, sortOrder: 19 },
        {
          fieldKey: 'employment_type',
          type: 'select',
          label: 'Part-time or Full-time?',
          required: true,
          sortOrder: 20,
          options: [
            { value: 'PART_TIME', label: 'Part-time', sortOrder: 0 },
            { value: 'FULL_TIME', label: 'Full-time', sortOrder: 1 },
          ],
        },
        { fieldKey: 'referred', type: 'checkbox', label: 'Was this candidate referred by a current employee?', required: false, sortOrder: 21 },
        { fieldKey: 'referring_employee_name', type: 'text', label: 'Referring employee full name', required: false, sortOrder: 22, conditionalFieldKey: 'referred', conditionalValue: 'true' },
        {
          fieldKey: 'candidate_source',
          type: 'select',
          label: 'Candidate source',
          required: false,
          sortOrder: 23,
          options: [
            { value: 'JAZZHR', label: 'JazzHR', sortOrder: 0 },
            { value: 'REFERRAL', label: 'Referral', sortOrder: 1 },
            { value: 'CAREER_PAGE', label: 'Career Page', sortOrder: 2 },
            { value: 'OTHER', label: 'Other', sortOrder: 3 },
          ],
        },
        { fieldKey: 'candidate_source_other', type: 'text', label: 'What source? (if Other)', required: false, sortOrder: 24, conditionalFieldKey: 'candidate_source', conditionalValue: 'OTHER' },
        { fieldKey: 'candidate_application_date', type: 'date', label: 'Candidate application date', required: false, sortOrder: 25 },
      ];
      for (const f of newHireFields) {
        const existingField = await prisma.ticketFormField.findFirst({
          where: { formSchemaId: newHireSchema.id, fieldKey: f.fieldKey },
        });
        if (!existingField) {
          const { options, ...rest } = f;
          const field = await prisma.ticketFormField.create({
            data: {
              formSchemaId: newHireSchema.id,
              ...rest,
              conditionalFieldKey: f.conditionalFieldKey ?? undefined,
              conditionalValue: f.conditionalValue ?? undefined,
            },
          });
          if (options?.length) {
            for (let i = 0; i < options.length; i++) {
              const o = options[i];
              const opt = typeof o === 'string' ? { value: (o as string).replace(/\s+/g, '_').toUpperCase(), label: o as string, sortOrder: i } : o;
              const exists = await prisma.ticketFormFieldOption.findFirst({
                where: { formFieldId: field.id, value: opt.value },
              });
              if (!exists) {
                await prisma.ticketFormFieldOption.create({
                  data: { formFieldId: field.id, value: opt.value, label: opt.label, sortOrder: opt.sortOrder ?? i },
                });
              }
            }
          }
        }
      }
      console.log('📋 Form fields: HR → New Hire schema fields seeded');
    }
  }

  console.log('\n✅ Seed complete!');
  console.log(`\n🔑 All accounts use password: ${DEFAULT_PASSWORD}`);
  console.log('\nAccounts seeded:');
  USERS.forEach((u) => console.log(`  ${u.role.padEnd(12)} ${u.email}`));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
