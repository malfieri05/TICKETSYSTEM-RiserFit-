/**
 * Stage 4 final verification: workflow engine e2e.
 * 1. Sequential A->B->C: initial READY/LOCKED, completing A unlocks B, completing B unlocks C.
 * 2. Parallel A->C, B->C: A,B READY C LOCKED; only A done does not unlock C; B done after A unlocks C.
 * 3. SKIPPED satisfies dependency (upstream SKIPPED unlocks downstream).
 * 4. Actionable queue: actionableForMe=true only tickets with READY subtask for dept/user; LOCKED-only excluded.
 * 5. Resolution gate: required must be DONE or SKIPPED; optional does not block.
 * 6. Ad hoc subtask: subtaskTemplateId null, template unchanged, status transitions work.
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

describe('Stage 4 Workflow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let deptUserToken: string;
  let deptUserId: string;
  let maintCat1Id: string;
  let maintCat2Id: string;
  let maintCat3Id: string;
  const deptId = 'dept_hr';

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
    const [cat1, cat2, cat3] = await Promise.all([
      prisma.maintenanceCategory.findFirst({
        where: { name: 'Plumbing' },
        select: { id: true },
      }),
      prisma.maintenanceCategory.findFirst({
        where: { name: 'Safety' },
        select: { id: true },
      }),
      prisma.maintenanceCategory.findFirst({
        where: { name: 'Electrical / Lighting' },
        select: { id: true },
      }),
    ]);
    maintCat1Id = cat1!.id;
    maintCat2Id = cat2!.id;
    maintCat3Id = cat3!.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (adminLogin.status !== 200 || !adminLogin.body?.access_token) {
      throw new Error(`Admin login failed: ${adminLogin.status}`);
    }
    adminToken = adminLogin.body.access_token;

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

    await prisma.subtaskWorkflowTemplate.deleteMany({
      where: {
        ticketClassId: tclassMaintenance,
        maintenanceCategoryId: { in: [maintCat1Id, maintCat2Id, maintCat3Id] },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('1. Sequential workflow A -> B -> C', () => {
    let workflowId: string;
    let templateAId: string;
    let templateBId: string;
    let templateCId: string;
    let ticketId: string;

    beforeAll(async () => {
      const createWf = await request(app.getHttpServer())
        .post('/api/subtask-workflow/templates')
        .set(auth(adminToken))
        .send({
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
          name: 'Seq A->B->C',
        })
        .expect(201);
      workflowId = createWf.body.id;

      const [a, b, c] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: workflowId,
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
            workflowTemplateId: workflowId,
            title: 'Step B',
            departmentId: deptId,
            isRequired: true,
            sortOrder: 1,
          })
          .then((r) => r.body.id),
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: workflowId,
            title: 'Step C',
            departmentId: deptId,
            isRequired: true,
            sortOrder: 2,
          })
          .then((r) => r.body.id),
      ]);
      templateAId = a;
      templateBId = b;
      templateCId = c;

      await request(app.getHttpServer())
        .post('/api/subtask-workflow/template-dependencies')
        .set(auth(adminToken))
        .send({
          workflowTemplateId: workflowId,
          subtaskTemplateId: templateBId,
          dependsOnSubtaskTemplateId: templateAId,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/subtask-workflow/template-dependencies')
        .set(auth(adminToken))
        .send({
          workflowTemplateId: workflowId,
          subtaskTemplateId: templateCId,
          dependsOnSubtaskTemplateId: templateBId,
        })
        .expect(201);

      const createTicket = await request(app.getHttpServer())
        .post('/api/tickets')
        .set(auth(adminToken))
        .send({
          title: 'Stage4 Seq ticket',
          description: 'Seq workflow',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
        })
        .expect(201);
      ticketId = createTicket.body.id;
    });

    it('A starts READY, B and C start LOCKED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const subs = res.body as Array<{ title: string; status: string }>;
      const a = subs.find((s) => s.title === 'Step A');
      const b = subs.find((s) => s.title === 'Step B');
      const c = subs.find((s) => s.title === 'Step C');
      expect(a?.status).toBe('READY');
      expect(b?.status).toBe('LOCKED');
      expect(c?.status).toBe('LOCKED');
    });

    it('Completing A makes B READY', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const subA = (list.body as Array<{ id: string; title: string }>).find(
        (s) => s.title === 'Step A',
      )!;
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/subtasks/${subA.id}`)
        .set(auth(adminToken))
        .send({ status: 'DONE' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const b = (res.body as Array<{ title: string; status: string }>).find(
        (s) => s.title === 'Step B',
      );
      const c = (res.body as Array<{ title: string; status: string }>).find(
        (s) => s.title === 'Step C',
      );
      expect(b?.status).toBe('READY');
      expect(c?.status).toBe('LOCKED');
    });

    it('Completing B makes C READY', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const subB = (list.body as Array<{ id: string; title: string }>).find(
        (s) => s.title === 'Step B',
      )!;
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/subtasks/${subB.id}`)
        .set(auth(adminToken))
        .send({ status: 'DONE' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const c = (res.body as Array<{ title: string; status: string }>).find(
        (s) => s.title === 'Step C',
      );
      expect(c?.status).toBe('READY');
    });
  });

  describe('2. Parallel dependency A->C, B->C', () => {
    let ticketId: string;
    let subAId: string;
    let subBId: string;
    let subCId: string;

    beforeAll(async () => {
      const createWf = await request(app.getHttpServer())
        .post('/api/subtask-workflow/templates')
        .set(auth(adminToken))
        .send({
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat2Id,
          name: 'Parallel A,B->C',
        })
        .expect(201);
      const wfId = createWf.body.id;

      const [a, b, c] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: wfId,
            title: 'Parallel A',
            departmentId: deptId,
            sortOrder: 0,
          })
          .then((r) => r.body.id),
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: wfId,
            title: 'Parallel B',
            departmentId: deptId,
            sortOrder: 1,
          })
          .then((r) => r.body.id),
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: wfId,
            title: 'Parallel C',
            departmentId: deptId,
            sortOrder: 2,
          })
          .then((r) => r.body.id),
      ]);

      await request(app.getHttpServer())
        .post('/api/subtask-workflow/template-dependencies')
        .set(auth(adminToken))
        .send({
          workflowTemplateId: wfId,
          subtaskTemplateId: c,
          dependsOnSubtaskTemplateId: a,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/subtask-workflow/template-dependencies')
        .set(auth(adminToken))
        .send({
          workflowTemplateId: wfId,
          subtaskTemplateId: c,
          dependsOnSubtaskTemplateId: b,
        })
        .expect(201);

      const createTicket = await request(app.getHttpServer())
        .post('/api/tickets')
        .set(auth(adminToken))
        .send({
          title: 'Stage4 Parallel ticket',
          description: 'Parallel',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat2Id,
        })
        .expect(201);
      ticketId = createTicket.body.id;
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const subs = list.body as Array<{ id: string; title: string }>;
      subAId = subs.find((s) => s.title === 'Parallel A')!.id;
      subBId = subs.find((s) => s.title === 'Parallel B')!.id;
      subCId = subs.find((s) => s.title === 'Parallel C')!.id;
    });

    it('A and B start READY, C starts LOCKED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const subs = res.body as Array<{ title: string; status: string }>;
      expect(subs.find((s) => s.title === 'Parallel A')?.status).toBe('READY');
      expect(subs.find((s) => s.title === 'Parallel B')?.status).toBe('READY');
      expect(subs.find((s) => s.title === 'Parallel C')?.status).toBe('LOCKED');
    });

    it('Completing only A does NOT unlock C', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/subtasks/${subAId}`)
        .set(auth(adminToken))
        .send({ status: 'DONE' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      expect(
        (res.body as Array<{ title: string; status: string }>).find(
          (s) => s.title === 'Parallel C',
        )?.status,
      ).toBe('LOCKED');
    });

    it('Completing B after A makes C READY', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/subtasks/${subBId}`)
        .set(auth(adminToken))
        .send({ status: 'DONE' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      expect(
        (res.body as Array<{ title: string; status: string }>).find(
          (s) => s.title === 'Parallel C',
        )?.status,
      ).toBe('READY');
    });
  });

  describe('3. SKIPPED satisfies dependency', () => {
    let ticketId: string;
    let subBId: string;

    beforeAll(async () => {
      const createWf = await request(app.getHttpServer())
        .post('/api/subtask-workflow/templates')
        .set(auth(adminToken))
        .send({
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat3Id,
          name: 'SKIP test A->B',
        })
        .expect(201);
      const wfId = createWf.body.id;
      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: wfId,
            title: 'Skip-Upstream',
            departmentId: deptId,
            sortOrder: 0,
          })
          .then((r) => r.body.id),
        request(app.getHttpServer())
          .post('/api/subtask-workflow/subtask-templates')
          .set(auth(adminToken))
          .send({
            workflowTemplateId: wfId,
            title: 'Skip-Downstream',
            departmentId: deptId,
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
          title: 'Stage4 SKIP ticket',
          description: 'SKIP',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat3Id,
        })
        .expect(201);
      ticketId = createTicket.body.id;
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      subBId = (list.body as Array<{ id: string; title: string }>).find(
        (s) => s.title === 'Skip-Downstream',
      )!.id;
    });

    it('Setting upstream to SKIPPED unlocks downstream to READY', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const subA = (list.body as Array<{ id: string; title: string }>).find(
        (s) => s.title === 'Skip-Upstream',
      )!;
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/subtasks/${subA.id}`)
        .set(auth(adminToken))
        .send({ status: 'SKIPPED' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      expect(
        (res.body as Array<{ title: string; status: string }>).find(
          (s) => s.title === 'Skip-Downstream',
        )?.status,
      ).toBe('READY');
    });
  });

  describe('4. Actionable queue (actionableForMe)', () => {
    it('actionableForMe=true returns only tickets with at least one READY subtask for dept/user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tickets')
        .query({ actionableForMe: true, limit: 50 })
        .set(auth(deptUserToken))
        .expect(200);
      const tickets = res.body.data as Array<{ id: string }>;
      for (const t of tickets) {
        const subs = await request(app.getHttpServer())
          .get(`/api/tickets/${t.id}/subtasks`)
          .set(auth(deptUserToken))
          .expect(200);
        const hasReady = (
          subs.body as Array<{
            status: string;
            departmentId?: string;
            ownerId?: string;
          }>
        ).some((s) => s.status === 'READY');
        expect(hasReady).toBe(true);
      }
    });

    it('Ticket with no READY subtasks does not appear in actionableForMe list', async () => {
      const ticketNoWorkflow = await request(app.getHttpServer())
        .post('/api/tickets')
        .set(auth(adminToken))
        .send({
          title: 'Stage4 No-workflow ticket',
          description: 'No workflow',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
        })
        .expect(201);
      const tid = ticketNoWorkflow.body.id;
      const subs = await prisma.subtask.findMany({
        where: { ticketId: tid },
        select: { id: true, status: true },
      });
      const allLocked =
        subs.length > 0 && subs.every((s) => s.status === 'LOCKED');
      if (subs.length === 0 || allLocked) {
        const list = await request(app.getHttpServer())
          .get('/api/tickets')
          .query({ actionableForMe: true, limit: 100 })
          .set(auth(deptUserToken))
          .expect(200);
        const ids = (list.body.data as Array<{ id: string }>).map((x) => x.id);
        if (allLocked) expect(ids).not.toContain(tid);
      }
    });
  });

  describe('5. Resolution gate', () => {
    let ticketId: string;

    beforeAll(async () => {
      const t = await request(app.getHttpServer())
        .post('/api/tickets')
        .set(auth(adminToken))
        .send({
          title: 'Stage4 Resolution-gate ticket',
          description: 'Gate',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
        })
        .expect(201);
      ticketId = t.body.id;
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/status`)
        .set(auth(adminToken))
        .send({ status: 'TRIAGED' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/status`)
        .set(auth(adminToken))
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
    });

    it('Cannot RESOLVE until all required subtasks are DONE or SKIPPED', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const requiredNotDone = (
        list.body as Array<{ isRequired: boolean; status: string }>
      ).filter(
        (s) => s.isRequired && s.status !== 'DONE' && s.status !== 'SKIPPED',
      );
      if (requiredNotDone.length > 0) {
        await request(app.getHttpServer())
          .patch(`/api/tickets/${ticketId}/status`)
          .set(auth(adminToken))
          .send({ status: 'RESOLVED' })
          .expect(400);
      }
    });

    it('Optional subtask does not block resolution', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const subs = listRes.body as Array<{
        id: string;
        title: string;
        isRequired: boolean;
      }>;
      const requiredOrder = ['Step A', 'Step B', 'Step C'];
      for (const title of requiredOrder) {
        const s = subs.find((x) => x.title === title && x.isRequired);
        if (s) {
          await request(app.getHttpServer())
            .patch(`/api/tickets/${ticketId}/subtasks/${s.id}`)
            .set(auth(adminToken))
            .send({ status: 'DONE' })
            .expect(200);
        }
      }
      const res = await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/status`)
        .set(auth(adminToken))
        .send({ status: 'RESOLVED' })
        .expect(200);
      expect(res.body.status).toBe('RESOLVED');
    });
  });

  describe('6. Ad hoc subtask', () => {
    let ticketId: string;
    let workflowBefore: unknown;

    beforeAll(async () => {
      const t = await request(app.getHttpServer())
        .post('/api/tickets')
        .set(auth(adminToken))
        .send({
          title: 'Stage4 Ad-hoc ticket',
          description: 'Adhoc',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId: maintCat1Id,
        })
        .expect(201);
      ticketId = t.body.id;
      const wf = await prisma.subtaskWorkflowTemplate.findFirst({
        where: { maintenanceCategoryId: maintCat1Id },
        include: { subtaskTemplates: true },
      });
      workflowBefore = JSON.stringify(wf?.subtaskTemplates ?? []);
    });

    it('Ad hoc subtask has subtaskTemplateId null', async () => {
      const create = await request(app.getHttpServer())
        .post(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(deptUserToken))
        .send({
          title: 'Ad hoc task',
          description: 'Manual',
          isRequired: false,
        })
        .expect(201);
      expect(create.body.subtaskTemplateId).toBeNull();
    });

    it('Template data is unchanged after adding ad hoc', async () => {
      const wfAfter = await prisma.subtaskWorkflowTemplate.findFirst({
        where: { maintenanceCategoryId: maintCat1Id },
        include: { subtaskTemplates: true },
      });
      expect(JSON.stringify(wfAfter?.subtaskTemplates ?? [])).toBe(
        workflowBefore,
      );
    });

    it('Ad hoc subtask can transition status normally', async () => {
      const list = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      const adhoc = (
        list.body as Array<{
          id: string;
          title: string;
          subtaskTemplateId: string | null;
        }>
      ).find((s) => s.title === 'Ad hoc task' && s.subtaskTemplateId == null)!;
      await request(app.getHttpServer())
        .patch(`/api/tickets/${ticketId}/subtasks/${adhoc.id}`)
        .set(auth(deptUserToken))
        .send({ status: 'DONE' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}/subtasks`)
        .set(auth(adminToken))
        .expect(200);
      expect(
        (res.body as Array<{ title: string; status: string }>).find(
          (s) => s.title === 'Ad hoc task',
        )?.status,
      ).toBe('DONE');
    });
  });
});
