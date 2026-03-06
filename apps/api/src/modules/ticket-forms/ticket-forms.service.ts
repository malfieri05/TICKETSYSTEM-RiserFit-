import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

export interface FormFieldOptionDto {
  value: string;
  label: string;
  sortOrder: number;
}

export interface FormFieldDto {
  id: string;
  fieldKey: string;
  type: string;
  label: string;
  required: boolean;
  sortOrder: number;
  conditionalFieldKey?: string | null;
  conditionalValue?: string | null;
  options?: FormFieldOptionDto[];
}

export interface TicketFormSchemaDto {
  id: string;
  ticketClassId: string;
  departmentId: string | null;
  supportTopicId: string | null;
  maintenanceCategoryId: string | null;
  version: number;
  name: string | null;
  sortOrder: number;
  fields: FormFieldDto[];
}

@Injectable()
export class TicketFormsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load form schema for the given context.
   * SUPPORT: ticketClassId + departmentId + supportTopicId must be provided.
   * MAINTENANCE: ticketClassId + maintenanceCategoryId must be provided.
   */
  async getSchema(params: {
    ticketClassId: string;
    departmentId?: string;
    supportTopicId?: string;
    maintenanceCategoryId?: string;
  }): Promise<TicketFormSchemaDto> {
    const { ticketClassId, departmentId, supportTopicId, maintenanceCategoryId } = params;

    const ticketClass = await this.prisma.ticketClass.findUnique({
      where: { id: ticketClassId, isActive: true },
      select: { code: true },
    });
    if (!ticketClass) {
      throw new BadRequestException('Invalid ticketClassId');
    }

    if (ticketClass.code === 'SUPPORT') {
      if (!departmentId || !supportTopicId) {
        throw new BadRequestException('SUPPORT forms require departmentId and supportTopicId');
      }
      const schema = await this.prisma.ticketFormSchema.findFirst({
        where: {
          ticketClassId,
          supportTopicId,
          isActive: true,
        },
        include: {
          fields: {
            orderBy: { sortOrder: 'asc' },
            include: {
              options: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });
      if (!schema) {
        throw new NotFoundException(
          'No form schema found for this support topic. An admin may need to configure one.',
        );
      }
      return this.toSchemaDto(schema);
    }

    if (ticketClass.code === 'MAINTENANCE') {
      if (!maintenanceCategoryId) {
        throw new BadRequestException('MAINTENANCE forms require maintenanceCategoryId');
      }
      const schema = await this.prisma.ticketFormSchema.findFirst({
        where: {
          ticketClassId,
          maintenanceCategoryId,
          isActive: true,
        },
        include: {
          fields: {
            orderBy: { sortOrder: 'asc' },
            include: {
              options: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });
      if (!schema) {
        throw new NotFoundException(
          'No form schema found for this maintenance category. An admin may need to configure one.',
        );
      }
      return this.toSchemaDto(schema);
    }

    throw new BadRequestException('Unknown ticket class');
  }

  private toSchemaDto(schema: {
    id: string;
    ticketClassId: string;
    departmentId: string | null;
    supportTopicId: string | null;
    maintenanceCategoryId: string | null;
    version: number;
    name: string | null;
    sortOrder: number;
    fields: Array<{
      id: string;
      fieldKey: string;
      type: string;
      label: string;
      required: boolean;
      sortOrder: number;
      conditionalFieldKey: string | null;
      conditionalValue: string | null;
      options: Array<{ value: string; label: string; sortOrder: number }>;
    }>;
  }): TicketFormSchemaDto {
    return {
      id: schema.id,
      ticketClassId: schema.ticketClassId,
      departmentId: schema.departmentId,
      supportTopicId: schema.supportTopicId,
      maintenanceCategoryId: schema.maintenanceCategoryId,
      version: schema.version,
      name: schema.name,
      sortOrder: schema.sortOrder,
      fields: schema.fields.map((f) => ({
        id: f.id,
        fieldKey: f.fieldKey,
        type: f.type,
        label: f.label,
        required: f.required,
        sortOrder: f.sortOrder,
        conditionalFieldKey: f.conditionalFieldKey ?? undefined,
        conditionalValue: f.conditionalValue ?? undefined,
        options:
          f.options?.length > 0
            ? f.options.map((o) => ({ value: o.value, label: o.label, sortOrder: o.sortOrder }))
            : undefined,
      })),
    };
  }
}
