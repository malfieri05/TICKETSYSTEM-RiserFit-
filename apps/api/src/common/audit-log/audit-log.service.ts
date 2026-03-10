import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';

export interface AuditLogEntry {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  ticketId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function toJson(
  val: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (val === undefined) return undefined;
  return val as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ticketId: entry.ticketId,
        oldValues: toJson(entry.oldValues),
        newValues: toJson(entry.newValues),
        metadata: toJson(entry.metadata),
      },
    });
  }

  async getTicketHistory(ticketId: string) {
    return this.prisma.auditLog.findMany({
      where: { ticketId },
      include: {
        actor: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
