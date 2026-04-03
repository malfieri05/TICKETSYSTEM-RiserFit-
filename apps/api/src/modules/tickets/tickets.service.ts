import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
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
import { generateTicketTitle } from './title-generator';
import {
  Role,
  TicketStatus,
  Prisma,
  EvaluationTrigger,
  AuditAction,
} from '@prisma/client';
import { SlaService } from '../sla/sla.service';
import { TicketFormsService } from '../ticket-forms/ticket-forms.service';
import { SubtaskWorkflowService } from '../subtask-workflow/subtask-workflow.service';
import { PolicyService } from '../../policy/policy.service';
import { LeaseEvaluationService } from '../lease-iq/services/lease-evaluation.service';
import {
  TICKET_ADD_TAG,
  TICKET_ASSIGN_OWNER,
  TICKET_CREATE,
  TICKET_LIST_INBOX,
  TICKET_TRANSITION_STATUS,
  TICKET_UPDATE_CORE_FIELDS,
  TICKET_VIEW,
} from '../../policy/capabilities/capability-keys';
import { mapCommentToResponse } from '../../common/serializers/comment-response';
import { AddTicketTagDto } from './dto/add-ticket-tag.dto';
import {
  normalizeTicketTagLabel,
  TICKET_TAG_LABEL_MAX_LEN,
  TICKET_MAX_TAGS_PER_TICKET,
} from './ticket-tag.utils';

/** New tickets: due 7 calendar days from this instant (matches migration backfill). */
function defaultTicketDueDate(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + 7);
  return d;
}

// ─── Prisma select shapes (prevents N+1 and controls response size) ──────────

const TAXONOMY_SELECT = {
  ticketClass: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
  supportTopic: { select: { id: true, name: true } },
  maintenanceCategory: { select: { id: true, name: true, color: true } },
};

type TicketTagRow = {
  createdAt: Date;
  tag: { id: string; name: string; color: string | null };
  createdBy: { id: string; name: string };
};

function mapTicketTagsToResponse(
  rows: TicketTagRow[] | undefined,
): {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}[] {
  if (!rows?.length) return [];
  return rows.map((r) => ({
    id: r.tag.id,
    name: r.tag.name,
    color: r.tag.color ?? null,
    createdAt: r.createdAt.toISOString(),
    createdBy: { id: r.createdBy.id, name: r.createdBy.name },
  }));
}

const TICKET_TAGS_LIST_SELECT = {
  orderBy: { createdAt: 'asc' as const },
  take: TICKET_MAX_TAGS_PER_TICKET,
  select: {
    createdAt: true,
    createdBy: { select: { id: true, name: true } },
    tag: { select: { id: true, name: true, color: true } },
  },
} as const;

