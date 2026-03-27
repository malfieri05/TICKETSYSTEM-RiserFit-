import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditLogService } from '../../../common/audit-log/audit-log.service';
import { DispatchTradeType, DispatchGroupStatus, Prisma } from '@prisma/client';

const MAINTENANCE_CLASS_CODE = 'MAINTENANCE';
const ACTIVE_GROUP_STATUSES: DispatchGroupStatus[] = ['DRAFT', 'READY_TO_SEND'];
const MAX_ITEMS_PER_GROUP = 20;

const GROUP_DETAIL_SELECT = {
  id: true,
  tradeType: true,
  createdBy: true,
  status: true,
  targetDate: true,
  notes: true,
  vendorId: true,
  createdAt: true,
  updatedAt: true,
  creator: {
    select: { id: true, name: true, email: true },
  },
  items: {
    orderBy: { stopOrder: 'asc' as const },
    select: {
      id: true,
      ticketId: true,
      stopOrder: true,
      estimatedDurationMinutes: true,
      createdAt: true,
      ticket: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          studioId: true,
          dispatchTradeType: true,
          dispatchReadiness: true,
          studio: {
            select: {
              id: true,
              name: true,
              formattedAddress: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DispatchGroupSelect;

const VALID_TRANSITIONS: Record<DispatchGroupStatus, DispatchGroupStatus[]> = {
  DRAFT: ['READY_TO_SEND', 'CANCELLED'],
  READY_TO_SEND: ['CANCELLED'],
  CANCELLED: [],
  // Schema-only; not implemented in V1:
  SENT_TO_VENDOR: [],
  SCHEDULED: [],
  IN_PROGRESS: [],
  COMPLETED: [],
};

@Injectable()
export class DispatchGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findById(id: string) {
    const group = await this.prisma.dispatchGroup.findUnique({
      where: { id },
      select: GROUP_DETAIL_SELECT,
    });
    if (!group) throw new NotFoundException(`Dispatch group ${id} not found`);
    return group;
  }

  async findAll(filters: {
    status?: DispatchGroupStatus;
    tradeType?: DispatchTradeType;
    page?: number;
    limit?: number;
  }) {
    const { status, tradeType, page = 1, limit = 20 } = filters;
    const where: Prisma.DispatchGroupWhereInput = {
      ...(status && { status }),
      ...(tradeType && { tradeType }),
    };
    const take = Math.min(limit, 50);
    const skip = (page - 1) * take;

    const [data, total] = await Promise.all([
      this.prisma.dispatchGroup.findMany({
        where,
        select: GROUP_DETAIL_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.dispatchGroup.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async create(input: {
    tradeType: DispatchTradeType;
    ticketIds: string[];
    notes?: string;
    targetDate?: string;
    actorId: string;
  }) {
    const { tradeType, ticketIds, notes, targetDate, actorId } = input;

    if (!ticketIds.length) {
      throw new BadRequestException('At least one ticket is required');
    }

    const maintenanceClass = await this.getMaintenanceClassId();
    await this.validateTicketsForGroup(ticketIds, maintenanceClass);

    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dispatchGroup.create({
        data: {
          tradeType,
          createdBy: actorId,
          status: 'DRAFT',
          notes: notes ?? null,
          targetDate: targetDate ? new Date(targetDate) : null,
        },
      });

      const itemsData = ticketIds.map((ticketId, index) => ({
        dispatchGroupId: created.id,
        ticketId,
        stopOrder: index + 1,
      }));
      await tx.dispatchGroupItem.createMany({ data: itemsData });

      return tx.dispatchGroup.findUnique({
        where: { id: created.id },
        select: GROUP_DETAIL_SELECT,
      });
    });

    await this.auditLog.log({
      actorId,
      action: 'CREATED',
      entityType: 'dispatch_group',
      entityId: group!.id,
      newValues: { tradeType, ticketIds, notes },
    });

    return group;
  }

  async addItem(groupId: string, ticketId: string, actorId: string) {
    const group = await this.assertGroupEditable(groupId);

    const currentItemCount = await this.prisma.dispatchGroupItem.count({
      where: { dispatchGroupId: groupId },
    });
    if (currentItemCount >= MAX_ITEMS_PER_GROUP) {
      throw new BadRequestException(
        `Maximum of ${MAX_ITEMS_PER_GROUP} tickets per group`,
      );
    }

    const maintenanceClass = await this.getMaintenanceClassId();
    await this.validateTicketsForGroup([ticketId], maintenanceClass);

    const maxOrder = await this.prisma.dispatchGroupItem.aggregate({
      where: { dispatchGroupId: groupId },
      _max: { stopOrder: true },
    });

    const item = await this.prisma.dispatchGroupItem.create({
      data: {
        dispatchGroupId: groupId,
        ticketId,
        stopOrder: (maxOrder._max.stopOrder ?? 0) + 1,
      },
      select: {
        id: true,
        ticketId: true,
        stopOrder: true,
        ticket: {
          select: { id: true, title: true, studio: { select: { id: true, name: true } } },
        },
      },
    });

    await this.auditLog.log({
      actorId,
      action: 'UPDATED',
      entityType: 'dispatch_group',
      entityId: groupId,
      newValues: { action: 'add_item', ticketId },
    });

    return item;
  }

  async removeItem(groupId: string, itemId: string, actorId: string) {
    await this.assertGroupEditable(groupId);

    const item = await this.prisma.dispatchGroupItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.dispatchGroupId !== groupId) {
      throw new NotFoundException('Item not found in this group');
    }

    await this.prisma.dispatchGroupItem.delete({ where: { id: itemId } });

    await this.auditLog.log({
      actorId,
      action: 'UPDATED',
      entityType: 'dispatch_group',
      entityId: groupId,
      newValues: { action: 'remove_item', ticketId: item.ticketId },
    });
  }

  async reorderItems(
    groupId: string,
    order: { itemId: string; stopOrder: number }[],
    actorId: string,
  ) {
    await this.assertGroupEditable(groupId);

    await this.prisma.$transaction(
      order.map((o) =>
        this.prisma.dispatchGroupItem.update({
          where: { id: o.itemId },
          data: { stopOrder: o.stopOrder },
        }),
      ),
    );

    await this.auditLog.log({
      actorId,
      action: 'UPDATED',
      entityType: 'dispatch_group',
      entityId: groupId,
      newValues: { action: 'reorder', order },
    });
  }

  async updateGroup(
    groupId: string,
    dto: { notes?: string; targetDate?: string; status?: DispatchGroupStatus },
    actorId: string,
  ) {
    const group = await this.findById(groupId);
    const oldValues: Record<string, unknown> = {};
    const data: Prisma.DispatchGroupUpdateInput = {};

    if (dto.status !== undefined) {
      const allowed = VALID_TRANSITIONS[group.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition from ${group.status} to ${dto.status}`,
        );
      }
      oldValues.status = group.status;
      data.status = dto.status;
    }

    // Only DRAFT groups can have notes/targetDate edited
    if (dto.notes !== undefined || dto.targetDate !== undefined) {
      if (group.status !== 'DRAFT' && dto.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT groups can be edited');
      }
    }

    if (dto.notes !== undefined) {
      oldValues.notes = group.notes;
      data.notes = dto.notes;
    }
    if (dto.targetDate !== undefined) {
      oldValues.targetDate = group.targetDate;
      data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    }

    const updated = await this.prisma.dispatchGroup.update({
      where: { id: groupId },
      data,
      select: GROUP_DETAIL_SELECT,
    });

    await this.auditLog.log({
      actorId,
      action: 'UPDATED',
      entityType: 'dispatch_group',
      entityId: groupId,
      oldValues,
      newValues: dto as Record<string, unknown>,
    });

    return updated;
  }

  async getDispatchReadyTickets(filters: {
    tradeType?: DispatchTradeType;
    studioId?: string;
    marketId?: string;
    page?: number;
    limit?: number;
  }) {
    const maintenanceClassId = await this.getMaintenanceClassId();
    const { tradeType, studioId, marketId, page = 1, limit = 50 } = filters;
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.TicketWhereInput = {
      ticketClassId: maintenanceClassId,
      dispatchReadiness: 'READY_FOR_DISPATCH',
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      ...(tradeType && { dispatchTradeType: tradeType }),
      ...(studioId && { studioId }),
      ...(marketId && { marketId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          studioId: true,
          createdAt: true,
          dispatchTradeType: true,
          dispatchReadiness: true,
          studio: { select: { id: true, name: true, formattedAddress: true } },
          market: { select: { id: true, name: true } },
        },
        orderBy: [{ dispatchTradeType: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
        skip,
        take,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, total, page, limit: take, totalPages: Math.ceil(total / take) };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async assertGroupEditable(groupId: string) {
    const group = await this.findById(groupId);
    if (group.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT groups can be edited');
    }
    return group;
  }

  private async getMaintenanceClassId(): Promise<string> {
    const cls = await this.prisma.ticketClass.findFirst({
      where: { code: MAINTENANCE_CLASS_CODE },
      select: { id: true },
    });
    if (!cls) throw new BadRequestException('Maintenance class not configured');
    return cls.id;
  }

  private async validateTicketsForGroup(
    ticketIds: string[],
    maintenanceClassId: string,
  ) {
    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: {
        id: true,
        status: true,
        ticketClassId: true,
        dispatchReadiness: true,
      },
    });

    if (tickets.length !== ticketIds.length) {
      const found = new Set(tickets.map((t) => t.id));
      const missing = ticketIds.filter((id) => !found.has(id));
      throw new BadRequestException(`Tickets not found: ${missing.join(', ')}`);
    }

    for (const ticket of tickets) {
      if (ticket.ticketClassId !== maintenanceClassId) {
        throw new BadRequestException(
          `Ticket ${ticket.id} is not a maintenance ticket`,
        );
      }
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
        throw new BadRequestException(
          `Ticket ${ticket.id} is ${ticket.status} and cannot be added to a dispatch group`,
        );
      }
      if (ticket.dispatchReadiness !== 'READY_FOR_DISPATCH') {
        throw new BadRequestException(
          `Ticket ${ticket.id} is not Ready for Dispatch`,
        );
      }
    }

    // One-active-group enforcement: only DRAFT and READY_TO_SEND
    const existingItems = await this.prisma.dispatchGroupItem.findMany({
      where: {
        ticketId: { in: ticketIds },
        group: { status: { in: ACTIVE_GROUP_STATUSES } },
      },
      select: { ticketId: true, group: { select: { id: true, status: true } } },
    });

    if (existingItems.length > 0) {
      const conflicts = existingItems.map(
        (i) => `Ticket ${i.ticketId} is already in dispatch group ${i.group.id} (${i.group.status})`,
      );
      throw new BadRequestException(
        `One or more tickets are already in an active dispatch group: ${conflicts.join('; ')}`,
      );
    }
  }
}
