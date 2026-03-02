import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { Role, SubtaskStatus } from '@prisma/client';

const SUBTASK_SELECT = {
  id: true,
  ticketId: true,
  title: true,
  description: true,
  status: true,
  isRequired: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  team: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
};

@Injectable()
export class SubtasksService {
  private readonly logger = new Logger(SubtasksService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private domainEvents: DomainEventsService,
  ) {}

  async create(ticketId: string, dto: CreateSubtaskDto, actor: RequestUser) {
    // Verify ticket exists
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, title: true, ownerId: true, status: true },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    // Requesters cannot create subtasks
    if (actor.role === Role.REQUESTER) {
      throw new ForbiddenException('Requesters cannot create subtasks');
    }

    // Validate team exists
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId, isActive: true },
    });
    if (!team) throw new NotFoundException(`Team ${dto.teamId} not found`);

    // Validate owner if specified
    if (dto.ownerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: dto.ownerId, isActive: true },
      });
      if (!owner) throw new NotFoundException(`User ${dto.ownerId} not found`);
    }

    const subtask = await this.prisma.subtask.create({
      data: {
        ticketId,
        teamId: dto.teamId,
        ownerId: dto.ownerId,
        title: dto.title,
        description: dto.description,
        isRequired: dto.isRequired ?? true,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: 'TODO',
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
        isRequired: dto.isRequired ?? true,
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

  async findByTicket(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    return this.prisma.subtask.findMany({
      where: { ticketId },
      select: SUBTASK_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(subtaskId: string, dto: UpdateSubtaskDto, actor: RequestUser) {
    const subtask = await this.findSubtaskOrThrow(subtaskId);

    if (actor.role === Role.REQUESTER) {
      throw new ForbiddenException('Requesters cannot update subtasks');
    }

    const previousStatus = subtask.status;
    const now = new Date();

    const updated = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.status && { status: dto.status }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
        // Set completedAt when status moves to DONE; clear it if re-opened
        ...(dto.status === 'DONE' ? { completedAt: now } : {}),
        ...(dto.status && dto.status !== 'DONE' && previousStatus === 'DONE'
          ? { completedAt: null }
          : {}),
      },
      select: SUBTASK_SELECT,
    });

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
        select: { ownerId: true },
      });

      if (dto.status === 'DONE') {
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
      } else if (dto.status === 'BLOCKED') {
        await this.domainEvents.emit({
          type: 'SUBTASK_BLOCKED',
          ticketId: subtask.ticketId,
          actorId: actor.id,
          occurredAt: now,
          payload: {
            subtaskId,
            subtaskTitle: subtask.title,
            ticketOwnerId: ticket?.ownerId ?? undefined,
          },
        });
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
   * Returns count of required subtasks that are NOT done.
   * Used by TicketsService.transitionStatus() to enforce the resolution gate.
   */
  async countBlockingSubtasks(ticketId: string): Promise<number> {
    return this.prisma.subtask.count({
      where: {
        ticketId,
        isRequired: true,
        status: { not: 'DONE' },
      },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async findSubtaskOrThrow(id: string) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        ticketId: true,
        ownerId: true,
        status: true,
        teamId: true,
      },
    });
    if (!subtask) throw new NotFoundException(`Subtask ${id} not found`);
    return subtask;
  }
}