const TICKET_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  requesterId: true,
  ownerId: true,
  studioId: true,
  dispatchTradeType: true,
  dispatchReadiness: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  dueDate: true,
  ...TAXONOMY_SELECT,
  studio: { select: { id: true, name: true } },
  market: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      teamId: true,
    },
  },
  tags: TICKET_TAGS_LIST_SELECT,
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
  dispatchTradeType: true,
  dispatchReadiness: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  dueDate: true,
  ...TAXONOMY_SELECT,
  studio: { select: { id: true, name: true } },
  market: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true, avatarUrl: true } },
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      teamId: true,
    },
  },
  tags: TICKET_TAGS_LIST_SELECT,
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
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      author: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
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
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  },
  tags: TICKET_TAGS_LIST_SELECT,
  formResponses: {
    select: { fieldKey: true, value: true },
    orderBy: { fieldKey: 'asc' as const },
  },
  leaseIqResult: true,
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
    private policy: PolicyService,
    private leaseEvaluation: LeaseEvaluationService,
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
    if (!tc)
      throw new NotFoundException(
        `Ticket class ${payload.ticketClassId} not found`,
      );
    const code = tc.code as 'SUPPORT' | 'MAINTENANCE';

    if (code === 'SUPPORT') {
      if (!payload.departmentId || !payload.supportTopicId) {
        throw new BadRequestException(
          'SUPPORT tickets require departmentId and supportTopicId',
        );
      }
      const topic = await this.prisma.supportTopic.findUnique({
        where: {
          id: payload.supportTopicId,
          departmentId: payload.departmentId,
          isActive: true,
        },
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
   * When ticketClassId is missing, treat as MAINTENANCE and resolve default maintenanceCategoryId if needed.
   */
  private async resolveCreateTaxonomy(dto: CreateTicketDto): Promise<{
    ticketClassId: string;
    departmentId: string | null;
    supportTopicId: string | null;
    maintenanceCategoryId: string | null;
  }> {
    let ticketClassId = dto.ticketClassId ?? null;
    let maintenanceCategoryId = dto.maintenanceCategoryId ?? null;
    const departmentId = dto.departmentId ?? null;
    const supportTopicId = dto.supportTopicId ?? null;

    if (!ticketClassId) {
      const maintenanceClass = await this.prisma.ticketClass.findFirst({
        where: { code: 'MAINTENANCE', isActive: true },
        select: { id: true },
      });
      if (!maintenanceClass)
        throw new NotFoundException('Ticket class MAINTENANCE not found');
      ticketClassId = maintenanceClass.id;
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
      ticketClassId: ticketClassId,
      departmentId,
      supportTopicId,
      maintenanceCategoryId,
    };
  }

  async create(dto: CreateTicketDto, actor: RequestUser) {
    const createDecision = this.policy.evaluate(TICKET_CREATE, actor, null);
    if (!createDecision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to create tickets',
      );
    }

    const resolved = await this.resolveCreateTaxonomy(dto);

    await this.validateTicketClassification({
      ticketClassId: resolved.ticketClassId,
      departmentId: resolved.departmentId,
      supportTopicId: resolved.supportTopicId,
      maintenanceCategoryId: resolved.maintenanceCategoryId,
    });

    // Stage 3: validate formResponses against schema when provided
    let schemaForResponses: Awaited<
      ReturnType<TicketFormsService['getSchema']>
    > | null = null;
    if (dto.formResponses && Object.keys(dto.formResponses).length > 0) {
      try {
        schemaForResponses = await this.ticketForms.getSchema({
          ticketClassId: resolved.ticketClassId,
          departmentId: resolved.departmentId ?? undefined,
          supportTopicId: resolved.supportTopicId ?? undefined,
          maintenanceCategoryId: resolved.maintenanceCategoryId ?? undefined,
        });
      } catch (e) {
        if (e instanceof NotFoundException || e instanceof BadRequestException)
          throw e;
        throw new BadRequestException(
          'Form schema could not be loaded for this ticket context. Omit formResponses or set ticket class and topic.',
        );
      }
      const requiredKeys = schemaForResponses.fields
        .filter((f) => f.required)
        .map((f) => f.fieldKey);
      for (const key of requiredKeys) {
        const val = dto.formResponses[key];
        if (val === undefined || val === null || String(val).trim() === '') {
          throw new BadRequestException(
            `Required form field "${key}" is missing or empty`,
          );
        }
      }
    }

    if (dto.ownerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: dto.ownerId, isActive: true },
      });
      if (!owner)
        throw new NotFoundException(`Owner user ${dto.ownerId} not found`);
    }

    // Stage 21: resolve title — backend is single source of truth for generated titles
    const incomingTitle = (dto.title ?? '').trim();
    const isSchemaBacked =
      (resolved.supportTopicId != null ||
        resolved.maintenanceCategoryId != null) &&
      dto.formResponses != null &&
      Object.keys(dto.formResponses).length > 0;

    let titleToStore: string;
    if (incomingTitle === '') {
      if (!isSchemaBacked) {
        throw new BadRequestException(
          'Title is required when not using a schema-backed ticket (topic/category + form responses).',
        );
      }
      const [ticketClass, supportTopic, maintenanceCategory, studio] =
        await Promise.all([
          this.prisma.ticketClass.findUnique({
            where: { id: resolved.ticketClassId },
            select: { code: true },
          }),
          resolved.supportTopicId
            ? this.prisma.supportTopic.findUnique({
                where: { id: resolved.supportTopicId },
                select: { name: true },
              })
            : null,
          resolved.maintenanceCategoryId
            ? this.prisma.maintenanceCategory.findUnique({
                where: { id: resolved.maintenanceCategoryId },
                select: { name: true },
              })
            : null,
          dto.studioId
            ? this.prisma.studio.findUnique({
                where: { id: dto.studioId },
                select: { name: true },
              })
            : null,
        ]);
      const ticketClassCode =
        ticketClass?.code === 'MAINTENANCE' ? 'MAINTENANCE' : 'SUPPORT';
      titleToStore = generateTicketTitle({
        ticketClassCode,
        supportTopicName: supportTopic?.name ?? null,
        maintenanceCategoryName: maintenanceCategory?.name ?? null,
        formResponses: dto.formResponses!,
        studioName: studio?.name ?? null,
      });
    } else {
      if (incomingTitle.length < 3) {
        throw new BadRequestException(
          'Title must be at least 3 characters when provided.',
        );
      }
      titleToStore = incomingTitle;
    }
    if (titleToStore.length === 0) {
      titleToStore =
        resolved.maintenanceCategoryId != null
          ? 'Maintenance Request'
          : 'Support Request';
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const createAt = new Date();
      const created = await tx.ticket.create({
        data: {
          title: titleToStore,
          description: dto.description ?? '',
          ticketClassId: resolved.ticketClassId,
          departmentId: resolved.departmentId,
          supportTopicId: resolved.supportTopicId,
          maintenanceCategoryId: resolved.maintenanceCategoryId,
          studioId: dto.studioId ?? null,
          marketId: dto.marketId ?? null,
          ownerId: dto.ownerId ?? null,
          priority: dto.priority ?? 'MEDIUM',
          requesterId: actor.id,
          status: 'NEW',
          dueDate: defaultTicketDueDate(createAt),
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
      if (
        schemaForResponses &&
        dto.formResponses &&
        Object.keys(dto.formResponses).length > 0
      ) {
        const validKeys = new Set(
          schemaForResponses.fields.map((f) => f.fieldKey),
        );
        for (const [fieldKey, value] of Object.entries(dto.formResponses)) {
          if (!validKeys.has(fieldKey)) continue;
          await tx.ticketFormResponse.create({
            data: {
              ticketId: created.id,
              fieldKey,
              value: String(value ?? ''),
            },
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
    if (ticket.ownerId && ticket.ownerId !== actor.id)
      this.mySummaryCache.invalidate(ticket.ownerId);

    // Audit log
    await this.auditLog.log({
      actorId: actor.id,
      action: 'CREATED',
      entityType: 'ticket',
      entityId: ticket.id,
      ticketId: ticket.id,
      newValues: {
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
      },
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
        title: ticket.title,
      },
    });

    // Stage 5: emit SUBTASK_BECAME_READY for each initially READY subtask (workflow instantiation)
    const initialReadySubtasks = await this.prisma.subtask.findMany({
      where: { ticketId: ticket.id, status: 'READY' },
      select: {
        id: true,
        title: true,
        ticketId: true,
        departmentId: true,
        ownerId: true,
      },
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

    // Lease IQ: evaluate maintenance tickets with studio (await so result is persisted before client sees ticket)
    try {
      await this.leaseEvaluation.evaluate(ticket.id, EvaluationTrigger.CREATE);
    } catch {
      // Do not fail ticket create if evaluation errors
    }

    return {
      ...ticket,
      tags: mapTicketTagsToResponse(ticket.tags as TicketTagRow[] | undefined),
    };
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async findAll(filters: TicketFiltersDto, actor: RequestUser) {
    const listDecision = this.policy.evaluate(TICKET_LIST_INBOX, actor, null);
    if (!listDecision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to list tickets',
      );
    }
    filters.normalize();
    const {
      status,
      statusGroup,
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

    // Stage 30: server-side page size clamp (max 100); applies even if DTO validation is bypassed.
    const limitClamped = Math.min(limit, 100);

    const scopeWhere = this.visibility.buildWhereClause(actor);

    // Stage 23: STUDIO_USER may only filter by a studio they are allowed to view; otherwise 403
    if (actor.role === Role.STUDIO_USER && studioId) {
      const allowedStudioIds = [
        actor.studioId,
        ...(actor.scopeStudioIds ?? []),
      ].filter(Boolean);
      if (!allowedStudioIds.includes(studioId)) {
        throw new ForbiddenException(
          'You may only filter by a location you are allowed to view',
        );
      }
    }

    // statusGroup takes precedence over individual status
    const resolvedStatusFilter: Prisma.TicketWhereInput =
      statusGroup === 'active'
        ? { status: { notIn: ['RESOLVED', 'CLOSED'] as TicketStatus[] } }
        : statusGroup === 'completed'
          ? { status: { in: ['RESOLVED', 'CLOSED'] as TicketStatus[] } }
          : status
            ? { status }
            : {};

    // Search: support ID lookup alongside title/description
    const searchFilter: Prisma.TicketWhereInput | undefined = search
      ? (() => {
          const searchConditions: Prisma.TicketWhereInput[] =
            searchInTitleOnly === true
              ? [{ title: { contains: search, mode: 'insensitive' } }]
              : [
                  { title: { contains: search, mode: 'insensitive' } },
                  { description: { contains: search, mode: 'insensitive' } },
                ];
          // Search by ticket ID: exact match or prefix (startsWith)
          searchConditions.push({ id: { equals: search } });
          if (search.length >= 4) {
            searchConditions.push({ id: { startsWith: search } });
          }
          return { OR: searchConditions };
        })()
      : undefined;

    const filterWhere: Prisma.TicketWhereInput = {
      ...resolvedStatusFilter,
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
      ...(searchFilter && searchFilter),
    };

    // Actionable filter (spec §9.1): tickets with at least one incomplete subtask
    // (status not DONE/SKIPPED) assigned to the user OR for a department the user is responsible for.
    if (
      actionableForMe &&
      (actor.role === 'DEPARTMENT_USER' || actor.role === 'ADMIN')
    ) {
      const departmentCodes = actor.departments?.length
        ? actor.departments.map((d) => String(d))
        : [];
      filterWhere.AND = filterWhere.AND ?? [];
      (filterWhere.AND as Prisma.TicketWhereInput[]).push({
        subtasks: {
          some: {
            status: { notIn: ['DONE', 'SKIPPED'] },
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

    const skip = (page - 1) * limitClamped;
    const select =
      includeCounts !== false ? TICKET_LIST_SELECT : TICKET_LIST_SELECT_LIGHT;

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limitClamped,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    // Annotate with SLA status (computed from priority + createdAt, no extra DB query)
    let annotated: ((typeof tickets)[0] & {
      sla: ReturnType<SlaService['compute']>;
      readySubtasksSummary?: { id: string; title: string }[];
      completedSubtasks?: number;
      totalSubtasks?: number;
      progressPercent?: number;
    })[] = tickets.map((t) => ({ ...t, sla: this.sla.compute(t) }));

    // Subtask progress for feed (completed / total / progressPercent) — two groupBy calls, no _count dependency
    if (annotated.length > 0) {
      const ticketIds = annotated.map((t) => t.id);
      const [completedByTicket, totalByTicket] = await Promise.all([
        this.prisma.subtask.groupBy({
          by: ['ticketId'],
          _count: { id: true },
          where: {
            ticketId: { in: ticketIds },
            status: { in: ['DONE', 'SKIPPED'] },
          },
        }),
        this.prisma.subtask.groupBy({
          by: ['ticketId'],
          _count: { id: true },
          where: { ticketId: { in: ticketIds } },
        }),
      ]);
      const completedMap = new Map(
        completedByTicket.map((r) => [r.ticketId, r._count.id]),
      );
      const totalMap = new Map(
        totalByTicket.map((r) => [r.ticketId, r._count.id]),
      );
      annotated = annotated.map((t) => {
        const total = totalMap.get(t.id) ?? 0;
        const completed = completedMap.get(t.id) ?? 0;
        return {
          ...t,
          totalSubtasks: total,
          completedSubtasks: completed,
          progressPercent:
            total === 0 ? 0 : Math.floor((completed / total) * 100),
        };
      });
    }

    // Attach incomplete subtask summary per ticket when actionableForMe=true (avoids N+1)
    if (
      actionableForMe &&
      (actor.role === 'DEPARTMENT_USER' || actor.role === 'ADMIN') &&
      annotated.length > 0
    ) {
      const departmentCodes = actor.departments?.length
        ? actor.departments.map((d) => String(d))
        : [];
      const readySubtasks = await this.prisma.subtask.findMany({
        where: {
          ticketId: { in: annotated.map((t) => t.id) },
          status: { notIn: ['DONE', 'SKIPPED'] },
          OR: [
            ...(departmentCodes.length > 0
              ? [{ department: { code: { in: departmentCodes } } }]
              : []),
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

    const withTags = annotated.map((t) => ({
      ...t,
      tags: mapTicketTagsToResponse(t.tags as TicketTagRow[] | undefined),
    }));

    return {
      data: withTags,
      total,
      page,
      limit: limitClamped,
      totalPages: Math.ceil(total / limitClamped),
    };
  }

  // ─── GET BY ID ───────────────────────────────────────────────────────────────

  async findById(id: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: TICKET_DETAIL_SELECT,
    });

    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);

    const decision = this.policy.evaluate(TICKET_VIEW, actor, ticket);
    if (!decision.allowed) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    // Server-side progress calculation (Stage 2 §8)
    const subtaskArray = ticket.subtasks ?? [];
    const totalSubtasks = subtaskArray.length;
    const completedSubtasks = subtaskArray.filter(
      (s: { status: string }) =>
        s.status === 'DONE' || s.status === 'SKIPPED',
    ).length;
    const progressPercent =
      totalSubtasks === 0
        ? 0
        : Math.floor((completedSubtasks / totalSubtasks) * 100);

    // Build thread shape: top-level comments with nested replies
    const mappedComments = ticket.comments.map((c) => ({
      ...mapCommentToResponse(c),
      parentCommentId: (c as any).parentCommentId as string | null,
    }));
    const topLevel = mappedComments.filter((c) => c.parentCommentId === null);
    const repliesByParent = new Map<string, typeof mappedComments>();
    for (const c of mappedComments) {
      if (c.parentCommentId) {
        const arr = repliesByParent.get(c.parentCommentId) ?? [];
        arr.push(c);
        repliesByParent.set(c.parentCommentId, arr);
      }
    }
    const threadedComments = topLevel.map((c) => ({
      ...c,
      replies: repliesByParent.get(c.id) ?? [],
    }));

    return {
      ...ticket,
      tags: mapTicketTagsToResponse(ticket.tags as TicketTagRow[] | undefined),
      comments: threadedComments,
      sla: this.sla.compute(ticket),
      completedSubtasks,
      totalSubtasks,
      progressPercent,
    };
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateTicketDto, actor: RequestUser) {
    const ticket = await this.findTicketOrThrow(id);

    const decision = this.policy.evaluate(
      TICKET_UPDATE_CORE_FIELDS,
      actor,
      ticket,
    );
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to update this ticket',
      );
    }

    // Dispatch fields are only valid for maintenance tickets — reject with 400 for non-maintenance
    if (dto.dispatchTradeType !== undefined || dto.dispatchReadiness !== undefined) {
      const ticketClass = await this.prisma.ticketClass.findUnique({
        where: { id: ticket.ticketClassId },
        select: { code: true },
      });
      if (ticketClass?.code !== 'MAINTENANCE') {
        throw new BadRequestException(
          'Dispatch fields (dispatchTradeType, dispatchReadiness) are only valid for maintenance tickets',
        );
      }
    }

    if (
      dto.ticketClassId != null ||
      dto.departmentId !== undefined ||
      dto.supportTopicId !== undefined ||
      dto.maintenanceCategoryId !== undefined
    ) {
      const ticketClassId = dto.ticketClassId ?? ticket.ticketClassId;
      const departmentId =
        dto.departmentId !== undefined ? dto.departmentId : ticket.departmentId;
      const supportTopicId =
        dto.supportTopicId !== undefined
          ? dto.supportTopicId
          : ticket.supportTopicId;
      const maintenanceCategoryId =
        dto.maintenanceCategoryId !== undefined
          ? dto.maintenanceCategoryId
          : ticket.maintenanceCategoryId;
      await this.validateTicketClassification({
        ticketClassId,
        departmentId: departmentId ?? null,
        supportTopicId: supportTopicId ?? null,
        maintenanceCategoryId: maintenanceCategoryId ?? null,
      });
    }

    const oldValues: Record<string, unknown> = {
      title: ticket.title,
      priority: ticket.priority,
    };
    if (
      dto.formResponses != null &&
      Object.keys(dto.formResponses).length > 0
    ) {
      const existing = await this.prisma.ticketFormResponse.findMany({
        where: { ticketId: id },
        select: { fieldKey: true, value: true },
      });
      oldValues.formResponses = Object.fromEntries(
        existing.map((r) => [r.fieldKey, r.value]),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.update({
        where: { id },
        data: {
          ...(dto.title && { title: dto.title }),
          ...(dto.description && { description: dto.description }),
          ...(dto.ticketClassId && { ticketClassId: dto.ticketClassId }),
          ...(dto.departmentId !== undefined && {
            departmentId: dto.departmentId,
          }),
          ...(dto.supportTopicId !== undefined && {
            supportTopicId: dto.supportTopicId,
          }),
          ...(dto.maintenanceCategoryId !== undefined && {
            maintenanceCategoryId: dto.maintenanceCategoryId,
          }),
          ...(dto.studioId !== undefined && { studioId: dto.studioId }),
          ...(dto.marketId !== undefined && { marketId: dto.marketId }),
          ...(dto.priority && { priority: dto.priority }),
          ...(dto.dispatchTradeType !== undefined && {
            dispatchTradeType: dto.dispatchTradeType,
          }),
          ...(dto.dispatchReadiness !== undefined && {
            dispatchReadiness: dto.dispatchReadiness,
          }),
        },
        select: TICKET_LIST_SELECT,
      });
      if (
        dto.formResponses != null &&
        Object.keys(dto.formResponses).length > 0
      ) {
        for (const [fieldKey, value] of Object.entries(dto.formResponses)) {
          await tx.ticketFormResponse.upsert({
            where: { ticketId_fieldKey: { ticketId: id, fieldKey } },
            create: {
              ticketId: id,
              fieldKey,
              value: String(value ?? ''),
            },
            update: { value: String(value ?? '') },
          });
        }
      }
      return result;
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

    return {
      ...updated,
      tags: mapTicketTagsToResponse(updated.tags as TicketTagRow[] | undefined),
    };
  }

  // ─── ASSIGN ──────────────────────────────────────────────────────────────────

  async assign(ticketId: string, ownerId: string, actor: RequestUser) {
    const ticket = await this.findTicketOrThrow(ticketId);
    const decision = this.policy.evaluate(TICKET_ASSIGN_OWNER, actor, ticket);
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to assign tickets',
      );
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

    return {
      ...updated,
      tags: mapTicketTagsToResponse(updated.tags as TicketTagRow[] | undefined),
    };
  }

  // ─── TRANSITION STATUS ───────────────────────────────────────────────────────

  async transitionStatus(
    ticketId: string,
    newStatus: TicketStatus,
    actor: RequestUser,
  ) {
    const ticket = await this.findTicketOrThrow(ticketId);

    const decision = this.policy.evaluate(
      TICKET_TRANSITION_STATUS,
      actor,
      ticket,
    );
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to transition ticket status',
      );
    }

    // Validate the transition is legal
    assertValidTransition(ticket.status, newStatus);

    // Resolution gate: cannot RESOLVE if any subtask is not DONE or SKIPPED (Stage 2: all subtasks, not just "required")
    if (newStatus === 'RESOLVED') {
      const incompleteSubtasks = await this.prisma.subtask.count({
        where: {
          ticketId,
          status: { notIn: ['DONE', 'SKIPPED'] },
        },
      });

      if (incompleteSubtasks > 0) {
        throw new BadRequestException(
          `Cannot resolve ticket: ${incompleteSubtasks} subtask(s) are not yet complete.`,
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
    let eventType:
      | 'TICKET_STATUS_CHANGED'
      | 'TICKET_RESOLVED'
      | 'TICKET_CLOSED' = 'TICKET_STATUS_CHANGED';
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

    return {
      ...updated,
      tags: mapTicketTagsToResponse(updated.tags as TicketTagRow[] | undefined),
    };
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

  async getMySummary(actor: RequestUser, page: number = 1, limit: number = 50) {
    // Stage 30: server-side page size clamp (max 100); applies even if validation is bypassed.
    const limitClamped = Math.min(limit, 100);

    const userId = actor.id;
    const cacheKey = userId;
    const useCache = page === 1 && limit === 50;
    if (useCache) {
      const cached = this.mySummaryCache.get<{
        total: number;
        open: number;
        resolved: number;
        closed: number;
        byCategory: {
          categoryId: string | null;
          categoryName: string;
          categoryColor: string | null;
          count: number;
        }[];
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
    type CountRow = {
      total: number;
      open: number;
      resolved: number;
      closed: number;
    };
    const [totalCount, openCount, resolvedCount, closedCount] =
      await Promise.all([
        this.prisma.ticket.count({ where: myTicketWhere }),
        this.prisma.ticket.count({
          where: {
            ...myTicketWhere,
            status: { notIn: ['RESOLVED', 'CLOSED'] },
          },
        }),
        this.prisma.ticket.count({
          where: { ...myTicketWhere, status: 'RESOLVED' },
        }),
        this.prisma.ticket.count({
          where: { ...myTicketWhere, status: 'CLOSED' },
        }),
      ]);
    const countResult: CountRow[] = [
      {
        total: totalCount,
        open: openCount,
        resolved: resolvedCount,
        closed: closedCount,
      },
    ];
    const { total, open, resolved, closed } = countResult[0] ?? {
      total: 0,
      open: 0,
      resolved: 0,
      closed: 0,
    };

    const [byMaintenance, bySupport, myTickets] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['maintenanceCategoryId'],
        where: { ...myTicketWhere, maintenanceCategoryId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['supportTopicId'],
        where: { ...myTicketWhere, supportTopicId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.ticket.findMany({
        where: myTicketWhere,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limitClamped,
        take: limitClamped,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          updatedAt: true,
          createdAt: true,
          resolvedAt: true,
          supportTopic: { select: { id: true, name: true } },
          maintenanceCategory: {
            select: { id: true, name: true, color: true },
          },
          requester: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
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
            select: { id: true, name: true, color: true },
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
      maintenanceCategories.map((c) => [c.id, c]),
    );
    const topicMap = Object.fromEntries(supportTopics.map((t) => [t.id, t]));

    const byCategoryEnriched = [
      ...byMaintenance.map((r) => ({
        categoryId: r.maintenanceCategoryId,
        categoryName: r.maintenanceCategoryId
          ? (maintMap[r.maintenanceCategoryId]?.name ?? 'Unknown')
          : 'No Category',
        categoryColor: r.maintenanceCategoryId
          ? (maintMap[r.maintenanceCategoryId]?.color ?? null)
          : null,
        count: r._count.id,
      })),
      ...bySupport.map((r) => ({
        categoryId: r.supportTopicId,
        categoryName: r.supportTopicId
          ? (topicMap[r.supportTopicId]?.name ?? 'Unknown')
          : 'No Category',
        categoryColor: null as string | null,
        count: r._count.id,
      })),
    ].sort((a, b) => b.count - a.count);

    const totalPages = Math.ceil(total / limitClamped);
    const result = {
      total,
      open,
      resolved,
      closed,
      byCategory: byCategoryEnriched,
      tickets: myTickets,
      page,
      limit: limitClamped,
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
    const openStatuses: TicketStatus[] = [
      'NEW',
      'TRIAGED',
      'IN_PROGRESS',
      'WAITING_ON_REQUESTER',
      'WAITING_ON_VENDOR',
    ];
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
          dueDate: true,
          updatedAt: true,
          studio: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
        },
      }),
    ]);

    const out: {
      openCount: number;
      completedCount: number;
      recentTickets: typeof recentTickets;
      allowedStudios?: { id: string; name: string }[];
    } = {
      openCount,
      completedCount,
      recentTickets,
    };

    // Stage 23: for STUDIO_USER, include allowed studios so portal can show location filter
    if (actor.role === Role.STUDIO_USER) {
      const studioIds = [
        actor.studioId,
        ...(actor.scopeStudioIds ?? []),
      ].filter((id): id is string => !!id);
      if (studioIds.length > 0) {
        const studios = await this.prisma.studio.findMany({
          where: { id: { in: studioIds } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        out.allowedStudios = studios;
      }
    }

    return out;
  }

  // ─── INBOX FOLDERS (Stage 23: department-scoped topic folders with active counts) ─

  /**
   * Returns folders (All + support topics for actor's departments) with active ticket counts.
   * Only DEPARTMENT_USER and ADMIN; controller enforces roles.
   * Uses grouped count by supportTopicId + one total count for "All".
   */
  async getInboxFolders(actor: RequestUser): Promise<{
    folders: { id: string; label: string; activeCount: number }[];
  }> {
    if (actor.role !== Role.DEPARTMENT_USER && actor.role !== Role.ADMIN) {
      return { folders: [] };
    }

    const departmentCodes = (actor.departments ?? [])
      .map((d) => String(d))
      .filter(Boolean);
    if (departmentCodes.length === 0) {
      const scopeWhere = this.visibility.buildWhereClause(actor);
      const activeStatuses: TicketStatus[] = [
        'NEW',
        'TRIAGED',
        'IN_PROGRESS',
        'WAITING_ON_REQUESTER',
        'WAITING_ON_VENDOR',
      ];
      const baseWhere: Prisma.TicketWhereInput =
        Object.keys(scopeWhere).length === 0
          ? { status: { in: activeStatuses } }
          : { AND: [scopeWhere, { status: { in: activeStatuses } }] };
      const allCount = await this.prisma.ticket.count({ where: baseWhere });
      return { folders: [{ id: 'all', label: 'All', activeCount: allCount }] };
    }

    const departments = await this.prisma.taxonomyDepartment.findMany({
      where: { code: { in: departmentCodes }, isActive: true },
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });
    const departmentIds = departments.map((d) => d.id);
    if (departmentIds.length === 0) {
      return { folders: [{ id: 'all', label: 'All', activeCount: 0 }] };
    }

    const topics = await this.prisma.supportTopic.findMany({
      where: { departmentId: { in: departmentIds }, isActive: true },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
    });

    const scopeWhere = this.visibility.buildWhereClause(actor);
    const activeStatuses: TicketStatus[] = [
      'NEW',
      'TRIAGED',
      'IN_PROGRESS',
      'WAITING_ON_REQUESTER',
      'WAITING_ON_VENDOR',
    ];
    const baseWhere: Prisma.TicketWhereInput =
      Object.keys(scopeWhere).length === 0
        ? { status: { in: activeStatuses } }
        : { AND: [scopeWhere, { status: { in: activeStatuses } }] };

    const [allCount, groupedByTopic] = await Promise.all([
      this.prisma.ticket.count({ where: baseWhere }),
      this.prisma.ticket.groupBy({
        by: ['supportTopicId'],
        _count: { id: true },
        where: {
          ...baseWhere,
          supportTopicId: { not: null },
        },
      }),
    ]);

    const countByTopicId = new Map<string, number>(
      groupedByTopic
        .filter((r) => r.supportTopicId != null)
        .map((r) => [r.supportTopicId!, r._count.id]),
    );

    const folders: { id: string; label: string; activeCount: number }[] = [
      { id: 'all', label: 'All', activeCount: allCount },
      ...topics.map((t) => ({
        id: t.id,
        label: t.name,
        activeCount: countByTopicId.get(t.id) ?? 0,
      })),
    ];

    return { folders };
  }

  async addTag(ticketId: string, dto: AddTicketTagDto, actor: RequestUser) {
    const raw = dto.label;
    if (raw.length > TICKET_TAG_LABEL_MAX_LEN) {
      throw new BadRequestException({
        code: 'INVALID_TAG_INPUT',
        message: 'Tag label is too long',
      });
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_TAG_INPUT',
        message: 'Tag label cannot be empty',
      });
    }
    const labelNormalized = normalizeTicketTagLabel(raw);
    if (labelNormalized.length === 0 || labelNormalized.length > TICKET_TAG_LABEL_MAX_LEN) {
      throw new BadRequestException({
        code: 'INVALID_TAG_INPUT',
        message: 'Tag label is invalid after normalization',
      });
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        title: true,
        requesterId: true,
        ownerId: true,
        studioId: true,
        department: { select: { code: true } },
        owner: { select: { teamId: true, team: { select: { name: true } } } },
      },
    });

    if (!ticket) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Ticket not found',
      });
    }

    const viewDecision = this.policy.evaluate(TICKET_VIEW, actor, ticket);
    if (!viewDecision.allowed) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Ticket not found',
      });
    }

    const tagDecision = this.policy.evaluate(TICKET_ADD_TAG, actor, ticket);
    if (!tagDecision.allowed) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_TAG_CREATION',
        message: 'You do not have permission to add tags to this ticket',
      });
    }

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    const authorName = actorUser?.name ?? 'Someone';

    const run = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.ticketTag.count({
        where: { ticketId },
      });
      if (existingCount >= TICKET_MAX_TAGS_PER_TICKET) {
        throw new BadRequestException({
          code: 'TAG_LIMIT_REACHED',
          message: `A ticket may have at most ${TICKET_MAX_TAGS_PER_TICKET} tags`,
        });
      }

      let tagRow = await tx.tag.findUnique({
        where: { name: labelNormalized },
      });
      if (!tagRow) {
        try {
          tagRow = await tx.tag.create({
            data: { name: labelNormalized, color: dto.color ?? 'orange' },
          });
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            tagRow = await tx.tag.findUniqueOrThrow({
              where: { name: labelNormalized },
            });
          } else {
            throw e;
          }
        }
      }

      let junction: { createdAt: Date };
      try {
        junction = await tx.ticketTag.create({
          data: {
            ticketId,
            tagId: tagRow.id,
            createdByUserId: actor.id,
          },
          select: { createdAt: true },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException({
            code: 'TAG_ALREADY_EXISTS_ON_TICKET',
            message: 'This tag is already on the ticket',
          });
        }
        throw e;
      }

      await tx.ticket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.TICKET_TAG_ADDED,
          entityType: 'ticket_tag',
          entityId: `${ticketId}:${tagRow.id}`,
          ticketId,
          newValues: { tagId: tagRow.id, tagName: labelNormalized },
        },
      });

      return { tagId: tagRow.id, createdAt: junction.createdAt };
    });

    const createdTagId = run.tagId;
    const createdAt = run.createdAt;

    await this.domainEvents.emit({
      type: 'TICKET_TAG_ADDED',
      ticketId,
      actorId: actor.id,
      occurredAt: new Date(),
      payload: {
        tagId: createdTagId,
        tagLabel: labelNormalized,
        authorName,
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId ?? undefined,
        title: ticket.title,
      },
    });

    this.logger.log(`Tag added: ticket=${ticketId} tag=${createdTagId}`);

    return {
      tag: { id: createdTagId, name: labelNormalized, color: dto.color ?? 'orange' },
      createdAt: createdAt.toISOString(),
      createdBy: { id: actor.id, name: authorName },
    };
  }

  async removeTag(ticketId: string, tagId: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        requesterId: true,
        ownerId: true,
        studioId: true,
        department: { select: { code: true } },
        owner: { select: { teamId: true, team: { select: { name: true } } } },
      },
    });

    if (!ticket) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Ticket not found',
      });
    }

    const viewDecision = this.policy.evaluate(TICKET_VIEW, actor, ticket);
    if (!viewDecision.allowed) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Ticket not found',
      });
    }

    const tagDecision = this.policy.evaluate(TICKET_ADD_TAG, actor, ticket);
    if (!tagDecision.allowed) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_TAG_CREATION',
        message: 'You do not have permission to remove tags from this ticket',
      });
    }

    const junction = await this.prisma.ticketTag.findUnique({
      where: {
        ticketId_tagId: { ticketId, tagId },
      },
      select: {
        tag: { select: { name: true } },
      },
    });

    if (!junction) {
      throw new NotFoundException({
        code: 'TAG_NOT_ON_TICKET',
        message: 'Tag is not on this ticket',
      });
    }

    const tagName = junction.tag.name;

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketTag.delete({
        where: { ticketId_tagId: { ticketId, tagId } },
      });
      await tx.ticket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.TICKET_TAG_REMOVED,
          entityType: 'ticket_tag',
          entityId: `${ticketId}:${tagId}`,
          ticketId,
          oldValues: { tagId, tagName },
        },
      });
    });

    this.logger.log(`Tag removed: ticket=${ticketId} tag=${tagId}`);

    return { ok: true as const };
  }
}
