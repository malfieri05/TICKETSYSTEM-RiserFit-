import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

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

  // ── Breakdown by category ─────────────────────────────────────────────────
  async getByCategory() {
    const rows = await this.prisma.ticket.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
      orderBy: { _count: { categoryId: 'desc' } },
    });

    // Fetch category names
    const categoryIds = rows
      .map((r) => r.categoryId)
      .filter((id): id is string => id !== null);

    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    const nameMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryId ? (nameMap[r.categoryId] ?? 'Unknown') : 'Uncategorized',
      count: r._count._all,
    }));
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

  // ── Resolution time by category (avg hours) ───────────────────────────────
  async getResolutionTimeByCategory() {
    const rows = await this.prisma.$queryRaw<
      { category_name: string; avg_hours: number; ticket_count: bigint }[]
    >`
      SELECT
        COALESCE(c.name, 'Uncategorized') AS category_name,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric,
          1
        )::float                          AS avg_hours,
        COUNT(*)                          AS ticket_count
      FROM   tickets t
      LEFT   JOIN categories c ON c.id = t.category_id
      WHERE  t.resolved_at IS NOT NULL
        AND  t.status IN ('RESOLVED', 'CLOSED')
      GROUP  BY c.name
      ORDER  BY avg_hours ASC
    `;

    return rows.map((r) => ({
      categoryName: r.category_name,
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
        category: { select: { name: true } },
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
      escape(t.category?.name),
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
