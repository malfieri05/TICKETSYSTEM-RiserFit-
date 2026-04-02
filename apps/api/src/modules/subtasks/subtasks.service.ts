import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { DomainEventsService } from '../events/domain-events.service';
import { SubtaskWorkflowService } from '../subtask-workflow/subtask-workflow.service';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { Role, TicketStatus } from '@prisma/client';
import { assertValidTransition } from '../tickets/ticket-state-machine';
import { PolicyService } from '../../policy/policy.service';
import {
  SUBTASK_CREATE,
  SUBTASK_UPDATE,
  SUBTASK_VIEW,
} from '../../policy/capabilities/capability-keys';
import { FirstResponseService } from '../../common/first-response/first-response.service';

const TICKET_FOR_VISIBILITY_SELECT = {
  id: true,
  requesterId: true,
  ownerId: true,
  studioId: true,
  department: { select: { code: true } },
  owner: { select: { teamId: true, team: { select: { name: true } } } },
} as const;

const SUBTASK_SELECT = {
  id: true,
  ticketId: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  availableAt: true,
  startedAt: true,
  completedAt: true,
  departmentId: true,
  subtaskTemplateId: true,
  createdAt: true,
  updatedAt: true,
  team: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
  department: { select: { id: true, code: true, name: true } },
  dependencyFrom: { select: { dependsOnSubtaskId: true } },
  subtaskTemplate: { select: { sortOrder: true } },
};

@Injectable()
export class SubtasksService {
  private readonly logger = new Logger(SubtasksService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private domainEvents: DomainEventsService,
    private subtaskWorkflow: SubtaskWorkflowService,
    private visibility: TicketVisibilityService,
    private policy: PolicyService,
    private firstResponse: FirstResponseService,
  ) {}

