import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { DispatchFiltersDto } from './dto/dispatch-filters.dto';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  /** Build where clause for OPEN maintenance tickets only (Stage 13 dispatch). */
  buildOpenMaintenanceWhere(filters: DispatchFiltersDto): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {
      ticketClass: { code: 'MAINTENANCE' },
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    };
    if (filters.studioId) where.studioId = filters.studioId;
    if (filters.marketId) where.marketId = filters.marketId;
    if (filters.maintenanceCategoryId) where.maintenanceCategoryId = filters.maintenanceCategoryId;
    if (filters.priority) where.priority = filters.priority;
    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) where.createdAt.gte = new Date(filters.createdAfter);
      if (filters.createdBefore) where.createdAt.lte = new Date(filters.createdBefore);
    }
    return where;
  }

  // ── Overall summary stats ─────────────────────────────────────────────────
  async getSummary() {
    const [total, byStatus, avgResolutionMs] = await Promise.all([
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
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((row) => [row.status, row._count._all]),
    );

    const open = (statusMap['NEW'] ?? 0) +
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
    };
  }

  // ── Ticket volume over last N days ────────────────────────────────────────
  async getVolumeByDay(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const tickets = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const byDay = new Map<string, number>();
    for (const t of tickets) {
      const key = t.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
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

    const maintIds = byMaintenance.map((r) => r.maintenanceCategoryId).filter((id): id is string => id != null);
    const topicIds = bySupport.map((r) => r.supportTopicId).filter((id): id is string => id != null);

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

    const maintMap = Object.fromEntries(maintenanceCategories.map((c) => [c.id, c.name]));
    const topicMap = Object.fromEntries(supportTopics.map((t) => [t.id, t.name]));

    const result: { categoryId: string | null; categoryName: string; count: number }[] = [
      ...byMaintenance.map((r) => ({
        categoryId: r.maintenanceCategoryId,
        categoryName: r.maintenanceCategoryId ? (maintMap[r.maintenanceCategoryId] ?? 'Unknown') : 'Uncategorized',
        count: r._count._all,
      })),
      ...bySupport.map((r) => ({
        categoryId: r.supportTopicId,
        categoryName: r.supportTopicId ? (topicMap[r.supportTopicId] ?? 'Unknown') : 'Uncategorized',
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
      { user_id: string; user_name: string; avg_hours: number | null; closed_count: bigint }[]
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
    const studioIds = rows.map((r) => r.studioId).filter((id): id is string => id !== null);
    const studios = await this.prisma.studio.findMany({
      where: { id: { in: studioIds } },
      select: { id: true, name: true, marketId: true },
    });
    const markets = studioIds.length
      ? await this.prisma.market.findMany({
          where: { id: { in: studios.map((s) => s.marketId).filter(Boolean) as string[] } },
          select: { id: true, name: true },
        })
      : [];
    const marketMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));
    const studioMap = Object.fromEntries(studios.map((s) => [s.id, { name: s.name, marketName: marketMap[s.marketId ?? ''] ?? '' }]));
    return rows.map((r) => ({
      studioId: r.studioId,
      studioName: r.studioId ? (studioMap[r.studioId]?.name ?? 'Unknown') : 'No Studio',
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
    const categoryIds = rows.map((r) => r.maintenanceCategoryId).filter((id): id is string => id !== null);
    const categories = categoryIds.length
      ? await this.prisma.maintenanceCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      maintenanceCategoryId: r.maintenanceCategoryId,
      categoryName: r.maintenanceCategoryId ? (nameMap[r.maintenanceCategoryId] ?? 'Unknown') : 'Uncategorized',
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
    const marketIds = rows.map((r) => r.marketId).filter((id): id is string => id !== null);
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
    const studioIds = filtered.map((r) => r.studioId).filter((id): id is string => id !== null);
    const studios = studioIds.length
      ? await this.prisma.studio.findMany({
          where: { id: { in: studioIds } },
          select: { id: true, name: true, marketId: true },
        })
      : [];
    const markets = studios.length
      ? await this.prisma.market.findMany({
          where: { id: { in: studios.map((s) => s.marketId).filter(Boolean) as string[] } },
          select: { id: true, name: true },
        })
      : [];
    const marketMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));
    const studioMap = Object.fromEntries(studios.map((s) => [s.id, { name: s.name, marketName: marketMap[s.marketId ?? ''] ?? '' }]));
    return filtered.map((r) => ({
      studioId: r.studioId,
      studioName: r.studioId ? (studioMap[r.studioId]?.name ?? 'Unknown') : 'No Studio',
      marketName: r.studioId ? (studioMap[r.studioId]?.marketName ?? '') : '',
      count: r._count._all,
    }));
  }

  // ── CSV export of all tickets ─────────────────────────────────────────────
  async exportTicketsCsv(): Promise<string> {
    const tickets = await this.prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
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
        _count: { select: { comments: true, subtasks: true, attachments: true } },
      },
    });

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
      // Wrap in quotes if it contains commas, newlines, or quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = tickets.map((t) => [
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
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }
}
