import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { DispatchTradeType } from '@prisma/client';

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  createdBy: true,
  dispatchTradeType: true,
  maintenanceCategoryId: true,
  anchorStudioId: true,
  radiusMiles: true,
  createdAt: true,
  updatedAt: true,
  creator: {
    select: { id: true, name: true, email: true },
  },
  maintenanceCategory: {
    select: { id: true, name: true },
  },
  anchorStudio: {
    select: { id: true, name: true, formattedAddress: true },
  },
} as const;

@Injectable()
export class DispatchTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: {
      name: string;
      dispatchTradeType: DispatchTradeType;
      maintenanceCategoryId?: string | null;
      anchorStudioId?: string | null;
      radiusMiles: number;
    },
    createdBy: string,
  ) {
    return this.prisma.dispatchGroupTemplate.create({
      data: {
        name: data.name,
        createdBy,
        dispatchTradeType: data.dispatchTradeType,
        maintenanceCategoryId: data.maintenanceCategoryId ?? undefined,
        anchorStudioId: data.anchorStudioId ?? undefined,
        radiusMiles: data.radiusMiles,
      },
      select: TEMPLATE_SELECT,
    });
  }

  async findAll() {
    return this.prisma.dispatchGroupTemplate.findMany({
      select: TEMPLATE_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findById(id: string) {
    const template = await this.prisma.dispatchGroupTemplate.findUnique({
      where: { id },
      select: TEMPLATE_SELECT,
    });
    if (!template) throw new NotFoundException(`Dispatch template ${id} not found`);
    return template;
  }

  async update(
    id: string,
    data: {
      name?: string;
      dispatchTradeType?: DispatchTradeType;
      maintenanceCategoryId?: string | null;
      anchorStudioId?: string | null;
      radiusMiles?: number;
    },
  ) {
    await this.findById(id);
    return this.prisma.dispatchGroupTemplate.update({
      where: { id },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.dispatchTradeType != null && { dispatchTradeType: data.dispatchTradeType }),
        ...(data.maintenanceCategoryId !== undefined && { maintenanceCategoryId: data.maintenanceCategoryId }),
        ...(data.anchorStudioId !== undefined && { anchorStudioId: data.anchorStudioId }),
        ...(data.radiusMiles != null && { radiusMiles: data.radiusMiles }),
      },
      select: TEMPLATE_SELECT,
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.dispatchGroupTemplate.delete({ where: { id } });
  }
}