  async create(ticketId: string, dto: CreateSubtaskDto, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { ...TICKET_FOR_VISIBILITY_SELECT, title: true, status: true },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const decision = this.policy.evaluate(SUBTASK_CREATE, actor, {
      id: 'new',
      ticket: {
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId,
        studioId: ticket.studioId,
        department: ticket.department,
        owner: ticket.owner,
      },
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to create subtasks for this ticket',
      );
    }

    // Validate team exists when provided
    if (dto.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.teamId, isActive: true },
      });
      if (!team) throw new NotFoundException(`Team ${dto.teamId} not found`);
    }

    // Validate owner if specified
    if (dto.ownerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: dto.ownerId, isActive: true },
      });
      if (!owner) throw new NotFoundException(`User ${dto.ownerId} not found`);
    }

    const now = new Date();
    const subtask = await this.prisma.subtask.create({
      data: {
        ticketId,
        ...(dto.teamId && { teamId: dto.teamId }),
        ...(dto.departmentId && { departmentId: dto.departmentId }),
        ownerId: dto.ownerId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: 'READY',
        availableAt: now,
      },
      select: SUBTASK_SELECT,
    });

    await this.auditLog.log({
      actorId: actor.id,
      action: 'SUBTASK_CREATED',
      entityType: 'subtask',
      entityId: subtask.id,
      ticketId,
      newValues: {
        title: dto.title,
        teamId: dto.teamId,
        ownerId: dto.ownerId,
      },
    });

    if (dto.ownerId) {
      await this.domainEvents.emit({
        type: 'SUBTASK_ASSIGNED',
        ticketId,
        actorId: actor.id,
        occurredAt: new Date(),
        payload: {
          subtaskId: subtask.id,
          subtaskTitle: dto.title,
          ownerId: dto.ownerId,
        },
      });
    }

    return subtask;
  }

  async findByTicket(ticketId: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: TICKET_FOR_VISIBILITY_SELECT,
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const decision = this.policy.evaluate(SUBTASK_VIEW, actor, {
      id: 'list',
      ticket: {
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId,
        studioId: ticket.studioId,
        department: ticket.department,
        owner: ticket.owner,
      },
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to view subtasks for this ticket',
      );
    }

    return this.prisma.subtask.findMany({
      where: { ticketId },
      select: SUBTASK_SELECT,
      orderBy: [
        { subtaskTemplate: { sortOrder: 'asc' } },
        { createdAt: 'asc' },
      ],
    });
  }

  async update(subtaskId: string, dto: UpdateSubtaskDto, actor: RequestUser) {
    const subtask = await this.findSubtaskOrThrow(subtaskId, actor);

    const decision = this.policy.evaluate(SUBTASK_UPDATE, actor, {
      id: subtask.id,
      ticket: {
        requesterId: subtask.ticket.requesterId,
        ownerId: subtask.ticket.ownerId,
        studioId: subtask.ticket.studioId,
        department: subtask.ticket.department,
        owner: subtask.ticket.owner,
      },
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to update subtasks for this ticket',
      );
    }

    const previousStatus = subtask.status;
    const now = new Date();
    const completing = dto.status === 'DONE' || dto.status === 'SKIPPED';
    const isFirstActivity =
      dto.status &&
      dto.status !== previousStatus &&
      (dto.status === 'IN_PROGRESS' ||
        dto.status === 'DONE' ||
        dto.status === 'SKIPPED');

    // Timer logic: compute startedAt for first work activity
    const needsStartedAt =
      isFirstActivity && !subtask.startedAt;

    const { updated, becameReadyIds } = await this.prisma.$transaction(
      async (tx) => {
        const out = await tx.subtask.update({
          where: { id: subtaskId },
          data: {
            ...(dto.title && { title: dto.title }),
            ...(dto.description !== undefined && {
              description: dto.description,
            }),
            ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
            ...(dto.status && { status: dto.status }),
            ...(dto.dueDate !== undefined && {
              dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            }),
            ...(needsStartedAt ? { startedAt: now } : {}),
            ...(completing ? { completedAt: now } : {}),
            ...(dto.status &&
            !completing &&
            (previousStatus === 'DONE' || previousStatus === 'SKIPPED')
              ? { completedAt: null }
              : {}),
          },
          select: SUBTASK_SELECT,
        });
        const becameReadyIds = completing
          ? await this.subtaskWorkflow.unlockDownstreamIfSatisfied(
              tx,
              subtaskId,
            )
          : [];

        if (dto.status && dto.status !== previousStatus) {
          await this.firstResponse.recordFirstSubtaskStatusChange(
            tx,
            subtask.ticketId,
            subtaskId,
            previousStatus,
            dto.status,
            now,
          );
        }

        return { updated: out, becameReadyIds };
      },
    );

    await this.auditLog.log({
      actorId: actor.id,
      action: 'SUBTASK_UPDATED',
      entityType: 'subtask',
      entityId: subtaskId,
      ticketId: subtask.ticketId,
      oldValues: { status: previousStatus },
      newValues: dto as Record<string, unknown>,
    });

    // Domain events for status transitions
    if (dto.status && dto.status !== previousStatus) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: subtask.ticketId },
        select: { ownerId: true, requesterId: true, status: true, title: true },
      });

      // Auto-transition: NEW/TRIAGED → IN_PROGRESS when first subtask has activity
      if (
        ticket &&
        isFirstActivity &&
        (ticket.status === 'NEW' || ticket.status === 'TRIAGED')
      ) {
        try {
          assertValidTransition(
            ticket.status as TicketStatus,
            'IN_PROGRESS' as TicketStatus,
          );
          await this.prisma.ticket.update({
            where: { id: subtask.ticketId },
            data: { status: 'IN_PROGRESS' },
          });
          this.logger.log(
            `Auto-transitioned ticket ${subtask.ticketId} from ${ticket.status} → IN_PROGRESS`,
          );
          await this.domainEvents.emit({
            type: 'TICKET_STATUS_CHANGED',
            ticketId: subtask.ticketId,
            actorId: actor.id,
            occurredAt: now,
            payload: {
              previousStatus: ticket.status,
              newStatus: 'IN_PROGRESS',
              requesterId: ticket.requesterId,
              title: ticket.title,
            },
          });
        } catch {
          // Transition not valid (e.g. NEW → IN_PROGRESS may not be in machine); log and continue
          this.logger.warn(
            `Could not auto-transition ticket ${subtask.ticketId} from ${ticket.status} → IN_PROGRESS`,
          );
        }
      }

      if (completing) {
        await this.domainEvents.emit({
          type: 'SUBTASK_COMPLETED',
          ticketId: subtask.ticketId,
          actorId: actor.id,
          occurredAt: now,
          payload: {
            subtaskId,
            subtaskTitle: subtask.title,
            ticketOwnerId: ticket?.ownerId ?? undefined,
          },
        });

        // Single authoritative resolution path: check if ALL subtasks are done/skipped
        await this.checkAndResolveTicket(subtask.ticketId, actor, now);
      }
      if (becameReadyIds.length > 0) {
        const readySubtasks = await this.prisma.subtask.findMany({
          where: { id: { in: becameReadyIds } },
          select: {
            id: true,
            title: true,
            ticketId: true,
            departmentId: true,
            ownerId: true,
          },
        });
        for (const readySubtask of readySubtasks) {
          await this.domainEvents.emit({
            type: 'SUBTASK_BECAME_READY',
            ticketId: readySubtask.ticketId,
            actorId: actor.id,
            occurredAt: now,
            payload: {
              subtaskId: readySubtask.id,
              subtaskTitle: readySubtask.title,
              ticketId: readySubtask.ticketId,
              departmentId: readySubtask.departmentId,
              ownerId: readySubtask.ownerId,
            },
          });
        }
      }
    }

    // Domain event for assignment change
    if (dto.ownerId && dto.ownerId !== subtask.ownerId) {
      await this.domainEvents.emit({
        type: 'SUBTASK_ASSIGNED',
        ticketId: subtask.ticketId,
        actorId: actor.id,
        occurredAt: now,
        payload: {
          subtaskId,
          subtaskTitle: subtask.title,
          ownerId: dto.ownerId,
        },
      });
    }

    return updated;
  }

  /**
   * Single authoritative resolution path (Stage 2 §9.2).
   * Checks if ALL subtasks on the ticket are DONE or SKIPPED.
   * If so, transitions the ticket to RESOLVED via the state machine.
   */
  private async checkAndResolveTicket(
    ticketId: string,
    actor: RequestUser,
    now: Date,
  ): Promise<void> {
    const incompleteCount = await this.prisma.subtask.count({
      where: {
        ticketId,
        status: { notIn: ['DONE', 'SKIPPED'] },
      },
    });
    if (incompleteCount > 0) return;

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true, requesterId: true, title: true },
    });
    if (!ticket) return;

    // Only auto-resolve from IN_PROGRESS or WAITING states
    try {
      assertValidTransition(
        ticket.status as TicketStatus,
        'RESOLVED' as TicketStatus,
      );
    } catch {
      return;
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED', resolvedAt: now },
    });
    this.logger.log(
      `Auto-resolved ticket ${ticketId}: all subtasks are DONE or SKIPPED`,
    );

    await this.domainEvents.emit({
      type: 'TICKET_RESOLVED',
      ticketId,
      actorId: actor.id,
      occurredAt: now,
      payload: {
        previousStatus: ticket.status,
        newStatus: 'RESOLVED',
        requesterId: ticket.requesterId,
        title: ticket.title,
      },
    });
  }

  /**
   * Returns count of subtasks that are NOT done (DONE or SKIPPED satisfy the gate).
   * Used by TicketsService.transitionStatus() to enforce the resolution gate.
   */
  async countBlockingSubtasks(ticketId: string): Promise<number> {
    return this.prisma.subtask.count({
      where: {
        ticketId,
        status: { notIn: ['DONE', 'SKIPPED'] },
      },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async findSubtaskOrThrow(id: string, actor: RequestUser) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        ticketId: true,
        ownerId: true,
        status: true,
        startedAt: true,
        teamId: true,
        departmentId: true,
        ticket: {
          select: {
            requesterId: true,
            ownerId: true,
            studioId: true,
            department: { select: { code: true } },
            owner: { select: { teamId: true, team: { select: { name: true } } } },
          },
        },
      },
    });
    if (!subtask) throw new NotFoundException(`Subtask ${id} not found`);
    return subtask;
  }
}
