import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TicketFormsService } from './ticket-forms.service';

const SUPPORT_CLASS_ID = 'tclass_support';
const MAINTENANCE_CLASS_ID = 'tclass_maintenance';
const DEPT_ID = 'dept_hr';
const TOPIC_ID = 'st_hr_1';
const MAINT_CAT_ID = 'mcat_plumbing';

function buildPrismaMock() {
  return {
    ticketClass: { findUnique: jest.fn() },
    ticketFormSchema: { findFirst: jest.fn() },
  };
}

describe('TicketFormsService', () => {
  let service: TicketFormsService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new TicketFormsService(prisma as never);
  });

  describe('getSchema', () => {
    it('returns schema for SUPPORT when departmentId and supportTopicId provided', async () => {
      const schemaRow = {
        id: 'schema-1',
        ticketClassId: SUPPORT_CLASS_ID,
        departmentId: DEPT_ID,
        supportTopicId: TOPIC_ID,
        maintenanceCategoryId: null,
        version: 1,
        name: 'Support: New Hire',
        sortOrder: 0,
        fields: [
          {
            id: 'f1',
            fieldKey: 'additional_details',
            type: 'textarea',
            label: 'Additional details',
            required: false,
            sortOrder: 100,
            conditionalFieldKey: null,
            conditionalValue: null,
            options: [],
          },
        ],
      };
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'SUPPORT' });
      prisma.ticketFormSchema.findFirst.mockResolvedValue(schemaRow);

      const result = await service.getSchema({
        ticketClassId: SUPPORT_CLASS_ID,
        departmentId: DEPT_ID,
        supportTopicId: TOPIC_ID,
      });

      expect(result.id).toBe('schema-1');
      expect(result.version).toBe(1);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].fieldKey).toBe('additional_details');
      expect(prisma.ticketFormSchema.findFirst).toHaveBeenCalledWith({
        where: {
          ticketClassId: SUPPORT_CLASS_ID,
          supportTopicId: TOPIC_ID,
          isActive: true,
        },
        include: expect.any(Object),
      });
    });

    it('returns schema for MAINTENANCE when maintenanceCategoryId provided', async () => {
      const schemaRow = {
        id: 'schema-m1',
        ticketClassId: MAINTENANCE_CLASS_ID,
        departmentId: null,
        supportTopicId: null,
        maintenanceCategoryId: MAINT_CAT_ID,
        version: 1,
        name: 'Maintenance: Plumbing',
        sortOrder: 0,
        fields: [
          {
            id: 'f1',
            fieldKey: 'additional_details',
            type: 'textarea',
            label: 'Additional details',
            required: false,
            sortOrder: 100,
            conditionalFieldKey: null,
            conditionalValue: null,
            options: [],
          },
        ],
      };
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'MAINTENANCE' });
      prisma.ticketFormSchema.findFirst.mockResolvedValue(schemaRow);

      const result = await service.getSchema({
        ticketClassId: MAINTENANCE_CLASS_ID,
        maintenanceCategoryId: MAINT_CAT_ID,
      });

      expect(result.id).toBe('schema-m1');
      expect(result.fields).toHaveLength(1);
      expect(prisma.ticketFormSchema.findFirst).toHaveBeenCalledWith({
        where: {
          ticketClassId: MAINTENANCE_CLASS_ID,
          maintenanceCategoryId: MAINT_CAT_ID,
          isActive: true,
        },
        include: expect.any(Object),
      });
    });

    it('throws BadRequestException when ticketClassId invalid', async () => {
      prisma.ticketClass.findUnique.mockResolvedValue(null);

      await expect(
        service.getSchema({ ticketClassId: 'invalid' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getSchema({ ticketClassId: 'invalid' }),
      ).rejects.toThrow(/Invalid ticketClassId/);
    });

    it('throws BadRequestException when SUPPORT but missing departmentId or supportTopicId', async () => {
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'SUPPORT' });

      await expect(
        service.getSchema({ ticketClassId: SUPPORT_CLASS_ID }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getSchema({ ticketClassId: SUPPORT_CLASS_ID }),
      ).rejects.toThrow(/departmentId and supportTopicId/);
    });

    it('throws BadRequestException when MAINTENANCE but missing maintenanceCategoryId', async () => {
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'MAINTENANCE' });

      await expect(
        service.getSchema({ ticketClassId: MAINTENANCE_CLASS_ID }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getSchema({ ticketClassId: MAINTENANCE_CLASS_ID }),
      ).rejects.toThrow(/maintenanceCategoryId/);
    });

    it('throws NotFoundException when no schema found for context', async () => {
      prisma.ticketClass.findUnique.mockResolvedValue({ code: 'SUPPORT' });
      prisma.ticketFormSchema.findFirst.mockResolvedValue(null);

      await expect(
        service.getSchema({
          ticketClassId: SUPPORT_CLASS_ID,
          departmentId: DEPT_ID,
          supportTopicId: TOPIC_ID,
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.getSchema({
          ticketClassId: SUPPORT_CLASS_ID,
          departmentId: DEPT_ID,
          supportTopicId: TOPIC_ID,
        }),
      ).rejects.toThrow(/No form schema found/);
    });
  });
});
