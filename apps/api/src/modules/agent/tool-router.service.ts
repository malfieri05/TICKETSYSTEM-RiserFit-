import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HybridRetrievalService } from '../ai/hybrid-retrieval.service';
import { TicketsService } from '../tickets/tickets.service';
import { ReportingService } from '../reporting/reporting.service';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  Role,
  TicketStatus,
  Priority,
  SubtaskStatus,
  Prisma,
} from '@prisma/client';
import { buildTicketCreatedAtFilter } from './ticket-metrics-where';
import { FirstResponseService } from '../../common/first-response/first-response.service';

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

@Injectable()
export class ToolRouterService {
  private readonly logger = new Logger(ToolRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hybridRetrieval: HybridRetrievalService,
    private readonly ticketsService: TicketsService,
    private readonly reportingService: ReportingService,
    private readonly ticketVisibility: TicketVisibilityService,
    private readonly firstResponse: FirstResponseService,
  ) {}

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    actor: RequestUser,
  ): Promise<ToolResult> {
    const start = Date.now();
    try {
      const data = await this.route(toolName, args, actor);
      this.logger.debug(`Tool ${toolName} executed in ${Date.now() - start}ms`);
      return { success: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Tool ${toolName} failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private async route(
    toolName: string,
    args: Record<string, unknown>,
    actor: RequestUser,
  ): Promise<unknown> {
    switch (toolName) {
      case 'get_current_user_context':
        return this.getUserContext(actor);
      case 'search_tickets':
        return this.searchTickets(args, actor);
      case 'get_ticket':
        return this.getTicket(args, actor);
      case 'create_ticket':
        return this.createTicket(args, actor);
      case 'update_ticket_status':
        return this.updateTicketStatus(args, actor);
      case 'assign_ticket':
        return this.assignTicket(args, actor);
      case 'add_ticket_comment':
        return this.addComment(args, actor);
      case 'create_subtask':
        return this.createSubtask(args, actor);
      case 'update_subtask_status':
        return this.updateSubtaskStatus(args, actor);
      case 'get_ticket_metrics':
        return this.getMetrics(args, actor);
      case 'query_user_rollups':
        return this.queryUserRollups(args, actor);
      case 'knowledge_search':
        return this.knowledgeSearch(args);
      case 'list_categories':
        return this.listCategories();
      case 'list_users':
        return this.listUsers(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // ── get_current_user_context ────────────────────────────────────────────────

  private async getUserContext(actor: RequestUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        teamId: true,
        studioId: true,
        marketId: true,
        team: { select: { id: true, name: true } },
        studio: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
      },
    });
    return {
      user_id: user?.id,
      role: user?.role,
      team: user?.team,
      studio: user?.studio,
      market: user?.market,
    };
  }

  // ── search_tickets ──────────────────────────────────────────────────────────

  private async searchTickets(
    args: Record<string, unknown>,
    actor: RequestUser,
  ) {
    const limit = Math.min(Number(args.limit) || 10, 25);
    const where: Prisma.TicketWhereInput = {};

    if (args.query) {
      where.OR = [
        { title: { contains: String(args.query), mode: 'insensitive' } },
        { description: { contains: String(args.query), mode: 'insensitive' } },
      ];
    }
    if (Array.isArray(args.status) && args.status.length > 0) {
      where.status = { in: args.status as TicketStatus[] };
    }
    if (Array.isArray(args.priority) && args.priority.length > 0) {
      where.priority = { in: args.priority as Priority[] };
    }
    if (args.category_id)
      where.maintenanceCategoryId = String(args.category_id);
    if (args.owner_user_id) where.ownerId = String(args.owner_user_id);
    if (args.requester_user_id)
      where.requesterId = String(args.requester_user_id);

    // RBAC: Studio users can only see their own tickets
    if (actor.role === 'STUDIO_USER') {
      where.requesterId = actor.id;
    }

    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        ticketClass: { select: { code: true, name: true } },
        department: { select: { name: true } },
        supportTopic: { select: { name: true } },
        maintenanceCategory: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        studio: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
        _count: { select: { comments: true, subtasks: true } },
      },
    });

    return { count: tickets.length, tickets };
  }

  // ── get_ticket ──────────────────────────────────────────────────────────────

  private async getTicket(args: Record<string, unknown>, actor: RequestUser) {
    const ticketId = String(args.ticket_id);
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        closedAt: true,
        ticketClass: { select: { code: true, name: true } },
        department: { select: { name: true } },
        supportTopic: { select: { name: true } },
        maintenanceCategory: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        studio: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, name: true } },
          },
        },
        subtasks: {
          select: {
            id: true,
            title: true,
            status: true,
            owner: { select: { id: true, name: true } },
          },
        },
        watchers: {
          select: { userId: true, user: { select: { name: true } } },
        },
      },
    });

    return ticket;
  }

  // ── create_ticket ───────────────────────────────────────────────────────────

  private async createTicket(
    args: Record<string, unknown>,
    actor: RequestUser,
  ) {
    const maintenanceCategoryId = args.category_id
      ? String(args.category_id)
      : await this.getDefaultMaintenanceCategoryId();
    const ticketClass = await this.prisma.ticketClass.findFirstOrThrow({
      where: { code: 'MAINTENANCE', isActive: true },
      select: { id: true },
    });

    const dto = {
      title: String(args.title),
      description: args.description ? String(args.description) : '',
      priority: (args.priority as Priority) || 'MEDIUM',
      ticketClassId: ticketClass.id,
      maintenanceCategoryId,
      ownerId:
        args.owner_user_id && this.canAssign(actor)
          ? String(args.owner_user_id)
          : undefined,
    };

    const ticket = await this.ticketsService.create(dto, actor);
    return {
      ticket_id: ticket.id,
      title: ticket.title,
      status: ticket.status,
    };
  }

  // ── update_ticket_status ────────────────────────────────────────────────────

  private async updateTicketStatus(
    args: Record<string, unknown>,
    actor: RequestUser,
  ) {
    const ticketId = String(args.ticket_id);
    const newStatus = String(args.new_status) as TicketStatus;

    if (!this.canManageTickets(actor)) {
      throw new ForbiddenException(
        'You do not have permission to change ticket status',
      );
    }

    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { status: true },
    });
    const oldStatus = ticket.status;

    const timestamps: Prisma.TicketUpdateInput = {};
    if (newStatus === 'RESOLVED') timestamps.resolvedAt = new Date();
    if (newStatus === 'CLOSED') timestamps.closedAt = new Date();

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: newStatus, ...timestamps },
      select: { id: true, title: true, status: true },
    });

    await this.writeAuditLog(
      actor.id,
      'STATUS_CHANGED',
      'Ticket',
      ticketId,
      ticketId,
      { oldStatus },
      { newStatus },
    );
    return {
      ticket_id: updated.id,
      old_status: oldStatus,
      new_status: updated.status,
    };
  }

  // ── assign_ticket ───────────────────────────────────────────────────────────

  private async assignTicket(
    args: Record<string, unknown>,
    actor: RequestUser,
  ) {
    if (!this.canAssign(actor)) {
      throw new ForbiddenException(
        'You do not have permission to assign tickets',
      );
    }

    const ticketId = String(args.ticket_id);
    const ownerId = args.owner_user_id ? String(args.owner_user_id) : null;

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { ownerId },
      select: {
        id: true,
        title: true,
        owner: { select: { id: true, name: true } },
      },
    });

    await this.writeAuditLog(
      actor.id,
      'ASSIGNED',
      'Ticket',
      ticketId,
      ticketId,
      null,
      { ownerId },
    );
    return {
      ticket_id: updated.id,
      assigned_to: updated.owner?.name ?? 'Unassigned',
    };
  }

  // ── add_ticket_comment ──────────────────────────────────────────────────────

  private async addComment(args: Record<string, unknown>, actor: RequestUser) {
    const ticketId = String(args.ticket_id);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { requesterId: true },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }
    // Internal notes feature removed; all comments are public.
    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: actor.id,
        body: String(args.body),
        isInternal: false,
      },
      select: { id: true, body: true, createdAt: true },
    });

    await this.firstResponse.recordNonRequesterComment(
      this.prisma,
      ticketId,
      ticket.requesterId,
      actor.id,
      comment.createdAt,
    );

    await this.writeAuditLog(
      actor.id,
      'COMMENTED',
      'TicketComment',
      comment.id,
      ticketId,
    );
    return { comment_id: comment.id, ticket_id: ticketId };
  }

  // ── create_subtask ──────────────────────────────────────────────────────────

  private async createSubtask(
    args: Record<string, unknown>,
    actor: RequestUser,
  ) {
    if (!this.canManageTickets(actor)) {
      throw new ForbiddenException(
        'You do not have permission to create subtasks',
      );
    }

    // Optional: use actor's team or first available (subtasks can exist without a team)
    const teamId =
      (actor as any).teamId ??
      (await this.getDefaultTeamId().catch(() => undefined));

    const subtask = await this.prisma.subtask.create({
      data: {
        ticketId: String(args.ticket_id),
        title: String(args.title),
        ...(teamId && { teamId }),
        ownerId: args.owner_user_id ? String(args.owner_user_id) : null,
        availableAt: new Date(),
      },
      select: { id: true, title: true, status: true },
    });

    await this.writeAuditLog(
      actor.id,
      'SUBTASK_CREATED',
      'Subtask',
      subtask.id,
      String(args.ticket_id),
    );
    return {
      subtask_id: subtask.id,
      ticket_id: String(args.ticket_id),
      title: subtask.title,
    };
  }

  // ── update_subtask_status ───────────────────────────────────────────────────

  private async updateSubtaskStatus(
    args: Record<string, unknown>,
    actor: RequestUser,
  ) {
    if (!this.canManageTickets(actor)) {
      throw new ForbiddenException(
        'You do not have permission to update subtasks',
      );
    }

    const subtaskId = String(args.subtask_id);
    const status = String(args.status) as SubtaskStatus;

    const prior = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      select: { status: true, ticketId: true },
    });
    if (!prior) {
      throw new NotFoundException(`Subtask ${subtaskId} not found`);
    }

    const now = new Date();
    const updated = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        status,
        completedAt: status === 'DONE' ? new Date() : null,
      },
      select: { id: true, title: true, status: true, ticketId: true },
    });

    await this.firstResponse.recordFirstSubtaskStatusChange(
      this.prisma,
      prior.ticketId,
      subtaskId,
      prior.status,
      status,
      now,
    );

    await this.writeAuditLog(
      actor.id,
      'SUBTASK_UPDATED',
      'Subtask',
      subtaskId,
      updated.ticketId,
    );
    return { subtask_id: updated.id, status: updated.status };
  }

  // ── get_ticket_metrics (scoped + analytics filters) ─────────────────────────

  private buildTicketAnalyticsWhere(
    args: Record<string, unknown>,
    actor: RequestUser,
  ): Prisma.TicketWhereInput {
    const scopeWhere = this.ticketVisibility.buildWhereClause(actor);
    const extra: Prisma.TicketWhereInput[] = [];

    const created = buildTicketCreatedAtFilter(args);
    if (created) extra.push(created);

    const tc = String(args.ticket_class ?? 'ALL').toUpperCase();
    const openOnly = args.open_only === true || args.open_only === 'true';
    const statusFilter = Array.isArray(args?.status)
      ? (args.status as TicketStatus[]).filter(Boolean)
      : undefined;

    const useDispatchMaintenanceOpen =
      tc === 'MAINTENANCE' && openOnly && !statusFilter?.length;

    if (useDispatchMaintenanceOpen) {
      extra.push(this.reportingService.buildOpenMaintenanceWhere({}));
    } else {
      if (tc === 'MAINTENANCE') {
        extra.push({ ticketClass: { code: 'MAINTENANCE' } });
      } else if (tc === 'SUPPORT') {
        extra.push({ ticketClass: { code: 'SUPPORT' } });
      }
      if (openOnly && !statusFilter?.length) {
        extra.push({
          status: { notIn: ['RESOLVED', 'CLOSED'] as TicketStatus[] },
        });
      }
    }

    if (statusFilter?.length) {
      extra.push({ status: { in: statusFilter } });
    }
    const priorityFilter = Array.isArray(args?.priority)
      ? (args.priority as Priority[]).filter(Boolean)
      : undefined;
    if (priorityFilter?.length) {
      extra.push({ priority: { in: priorityFilter } });
    }

    const parts = [scopeWhere, ...extra].filter(
      (p) => p && Object.keys(p as object).length > 0,
    );
    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0];
    return { AND: parts };
  }

  private async getMetrics(args: Record<string, unknown>, actor: RequestUser) {
    try {
      const groupBy = String(args?.group_by ?? 'status')
        .toLowerCase()
        .trim();
      const where = this.buildTicketAnalyticsWhere(args, actor);
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 50);

      type MetricsGroupField =
        | 'status'
        | 'priority'
        | 'maintenanceCategoryId'
        | 'marketId'
        | 'studioId'
        | 'ticketClassId';

      let groupField: MetricsGroupField =
        groupBy === 'priority'
          ? 'priority'
          : groupBy === 'category'
            ? 'maintenanceCategoryId'
            : groupBy === 'market'
              ? 'marketId'
              : groupBy === 'studio'
                ? 'studioId'
                : groupBy === 'ticket_class'
                  ? 'ticketClassId'
                  : 'status';

      const groups = await this.prisma.ticket.groupBy({
        by: [groupField],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      const top = groups.slice(0, limit);

      if (groupBy === 'category') {
        const catIds = top
          .map(
            (g) =>
              (g as { maintenanceCategoryId?: string | null })
                .maintenanceCategoryId,
          )
          .filter((id): id is string => Boolean(id));
        const cats = catIds.length
          ? await this.prisma.maintenanceCategory.findMany({
              where: { id: { in: catIds } },
              select: { id: true, name: true },
            })
          : [];
        const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
        return {
          counts: top.map((g) => {
            const id = (g as { maintenanceCategoryId?: string | null })
              .maintenanceCategoryId;
            return {
              group: id ? (catMap[id] ?? 'Unknown') : 'Support / Unassigned',
              count: g._count.id,
            };
          }),
        };
      }
      if (groupBy === 'market') {
        const mktIds = top
          .map((g) => (g as { marketId?: string | null }).marketId)
          .filter((id): id is string => Boolean(id));
        const mkts = mktIds.length
          ? await this.prisma.market.findMany({
              where: { id: { in: mktIds } },
              select: { id: true, name: true },
            })
          : [];
        const mktMap = Object.fromEntries(mkts.map((m) => [m.id, m.name]));
        return {
          counts: top.map((g) => ({
            group:
              mktMap[(g as { marketId?: string | null }).marketId ?? ''] ??
              'Unknown',
            count: g._count.id,
          })),
        };
      }
      if (groupBy === 'studio') {
        const studioIds = top
          .map((g) => (g as { studioId?: string | null }).studioId)
          .filter((id): id is string => Boolean(id));
        const studios = studioIds.length
          ? await this.prisma.studio.findMany({
              where: { id: { in: studioIds } },
              select: { id: true, name: true, marketId: true },
            })
          : [];
        const marketIds = studios
          .map((s) => s.marketId)
          .filter((id): id is string => Boolean(id));
        const markets = marketIds.length
          ? await this.prisma.market.findMany({
              where: { id: { in: marketIds } },
              select: { id: true, name: true },
            })
          : [];
        const marketMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));
        const studioMap = Object.fromEntries(
          studios.map((s) => [
            s.id,
            {
              name: s.name,
              marketName: marketMap[s.marketId ?? ''] ?? '',
            },
          ]),
        );
        return {
          counts: top.map((g) => {
            const sid = (g as { studioId?: string | null }).studioId;
            const meta = sid ? studioMap[sid] : undefined;
            const label = sid
              ? meta
                ? `${meta.name}${meta.marketName ? ` (${meta.marketName})` : ''}`
                : 'Unknown'
              : 'No studio';
            return { group: label, count: g._count.id };
          }),
        };
      }
      if (groupBy === 'ticket_class') {
        const classIds = top
          .map((g) => (g as { ticketClassId?: string | null }).ticketClassId)
          .filter((id): id is string => Boolean(id));
        const classes = classIds.length
          ? await this.prisma.ticketClass.findMany({
              where: { id: { in: classIds } },
              select: { id: true, code: true, name: true },
            })
          : [];
        const classMap = Object.fromEntries(
          classes.map((c) => [c.id, `${c.code}: ${c.name}`]),
        );
        return {
          counts: top.map((g) => {
            const id = (g as { ticketClassId?: string | null }).ticketClassId;
            return {
              group: id ? (classMap[id] ?? 'Unknown') : 'Unclassified',
              count: g._count.id,
            };
          }),
        };
      }

      return {
        counts: top.map((g) => ({
          group: String((g as Record<string, unknown>)[groupField] ?? ''),
          count: g._count.id,
        })),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Metrics query failed';
      this.logger.warn(`get_ticket_metrics failed: ${msg}`);
      return { counts: [], error: msg };
    }
  }

  // ── query_user_rollups (account creation dates — not HR hire date) ─────────

  private buildUserRollupWhere(actor: RequestUser): Prisma.UserWhereInput {
    if (actor.role === Role.ADMIN || actor.role === Role.DEPARTMENT_USER) {
      return {};
    }
    const studioIds = [actor.studioId, ...actor.scopeStudioIds].filter(
      (id): id is string => Boolean(id),
    );
    const or: Prisma.UserWhereInput[] = [{ id: actor.id }];
    if (studioIds.length > 0) {
      or.push({ studioId: { in: studioIds } });
    }
    return { OR: or };
  }

  private buildUserCreatedAtFilter(
    args: Record<string, unknown>,
  ): Prisma.DateTimeFilter | null {
    const w = buildTicketCreatedAtFilter(args);
    if (!w || !w.createdAt || typeof w.createdAt !== 'object') return null;
    return w.createdAt as Prisma.DateTimeFilter;
  }

  private async queryUserRollups(
    args: Record<string, unknown>,
    actor: RequestUser,
  ) {
    try {
      const groupBy = String(args.group_by ?? 'studio').toLowerCase().trim();
      const isActive =
        args.is_active !== false && args.is_active !== 'false';
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 50);

      const whereUser: Prisma.UserWhereInput = this.buildUserRollupWhere(actor);
      if (isActive) whereUser.isActive = true;

      const created = this.buildUserCreatedAtFilter(args);
      if (created) whereUser.createdAt = created;

      const disclaimer =
        'Counts reflect user accounts (User.createdAt / signup), not HR hire dates.';

      if (groupBy === 'role') {
        const rows = await this.prisma.user.groupBy({
          by: ['role'],
          where: whereUser,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        });
        return {
          counts: rows.slice(0, limit).map((r) => ({
            group: r.role,
            count: r._count.id,
          })),
          disclaimer,
        };
      }

      if (groupBy === 'market') {
        const rows = await this.prisma.user.groupBy({
          by: ['marketId'],
          where: whereUser,
          _count: { id: true },
          orderBy: { _count: { marketId: 'desc' } },
        });
        const top = rows.slice(0, limit);
        const mktIds = top
          .map((r) => r.marketId)
          .filter((id): id is string => Boolean(id));
        const mkts = mktIds.length
          ? await this.prisma.market.findMany({
              where: { id: { in: mktIds } },
              select: { id: true, name: true },
            })
          : [];
        const mktMap = Object.fromEntries(mkts.map((m) => [m.id, m.name]));
        return {
          counts: top.map((r) => ({
            group: r.marketId
              ? (mktMap[r.marketId] ?? 'Unknown')
              : 'No market',
            count: r._count.id,
          })),
          disclaimer,
        };
      }

      const rows = await this.prisma.user.groupBy({
        by: ['studioId'],
        where: whereUser,
        _count: { id: true },
        orderBy: { _count: { studioId: 'desc' } },
      });
      const top = rows.slice(0, limit);
      const studioIds = top
        .map((r) => r.studioId)
        .filter((id): id is string => Boolean(id));
      const studios = studioIds.length
        ? await this.prisma.studio.findMany({
            where: { id: { in: studioIds } },
            select: { id: true, name: true, marketId: true },
          })
        : [];
      const marketIds = studios
        .map((s) => s.marketId)
        .filter((id): id is string => Boolean(id));
      const markets = marketIds.length
        ? await this.prisma.market.findMany({
            where: { id: { in: marketIds } },
            select: { id: true, name: true },
          })
        : [];
      const marketMap = Object.fromEntries(markets.map((m) => [m.id, m.name]));
      const studioMap = Object.fromEntries(
        studios.map((s) => [
          s.id,
          {
            name: s.name,
            marketName: marketMap[s.marketId ?? ''] ?? '',
          },
        ]),
      );
      return {
        counts: top.map((r) => {
          const sid = r.studioId;
          const meta = sid ? studioMap[sid] : undefined;
          const label = sid
            ? meta
              ? `${meta.name}${meta.marketName ? ` (${meta.marketName})` : ''}`
              : 'Unknown'
            : 'No studio';
          return { group: label, count: r._count.id };
        }),
        disclaimer,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'User rollup failed';
      this.logger.warn(`query_user_rollups failed: ${msg}`);
      return { counts: [], error: msg, disclaimer: '' };
    }
  }

  // ── knowledge_search ────────────────────────────────────────────────────────

  /**
   * Hybrid (vector + keyword) search over the knowledge base.
   * Replaces the old vector-only path so brittle proper-noun queries
   * ("LeaseIQ", "RBAC", "SSE") still hit the right product help article
   * even when embeddings don't rank them first.
   *
   * See apps/api/src/modules/ai/hybrid-retrieval.service.ts for details
   * on the RRF fusion and keyword tokenization.
   */
  private async knowledgeSearch(args: Record<string, unknown>) {
    const query = String(args.query ?? '').trim();
    if (!query) return { chunks: [], note: 'Empty query' };

    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 12);

    try {
      const hits = await this.hybridRetrieval.hybridSearch(
        query,
        limit,
        'general_plus_product',
      );

      return {
        chunks: hits.map((h) => ({
          documentId: h.documentId,
          title: h.documentTitle,
          text: h.content.slice(0, 500),
          pageNumber: h.pageNumber,
          score: Number(h.score.toFixed(6)),
          vectorRank: h.vectorRank,
          keywordRank: h.keywordRank,
        })),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`knowledge_search hybrid retrieval failed: ${msg}`);
      return { chunks: [], error: msg };
    }
  }

  // ── list_categories ─────────────────────────────────────────────────────────

  private async listCategories() {
    const categories = await this.prisma.maintenanceCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, color: true },
      orderBy: { sortOrder: 'asc' },
    });
    return { categories };
  }

  // ── list_users ──────────────────────────────────────────────────────────────

  private async listUsers(args: Record<string, unknown>) {
    const where: Prisma.UserWhereInput = { isActive: true };
    if (args.role) where.role = args.role as Role;

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
      take: 50,
    });
    return { users };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private canManageTickets(actor: RequestUser): boolean {
    return ['ADMIN', 'DEPARTMENT_USER'].includes(actor.role);
  }

  private canAssign(actor: RequestUser): boolean {
    return ['ADMIN', 'DEPARTMENT_USER'].includes(actor.role);
  }

  private async getDefaultMaintenanceCategoryId(): Promise<string> {
    const cat = await this.prisma.maintenanceCategory.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!cat)
      throw new Error(
        'No maintenance categories exist. Ask an admin to seed taxonomy first.',
      );
    return cat.id;
  }

  private async getDefaultTeamId(): Promise<string> {
    const team = await this.prisma.team.findFirst({
      where: { isActive: true },
    });
    if (!team)
      throw new Error('No teams exist. Ask an admin to create one first.');
    return team.id;
  }

  private async writeAuditLog(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    ticketId?: string | null,
    oldValues?: unknown,
    newValues?: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: action as any,
        entityType,
        entityId,
        ticketId: ticketId ?? null,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : null,
        metadata: { source: 'ai_agent' },
      },
    });
  }
}
