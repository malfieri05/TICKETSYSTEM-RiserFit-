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
import { MySummaryCacheService } from '../../common/cache/my-summary-cache.service';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketFiltersDto } from './dto/ticket-filters.dto';
import { assertValidTransition } from './ticket-state-machine';
import { Role, TicketStatus, Prisma } from '@prisma/client';
import { SlaService } from '../sla/sla.service';
import { TicketFormsService } from '../ticket-forms/ticket-forms.service';
import { SubtaskWorkflowService } from '../subtask-workflow/subtask-workflow.service';

// ─── Prisma select shapes (prevents N+1 and controls response size) ──────────

const TAXONOMY_SELECT = {
  ticketClass: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
  supportTopic: { select: { id: true, name: true } },
  maintenanceCategory: { select: { id: true, name: true, color: true } },
};

const TICKET_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  requesterId: true,
  ownerId: true,
  studioId: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  category: { select: { id: true, name: true, color: true } },
  ...TAXONOMY_SELECT,
  studio: { select: { id: true, name: true } },
  market: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
  owner: { select: { id: true, name: true, email: true, avatarUrl: true, teamId: true } },
  _count: {
    select: {
      comments: true,
      subtasks: true,
      attachments: true,
    },
  },
} satisfies Prisma.TicketSelect;

/** Lighter select for list when includeCounts=false (no _count subqueries). */
const TICKET_LIST_SELECT_LIGHT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  requesterId: true,
  ownerId: true,
  studioId: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  category: { select: { id: true, name: true, color: true } },
  ...TAXONOMY_SELECT,
  studio: { select: { id: true, name: true } },
  market: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
  owner: { select: { id: true, name: true, email: true, avatarUrl: true, teamId: true } },
} satisfies Prisma.TicketSelect;

