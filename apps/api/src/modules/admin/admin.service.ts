import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateMarketDto,
  UpdateMarketDto,
  CreateStudioDto,
  UpdateStudioDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ─── Categories ──────────────────────────────────────────────────────────

  async listCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`Category "${dto.name}" already exists`);

    return this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        isActive: true,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findCategoryOrThrow(id);
    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  private async findCategoryOrThrow(id: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }

  // ─── Ticket taxonomy (Stage 2, read-only config) ──────────────────────────

  async getTicketTaxonomy() {
    const [ticketClasses, departments, supportTopics, maintenanceCategories] = await Promise.all([
      this.prisma.ticketClass.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, name: true, sortOrder: true },
      }),
      this.prisma.taxonomyDepartment.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, name: true, sortOrder: true },
      }),
      this.prisma.supportTopic.findMany({
        where: { isActive: true },
        orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          departmentId: true,
          department: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.maintenanceCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, description: true, color: true, sortOrder: true },
      }),
    ]);

    const supportTopicsByDepartment = departments.map((dept) => ({
      ...dept,
      topics: supportTopics
        .filter((t) => t.departmentId === dept.id)
        .map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
    }));

    return {
      ticketClasses,
      departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name, sortOrder: d.sortOrder })),
      supportTopicsByDepartment,
      maintenanceCategories,
    };
  }

  // ─── Markets ─────────────────────────────────────────────────────────────

  async listMarkets() {
    return this.prisma.market.findMany({
      orderBy: { name: 'asc' },
      include: {
        studios: { orderBy: { name: 'asc' } },
      },
    });
  }

  async createMarket(dto: CreateMarketDto) {
    const existing = await this.prisma.market.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`Market "${dto.name}" already exists`);

    return this.prisma.market.create({
      data: { name: dto.name },
      include: { studios: true },
    });
  }

  async updateMarket(id: string, dto: UpdateMarketDto) {
    await this.findMarketOrThrow(id);
    return this.prisma.market.update({
      where: { id },
      data: { ...(dto.name && { name: dto.name }) },
      include: { studios: true },
    });
  }

  private async findMarketOrThrow(id: string) {
    const market = await this.prisma.market.findUnique({ where: { id } });
    if (!market) throw new NotFoundException(`Market ${id} not found`);
    return market;
  }

  // ─── Studios ─────────────────────────────────────────────────────────────

  async listStudios(marketId?: string) {
    return this.prisma.studio.findMany({
      where: marketId ? { marketId } : undefined,
      orderBy: { name: 'asc' },
      include: { market: true },
    });
  }

  async createStudio(dto: CreateStudioDto) {
    await this.findMarketOrThrow(dto.marketId);

    const existing = await this.prisma.studio.findFirst({
      where: {
        marketId: dto.marketId,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });
    if (existing) throw new ConflictException(`Studio "${dto.name}" already exists in this market`);

    return this.prisma.studio.create({
      data: { name: dto.name, marketId: dto.marketId },
      include: { market: true },
    });
  }

  async updateStudio(id: string, dto: UpdateStudioDto) {
    const studio = await this.prisma.studio.findUnique({ where: { id } });
    if (!studio) throw new NotFoundException(`Studio ${id} not found`);

    return this.prisma.studio.update({
      where: { id },
      data: { ...(dto.name && { name: dto.name }) },
      include: { market: true },
    });
  }
}
