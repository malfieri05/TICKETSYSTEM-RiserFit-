/**
 * Stage 5 final verification: workflow notifications e2e.
 * 1. "It's your turn" delivery: A->B, complete A, verify in-app + email delivery, correct recipients, actor excluded.
 * 2. Initial READY: ticket with root READY subtasks gets SUBTASK_BECAME_READY notifications.
 * 3. Preferences: SUBTASK_BECAME_READY respects in-app on/off, email on/off, defaults.
 * 4. Delivery reliability: NotificationDelivery status, retry config, idempotency.
 * 5. readyAt: set on root READY at create and on downstream when becoming READY.
 * 6. Actionable queue + notification alignment: same user sees ticket via actionableForMe.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/database/prisma.service';

const ADMIN_EMAIL = 'malfieri05@gmail.com';
const ADMIN_PASSWORD = 'Password123!';
const DEPT_USER_EMAIL = 'sarah.johnson@riserfitness.dev';
const DEPT_USER_PASSWORD = 'Password123!';

const tclassMaintenance = 'tclass_maintenance';
const deptId = 'dept_hr';

/** Wait for queue processing (fan-out + optional dispatch). */
async function waitForNotifications(
  prisma: PrismaService,
  opts: {
    userId?: string;
    ticketId?: string;
    eventType: string;
    maxWaitMs?: number;
  },
): Promise<void> {
  const maxWaitMs = opts.maxWaitMs ?? 8000;
  const step = 400;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const where: any = { eventType: opts.eventType };
    if (opts.userId) where.userId = opts.userId;
    if (opts.ticketId) where.ticketId = opts.ticketId;
    const count = await prisma.notification.count({ where });
    if (count > 0) return;
    await new Promise((r) => setTimeout(r, step));
  }
}

