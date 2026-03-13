import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';

export interface DashboardSummaryDto {
  newTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  avgCompletionHours: number | null;
  supportByType: { typeId: string; typeName: string; count: number }[];
  maintenanceByLocation: {
    locationId: string;
    locationName: string;
    count: number;
  }[];
}

export interface StudioDashboardSummaryDto {
  openTickets: number;
  completedTickets: number;
  avgCompletionHours: number | null;
  byLocation: { locationId: string; locationName: string; count: number }[];
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private visibility: TicketVisibilityService,
  ) {}

  async getSummary(
    actor: RequestUser,
    studioId?: string,
  ): Promise<DashboardSummaryDto | StudioDashboardSummaryDto> {
    if (actor.role === Role.STUDIO_USER) {
      return this.getStudioSummary(actor, studioId);
    }
    return this.getAdminOrDeptSummary(actor);
  }

  private async getAdminOrDeptSummary(
    actor: RequestUser,
  ): Promise<DashboardSummaryDto> {
    const where = this.visibility.buildWhereClause(actor);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      newTickets,
      inProgressTickets,
      resolvedTickets,
      avgResult,
      supportByType,
      maintenanceByLocation,
    ] = await Promise.all([
      this.prisma.ticket.count({ where: { ...where, status: 'NEW' } }),
      this.prisma.ticket.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      this.prisma.ticket.count({
        where: { ...where, status: { in: ['RESOLVED', 'CLOSED'] } },
      }),
      this.computeAvgCompletion(where, thirtyDaysAgo),
      this.computeSupportByType(where),
      this.computeMaintenanceByLocation(where),
    ]);

    return {
      newTickets,
      inProgressTickets,
      resolvedTickets,
      avgCompletionHours: avgResult,
      supportByType,
      maintenanceByLocation,
    };
  }

  private async getStudioSummary(
    actor: RequestUser,
    studioId?: string,
  ): Promise<StudioDashboardSummaryDto> {
    let where = this.visibility.buildWhereClause(actor);

    if (studioId) {
      const allowedStudioIds: string[] = [];
      if (actor.studioId) allowedStudioIds.push(actor.studioId);
      allowedStudioIds.push(...actor.scopeStudioIds);
      if (!allowedStudioIds.includes(studioId)) {
        return {
          openTickets: 0,
          completedTickets: 0,
          avgCompletionHours: null,
          byLocation: [],
        };
      }
      where = { ...where, studioId };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [openTickets, completedTickets, avgResult, byLocation] =
      await Promise.all([
        this.prisma.ticket.count({
          where: {
            ...where,
            status: { notIn: ['RESOLVED', 'CLOSED'] },
          },
        }),
        this.prisma.ticket.count({
          where: { ...where, status: { in: ['RESOLVED', 'CLOSED'] } },
        }),
        this.computeAvgCompletion(where, thirtyDaysAgo),
        this.computeByLocation(where),
      ]);

    return {
      openTickets,
      completedTickets,
      avgCompletionHours: avgResult,
      byLocation,
    };
  }

  private async computeAvgCompletion(
    baseWhere: Record<string, unknown>,
    since: Date,
  ): Promise<number | null> {
    const rows = await this.prisma.$queryRawUnsafe<
      [{ avg_hours: number | null }]
    >(
      `
      SELECT ROUND(
        AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 3600)::numeric,
        1
      )::float AS avg_hours
      FROM tickets t
      WHERE t.status IN ('RESOLVED', 'CLOSED')
        AND t."resolvedAt" IS NOT NULL
        AND t."resolvedAt" >= $1
    `,
      since,
    );

    const val = rows?.[0]?.avg_hours;
    return val != null ? Number(val) : null;
  }

  private async computeSupportByType(
    baseWhere: Record<string, unknown>,
  ): Promise<{ typeId: string; typeName: string; count: number }[]> {
    const rows = await this.prisma.ticket.groupBy({
      by: ['supportTopicId'],
      where: { ...baseWhere, supportTopicId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { supportTopicId: 'desc' } },
    });

    const topicIds = rows
      .map((r) => r.supportTopicId)
      .filter((id): id is string => id != null);

    if (topicIds.length === 0) return [];

    const topics = await this.prisma.supportTopic.findMany({
      where: { id: { in: topicIds } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(topics.map((t) => [t.id, t.name]));

    return rows
      .filter((r) => r.supportTopicId != null)
      .map((r) => ({
        typeId: r.supportTopicId!,
        typeName: nameMap[r.supportTopicId!] ?? 'Unknown',
        count: r._count._all,
      }));
  }

  private async computeMaintenanceByLocation(
    baseWhere: Record<string, unknown>,
  ): Promise<
    { locationId: string; locationName: string; count: number }[]
  > {
    const rows = await this.prisma.ticket.groupBy({
      by: ['studioId'],
      where: {
        ...baseWhere,
        maintenanceCategoryId: { not: null },
        studioId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { studioId: 'desc' } },
    });

    const studioIds = rows
      .map((r) => r.studioId)
      .filter((id): id is string => id != null);

    if (studioIds.length === 0) return [];

    const studios = await this.prisma.studio.findMany({
      where: { id: { in: studioIds } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(studios.map((s) => [s.id, s.name]));

    return rows
      .filter((r) => r.studioId != null)
      .map((r) => ({
        locationId: r.studioId!,
        locationName: nameMap[r.studioId!] ?? 'Unknown',
        count: r._count._all,
      }));
  }

  private async computeByLocation(
    baseWhere: Record<string, unknown>,
  ): Promise<
    { locationId: string; locationName: string; count: number }[]
  > {
    const rows = await this.prisma.ticket.groupBy({
      by: ['studioId'],
      where: { ...baseWhere, studioId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { studioId: 'desc' } },
    });

    const studioIds = rows
      .map((r) => r.studioId)
      .filter((id): id is string => id != null);

    if (studioIds.length === 0) return [];

    const studios = await this.prisma.studio.findMany({
      where: { id: { in: studioIds } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(studios.map((s) => [s.id, s.name]));

    return rows
      .filter((r) => r.studioId != null)
      .map((r) => ({
        locationId: r.studioId!,
        locationName: nameMap[r.studioId!] ?? 'Unknown',
        count: r._count._all,
      }));
  }
}
