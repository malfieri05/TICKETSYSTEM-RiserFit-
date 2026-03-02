import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketFiltersDto } from './dto/ticket-filters.dto';
import { assertValidTransition } from './ticket-state-machine';
import { Role, TicketStatus, Prisma } from '@prisma/client';

// ─── Prisma select shapes (prevents N+1 and controls response size) ──────────

const TICKET_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  category: { select: { id: true, name: true, color: true } },
  studio: { select: { id: true, name: true } },
  market: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
  owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
  _count: {
    select: {
      comments: true,
      subtasks: true,
      attachments: true,
    },
  },
} satisfies Prisma.TicketSelect;

const TICKET_DETAIL_SELECT = {
  ...TICKET_LIST_SELECT,
  description: true,
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      mentions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  },
  subtasks: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      team: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  },
  watchers: {
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  },
  tags: {
    include: { tag: { select: { id: true, name: true, color: true } } },
  },
} satisfies Prisma.TicketSelect;

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private domainEvents: DomainEventsService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateTicketDto, actor: RequestUser) {
    // Validate category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(`Category ${dto.categoryId} not found`);
    }

    // Validate owner exists if specified
    if (dto.ownerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: dto.ownerId, isActive: true },
      });
      if (!owner) throw new NotFoundException(`Owner user ${dto.ownerId} not found`);
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          title: dto.title,
          description: dto.description,
          categoryId: dto.categoryId,
          studioId: dto.studioId,
          marketId: dto.marketId,
          priority: dto.priority ?? 'MEDIUM',
          requesterId: actor.id,
          ownerId: dto.ownerId,
          status: 'NEW',
        },
        select: TICKET_LIST_SELECT,
      });

      // Auto-watch: requester always watches their own ticket
      await tx.ticketWatcher.create({
        data: { ticketId: created.id, userId: actor.id },
      });

      // Also watch if owner is different from requester
      if (dto.ownerId && dto.ownerId !== actor.id) {
        await tx.ticketWatcher.create({
          data: { ticketId: created.id, userId: dto.ownerId },
        });
      }

      return created;
    });

    // Audit log
    await this.auditLog.log({
      actorId: actor.id,
      action: 'CREATED',
      entityType: 'ticket',
      entityId: ticket.id,
      ticketId: ticket.id,
      newValues: { title: ticket.title, status: ticket.status, priority: ticket.priority },
    });

    // Domain event — triggers notification fan-out
    await this.domainEvents.emit({
      type: 'TICKET_CREATED',
      ticketId: ticket.id,
      actorId: actor.id,
      occurredAt: new Date(),
      payload: {
        requesterId: actor.id,
        ownerId: dto.ownerId,
        title: dto.title,
      },
    });

    return ticket;
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async findAll(filters: TicketFiltersDto, actor: RequestUser) {
    const {
      status,
      categoryId,
      studioId,
      marketId,
      priority,
      ownerId,
      requesterId,
      search,
      createdAfter,
      createdBefore,
      page = 1,
      limit = 25,
    } = filters;

    const where: Prisma.TicketWhereInput = {
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(studioId && { studioId }),
      ...(marketId && { marketId }),
      ...(priority && { priority }),
      ...(ownerId && { ownerId }),
      ...(requesterId && { requesterId }),
      ...(createdAfter || createdBefore
        ? {
            createdAt: {
              ...(createdAfter && { gte: new Date(createdAfter) }),
              ...(createdBefore && { lte: new Date(createdBefore) }),
            },
          }
        : {}),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select: TICKET_LIST_SELECT,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── GET BY ID ───────────────────────────────────────────────────────────────

  async findById(id: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: TICKET_DETAIL_SELECT,
    });

    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);

    return ticket;
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateTicketDto, actor: RequestUser) {
    const ticket = await this.findTicketOrThrow(id);

    // Only owner, manager, or admin can update
    this.assertCanModify(ticket, actor);

    if (dto.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new NotFoundException(`Category ${dto.categoryId} not found`);
    }

    const oldValues = {
      title: ticket.title,
      priority: ticket.priority,
      categoryId: ticket.categoryId,
    };

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.studioId !== undefined && { studioId: dto.studioId }),
        ...(dto.marketId !== undefined && { marketId: dto.marketId }),
        ...(dto.priority && { priority: dto.priority }),
      },
      select: TICKET_LIST_SELECT,
    });

    await this.auditLog.log({
      actorId: actor.id,
      action: 'UPDATED',
      entityType: 'ticket',
      entityId: id,
      ticketId: id,
      oldValues,
      newValues: dto as Record<string, unknown>,
    });

    return updated;
  }

  // ─── ASSIGN ──────────────────────────────────────────────────────────────────

  async assign(ticketId: string, ownerId: string, actor: RequestUser) {
    const ticket = await this.findTicketOrThrow(ticketId);

    // Only agents, managers, admins can assign
    if (actor.role === Role.REQUESTER) {
      throw new ForbiddenException('Requesters cannot assign tickets');
    }

    const newOwner = await this.prisma.user.findUnique({
      where: { id: ownerId, isActive: true },
      select: { id: true, name: true },
    });
    if (!newOwner) throw new NotFoundException(`User ${ownerId} not found`);

    const isReassignment = ticket.ownerId !== null;
    const previousOwnerId = ticket.ownerId ?? undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.update({
        where: { id: ticketId },
        data: { ownerId },
        select: TICKET_LIST_SELECT,
      });

      // Auto-add new owner as watcher
      await tx.ticketWatcher.upsert({
        where: { ticketId_userId: { ticketId, userId: ownerId } },
        create: { ticketId, userId: ownerId },
        update: {},
      });

      return result;
    });

    await this.auditLog.log({
      actorId: actor.id,
      action: isReassignment ? 'REASSIGNED' : 'ASSIGNED',
      entityType: 'ticket',
      entityId: ticketId,
      ticketId,
      oldValues: { ownerId: previousOwnerId },
      newValues: { ownerId },
    });

    await this.domainEvents.emit({
      type: isReassignment ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED',
      ticketId,
      actorId: actor.id,
      occurredAt: new Date(),
      payload: {
        ownerId,
        ownerName: newOwner.name,
        previousOwnerId,
        title: ticket.title,
      },
    });

    return updated;
  }

  // ─── TRANSITION STATUS ───────────────────────────────────────────────────────

  async transitionStatus(ticketId: string, newStatus: TicketStatus, actor: RequestUser) {
    const ticket = await this.findTicketOrThrow(ticketId);

    // Validate the transition is legal
    assertValidTransition(ticket.status, newStatus);

    // Resolution gate: cannot RESOLVE if any required subtask is not DONE
    if (newStatus === 'RESOLVED') {
      const blockedSubtasks = await this.prisma.subtask.count({
        where: {
          ticketId,
          isRequired: true,
          status: { not: 'DONE' },
        },
      });

      if (blockedSubtasks > 0) {
        throw new BadRequestException(
          `Cannot resolve ticket: ${blockedSubtasks} required subtask(s) are not yet complete.`,
        );
      }
    }

    const now = new Date();
    const timestamps: Partial<{ resolvedAt: Date; closedAt: Date }> = {};
    if (newStatus === 'RESOLVED') timestamps.resolvedAt = now;
    if (newStatus === 'CLOSED') timestamps.closedAt = now;
    // If re-opening from RESOLVED, clear resolvedAt
    if (ticket.status === 'RESOLVED' && newStatus === 'IN_PROGRESS') {
      (timestamps as Record<string, unknown>).resolvedAt = null;
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: newStatus, ...timestamps },
      select: TICKET_LIST_SELECT,
    });

    await this.auditLog.log({
      actorId: actor.id,
      action: 'STATUS_CHANGED',
      entityType: 'ticket',
      entityId: ticketId,
      ticketId,
      oldValues: { status: ticket.status },
      newValues: { status: newStatus },
    });

    // Choose the most specific event type
    let eventType: 'TICKET_STATUS_CHANGED' | 'TICKET_RESOLVED' | 'TICKET_CLOSED' =
      'TICKET_STATUS_CHANGED';
    if (newStatus === 'RESOLVED') eventType = 'TICKET_RESOLVED';
    if (newStatus === 'CLOSED') eventType = 'TICKET_CLOSED';

    await this.domainEvents.emit({
      type: eventType,
      ticketId,
      actorId: actor.id,
      occurredAt: now,
      payload: {
        previousStatus: ticket.status,
        newStatus,
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId ?? undefined,
        title: ticket.title,
      },
    });

    return updated;
  }

  // ─── WATCHERS ────────────────────────────────────────────────────────────────

  async addWatcher(ticketId: string, userId: string) {
    await this.findTicketOrThrow(ticketId);
    await this.prisma.ticketWatcher.upsert({
      where: { ticketId_userId: { ticketId, userId } },
      create: { ticketId, userId },
      update: {},
    });
    return { ticketId, userId, watching: true };
  }

  async removeWatcher(ticketId: string, userId: string) {
    await this.findTicketOrThrow(ticketId);
    await this.prisma.ticketWatcher.deleteMany({
      where: { ticketId, userId },
    });
    return { ticketId, userId, watching: false };
  }

  // ─── AUDIT HISTORY ───────────────────────────────────────────────────────────

  async getHistory(ticketId: string, actor: RequestUser) {
    await this.findTicketOrThrow(ticketId);
    return this.auditLog.getTicketHistory(ticketId);
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  private async findTicketOrThrow(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        requesterId: true,
        ownerId: true,
        categoryId: true,
        studioId: true,
        marketId: true,
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  private assertCanModify(
    ticket: { requesterId: string; ownerId: string | null },
    actor: RequestUser,
  ) {
    const isOwner = ticket.ownerId === actor.id;
    const isRequester = ticket.requesterId === actor.id;
    const isPrivileged = actor.role === Role.MANAGER || actor.role === Role.ADMIN;

    if (!isOwner && !isRequester && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to modify this ticket');
    }
  }
}
