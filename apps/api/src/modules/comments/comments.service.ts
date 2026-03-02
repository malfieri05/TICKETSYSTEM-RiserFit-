import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { DomainEventsService } from '../events/domain-events.service';
import { MentionParserService } from './mention-parser.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Role } from '@prisma/client';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private domainEvents: DomainEventsService,
    private mentionParser: MentionParserService,
  ) {}

  async create(ticketId: string, dto: CreateCommentDto, actor: RequestUser) {
    // Verify ticket exists
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        title: true,
        requesterId: true,
        ownerId: true,
        status: true,
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    // Requesters cannot post internal notes
    const isInternal = dto.isInternal ?? false;
    if (isInternal && actor.role === Role.REQUESTER) {
      throw new ForbiddenException('Requesters cannot post internal notes');
    }

    // Extract @mentions from the comment body
    const mentionedUserIds = await this.mentionParser.extractMentions(dto.body);

    // Create comment + mention records in one transaction
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticketId,
          authorId: actor.id,
          body: dto.body,
          isInternal,
          mentions: {
            create: mentionedUserIds.map((userId) => ({ userId })),
          },
        },
        include: {
          author: { select: { id: true, name: true, email: true, avatarUrl: true } },
          mentions: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });

      // Update the ticket's updatedAt timestamp
      await tx.ticket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });

      return created;
    });

    // Audit log
    await this.auditLog.log({
      actorId: actor.id,
      action: 'COMMENTED',
      entityType: 'comment',
      entityId: comment.id,
      ticketId,
      newValues: {
        body: dto.body.substring(0, 200),
        isInternal,
        mentionCount: mentionedUserIds.length,
      },
    });

    // Domain events
    await this.domainEvents.emit({
      type: 'COMMENT_ADDED',
      ticketId,
      actorId: actor.id,
      occurredAt: new Date(),
      payload: {
        commentId: comment.id,
        authorId: actor.id,
        authorName: comment.author.name,
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId ?? undefined,
        bodyPreview: dto.body.substring(0, 120),
      },
    });

    // Separate mention event if there were any mentions
    if (mentionedUserIds.length > 0) {
      await this.domainEvents.emit({
        type: 'MENTION_IN_COMMENT',
        ticketId,
        actorId: actor.id,
        occurredAt: new Date(),
        payload: {
          commentId: comment.id,
          mentionedUserIds,
          authorId: actor.id,
          authorName: comment.author.name,
          bodyPreview: dto.body.substring(0, 120),
        },
      });
    }

    return comment;
  }

  async findByTicket(ticketId: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, requesterId: true },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const where = {
      ticketId,
      // Requesters cannot see internal notes
      ...(actor.role === Role.REQUESTER ? { isInternal: false } : {}),
    };

    return this.prisma.ticketComment.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        mentions: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(commentId: string, body: string, actor: RequestUser) {
    const comment = await this.prisma.ticketComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
        ticketId: true,
        body: true,
      },
    });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    // Only the author can edit their own comment
    if (comment.authorId !== actor.id) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const updated = await this.prisma.ticketComment.update({
      where: { id: commentId },
      data: { body, editedAt: new Date() },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        mentions: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    await this.auditLog.log({
      actorId: actor.id,
      action: 'UPDATED',
      entityType: 'comment',
      entityId: commentId,
      ticketId: comment.ticketId,
      oldValues: { body: comment.body.substring(0, 200) },
      newValues: { body: body.substring(0, 200) },
    });

    return updated;
  }
}
