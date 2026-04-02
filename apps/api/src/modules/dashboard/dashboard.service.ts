import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';

export interface DashboardSummaryDto {
  newTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  /** Tickets resolved/closed in the KPI window when `kpiRange` is set; otherwise same as legacy resolved snapshot. */
  closedTickets: number;
  avgCompletionHours: number | null;
  /** Tickets created in the window with a recorded first response; avg hours from created → first response. */
  avgFirstResponseHours: number | null;
  /** When set, top KPI cards use this inclusive date range (YYYY-MM-DD). */
  kpiRange?: { from: string; to: string };
  /** Support tickets grouped by department. */
  supportByDepartment: { deptId: string; deptName: string; count: number }[];
  /** Support tickets grouped by support topic. */
  supportByType: { typeId: string; typeName: string; count: number }[];
  /** Maintenance tickets grouped by maintenance category. */
  maintenanceByCategory: { categoryId: string; categoryName: string; count: number }[];
  /** Maintenance tickets grouped by studio location. */
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
  avgFirstResponseHours: number | null;
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
    fromStr?: string,
    toStr?: string,
  ): Promise<DashboardSummaryDto | StudioDashboardSummaryDto> {
    if (actor.role === Role.STUDIO_USER) {
      return this.getStudioSummary(actor, studioId);
    }
    return this.getAdminOrDeptSummary(actor, fromStr, toStr);
  }

  private parseDayBoundary(isoDate: string, endOfDay: boolean): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
    if (!m) {
      throw new BadRequestException(
        `Invalid date "${isoDate}" — expected YYYY-MM-DD`,
      );
    }
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 0, 0, 0, 0);
    if (endOfDay) {
      dt.setHours(23, 59, 59, 999);
    }
    return dt;
  }

  private async computeKpiForWindow(
    baseWhere: Prisma.TicketWhereInput,
    fromStart: Date,
    toEnd: Date,
  ): Promise<{
    newTickets: number;
    inProgressTickets: number;
    closedTickets: number;
    avgFirstResponseHours: number | null;
    avgResolutionHours: number | null;
  }> {
    const createdInRange: Prisma.TicketWhereInput = {
      createdAt: { gte: fromStart, lte: toEnd },
    };
    const updatedInRange: Prisma.TicketWhereInput = {
      updatedAt: { gte: fromStart, lte: toEnd },
    };
    const closedInRange: Prisma.TicketWhereInput = {
      status: { in: ['RESOLVED', 'CLOSED'] },
      OR: [
        { resolvedAt: { gte: fromStart, lte: toEnd } },
        {
          AND: [
            { resolvedAt: null },
            { closedAt: { gte: fromStart, lte: toEnd } },
          ],
        },
      ],
    };

    const [newTickets, inProgressTickets, closedTickets] = await Promise.all([
      this.prisma.ticket.count({
        where: { AND: [baseWhere, createdInRange] },
      }),
      this.prisma.ticket.count({
        where: {
          AND: [
            baseWhere,
            { status: 'IN_PROGRESS' },
            updatedInRange,
          ],
        },
      }),
      this.prisma.ticket.count({
        where: { AND: [baseWhere, closedInRange] },
      }),
    ]);

    const firstRows = await this.prisma.ticket.findMany({
      where: {
        AND: [baseWhere, createdInRange, { firstResponseAt: { not: null } }],
      },
      select: { createdAt: true, firstResponseAt: true },
    });
    const avgFirstResponseHours =
      firstRows.length === 0
        ? null
        : Math.round(
            (firstRows.reduce(
              (a, t) =>
                a +
                (t.firstResponseAt!.getTime() - t.createdAt.getTime()) /
                  (1000 * 60 * 60),
              0,
            ) /
              firstRows.length) *
              10,
          ) / 10;

    const resolvedRows = await this.prisma.ticket.findMany({
      where: { AND: [baseWhere, closedInRange] },
      select: { createdAt: true, resolvedAt: true, closedAt: true },
    });
    const deltas = resolvedRows
      .map((t) => {
        const end = t.resolvedAt ?? t.closedAt;
        if (!end) return null;
        return (end.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
      })
      .filter((x): x is number => x != null);
    const avgResolutionHours =
      deltas.length === 0
        ? null
        : Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) /
          10;

    return {
      newTickets,
      inProgressTickets,
      closedTickets,
      avgFirstResponseHours,
      avgResolutionHours,
    };
  }

  private async getAdminOrDeptSummary(
    actor: RequestUser,
    fromStr?: string,
    toStr?: string,
  ): Promise<DashboardSummaryDto> {
    const where = this.visibility.buildWhereClause(actor);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [supportByDepartment, supportByType, maintenanceByCategory, maintenanceByLocation] =
      await Promise.all([
        this.computeSupportByDepartment(where),
        this.computeSupportByType(where),
        this.computeMaintenanceByCategory(where),
        this.computeMaintenanceByLocation(where),
      ]);

    if (fromStr && toStr) {
      const fromStart = this.parseDayBoundary(fromStr, false);
      const toEnd = this.parseDayBoundary(toStr, true);
      if (fromStart.getTime() > toEnd.getTime()) {
        throw new BadRequestException('"from" must be on or before "to"');
      }
      const k = await this.computeKpiForWindow(where, fromStart, toEnd);
      return {
        newTickets: k.newTickets,
        inProgressTickets: k.inProgressTickets,
        resolvedTickets: k.closedTickets,
        closedTickets: k.closedTickets,
        avgCompletionHours: k.avgResolutionHours,
        avgFirstResponseHours: k.avgFirstResponseHours,
        kpiRange: { from: fromStr.trim(), to: toStr.trim() },
        supportByDepartment,
        supportByType,
        maintenanceByCategory,
        maintenanceByLocation,
      };
    }

    const [
      newTickets,
      inProgressTickets,
      resolvedTickets,
      avgResult,
      avgFirstResponse,
    ] = await Promise.all([
      this.prisma.ticket.count({ where: { ...where, status: 'NEW' } }),
      this.prisma.ticket.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      this.prisma.ticket.count({
        where: { ...where, status: { in: ['RESOLVED', 'CLOSED'] } },
      }),
      this.computeAvgCompletion(where, thirtyDaysAgo),
      this.computeAvgFirstResponse(where, thirtyDaysAgo),
    ]);

    return {
      newTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets: resolvedTickets,
      avgCompletionHours: avgResult,
      avgFirstResponseHours: avgFirstResponse,
      supportByDepartment,
      supportByType,
      maintenanceByCategory,
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
          avgFirstResponseHours: null,
          byLocation: [],
        };
      }
      where = { ...where, studioId };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [openTickets, completedTickets, avgResult, avgFirstResponse, byLocation] =
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
        this.computeAvgFirstResponse(where, thirtyDaysAgo),
        this.computeByLocation(where),
      ]);

    return {
      openTickets,
      completedTickets,
      avgCompletionHours: avgResult,
      avgFirstResponseHours: avgFirstResponse,
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

  /** Among tickets created in the last window, average hours from creation to first response (when set). */
  private async computeAvgFirstResponse(
    baseWhere: Prisma.TicketWhereInput,
    since: Date,
  ): Promise<number | null> {
    const rows = await this.prisma.ticket.findMany({
      where: {
        ...baseWhere,
        createdAt: { gte: since },
        firstResponseAt: { not: null },
      },
      select: { createdAt: true, firstResponseAt: true },
    });
    if (rows.length === 0) return null;
    const totalHours =
      rows.reduce(
        (acc, t) =>
          acc +
          ((t.firstResponseAt!.getTime() - t.createdAt.getTime()) /
            (1000 * 60 * 60)),
        0,
      ) / rows.length;
    return Math.round(totalHours * 10) / 10;
  }

  private async computeSupportByDepartment(
    baseWhere: Record<string, unknown>,
  ): Promise<{ deptId: string; deptName: string; count: number }[]> {
    const rows = await this.prisma.ticket.groupBy({
      by: ['departmentId'],
      where: { ...baseWhere, departmentId: { not: null }, maintenanceCategoryId: null },
      _count: { _all: true },
      orderBy: { _count: { departmentId: 'desc' } },
    });

    const deptIds = rows
      .map((r) => r.departmentId)
      .filter((id): id is string => id != null);

    if (deptIds.length === 0) return [];

    const depts = await this.prisma.taxonomyDepartment.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(depts.map((d) => [d.id, d.name]));

    return rows
      .filter((r) => r.departmentId != null)
      .map((r) => ({
        deptId: r.departmentId!,
        deptName: nameMap[r.departmentId!] ?? 'Unknown',
        count: r._count._all,
      }));
  }

  private async computeMaintenanceByCategory(
    baseWhere: Record<string, unknown>,
  ): Promise<{ categoryId: string; categoryName: string; count: number }[]> {
    const rows = await this.prisma.ticket.groupBy({
      by: ['maintenanceCategoryId'],
      where: { ...baseWhere, maintenanceCategoryId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { maintenanceCategoryId: 'desc' } },
    });

    const catIds = rows
      .map((r) => r.maintenanceCategoryId)
      .filter((id): id is string => id != null);

    if (catIds.length === 0) return [];

    const cats = await this.prisma.maintenanceCategory.findMany({
      where: { id: { in: catIds } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

    return rows
      .filter((r) => r.maintenanceCategoryId != null)
      .map((r) => ({
        categoryId: r.maintenanceCategoryId!,
        categoryName: nameMap[r.maintenanceCategoryId!] ?? 'Unknown',
        count: r._count._all,
      }));
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
