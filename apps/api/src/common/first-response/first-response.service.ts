import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** DB client usable inside or outside a transaction. */
type DbClient = PrismaService | Prisma.TransactionClient;

const FIRST_SUBTASK_ORDER_BY = [
  { subtaskTemplate: { sortOrder: 'asc' as const } },
  { createdAt: 'asc' as const },
] as const;

@Injectable()
export class FirstResponseService {
  /**
   * Set ticket.firstResponseAt to the earliest qualifying timestamp seen so far
   * (min of existing value and candidate).
   */
  async recordCandidate(
    db: DbClient,
    ticketId: string,
    candidateAt: Date,
  ): Promise<void> {
    await db.$executeRaw`
      UPDATE tickets
      SET "firstResponseAt" = LEAST(
        COALESCE("firstResponseAt", ${candidateAt}),
        ${candidateAt}
      )
      WHERE id = ${ticketId}
    `;
  }

  /** First public comment by a user who is not the ticket requester. */
  async recordNonRequesterComment(
    db: DbClient,
    ticketId: string,
    requesterId: string,
    authorId: string,
    at: Date,
  ): Promise<void> {
    if (authorId === requesterId) return;
    await this.recordCandidate(db, ticketId, at);
  }

  /** First status change on the ticket's first-ordered subtask (workflow sort, then createdAt). */
  async recordFirstSubtaskStatusChange(
    db: DbClient,
    ticketId: string,
    subtaskId: string,
    previousStatus: string,
    newStatus: string | undefined,
    at: Date,
  ): Promise<void> {
    if (!newStatus || newStatus === previousStatus) return;
    const first = await db.subtask.findFirst({
      where: { ticketId },
      orderBy: [...FIRST_SUBTASK_ORDER_BY],
      select: { id: true },
    });
    if (first?.id !== subtaskId) return;
    await this.recordCandidate(db, ticketId, at);
  }
}
