import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateMarketDto,
  UpdateMarketDto,
  CreateStudioDto,
  UpdateStudioDto,
} from './dto/admin.dto';
import { haversineMiles } from '../../utils/geoDistance';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ─── Ticket taxonomy (Stage 2, read-only config) ──────────────────────────

  async getTicketTaxonomy() {
    const [ticketClasses, departments, supportTopics, maintenanceCategories] =
      await Promise.all([
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
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            sortOrder: true,
          },
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
      departments: departments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        sortOrder: d.sortOrder,
      })),
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
    if (existing)
      throw new ConflictException(`Market "${dto.name}" already exists`);

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

    const name = dto.name.trim();
    const formattedAddress = dto.formattedAddress.trim();
    if (!name)
      throw new BadRequestException('name must be non-empty after trim');
    if (!formattedAddress)
      throw new BadRequestException(
        'formattedAddress must be non-empty after trim',
      );

    const existing = await this.prisma.studio.findFirst({
      where: {
        marketId: dto.marketId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (existing)
      throw new ConflictException(
        `Studio "${name}" already exists in this market`,
      );

    return this.prisma.studio.create({
      data: {
        name,
        marketId: dto.marketId,
        formattedAddress,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      include: { market: true },
    });
  }

  async updateStudio(id: string, dto: UpdateStudioDto) {
    const studio = await this.prisma.studio.findUnique({ where: { id } });
    if (!studio) throw new NotFoundException(`Studio ${id} not found`);

    if (studio.latitude != null && dto.latitude === null) {
      throw new BadRequestException(
        'Latitude cannot be removed once set; update with a new value or omit to keep existing.',
      );
    }
    if (studio.longitude != null && dto.longitude === null) {
      throw new BadRequestException(
        'Longitude cannot be removed once set; update with a new value or omit to keep existing.',
      );
    }

    const data: {
      name?: string;
      formattedAddress?: string;
      latitude?: number;
      longitude?: number;
    } = {};
    if (dto.name != null) {
      const trimmed = dto.name.trim();
      if (!trimmed)
        throw new BadRequestException('name must be non-empty after trim');
      data.name = trimmed;
    }
    if (dto.formattedAddress != null) {
      const trimmed = dto.formattedAddress.trim();
      if (!trimmed)
        throw new BadRequestException(
          'formattedAddress must be non-empty after trim',
        );
      data.formattedAddress = trimmed;
    }
    if (typeof dto.latitude === 'number') data.latitude = dto.latitude;
    if (typeof dto.longitude === 'number') data.longitude = dto.longitude;

    return this.prisma.studio.update({
      where: { id },
      data,
      include: { market: true },
    });
  }

  /** Studios within radiusMiles of the given studio (Haversine). Target and results must have coordinates. Max 50 results. */
  async getNearbyStudios(
    studioId: string,
    radiusMiles: number,
  ): Promise<
    {
      id: string;
      name: string;
      formattedAddress: string | null;
      marketName: string;
      distanceMiles: number;
    }[]
  > {
    const target = await this.prisma.studio.findUnique({
      where: { id: studioId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!target) throw new NotFoundException(`Studio ${studioId} not found`);
    if (target.latitude == null || target.longitude == null) {
      throw new NotFoundException(
        'This studio has no coordinates; nearby search is not available.',
      );
    }

    const others = await this.prisma.studio.findMany({
      where: {
        id: { not: studioId },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        formattedAddress: true,
        latitude: true,
        longitude: true,
        market: { select: { name: true } },
      },
    });

    const results: {
      id: string;
      name: string;
      formattedAddress: string | null;
      marketName: string;
      distanceMiles: number;
    }[] = [];
    for (const s of others) {
      const lat = s.latitude!;
      const lon = s.longitude!;
      const dist = haversineMiles(target.latitude, target.longitude, lat, lon);
      if (dist <= radiusMiles) {
        results.push({
          id: s.id,
          name: s.name,
          formattedAddress: s.formattedAddress,
          marketName: s.market.name,
          distanceMiles: Math.round(dist * 10) / 10,
        });
      }
    }
    results.sort((a, b) => a.distanceMiles - b.distanceMiles);
    return results.slice(0, 50);
  }
}
