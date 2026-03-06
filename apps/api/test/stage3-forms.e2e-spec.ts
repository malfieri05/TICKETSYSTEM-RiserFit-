/**
 * Stage 3 integration: GET /ticket-forms/schema, ticket create (legacy + formResponses), ticket detail with formResponses.
 * Requires DB with seed (support topics, maintenance categories, form schemas). Use seeded user for auth.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/database/prisma.service';

const SEEDED_EMAIL = 'malfieri05@gmail.com';
const SEEDED_PASSWORD = 'Password123!';

describe('Stage 3 Forms (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let supportTopicId: string;
  let departmentId: string;
  let maintenanceCategoryId: string;
  const tclassSupport = 'tclass_support';
  const tclassMaintenance = 'tclass_maintenance';

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
    const supportTopic = await prisma.supportTopic.findFirst({
      where: { isActive: true },
      select: { id: true, departmentId: true },
    });
    supportTopicId = supportTopic!.id;
    departmentId = supportTopic!.departmentId;
    const maintCat = await prisma.maintenanceCategory.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    maintenanceCategoryId = maintCat!.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: SEEDED_EMAIL, password: SEEDED_PASSWORD });
    if (loginRes.status !== 200 || !loginRes.body?.access_token) {
      throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }
    token = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/ticket-forms/schema', () => {
    it('returns schema for valid SUPPORT context', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/ticket-forms/schema')
        .query({
          ticketClassId: tclassSupport,
          departmentId,
          supportTopicId,
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('version', 1);
      expect(res.body).toHaveProperty('fields');
      expect(Array.isArray(res.body.fields)).toBe(true);
    });

    it('returns schema for valid MAINTENANCE context', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/ticket-forms/schema')
        .query({
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId,
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('version', 1);
      expect(res.body).toHaveProperty('fields');
    });
  });

  describe('Ticket create and detail', () => {
    it('legacy create (no formResponses) succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'E2E legacy ticket',
          description: 'No form',
          categoryId: maintenanceCategoryId,
        })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('ticketClass');
      expect(res.body.formResponses).toBeUndefined();
    });

    it('taxonomy-based create with formResponses succeeds and detail returns them', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'E2E ticket with form',
          description: 'Has form responses',
          ticketClassId: tclassMaintenance,
          maintenanceCategoryId,
          formResponses: { additional_details: 'E2E test value' },
        })
        .expect(201);
      const ticketId = createRes.body.id;
      expect(ticketId).toBeDefined();

      const detailRes = await request(app.getHttpServer())
        .get(`/api/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(detailRes.body).toHaveProperty('formResponses');
      expect(Array.isArray(detailRes.body.formResponses)).toBe(true);
      const additionalDetails = detailRes.body.formResponses.find((r: { fieldKey: string }) => r.fieldKey === 'additional_details');
      expect(additionalDetails).toBeDefined();
      expect(additionalDetails.value).toBe('E2E test value');
    });
  });
});