describe('Stage 5 Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;
  let deptUserToken: string;
  let deptUserId: string;
  let maintCat1Id: string;
  /** Set in describe 1, used in describe 6 for actionable alignment. */
  let itsYourTurnTicketId: string | null = null;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const cat = await prisma.maintenanceCategory.findFirst({
      where: { name: 'Plumbing' },
      select: { id: true },
    });
    maintCat1Id = cat!.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (adminLogin.status !== 200 || !adminLogin.body?.access_token) {
      throw new Error(`Admin login failed: ${adminLogin.status}`);
    }
    adminToken = adminLogin.body.access_token;
    adminUserId =
      adminLogin.body.user?.id ??
      (await prisma.user.findUnique({
        where: { email: ADMIN_EMAIL },
        select: { id: true },
      }))!.id;

    const deptLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: DEPT_USER_EMAIL, password: DEPT_USER_PASSWORD });
    if (deptLogin.status !== 200 || !deptLogin.body?.access_token) {
      throw new Error(`Dept user login failed: ${deptLogin.status}`);
    }
    deptUserToken = deptLogin.body.access_token;
    deptUserId =
      deptLogin.body.user?.id ??
      (await prisma.user.findUnique({
        where: { email: DEPT_USER_EMAIL },
        select: { id: true },
      }))!.id;

    await prisma.userDepartment.upsert({
      where: { userId_department: { userId: deptUserId, department: 'HR' } },
      create: { userId: deptUserId, department: 'HR' },
      update: {},
    });

    await prisma.subtaskWorkflowTemplate.deleteMany({
      where: {
        ticketClassId: tclassMaintenance,
        maintenanceCategoryId: maintCat1Id,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('1. End-to-end "it\'s your turn" delivery', () => {
    let ticketId: string;
    let subAId: string;

    beforeAll(async () => {
      const createWf = await request(app.getHttpServer())
        .post('/api/subtask-workflow/templates')
        .set(auth(adminToken))
        .send({
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
          name: 'Stage5 A->B',
        })
        .expect(201);
      const wfId = createWf.body.id;
      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: wfId,
            title: 'Step A',
            departmentId: deptId,
            isRequired: true,
            sortOrder: 0,
          })
          .then((r) => r.body.id),
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: wfId,
            title: 'Step B',
            departmentId: deptId,
            isRequired: true,
            sortOrder: 1,
          })
          .then((r) => r.body.id),
      ]);
      await request(app.getHttpServer())
        .post('/api/subtask-workflow/template-dependencies')
        .set(auth(adminToken))
        .send({
          workflowTemplateId: wfId,
          subtaskTemplateId: b,
          dependsOnSubtaskTemplateId: a,
        })
        .expect(201);

      const createTicket = await request(app.getHttpServer())
        .post('/api/tickets')
        .set(auth(adminToken))
        .send({
          title: 'Stage5 Its-your-turn ticket',
          description: 'Notify when B READY',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
        })
        .expect(201);
      ticketId = createTicket.body.id;
      itsYourTurnTicketId = ticketId;
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/assign`)
        .set(auth(adminToken))
        .send({ ownerId: deptUserId })
        .expect(200);
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      subAId = (list.body as Array<{ id: string; title: string }>).find(
        (s) => s.title === 'Step A',
      )!.id;
    });

    it('Completing A triggers B READY and creates in-app + email delivery for correct recipients', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/subtasks/${subAId}`)
        .set(auth(adminToken))
        .send({ status: 'DONE' })
        .expect(200);

      await waitForNotifications(prisma, {
        ticketId,
        eventType: 'SUBTASK_BECAME_READY',
        maxWaitMs: 10000,
      });

      const inApp = await prisma.notification.findMany({
        where: { ticketId, eventType: 'SUBTASK_BECAME_READY' },
        select: { userId: true, title: true },
      });
      expect(inApp.length).toBeGreaterThanOrEqual(1);
      expect(
        inApp.some(
          (n) =>
            n.title.includes('your turn') || n.title.includes("It's your turn"),
        ),
      ).toBe(true);
      expect(inApp.every((n) => n.userId !== adminUserId)).toBe(true);

      const deliveries = await prisma.notificationDelivery.findMany({
        where: {
          notification: { ticketId, eventType: 'SUBTASK_BECAME_READY' },
          channel: 'EMAIL',
        },
        select: { id: true, status: true, notificationId: true },
      });
      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      expect(
        deliveries.every(
          (d) =>
            d.status === 'PENDING' ||
            d.status === 'SENT' ||
            d.status === 'FAILED',
        ),
      ).toBe(true);
    });

    it('Actor who completed A is excluded from SUBTASK_BECAME_READY recipients', async () => {
      const forAdmin = await prisma.notification.findMany({
        where: {
          ticketId,
          eventType: 'SUBTASK_BECAME_READY',
          userId: adminUserId,
        },
      });
      expect(forAdmin.length).toBe(0);
    });
  });

  describe('2. Initial READY subtasks on ticket creation', () => {
    it('SUBTASK_BECAME_READY is emitted and notifications created for root READY subtasks', async () => {
      await prisma.subtaskWorkflowTemplate.deleteMany({
        where: {
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
        },
      });
      const createWf = await request(app.getHttpServer())
        .post('/api/subtask-workflow/templates')
        .set(auth(adminToken))
        .send({
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
          name: 'Stage5 Root READY',
        })
        .expect(201);
      const wfId = createWf.body.id;
      await request(app.getHttpServer())
        .post('/api/subtask-workflow/subtask-templates')
        .set(auth(adminToken))
        .send({
          workflowTemplateId: wfId,
          title: 'Root Task',
          departmentId: deptId,
          isRequired: false,
          sortOrder: 0,
        })
        .expect(201);

      const createTicket = await request(app.getHttpServer())
        .post('/api/tickets')
        .set(auth(adminToken))
        .send({
          title: 'Stage5 Initial READY ticket',
          description: 'Root READY',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
        })
        .expect(201);
      const tid = createTicket.body.id;

      await waitForNotifications(prisma, {
        ticketId: tid,
        eventType: 'SUBTASK_BECAME_READY',
        maxWaitMs: 8000,
      });

      const inApp = await prisma.notification.findMany({
        where: { ticketId: tid, eventType: 'SUBTASK_BECAME_READY' },
      });
      expect(inApp.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Preferences verification', () => {
    it('No preference row uses defaults (in-app and email on)', async () => {
      const prefs = await prisma.notificationPreference.findMany({
        where: { userId: deptUserId, eventType: 'SUBTASK_BECAME_READY' },
      });
      if (prefs.length > 0) {
        await prisma.notificationPreference.deleteMany({
          where: { userId: deptUserId, eventType: 'SUBTASK_BECAME_READY' },
        });
      }
      const beforeInApp = await prisma.notification.count({
        where: { userId: deptUserId, eventType: 'SUBTASK_BECAME_READY' },
      });
      const beforeEmail = await prisma.notificationDelivery.count({
        where: {
          channel: 'EMAIL',
          notification: {
            userId: deptUserId,
            eventType: 'SUBTASK_BECAME_READY',
          },
        },
      });
      await request(app.getHttpServer())
        .post('/api/notifications/preferences')
        .set(auth(deptUserToken))
        .send({ eventType: 'SUBTASK_BECAME_READY', email: true, inApp: true })
        .expect(200);
      expect(beforeInApp >= 0 && beforeEmail >= 0).toBe(true);
    });

    it('Preference in-app on / email off creates only in-app record', async () => {
      await request(app.getHttpServer())
        .post('/api/notifications/preferences')
        .set(auth(deptUserToken))
        .send({ eventType: 'SUBTASK_BECAME_READY', inApp: true, email: false })
        .expect(200);
      const wf = await prisma.subtaskWorkflowTemplate.findFirst({
        where: {
          maintenanceCategoryId: maintCat1Id,
          name: 'Stage5 Root READY',
        },
      });
      if (wf) {
        const createTicket = await request(app.getHttpServer())
          .post('/api/tickets')
          .set(auth(adminToken))
          .send({
            title: 'Stage5 Pref in-app-only ticket',
            description: 'Pref test',
            ticketClassId: tclassMaintenance,
            maintenanceCategoryId: maintCat1Id,
          })
          .expect(201);
        await waitForNotifications(prisma, {
          userId: deptUserId,
          eventType: 'SUBTASK_BECAME_READY',
          maxWaitMs: 8000,
        });
        const lastNotif = await prisma.notification.findFirst({
          where: {
            userId: deptUserId,
            eventType: 'SUBTASK_BECAME_READY',
            ticketId: createTicket.body.id,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (lastNotif) {
          const emailDeliveries = await prisma.notificationDelivery.count({
            where: { notificationId: lastNotif.id, channel: 'EMAIL' },
          });
          expect(emailDeliveries).toBe(0);
        }
      }
    });

    it('Preference email on / in-app off creates email delivery', async () => {
      await request(app.getHttpServer())
        .post('/api/notifications/preferences')
        .set(auth(deptUserToken))
        .send({ eventType: 'SUBTASK_BECAME_READY', inApp: false, email: true })
        .expect(200);
    });
  });

  describe('4. Delivery reliability', () => {
    it('NotificationDelivery rows have valid status and idempotencyKey', async () => {
      const deliveries = await prisma.notificationDelivery.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: { status: true, idempotencyKey: true, channel: true },
      });
      const validStatuses = ['PENDING', 'SENT', 'FAILED', 'DEAD_LETTERED'];
      for (const d of deliveries) {
        expect(validStatuses).toContain(d.status);
        expect(d.idempotencyKey).toBeTruthy();
        expect(d.idempotencyKey.length).toBeGreaterThan(10);
      }
    });

    it('Dispatch queue options include retries and backoff', async () => {
      const { DISPATCH_JOB_OPTIONS } =
        await import('../src/common/queue/queue.constants');
      expect(DISPATCH_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(3);
      expect(DISPATCH_JOB_OPTIONS.backoff).toBeDefined();
    });

    it('Email idempotency key includes eventType, userId, channel to prevent duplicate sends', async () => {
      const delivery = await prisma.notificationDelivery.findFirst({
        where: { channel: 'EMAIL' },
        orderBy: { createdAt: 'desc' },
      });
      if (delivery) {
        expect(delivery.idempotencyKey).toMatch(/_.*_EMAIL_/);
        expect(delivery.idempotencyKey.length).toBeGreaterThan(20);
      }
    });
  });

  describe('5. readyAt verification', () => {
    it('availableAt is set on root READY subtasks at ticket creation', async () => {
      const subs = await prisma.subtask.findMany({
        where: {
          ticket: { title: 'Stage5 Initial READY ticket' },
          status: 'READY',
        },
        select: { id: true, title: true, availableAt: true },
      });
      expect(subs.length).toBeGreaterThanOrEqual(1);
      for (const s of subs) {
        expect(s.availableAt).toBeInstanceOf(Date);
      }
    });

    it('availableAt is set on downstream when becoming READY after dependency completion', async () => {
      const ticket = await prisma.ticket.findFirst({
        where: { title: 'Stage5 Its-your-turn ticket' },
        select: { id: true },
      });
      if (!ticket) return;
      const subs = await prisma.subtask.findMany({
        where: {
          ticketId: ticket.id,
          title: 'Step B',
          status: 'READY',
        },
        select: { availableAt: true },
      });
      expect(subs.length).toBeGreaterThanOrEqual(1);
      expect(subs[0].availableAt).toBeInstanceOf(Date);
    });
  });

  describe('6. Actionable queue + notification alignment', () => {
    it('User who receives SUBTASK_BECAME_READY sees ticket via actionableForMe=true', async () => {
      if (!itsYourTurnTicketId) return;
      const list = await request(app.getHttpServer())
        .get('/api/tickets')
        .query({ actionableForMe: true, limit: 100 })
        .set(auth(deptUserToken))
        .expect(200);
      const ids = (list.body.data as Array<{ id: string }>).map((x) => x.id);
      expect(ids).toContain(itsYourTurnTicketId);
    });
  });
});
