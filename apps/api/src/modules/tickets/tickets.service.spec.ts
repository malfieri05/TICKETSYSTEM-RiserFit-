import { BadRequestException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';

const MAINTENANCE_CLASS_ID = 'tclass_maintenance';
const SUPPORT_CLASS_ID = 'tclass_support';
const MAINT_CAT_ID = 'mcat_plumbing';

function makeActor(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'user-1',
    email: 'user@test.com',
    displayName: 'Test User',
    role: 'STUDIO_USER',
    teamId: null,
    studioId: null,
    marketId: null,
    isActive: true,
    departments: [],
    scopeStudioIds: [],
    ...overrides,
  };
}

function buildPrismaMock() {
  return {
    ticketClass: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    maintenanceCategory: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    taxonomyDepartment: {
      findUniqueOrThrow: jest.fn(),
    },
    supportTopic: {
      findUnique: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    ticket: {
      create: jest.fn(),
    },
    ticketWatcher: {
      create: jest.fn(),
    },
    ticketFormResponse: {
      create: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prismaTx)),
  };
}

let prismaTx: ReturnType<typeof buildPrismaMock>;

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let auditLog: { log: jest.Mock };
  let domainEvents: { emit: jest.Mock };
  let sla: { compute: jest.Mock };
  let mySummaryCache: { invalidate: jest.Mock };
  let visibility: { buildWhereClause: jest.Mock; assertCanView: jest.Mock; assertCanModify: jest.Mock };
  let ticketForms: { getSchema: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    prismaTx = buildPrismaMock();
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prismaTx));

    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    domainEvents = { emit: jest.fn().mockResolvedValue(undefined) };
    sla = { compute: jest.fn().mockReturnValue({ status: 'OK', targetHours: 24, elapsedHours: 0, remainingHours: 24, percentUsed: 0 }) };
    mySummaryCache = { invalidate: jest.fn() };
    visibility = {
      buildWhereClause: jest.fn().mockReturnValue({}),
      assertCanView: jest.fn(),
      assertCanModify: jest.fn(),
    };
    ticketForms = {
      getSchema: jest.fn(),
    };
    const subtaskWorkflow = {
      instantiateForTicket: jest.fn().mockResolvedValue(undefined),
    };

    service = new TicketsService(
      prisma as never,
      auditLog as never,
      domainEvents as never,
      sla as never,
      mySummaryCache as never,
      visibility as never,
      ticketForms as never,
      subtaskWorkflow as never,
    );
  });

  describe('create (taxonomy compatibility)', () => {
    it('legacy payload with only categoryId succeeds and maps to MAINTENANCE + maintenanceCategoryId', async () => {
      const actor = makeActor();
      const categoryId = MAINT_CAT_ID;

      prisma.ticketClass.findFirst.mockResolvedValue({ id: MAINTENANCE_CLASS_ID });
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'MAINTENANCE' });
      prisma.maintenanceCategory.findUniqueOrThrow.mockResolvedValue({ id: categoryId });
      prisma.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaTx.ticket.create.mockResolvedValue({
        id: 'ticket-1',
        title: 'Legacy ticket',
        status: 'NEW',
        ticketClassId: MAINTENANCE_CLASS_ID,
        maintenanceCategoryId: categoryId,
        categoryId,
        ticketClass: { id: MAINTENANCE_CLASS_ID, code: 'MAINTENANCE', name: 'Maintenance' },
        maintenanceCategory: { id: categoryId, name: 'Plumbing', color: null },
      });
      prismaTx.ticketWatcher.create.mockResolvedValue({});

      const result = await service.create(
        {
          title: 'Legacy ticket',
          description: '',
          priority: 'MEDIUM',
          categoryId,
        },
        actor,
      );

      expect(prisma.ticketClass.findFirst).toHaveBeenCalledWith({
        where: { code: 'MAINTENANCE', isActive: true },
        select: { id: true },
      });
      expect(prismaTx.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketClassId: MAINTENANCE_CLASS_ID,
            maintenanceCategoryId: categoryId,
            categoryId,
            title: 'Legacy ticket',
          }),
        }),
      );
      expect(result.ticketClass?.id).toBe(MAINTENANCE_CLASS_ID);
      expect(result.maintenanceCategory?.id).toBe(categoryId);
    });

    it('new payload with ticketClassId + maintenanceCategoryId still works', async () => {
      const actor = makeActor();

      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'MAINTENANCE' });
      prisma.maintenanceCategory.findUniqueOrThrow.mockResolvedValue({ id: MAINT_CAT_ID });
      prismaTx.ticket.create.mockResolvedValue({
        id: 'ticket-2',
        title: 'New taxonomy ticket',
        status: 'NEW',
        ticketClassId: MAINTENANCE_CLASS_ID,
        maintenanceCategoryId: MAINT_CAT_ID,
        ticketClass: { id: MAINTENANCE_CLASS_ID, code: 'MAINTENANCE', name: 'Maintenance' },
        maintenanceCategory: { id: MAINT_CAT_ID, name: 'Plumbing', color: null },
      });
      prismaTx.ticketWatcher.create.mockResolvedValue({});

      const result = await service.create(
        {
          title: 'New taxonomy ticket',
          description: '',
          priority: 'HIGH',
          ticketClassId: MAINTENANCE_CLASS_ID,
          maintenanceCategoryId: MAINT_CAT_ID,
        },
        actor,
      );

      expect(prisma.ticketClass.findFirst).not.toHaveBeenCalled();
      expect(prismaTx.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketClassId: MAINTENANCE_CLASS_ID,
            maintenanceCategoryId: MAINT_CAT_ID,
            title: 'New taxonomy ticket',
          }),
        }),
      );
      expect(result.ticketClass?.id).toBe(MAINTENANCE_CLASS_ID);
      expect(result.maintenanceCategory?.id).toBe(MAINT_CAT_ID);
    });

    it('invalid SUPPORT payload (missing departmentId and supportTopicId) fails with BadRequestException', async () => {
      const actor = makeActor();

      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'SUPPORT' });

      await expect(
        service.create(
          {
            title: 'Support ticket without dept',
            description: '',
            priority: 'MEDIUM',
            ticketClassId: SUPPORT_CLASS_ID,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(
          {
            title: 'Support ticket without dept',
            description: '',
            priority: 'MEDIUM',
            ticketClassId: SUPPORT_CLASS_ID,
          },
          actor,
        ),
      ).rejects.toThrow(/SUPPORT tickets require departmentId and supportTopicId/);

      expect(prismaTx.ticket.create).not.toHaveBeenCalled();
    });

    it('create with formResponses persists to ticket_form_responses when schema validates', async () => {
      const actor = makeActor();
      ticketForms.getSchema.mockResolvedValue({
        id: 'schema-1',
        fields: [
          { fieldKey: 'additional_details', required: false },
          { fieldKey: 'urgency', required: true },
        ],
      });
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'MAINTENANCE' });
      prisma.maintenanceCategory.findUniqueOrThrow.mockResolvedValue({ id: MAINT_CAT_ID });
      prismaTx.ticket.create.mockResolvedValue({
        id: 'ticket-form-1',
        title: 'With form',
        status: 'NEW',
        ticketClassId: MAINTENANCE_CLASS_ID,
        maintenanceCategoryId: MAINT_CAT_ID,
        ticketClass: { id: MAINTENANCE_CLASS_ID, code: 'MAINTENANCE', name: 'Maintenance' },
        maintenanceCategory: { id: MAINT_CAT_ID, name: 'Plumbing', color: null },
      });
      prismaTx.ticketWatcher.create.mockResolvedValue({});
      prismaTx.ticketFormResponse.create.mockResolvedValue({});

      await service.create(
        {
          title: 'With form',
          description: '',
          ticketClassId: MAINTENANCE_CLASS_ID,
          maintenanceCategoryId: MAINT_CAT_ID,
          formResponses: { additional_details: 'Some notes', urgency: 'high' },
        },
        actor,
      );

      expect(ticketForms.getSchema).toHaveBeenCalledWith({
        ticketClassId: MAINTENANCE_CLASS_ID,
        departmentId: undefined,
        supportTopicId: undefined,
        maintenanceCategoryId: MAINT_CAT_ID,
      });
      expect(prismaTx.ticketFormResponse.create).toHaveBeenCalledTimes(2);
      expect(prismaTx.ticketFormResponse.create).toHaveBeenCalledWith({
        data: { ticketId: 'ticket-form-1', fieldKey: 'additional_details', value: 'Some notes' },
      });
      expect(prismaTx.ticketFormResponse.create).toHaveBeenCalledWith({
        data: { ticketId: 'ticket-form-1', fieldKey: 'urgency', value: 'high' },
      });
    });

    it('create with formResponses but missing required field throws BadRequestException', async () => {
      const actor = makeActor();
      ticketForms.getSchema.mockResolvedValue({
        id: 'schema-1',
        fields: [{ fieldKey: 'required_field', required: true }],
      });
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'MAINTENANCE' });
      prisma.maintenanceCategory.findUniqueOrThrow.mockResolvedValue({ id: MAINT_CAT_ID });

      await expect(
        service.create(
          {
            title: 'Missing required',
            description: '',
            ticketClassId: MAINTENANCE_CLASS_ID,
            maintenanceCategoryId: MAINT_CAT_ID,
            formResponses: { other: 'value' },
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(
          {
            title: 'Missing required',
            description: '',
            ticketClassId: MAINTENANCE_CLASS_ID,
            maintenanceCategoryId: MAINT_CAT_ID,
            formResponses: { other: 'value' },
          },
          actor,
        ),
      ).rejects.toThrow(/Required form field "required_field"/);

      expect(prismaTx.ticket.create).not.toHaveBeenCalled();
    });

    it('legacy create without formResponses does not call ticketForms.getSchema', async () => {
      const actor = makeActor();
      prisma.ticketClass.findFirst.mockResolvedValue({ id: MAINTENANCE_CLASS_ID });
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'MAINTENANCE' });
      prisma.maintenanceCategory.findUniqueOrThrow.mockResolvedValue({ id: MAINT_CAT_ID });
      prisma.category.findUnique.mockResolvedValue({ id: MAINT_CAT_ID });
      prismaTx.ticket.create.mockResolvedValue({
        id: 'ticket-1',
        title: 'Legacy',
        status: 'NEW',
        ticketClassId: MAINTENANCE_CLASS_ID,
        maintenanceCategoryId: MAINT_CAT_ID,
        categoryId: MAINT_CAT_ID,
        ticketClass: { id: MAINTENANCE_CLASS_ID, code: 'MAINTENANCE', name: 'Maintenance' },
        maintenanceCategory: { id: MAINT_CAT_ID, name: 'Plumbing', color: null },
      });
      prismaTx.ticketWatcher.create.mockResolvedValue({});

      await service.create(
        { title: 'Legacy', description: '', categoryId: MAINT_CAT_ID },
        actor,
      );

      expect(ticketForms.getSchema).not.toHaveBeenCalled();
    });
  });
});
