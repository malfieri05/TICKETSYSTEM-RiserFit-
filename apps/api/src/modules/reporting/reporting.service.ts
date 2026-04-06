import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { DispatchFiltersDto } from './dto/dispatch-filters.dto';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  /** Build where clause for OPEN maintenance tickets only (Stage 13 dispatch). */
  buildOpenMaintenanceWhere(
    filters: DispatchFiltersDto,
  ): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {
      ticketClass: { code: 'MAINTENANCE' },
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    };
    if (filters.studioId) where.studioId = filters.studioId;
    if (filters.marketId) where.marketId = filters.marketId;
    if (filters.maintenanceCategoryId)
      where.maintenanceCategoryId = filters.maintenanceCategoryId;
    if (filters.priority) where.priority = filters.priority;
    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter)
        where.createdAt.gte = new Date(filters.createdAfter);
      if (filters.createdBefore)
        where.createdAt.lte = new Date(filters.createdBefore);
    }
    return where;
  }

  // ── Overall summary stats ─────────────────────────────────────────────────
  async getSummary() {
    const [total, byStatus, avgResolutionMs, avgFirstResponseMs] =
      await Promise.all([
        this.prisma.ticket.count(),

        this.prisma.ticket.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),

        // Average resolution time in hours for RESOLVED/CLOSED tickets
        this.prisma.$queryRaw<[{ avg_hours: number | null }]>`
        SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) AS avg_hours
        FROM tickets
        WHERE resolved_at IS NOT NULL
          AND status IN ('RESOLVED', 'CLOSED')
      `,

        // First response: created → first non-requester comment or first-ordered subtask status change
        this.prisma.$queryRaw<[{ avg_hours: number | null }]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 3600) AS avg_hours
        FROM tickets
        WHERE "firstResponseAt" IS NOT NULL
      `,
      ]);

    const statusMap = Object.fromEntries(
      byStatus.map((row) => [row.status, row._count._all]),
    );

    const open =
      (statusMap['NEW'] ?? 0) +
      (statusMap['TRIAGED'] ?? 0) +
      (statusMap['IN_PROGRESS'] ?? 0) +
      (statusMap['WAITING_ON_REQUESTER'] ?? 0) +
      (statusMap['WAITING_ON_VENDOR'] ?? 0);

    const resolved = (statusMap['RESOLVED'] ?? 0) + (statusMap['CLOSED'] ?? 0);

    return {
      total,
      open,
      resolved,
      avgResolutionHours: avgResolutionMs[0]?.avg_hours
        ? parseFloat(Number(avgResolutionMs[0].avg_hours).toFixed(1))
        : null,
      avgFirstResponseHours: avgFirstResponseMs[0]?.avg_hours
        ? parseFloat(Number(avgFirstResponseMs[0].avg_hours).toFixed(1))
        : null,
    };
  }

  // ── Ticket volume over last N days (days=0 → all time) ───────────────────
  async getVolumeByDay(days = 30) {
    const since =
      days > 0 ? new Date(Date.now() - days * 86_400_000) : null;

    // Created per day
    const createdRows: { day: Date; count: bigint }[] = since
      ? await this.prisma.$queryRaw`
          SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
          FROM tickets
          WHERE "createdAt" >= ${since}
          GROUP BY day ORDER BY day`
      : await this.prisma.$queryRaw`
          SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
          FROM tickets
          GROUP BY day ORDER BY day`;

    // Closed/resolved per day (use resolvedAt when set, else closedAt)
    const closedRows: { day: Date; count: bigint }[] = since
      ? await this.prisma.$queryRaw`
          SELECT date_trunc('day', COALESCE("resolvedAt", "closedAt")) AS day,
                 COUNT(*) AS count
          FROM tickets
          WHERE status IN ('RESOLVED', 'CLOSED')
            AND COALESCE("resolvedAt", "closedAt") IS NOT NULL
            AND COALESCE("resolvedAt", "closedAt") >= ${since}
          GROUP BY day ORDER BY day`
      : await this.prisma.$queryRaw`
          SELECT date_trunc('day', COALESCE("resolvedAt", "closedAt")) AS day,
                 COUNT(*) AS count
          FROM tickets
          WHERE status IN ('RESOLVED', 'CLOSED')
            AND COALESCE("resolvedAt", "closedAt") IS NOT NULL
          GROUP BY day ORDER BY day`;

    // Merge into a single date-keyed map
    const map = new Map<string, { count: number; closed: number }>();

    for (const r of createdRows) {
      const key = r.day.toISOString().slice(0, 10);
      const entry = map.get(key) ?? { count: 0, closed: 0 };
      entry.count = Number(r.count);
      map.set(key, entry);
    }

    for (const r of closedRows) {
      const key = r.day.toISOString().slice(0, 10);
      const entry = map.get(key) ?? { count: 0, closed: 0 };
      entry.closed = Number(r.count);
      map.set(key, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, closed }]) => ({ date, count, closed }));
  }

  private parseVolumeDayBoundary(isoDate: string, endOfDay: boolean): Date {
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

  /** Ticket volume per day for tickets created / closed in an inclusive calendar range (aligns with dashboard KPI timeframe). */
  async getVolumeByDayInRange(fromStr: string, toStr: string) {
    const fromStart = this.parseVolumeDayBoundary(fromStr, false);
    const toEnd = this.parseVolumeDayBoundary(toStr, true);
    if (fromStart.getTime() > toEnd.getTime()) {
      throw new BadRequestException('"from" must be on or before "to"');
    }

    const createdRows: { day: Date; count: bigint }[] = await this.prisma
      .$queryRaw`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
      FROM tickets
      WHERE "createdAt" >= ${fromStart}
        AND "createdAt" <= ${toEnd}
      GROUP BY day ORDER BY day`;

    const closedRows: { day: Date; count: bigint }[] = await this.prisma
      .$queryRaw`
      SELECT date_trunc('day', COALESCE("resolvedAt", "closedAt")) AS day,
             COUNT(*) AS count
      FROM tickets
      WHERE status IN ('RESOLVED', 'CLOSED')
        AND COALESCE("resolvedAt", "closedAt") IS NOT NULL
        AND COALESCE("resolvedAt", "closedAt") >= ${fromStart}
        AND COALESCE("resolvedAt", "closedAt") <= ${toEnd}
      GROUP BY day ORDER BY day`;

    const map = new Map<string, { count: number; closed: number }>();

    for (const r of createdRows) {
      const key = r.day.toISOString().slice(0, 10);
      const entry = map.get(key) ?? { count: 0, closed: 0 };
      entry.count = Number(r.count);
      map.set(key, entry);
    }

    for (const r of closedRows) {
      const key = r.day.toISOString().slice(0, 10);
      const entry = map.get(key) ?? { count: 0, closed: 0 };
      entry.closed = Number(r.count);
      map.set(key, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, closed }]) => ({ date, count, closed }));
  }

  // ── Breakdown by status ───────────────────────────────────────────────────
  async getByStatus() {
    const rows = await this.prisma.ticket.groupBy({
      by: ['status'],
      _count: { _all: true },
      orderBy: { _count: { status: 'desc' } },
    });

    return rows.map((r) => ({ status: r.status, count: r._count._all }));
  }

  // ── Breakdown by priority ─────────────────────────────────────────────────
  async getByPriority() {
    const rows = await this.prisma.ticket.groupBy({
      by: ['priority'],
      _count: { _all: true },
    });

    const order = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
    return rows
      .sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority))
      .map((r) => ({ priority: r.priority, count: r._count._all }));
  }

  // ── Breakdown by taxonomy (maintenance category + support topic) ───────────
  async getByCategory() {
    const [byMaintenance, bySupport] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['maintenanceCategoryId'],
        where: { maintenanceCategoryId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { maintenanceCategoryId: 'desc' } },
      }),
      this.prisma.ticket.groupBy({
        by: ['supportTopicId'],
        where: { supportTopicId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { supportTopicId: 'desc' } },
      }),
    ]);

    const maintIds = byMaintenance
      .map((r) => r.maintenanceCategoryId)
      .filter((id): id is string => id != null);
    const topicIds = bySupport
      .map((r) => r.supportTopicId)
      .filter((id): id is string => id != null);

    const [maintenanceCategories, supportTopics] = await Promise.all([
      maintIds.length > 0
        ? this.prisma.maintenanceCategory.findMany({
            where: { id: { in: maintIds } },
            select: { id: true, name: true },
          })
        : [],
      topicIds.length > 0
        ? this.prisma.supportTopic.findMany({
            where: { id: { in: topicIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const maintMap = Object.fromEntries(
      maintenanceCategories.map((c) => [c.id, c.name]),
    );
    const topicMap = Object.fromEntries(
      supportTopics.map((t) => [t.id, t.name]),
    );

    const result: {
      categoryId: string | null;
      categoryName: string;
      count: number;
    }[] = [
      ...byMaintenance.map((r) => ({
        categoryId: r.maintenanceCategoryId,
        categoryName: r.maintenanceCategoryId
          ? (maintMap[r.maintenanceCategoryId] ?? 'Unknown')
          : 'Uncategorized',
        count: r._count._all,
      })),
      ...bySupport.map((r) => ({
        categoryId: r.supportTopicId,
        categoryName: r.supportTopicId
          ? (topicMap[r.supportTopicId] ?? 'Unknown')
          : 'Uncategorized',
        count: r._count._all,
      })),
    ];
    result.sort((a, b) => b.count - a.count);
    return result;
  }

  // ── Breakdown by market ───────────────────────────────────────────────────
  async getByMarket() {
    const rows = await this.prisma.ticket.groupBy({
      by: ['marketId'],
      _count: { _all: true },
      orderBy: { _count: { marketId: 'desc' } },
    });

    const marketIds = rows
      .map((r) => r.marketId)
      .filter((id): id is string => id !== null);

    const markets = await this.prisma.market.findMany({
      where: { id: { in: marketIds } },
      select: { id: true, name: true },
    });

    const nameMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));

    return rows.map((r) => ({
      marketId: r.marketId,
      marketName: r.marketId ? (nameMap[r.marketId] ?? 'Unknown') : 'No Market',
      count: r._count._all,
    }));
  }

  // ── Resolution time by taxonomy (avg hours) ─────────────────────────────
  async getResolutionTimeByCategory() {
    const rows = await this.prisma.$queryRaw<
      { taxonomy_name: string; avg_hours: number; ticket_count: bigint }[]
    >`
      SELECT
        COALESCE(m.name, s.name, 'Uncategorized') AS taxonomy_name,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric,
          1
        )::float AS avg_hours,
        COUNT(*)::bigint AS ticket_count
      FROM tickets t
      LEFT JOIN maintenance_categories m ON m.id = t.maintenance_category_id
      LEFT JOIN support_topics s ON s.id = t.support_topic_id
      WHERE t.resolved_at IS NOT NULL
        AND t.status IN ('RESOLVED', 'CLOSED')
      GROUP BY m.name, s.name
      ORDER BY avg_hours ASC
    `;

    return rows.map((r) => ({
      categoryName: r.taxonomy_name,
      avgHours: Number(r.avg_hours),
      ticketCount: Number(r.ticket_count),
    }));
  }

  // ── Completion time by owner (avg hours) ───────────────────────────────────
  async getCompletionTimeByOwner() {
    const rows = await this.prisma.$queryRaw<
      {
        user_id: string;
        user_name: string;
        avg_hours: number | null;
        closed_count: bigint;
      }[]
    >`
      SELECT
        u.id                                        AS user_id,
        u.name                                      AS user_name,
        AVG(EXTRACT(EPOCH FROM (COALESCE(t.closed_at, t.resolved_at) - t.created_at)) / 3600)
          FILTER (WHERE t.closed_at IS NOT NULL OR t.resolved_at IS NOT NULL) AS avg_hours,
        COUNT(*) FILTER (WHERE t.status IN ('RESOLVED','CLOSED'))             AS closed_count
      FROM tickets t
      JOIN users   u ON u.id = t.owner_id
      GROUP BY u.id, u.name
      ORDER BY avg_hours NULLS LAST
    `;

    return rows
      .filter((r) => r.avg_hours !== null)
      .map((r) => ({
        userId: r.user_id,
        userName: r.user_name,
        avgHours: r.avg_hours ? Number(r.avg_hours.toFixed(1)) : null,
        closedCount: Number(r.closed_count),
      }));
  }

  // ── Dispatch: open maintenance only (Stage 13) ─────────────────────────────
  async getDispatchByStudio(filters: DispatchFiltersDto) {
    const where = this.buildOpenMaintenanceWhere(filters);
    const rows = await this.prisma.ticket.groupBy({
      by: ['studioId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { studioId: 'desc' } },
    });
    const studioIds = rows
      .map((r) => r.studioId)
      .filter((id): id is string => id !== null);
    const studios = await this.prisma.studio.findMany({
      where: { id: { in: studioIds } },
      select: { id: true, name: true, marketId: true },
    });
    const markets = studioIds.length
      ? await this.prisma.market.findMany({
          where: {
            id: {
              in: studios.map((s) => s.marketId).filter(Boolean),
            },
          },
          select: { id: true, name: true },
        })
      : [];
    const marketMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));
    const studioMap = Object.fromEntries(
      studios.map((s) => [
        s.id,
        { name: s.name, marketName: marketMap[s.marketId ?? ''] ?? '' },
      ]),
    );
    return rows.map((r) => ({
      studioId: r.studioId,
      studioName: r.studioId
        ? (studioMap[r.studioId]?.name ?? 'Unknown')
        : 'No Studio',
      marketName: r.studioId ? (studioMap[r.studioId]?.marketName ?? '') : '',
      count: r._count._all,
    }));
  }

  async getDispatchByCategory(filters: DispatchFiltersDto) {
    const where = this.buildOpenMaintenanceWhere(filters);
    const rows = await this.prisma.ticket.groupBy({
      by: ['maintenanceCategoryId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { maintenanceCategoryId: 'desc' } },
    });
    const categoryIds = rows
      .map((r) => r.maintenanceCategoryId)
      .filter((id): id is string => id !== null);
    const categories = categoryIds.length
      ? await this.prisma.maintenanceCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      maintenanceCategoryId: r.maintenanceCategoryId,
      categoryName: r.maintenanceCategoryId
        ? (nameMap[r.maintenanceCategoryId] ?? 'Unknown')
        : 'Uncategorized',
      count: r._count._all,
    }));
  }

  async getDispatchByMarket(filters: DispatchFiltersDto) {
    const where = this.buildOpenMaintenanceWhere(filters);
    const rows = await this.prisma.ticket.groupBy({
      by: ['marketId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { marketId: 'desc' } },
    });
    const marketIds = rows
      .map((r) => r.marketId)
      .filter((id): id is string => id !== null);
    const markets = marketIds.length
      ? await this.prisma.market.findMany({
          where: { id: { in: marketIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));
    return rows.map((r) => ({
      marketId: r.marketId,
      marketName: r.marketId ? (nameMap[r.marketId] ?? 'Unknown') : 'No Market',
      count: r._count._all,
    }));
  }

  async getDispatchStudiosWithMultiple(filters: DispatchFiltersDto) {
    const where = this.buildOpenMaintenanceWhere(filters);
    const rows = await this.prisma.ticket.groupBy({
      by: ['studioId'],
      where,
      _count: { _all: true },
    });
    const filtered = rows.filter((r) => r._count._all >= 2);
    const studioIds = filtered
      .map((r) => r.studioId)
      .filter((id): id is string => id !== null);
    const studios = studioIds.length
      ? await this.prisma.studio.findMany({
          where: { id: { in: studioIds } },
          select: { id: true, name: true, marketId: true },
        })
      : [];
    const markets = studios.length
      ? await this.prisma.market.findMany({
          where: {
            id: {
              in: studios.map((s) => s.marketId).filter(Boolean),
            },
          },
          select: { id: true, name: true },
        })
      : [];
    const marketMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));
    const studioMap = Object.fromEntries(
      studios.map((s) => [
        s.id,
        { name: s.name, marketName: marketMap[s.marketId ?? ''] ?? '' },
      ]),
    );
    return filtered.map((r) => ({
      studioId: r.studioId,
      studioName: r.studioId
        ? (studioMap[r.studioId]?.name ?? 'Unknown')
        : 'No Studio',
      marketName: r.studioId ? (studioMap[r.studioId]?.marketName ?? '') : '',
      count: r._count._all,
    }));
  }

  // ── Workflow / subtask completion timing ────────────────────────────────────
  async getWorkflowTiming() {
    const templates = await this.prisma.subtaskWorkflowTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        subtaskTemplates: {
          select: { id: true, title: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (templates.length === 0) return { workflows: [] };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allTemplateIds = templates.map((t) => t.id);
    const allSubtaskTemplateIds = templates.flatMap((t) =>
      t.subtaskTemplates.map((st) => st.id),
    );

    // ── Two batched queries replace N + N*M individual queries ──────────────

    // 1. Ticket completion averages per workflow template (one query)
    const ticketAvgRows = await this.prisma.$queryRaw<
      { workflow_template_id: string; avg_hours: number | null }[]
    >`
      SELECT
        st.workflow_template_id,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric,
          1
        )::float AS avg_hours
      FROM tickets t
      JOIN subtasks s ON s.ticket_id = t.id
      JOIN subtask_templates st ON st.id = s.subtask_template_id
      WHERE t.status IN ('RESOLVED', 'CLOSED')
        AND t.resolved_at IS NOT NULL
        AND t.resolved_at >= ${thirtyDaysAgo}
        AND st.workflow_template_id = ANY(${allTemplateIds})
      GROUP BY st.workflow_template_id
    `;

    // 2. Step timings for all subtask templates (one query)
    const stepTimingRows = await this.prisma.$queryRaw<
      {
        subtask_template_id: string;
        avg_completion_hours: number | null;
        avg_active_hours: number | null;
      }[]
    >`
      SELECT
        s.subtask_template_id,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (s.completed_at - s.available_at)) / 3600)::numeric,
          1
        )::float AS avg_completion_hours,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 3600)::numeric,
          1
        )::float AS avg_active_hours
      FROM subtasks s
      WHERE s.subtask_template_id = ANY(${allSubtaskTemplateIds})
        AND s.completed_at IS NOT NULL
        AND s.available_at IS NOT NULL
        AND s.completed_at >= ${thirtyDaysAgo}
      GROUP BY s.subtask_template_id
    `;

    // ── Assemble in memory ───────────────────────────────────────────────────

    const ticketAvgByTemplate = new Map(
      ticketAvgRows.map((r) => [r.workflow_template_id, r.avg_hours]),
    );
    const stepTimingById = new Map(
      stepTimingRows.map((r) => [r.subtask_template_id, r]),
    );

    const workflows = templates.map((tpl) => {
      const avgHours = ticketAvgByTemplate.get(tpl.id) ?? null;
      const steps = tpl.subtaskTemplates.map((st) => {
        const timing = stepTimingById.get(st.id);
        return {
          stepId: st.id,
          stepName: st.title,
          avgSubtaskCompletionHours:
            timing?.avg_completion_hours != null
              ? Number(timing.avg_completion_hours)
              : null,
          avgActiveWorkHours:
            timing?.avg_active_hours != null
              ? Number(timing.avg_active_hours)
              : null,
        };
      });
      return {
        workflowId: tpl.id,
        workflowName: tpl.name ?? tpl.id,
        avgTicketCompletionHours: avgHours != null ? Number(avgHours) : null,
        steps,
      };
    });

    return { workflows };
  }

  // ── CSV export of all tickets ─────────────────────────────────────────────
  // Batched cursor-based approach: fetches BATCH_SIZE rows at a time and
  // assembles the CSV incrementally, avoiding loading all tickets into memory.
  async exportTicketsCsv(): Promise<string> {
    const BATCH_SIZE = 500;

    const headers = [
      'ID',
      'Title',
      'Status',
      'Priority',
      'Category',
      'Market',
      'Studio',
      'Requester',
      'Requester Email',
      'Owner',
      'Owner Email',
      'Comments',
      'Subtasks',
      'Attachments',
      'Created At',
      'Resolved At',
      'Closed At',
    ];

    const escape = (val: string | null | undefined) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const ticketSelect = {
      id: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      closedAt: true,
      description: true,
      requester: { select: { name: true, email: true } },
      owner: { select: { name: true, email: true } },
      supportTopic: { select: { name: true } },
      maintenanceCategory: { select: { name: true } },
      market: { select: { name: true } },
      studio: { select: { name: true } },
      _count: {
        select: { comments: true, subtasks: true, attachments: true },
      },
    } as const;

    const csvLines: string[] = [headers.join(',')];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.prisma.ticket.findMany({
        orderBy: { createdAt: 'desc' },
        select: ticketSelect,
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;

      for (const t of batch) {
        csvLines.push(
          [
            t.id,
            escape(t.title),
            t.status,
            t.priority,
            escape(t.maintenanceCategory?.name ?? t.supportTopic?.name ?? null),
            escape(t.market?.name),
            escape(t.studio?.name),
            escape(t.requester?.name),
            escape(t.requester?.email),
            escape(t.owner?.name ?? ''),
            escape(t.owner?.email ?? ''),
            t._count.comments,
            t._count.subtasks,
            t._count.attachments,
            t.createdAt.toISOString(),
            t.resolvedAt?.toISOString() ?? '',
            t.closedAt?.toISOString() ?? '',
          ].join(','),
        );
      }

      if (batch.length < BATCH_SIZE) break; // last page
      cursor = batch[batch.length - 1].id;
    }

    return csvLines.join('\n');
  }
}
