import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { IngestionService } from '../ai/ingestion.service';
import { TicketsService } from '../tickets/tickets.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { Role, TicketStatus, Priority, SubtaskStatus, Prisma } from '@prisma/client';

const DISTANCE_THRESHOLD = 0.4;

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
    private readonly config: ConfigService,
    private readonly ingestion: IngestionService,
    private readonly ticketsService: TicketsService,
  ) {}

  async execute(toolName: string, args: Record<string, unknown>, actor: RequestUser): Promise<ToolResult> {
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

  private async route(toolName: string, args: Record<string, unknown>, actor: RequestUser): Promise<unknown> {
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
        id: true, email: true, name: true, role: true,
        teamId: true, studioId: true, marketId: true,
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

  private async searchTickets(args: Record<string, unknown>, actor: RequestUser) {
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
    if (args.category_id) where.maintenanceCategoryId = String(args.category_id);
    if (args.owner_user_id) where.ownerId = String(args.owner_user_id);
    if (args.requester_user_id) where.requesterId = String(args.requester_user_id);

    // RBAC: Studio users can only see their own tickets
    if (actor.role === 'STUDIO_USER') {
      where.requesterId = actor.id;
    }

    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true, title: true, status: true, priority: true, createdAt: true, updatedAt: true,
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
        id: true, title: true, description: true, status: true, priority: true,
        createdAt: true, updatedAt: true, resolvedAt: true, closedAt: true,
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
            id: true, body: true, isInternal: true, createdAt: true,
            author: { select: { id: true, name: true } },
          },
        },
        subtasks: {
          select: {
            id: true, title: true, status: true, isRequired: true,
            owner: { select: { id: true, name: true } },
          },
        },
        watchers: { select: { userId: true, user: { select: { name: true } } } },
      },
    });

    // RBAC: hide internal comments from studio users
    if (actor.role === 'STUDIO_USER') {
      ticket.comments = ticket.comments.filter((c) => !c.isInternal);
    }

    return ticket;
  }

  // ── create_ticket ───────────────────────────────────────────────────────────

  private async createTicket(args: Record<string, unknown>, actor: RequestUser) {
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
      ownerId: args.owner_user_id && this.canAssign(actor) ? String(args.owner_user_id) : undefined,
    };

    const ticket = await this.ticketsService.create(dto, actor);
    return {
      ticket_id: ticket.id,
      title: ticket.title,
      status: ticket.status,
    };
  }

  // ── update_ticket_status ────────────────────────────────────────────────────

  private async updateTicketStatus(args: Record<string, unknown>, actor: RequestUser) {
    const ticketId = String(args.ticket_id);
    const newStatus = String(args.new_status) as TicketStatus;

    if (!this.canManageTickets(actor)) {
      throw new ForbiddenException('You do not have permission to change ticket status');
    }

    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { status: true } });
    const oldStatus = ticket.status;

    const timestamps: Prisma.TicketUpdateInput = {};
    if (newStatus === 'RESOLVED') timestamps.resolvedAt = new Date();
    if (newStatus === 'CLOSED') timestamps.closedAt = new Date();

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: newStatus, ...timestamps },
      select: { id: true, title: true, status: true },
    });

    await this.writeAuditLog(actor.id, 'STATUS_CHANGED', 'Ticket', ticketId, ticketId, { oldStatus }, { newStatus });
    return { ticket_id: updated.id, old_status: oldStatus, new_status: updated.status };
  }

  // ── assign_ticket ───────────────────────────────────────────────────────────

  private async assignTicket(args: Record<string, unknown>, actor: RequestUser) {
    if (!this.canAssign(actor)) {
      throw new ForbiddenException('You do not have permission to assign tickets');
    }

    const ticketId = String(args.ticket_id);
    const ownerId = args.owner_user_id ? String(args.owner_user_id) : null;

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { ownerId },
      select: { id: true, title: true, owner: { select: { id: true, name: true } } },
    });

    await this.writeAuditLog(actor.id, 'ASSIGNED', 'Ticket', ticketId, ticketId, null, { ownerId });
    return { ticket_id: updated.id, assigned_to: updated.owner?.name ?? 'Unassigned' };
  }

  // ── add_ticket_comment ──────────────────────────────────────────────────────

  private async addComment(args: Record<string, unknown>, actor: RequestUser) {
    const ticketId = String(args.ticket_id);
    const isInternal = Boolean(args.is_internal);

    if (isInternal && actor.role === 'STUDIO_USER') {
      throw new ForbiddenException('Studio users cannot create internal notes');
    }

    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: actor.id,
        body: String(args.body),
        isInternal,
      },
      select: { id: true, body: true, isInternal: true, createdAt: true },
    });

    await this.writeAuditLog(actor.id, 'COMMENTED', 'TicketComment', comment.id, ticketId);
    return { comment_id: comment.id, ticket_id: ticketId };
  }

  // ── create_subtask ──────────────────────────────────────────────────────────

  private async createSubtask(args: Record<string, unknown>, actor: RequestUser) {
    if (!this.canManageTickets(actor)) {
      throw new ForbiddenException('You do not have permission to create subtasks');
    }

    // Optional: use actor's team or first available (subtasks can exist without a team)
    const teamId = (actor as any).teamId ?? await this.getDefaultTeamId().catch(() => undefined);

    const subtask = await this.prisma.subtask.create({
      data: {
        ticketId: String(args.ticket_id),
        title: String(args.title),
        ...(teamId && { teamId }),
        ownerId: args.owner_user_id ? String(args.owner_user_id) : null,
        isRequired: args.is_required !== false,
      },
      select: { id: true, title: true, status: true },
    });

    await this.writeAuditLog(actor.id, 'SUBTASK_CREATED', 'Subtask', subtask.id, String(args.ticket_id));
    return { subtask_id: subtask.id, ticket_id: String(args.ticket_id), title: subtask.title };
  }

  // ── update_subtask_status ───────────────────────────────────────────────────

  private async updateSubtaskStatus(args: Record<string, unknown>, actor: RequestUser) {
    if (!this.canManageTickets(actor)) {
      throw new ForbiddenException('You do not have permission to update subtasks');
    }

    const subtaskId = String(args.subtask_id);
    const status = String(args.status) as SubtaskStatus;

    const updated = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        status,
        completedAt: status === 'DONE' ? new Date() : null,
      },
      select: { id: true, title: true, status: true, ticketId: true },
    });

    await this.writeAuditLog(actor.id, 'SUBTASK_UPDATED', 'Subtask', subtaskId, updated.ticketId);
    return { subtask_id: updated.id, status: updated.status };
  }

  // ── get_ticket_metrics ──────────────────────────────────────────────────────

  private async getMetrics(args: Record<string, unknown>, _actor: RequestUser) {
    try {
      const groupBy = String(args?.group_by ?? 'status').toLowerCase().trim();
      const statusFilter = Array.isArray(args?.status) ? (args.status as TicketStatus[]).filter(Boolean) : undefined;
      const priorityFilter = Array.isArray(args?.priority) ? (args.priority as Priority[]).filter(Boolean) : undefined;

      const where: Prisma.TicketWhereInput = {};
      if (statusFilter?.length) where.status = { in: statusFilter };
      if (priorityFilter?.length) where.priority = { in: priorityFilter };

      const groupField: 'status' | 'priority' | 'maintenanceCategoryId' | 'marketId' =
        groupBy === 'priority' ? 'priority'
          : groupBy === 'category' ? 'maintenanceCategoryId'
          : groupBy === 'market' ? 'marketId'
          : 'status';

      const groups = await this.prisma.ticket.groupBy({
        by: [groupField],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      if (groupBy === 'category') {
        const catIds = groups
          .map((g) => (g as { maintenanceCategoryId?: string | null }).maintenanceCategoryId)
          .filter((id): id is string => Boolean(id));
        const cats = catIds.length
          ? await this.prisma.maintenanceCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
          : [];
        const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
        return {
          counts: groups.map((g) => {
            const id = (g as { maintenanceCategoryId?: string | null }).maintenanceCategoryId;
            return {
              group: id ? (catMap[id] ?? 'Unknown') : 'Support / Unassigned',
              count: g._count.id,
            };
          }),
        };
      }
      if (groupBy === 'market') {
        const mktIds = groups.map((g) => (g as { marketId?: string }).marketId).filter((id): id is string => Boolean(id));
        const mkts = mktIds.length
          ? await this.prisma.market.findMany({ where: { id: { in: mktIds } }, select: { id: true, name: true } })
          : [];
        const mktMap = Object.fromEntries(mkts.map((m) => [m.id, m.name]));
        return {
          counts: groups.map((g) => ({
            group: mktMap[(g as { marketId?: string }).marketId ?? ''] ?? 'Unknown',
            count: g._count.id,
          })),
        };
      }

      return {
        counts: groups.map((g) => ({
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

  // ── knowledge_search ────────────────────────────────────────────────────────

  private async knowledgeSearch(args: Record<string, unknown>) {
    const query = String(args.query);
    const limit = Math.min(Number(args.limit) || 5, 10);

    let embedding: number[];
    try {
      embedding = await this.ingestion.embedOne(query);
    } catch {
      return { chunks: [], note: 'Embedding service unavailable' };
    }

    const chunks = await this.prisma.$queryRaw<Array<{ id: string; content: string; document_title: string; distance: number }>>`
      SELECT dc.id, dc.content, kd.title AS document_title,
             dc.embedding <=> ${`[${embedding.join(',')}]`}::vector AS distance
      FROM "document_chunks" dc
      JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
      WHERE kd."isActive" = true AND dc.embedding IS NOT NULL
        AND dc.embedding <=> ${`[${embedding.join(',')}]`}::vector < ${DISTANCE_THRESHOLD}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    return {
      chunks: chunks.map((c) => ({
        title: c.document_title,
        text: c.content.slice(0, 500),
      })),
    };
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
    if (!cat) throw new Error('No maintenance categories exist. Ask an admin to seed taxonomy first.');
    return cat.id;
  }

  private async getDefaultTeamId(): Promise<string> {
    const team = await this.prisma.team.findFirst({ where: { isActive: true } });
    if (!team) throw new Error('No teams exist. Ask an admin to create one first.');
    return team.id;
  }

  private async writeAuditLog(
    actorId: string, action: string, entityType: string, entityId: string,
    ticketId?: string | null, oldValues?: unknown, newValues?: unknown,
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