const TICKET_DETAIL_SELECT = {
  ...TICKET_LIST_SELECT,
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      teamId: true,
      team: { select: { name: true } },
    },
  },
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
  formResponses: {
    select: { fieldKey: true, value: true },
    orderBy: { fieldKey: 'asc' as const },
  },
} satisfies Prisma.TicketSelect;

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private domainEvents: DomainEventsService,
    private sla: SlaService,
    private mySummaryCache: MySummaryCacheService,
    private visibility: TicketVisibilityService,
    private ticketForms: TicketFormsService,
    private subtaskWorkflow: SubtaskWorkflowService,
  ) {}

  /**
   * Validates ticket classification invariant: SUPPORT → departmentId + supportTopicId; MAINTENANCE → maintenanceCategoryId.
   * Throws BadRequestException if invalid. Returns the resolved ticket class code.
   */
  private async validateTicketClassification(payload: {
    ticketClassId: string;
    departmentId?: string | null;
    supportTopicId?: string | null;
    maintenanceCategoryId?: string | null;
  }): Promise<'SUPPORT' | 'MAINTENANCE'> {
    const tc = await this.prisma.ticketClass.findUnique({
      where: { id: payload.ticketClassId, isActive: true },
      select: { code: true },
    });
    if (!tc) throw new NotFoundException(`Ticket class ${payload.ticketClassId} not found`);
    const code = tc.code as 'SUPPORT' | 'MAINTENANCE';

    if (code === 'SUPPORT') {
      if (!payload.departmentId || !payload.supportTopicId) {
        throw new BadRequestException(
          'SUPPORT tickets require departmentId and supportTopicId',
        );
      }
      const topic = await this.prisma.supportTopic.findUnique({
        where: { id: payload.supportTopicId, departmentId: payload.departmentId, isActive: true },
        select: { id: true },
      });
      if (!topic) {
        throw new BadRequestException(
          'supportTopicId must belong to the given department',
        );
      }
      await this.prisma.taxonomyDepartment.findUniqueOrThrow({
        where: { id: payload.departmentId, isActive: true },
      });
    } else if (code === 'MAINTENANCE') {
      if (!payload.maintenanceCategoryId) {
        throw new BadRequestException(
          'MAINTENANCE tickets require maintenanceCategoryId',
        );
      }
      await this.prisma.maintenanceCategory.findUniqueOrThrow({
        where: { id: payload.maintenanceCategoryId, isActive: true },
      });
    }
    return code;
  }

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  /**
   * Legacy compatibility: when ticketClassId is missing, treat as MAINTENANCE and resolve
   * maintenanceCategoryId from categoryId if needed. Does not weaken validation for full payloads.
   */
  private async resolveCreateTaxonomy(dto: CreateTicketDto): Promise<{
    ticketClassId: string;
    departmentId: string | null;
    supportTopicId: string | null;
    maintenanceCategoryId: string | null;
    categoryId: string | null;
  }> {
    let ticketClassId = dto.ticketClassId ?? null;
    let maintenanceCategoryId = dto.maintenanceCategoryId ?? null;
    const departmentId = dto.departmentId ?? null;
    const supportTopicId = dto.supportTopicId ?? null;
    const categoryId = dto.categoryId ?? null;

    if (!ticketClassId) {
      const maintenanceClass = await this.prisma.ticketClass.findFirst({
        where: { code: 'MAINTENANCE', isActive: true },
        select: { id: true },
      });
      if (!maintenanceClass) throw new NotFoundException('Ticket class MAINTENANCE not found');
      ticketClassId = maintenanceClass.id;
    }

    if (ticketClassId && !maintenanceCategoryId && categoryId) {
      maintenanceCategoryId = categoryId;
    }

    if (ticketClassId && !maintenanceCategoryId) {
      const tc = await this.prisma.ticketClass.findUnique({
        where: { id: ticketClassId },
        select: { code: true },
      });
      if (tc?.code === 'MAINTENANCE') {
        const defaultCat = await this.prisma.maintenanceCategory.findFirst({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        });
        if (defaultCat) maintenanceCategoryId = defaultCat.id;
      }
    }

    return {
      ticketClassId: ticketClassId as string,
      departmentId,
      supportTopicId,
      maintenanceCategoryId,
      categoryId,
    };
  }

  async create(dto: CreateTicketDto, actor: RequestUser) {
    const resolved = await this.resolveCreateTaxonomy(dto);

    await this.validateTicketClassification({
      ticketClassId: resolved.ticketClassId,
      departmentId: resolved.departmentId,
      supportTopicId: resolved.supportTopicId,
      maintenanceCategoryId: resolved.maintenanceCategoryId,
    });

    // Stage 3: validate formResponses against schema when provided
    let schemaForResponses: Awaited<ReturnType<TicketFormsService['getSchema']>> | null = null;
    if (dto.formResponses && Object.keys(dto.formResponses).length > 0) {
      try {
        schemaForResponses = await this.ticketForms.getSchema({
          ticketClassId: resolved.ticketClassId,
          departmentId: resolved.departmentId ?? undefined,
          supportTopicId: resolved.supportTopicId ?? undefined,
          maintenanceCategoryId: resolved.maintenanceCategoryId ?? undefined,
        });
      } catch (e) {
        if (e instanceof NotFoundException || e instanceof BadRequestException) throw e;
        throw new BadRequestException(
          'Form schema could not be loaded for this ticket context. Omit formResponses or set ticket class and topic.',
        );
      }
      const requiredKeys = schemaForResponses.fields.filter((f) => f.required).map((f) => f.fieldKey);
      for (const key of requiredKeys) {
        const val = dto.formResponses![key];
        if (val === undefined || val === null || String(val).trim() === '') {
          throw new BadRequestException(`Required form field "${key}" is missing or empty`);
        }
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category ${dto.categoryId} not found`);
      }
    }

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
          description: dto.description ?? '',
          ticketClassId: resolved.ticketClassId,
          departmentId: resolved.departmentId,
          supportTopicId: resolved.supportTopicId,
          maintenanceCategoryId: resolved.maintenanceCategoryId,
          categoryId: resolved.categoryId,
          studioId: dto.studioId ?? null,
          marketId: dto.marketId ?? null,
          ownerId: dto.ownerId ?? null,
          priority: dto.priority ?? 'MEDIUM',
          requesterId: actor.id,
          status: 'NEW',
        } satisfies Prisma.TicketUncheckedCreateInput,
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

      // Stage 3: persist form responses when provided and validated
      if (schemaForResponses && dto.formResponses && Object.keys(dto.formResponses).length > 0) {
        const validKeys = new Set(schemaForResponses.fields.map((f) => f.fieldKey));
        for (const [fieldKey, value] of Object.entries(dto.formResponses)) {
          if (!validKeys.has(fieldKey)) continue;
          await tx.ticketFormResponse.create({
            data: { ticketId: created.id, fieldKey, value: String(value ?? '') },
          });
        }
      }

      // Stage 4: instantiate subtask workflow template (subtasks + dependencies, READY/LOCKED)
      await this.subtaskWorkflow.instantiateForTicket(tx, created.id, {
        ticketClassId: resolved.ticketClassId,
        departmentId: resolved.departmentId,
        supportTopicId: resolved.supportTopicId,
        maintenanceCategoryId: resolved.maintenanceCategoryId,
      });

      return created;
    });

    this.mySummaryCache.invalidate(actor.id);
    if (ticket.ownerId && ticket.ownerId !== actor.id) this.mySummaryCache.invalidate(ticket.ownerId);

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

    // Stage 5: emit SUBTASK_BECAME_READY for each initially READY subtask (workflow instantiation)
    const initialReadySubtasks = await this.prisma.subtask.findMany({
      where: { ticketId: ticket.id, status: 'READY' },
      select: { id: true, title: true, ticketId: true, departmentId: true, ownerId: true },
    });
    const occurredAt = new Date();
    for (const s of initialReadySubtasks) {
      await this.domainEvents.emit({
        type: 'SUBTASK_BECAME_READY',
        ticketId: s.ticketId,
        actorId: actor.id,
        occurredAt,
        payload: {
          subtaskId: s.id,
          subtaskTitle: s.title,
          ticketId: s.ticketId,
          departmentId: s.departmentId,
          ownerId: s.ownerId,
        },
      });
    }

    return ticket;
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async findAll(filters: TicketFiltersDto, actor: RequestUser) {
    const {
      status,
      categoryId,
      ticketClassId,
      departmentId,
      supportTopicId,
      maintenanceCategoryId,
      studioId,
      marketId,
      priority,
      ownerId,
      requesterId,
      search,
      searchInTitleOnly,
      includeCounts = true,
      actionableForMe = false,
      createdAfter,
      createdBefore,
      page = 1,
      limit = 25,
    } = filters;

    const scopeWhere = this.visibility.buildWhereClause(actor);

    const filterWhere: Prisma.TicketWhereInput = {
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(ticketClassId && { ticketClassId }),
      ...(departmentId && { departmentId }),
      ...(supportTopicId && { supportTopicId }),
      ...(maintenanceCategoryId && { maintenanceCategoryId }),
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
        OR:
          searchInTitleOnly === true
            ? [{ title: { contains: search, mode: 'insensitive' } }]
            : [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
      }),
    };

    // Stage 4: department actionable queue — tickets with at least one READY subtask for my department or assigned to me
    if (actionableForMe && (actor.role === 'DEPARTMENT_USER' || actor.role === 'ADMIN')) {
      const departmentCodes = actor.departments?.length
        ? actor.departments.map((d) => String(d))
        : [];
      filterWhere.AND = filterWhere.AND ?? [];
      (filterWhere.AND as Prisma.TicketWhereInput[]).push({
        subtasks: {
          some: {
            status: 'READY',
            OR: [
              ...(departmentCodes.length > 0
                ? [{ department: { code: { in: departmentCodes } } }]
                : []),
              { ownerId: actor.id },
            ].filter(Boolean),
          },
        },
      });
    }

    // Merge scope restriction with user-supplied filters using AND
    const where: Prisma.TicketWhereInput =
      Object.keys(scopeWhere).length === 0
        ? filterWhere
        : { AND: [scopeWhere, filterWhere] };

    const skip = (page - 1) * limit;
    const select = includeCounts !== false ? TICKET_LIST_SELECT : TICKET_LIST_SELECT_LIGHT;

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    // Annotate with SLA status (computed from priority + createdAt, no extra DB query)
    let annotated: (typeof tickets[0] & { sla: ReturnType<SlaService['compute']>; readySubtasksSummary?: { id: string; title: string }[] })[] = tickets.map((t) => ({ ...t, sla: this.sla.compute(t) }));

    // Stage 6: when actionableForMe=true, attach READY subtask summary per ticket (same dept/owner filter) to avoid N+1
    if (actionableForMe && (actor.role === 'DEPARTMENT_USER' || actor.role === 'ADMIN') && annotated.length > 0) {
      const departmentCodes = actor.departments?.length ? actor.departments.map((d) => String(d)) : [];
      const readySubtasks = await this.prisma.subtask.findMany({
        where: {
          ticketId: { in: annotated.map((t) => t.id) },
          status: 'READY',
          OR: [
            ...(departmentCodes.length > 0 ? [{ department: { code: { in: departmentCodes } } }] : []),
            { ownerId: actor.id },
          ].filter((x) => Object.keys(x).length > 0),
        },
        select: { ticketId: true, id: true, title: true },
      });
      const byTicket = new Map<string, { id: string; title: string }[]>();
      for (const s of readySubtasks) {
        if (!byTicket.has(s.ticketId)) byTicket.set(s.ticketId, []);
        byTicket.get(s.ticketId)!.push({ id: s.id, title: s.title });
      }
      annotated = annotated.map((t) => ({
        ...t,
        readySubtasksSummary: byTicket.get(t.id) ?? [],
      }));
    }

    return {
      data: annotated,
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

    this.visibility.assertCanView(ticket, actor);

    return { ...ticket, sla: this.sla.compute(ticket) };
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateTicketDto, actor: RequestUser) {
    const ticket = await this.findTicketOrThrow(id);

    this.visibility.assertCanModify(ticket, actor);

    if (dto.ticketClassId != null || dto.departmentId !== undefined || dto.supportTopicId !== undefined || dto.maintenanceCategoryId !== undefined) {
      const ticketClassId = dto.ticketClassId ?? ticket.ticketClassId;
      const departmentId = dto.departmentId !== undefined ? dto.departmentId : ticket.departmentId;
      const supportTopicId = dto.supportTopicId !== undefined ? dto.supportTopicId : ticket.supportTopicId;
      const maintenanceCategoryId = dto.maintenanceCategoryId !== undefined ? dto.maintenanceCategoryId : ticket.maintenanceCategoryId;
      await this.validateTicketClassification({
        ticketClassId,
        departmentId: departmentId ?? null,
        supportTopicId: supportTopicId ?? null,
        maintenanceCategoryId: maintenanceCategoryId ?? null,
      });
    }

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
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.ticketClassId && { ticketClassId: dto.ticketClassId }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.supportTopicId !== undefined && { supportTopicId: dto.supportTopicId }),
        ...(dto.maintenanceCategoryId !== undefined && { maintenanceCategoryId: dto.maintenanceCategoryId }),
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

    // Only DEPARTMENT_USER and ADMIN can assign tickets
    if (actor.role === Role.STUDIO_USER) {
      throw new ForbiddenException('Studio users cannot assign tickets');
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

    this.mySummaryCache.invalidate(ownerId);
    if (previousOwnerId) this.mySummaryCache.invalidate(previousOwnerId);

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

    // Resolution gate: cannot RESOLVE if any required subtask is not DONE or SKIPPED (Stage 4)
    if (newStatus === 'RESOLVED') {
      const blockedSubtasks = await this.prisma.subtask.count({
        where: {
          ticketId,
          isRequired: true,
          status: { notIn: ['DONE', 'SKIPPED'] },
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
    this.mySummaryCache.invalidate(userId);
    return { ticketId, userId, watching: true };
  }

  async removeWatcher(ticketId: string, userId: string) {
    await this.findTicketOrThrow(ticketId);
    await this.prisma.ticketWatcher.deleteMany({
      where: { ticketId, userId },
    });
    this.mySummaryCache.invalidate(userId);
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
        ticketClassId: true,
        departmentId: true,
        supportTopicId: true,
        maintenanceCategoryId: true,
        studioId: true,
        marketId: true,
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  // ─── MY SUMMARY ─────────────────────────────────────────────────────────────

  async getMySummary(
    actor: RequestUser,
    page: number = 1,
    limit: number = 50,
  ) {
    const userId = actor.id;
    const cacheKey = userId;
    const useCache = page === 1 && limit === 50;
    if (useCache) {
      const cached = this.mySummaryCache.get<{
        total: number;
        open: number;
        resolved: number;
        closed: number;
        byCategory: { categoryId: string | null; categoryName: string; categoryColor: string | null; count: number }[];
        tickets: unknown[];
        page: number;
        limit: number;
        totalPages: number;
      }>(cacheKey);
      if (cached) return cached;
    }

    const scopeWhere = this.visibility.buildWhereClause(actor);

    // For getMySummary we further narrow to tickets the user is directly
    // involved with (requester, owner, or watcher), but still within their scope.
    const myTicketWhere: Prisma.TicketWhereInput = {
      AND: [
        scopeWhere,
        {
          OR: [
            { requesterId: userId },
            { ownerId: userId },
            { watchers: { some: { userId } } },
          ],
        },
      ],
    };

    // Count query — use Prisma (avoids raw SQL scope duplication)
    type CountRow = { total: number; open: number; resolved: number; closed: number };
    const [totalCount, openCount, resolvedCount, closedCount] = await Promise.all([
      this.prisma.ticket.count({ where: myTicketWhere }),
      this.prisma.ticket.count({ where: { ...myTicketWhere, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.ticket.count({ where: { ...myTicketWhere, status: 'RESOLVED' } }),
      this.prisma.ticket.count({ where: { ...myTicketWhere, status: 'CLOSED' } }),
    ]);
    const countResult: CountRow[] = [{
      total: totalCount,
      open: openCount,
      resolved: resolvedCount,
      closed: closedCount,
    }];
    const { total, open, resolved, closed } = countResult[0] ?? { total: 0, open: 0, resolved: 0, closed: 0 };

    const [byCategory, myTickets] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['categoryId'],
        where: myTicketWhere,
        _count: { id: true },
      }),
      this.prisma.ticket.findMany({
        where: myTicketWhere,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: Math.min(limit, 100),
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          updatedAt: true,
          createdAt: true,
          resolvedAt: true,
          category: { select: { id: true, name: true, color: true } },
          requester: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
    ]);

    const categoryIds = byCategory
      .map((r) => r.categoryId)
      .filter((id): id is string => id !== null);

    const categories = categoryIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, color: true },
        })
      : [];

    const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

    const byCategoryEnriched = byCategory.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryId ? (categoryMap[r.categoryId]?.name ?? 'Unknown') : 'No Category',
      categoryColor: r.categoryId ? (categoryMap[r.categoryId]?.color ?? null) : null,
      count: r._count.id,
    }));

    const totalPages = Math.ceil(total / limit);
    const result = {
      total,
      open,
      resolved,
      closed,
      byCategory: byCategoryEnriched,
      tickets: myTickets,
      page,
      limit,
      totalPages,
    };

    if (useCache) this.mySummaryCache.set(cacheKey, result);
    return result;
  }

  // ─── SCOPE SUMMARY (Studio Portal) ───────────────────────────────────────────

  /**
   * Returns open count, completed count, and recently updated tickets for the
   * current user's visibility scope (TicketVisibilityService). Used by the
   * Studio Ticket Portal dashboard.
   */
  async getScopeSummary(actor: RequestUser) {
    const scopeWhere = this.visibility.buildWhereClause(actor);
    const openStatuses: TicketStatus[] = ['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR'];
    const completedStatuses: TicketStatus[] = ['RESOLVED', 'CLOSED'];
    const whereOpen =
      Object.keys(scopeWhere).length === 0
        ? { status: { in: openStatuses } }
        : { AND: [scopeWhere, { status: { in: openStatuses } }] };
    const whereCompleted =
      Object.keys(scopeWhere).length === 0
        ? { status: { in: completedStatuses } }
        : { AND: [scopeWhere, { status: { in: completedStatuses } }] };

    const [openCount, completedCount, recentTickets] = await Promise.all([
      this.prisma.ticket.count({ where: whereOpen }),
      this.prisma.ticket.count({ where: whereCompleted }),
      this.prisma.ticket.findMany({
        where: scopeWhere,
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          updatedAt: true,
          studio: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
        },
      }),
    ]);

    return { openCount, completedCount, recentTickets };
  }
}

