import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { DomainEventsService } from '../events/domain-events.service';
import { MentionParserService } from './mention-parser.service';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PolicyService } from '../../policy/policy.service';
import { COMMENT_ADD_PUBLIC } from '../../policy/capabilities/capability-keys';
import { mapCommentToResponse } from '../../common/serializers/comment-response';

const TICKET_FOR_VISIBILITY_SELECT = {
  id: true,
  requesterId: true,
  ownerId: true,
  studioId: true,
  department: { select: { code: true } },
  owner: { select: { teamId: true, team: { select: { name: true } } } },
} as const;

const COMMENT_INCLUDE = {
  author: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
  mentions: {
    include: { user: { select: { id: true, name: true } } },
  },
} as const;

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private domainEvents: DomainEventsService,
    private mentionParser: MentionParserService,
    private visibility: TicketVisibilityService,
    private policy: PolicyService,
  ) {}

  async create(ticketId: string, dto: CreateCommentDto, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ...TICKET_FOR_VISIBILITY_SELECT,
        title: true,
        status: true,
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const isInternal = false;

    const decision = this.policy.evaluate(COMMENT_ADD_PUBLIC, actor, {
      requesterId: ticket.requesterId,
      ownerId: ticket.ownerId,
      studioId: ticket.studioId,
      department: ticket.department,
      owner: ticket.owner,
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to comment on this ticket',
      );
    }

    // Reply validation: one-level only
    if (dto.parentCommentId) {
      const parent = await this.prisma.ticketComment.findUnique({
        where: { id: dto.parentCommentId },
        select: { id: true, ticketId: true, parentCommentId: true },
      });
      if (!parent) {
        throw new NotFoundException(`Parent comment ${dto.parentCommentId} not found`);
      }
      if (parent.ticketId !== ticketId) {
        throw new BadRequestException('Parent comment does not belong to this ticket');
      }
      if (parent.parentCommentId !== null) {
        throw new BadRequestException('Cannot reply to a reply; only one level of threading is allowed');
      }
    }

    // Resolve mentionable user IDs for this ticket (visibility-scoped)
    const mentionableUserIds = await this.getMentionableUserIds(ticketId, ticket);

    // Parse and validate mentions against the allowed set
    const mentionedUserIds = await this.mentionParser.extractMentionsForTicket(
      dto.body,
      mentionableUserIds,
    );

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticketId,
          authorId: actor.id,
          body: dto.body,
          isInternal,
          parentCommentId: dto.parentCommentId ?? null,
          mentions: {
            create: mentionedUserIds.map((userId) => ({ userId })),
          },
        },
        include: {
          ...COMMENT_INCLUDE,
        },
      });

      await tx.ticket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() },
      });

      return created;
    });

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
        parentCommentId: dto.parentCommentId ?? null,
      },
    });

    this.logger.log(`Comment created: ticket=${ticketId} comment=${comment.id}`);

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
        isInternal,
        mentionedUserIds,
        parentCommentId: dto.parentCommentId ?? undefined,
      },
    });

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
          parentCommentId: dto.parentCommentId ?? undefined,
        },
      });
    }

    return mapCommentToResponse(comment);
  }

  async findByTicket(ticketId: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: TICKET_FOR_VISIBILITY_SELECT,
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const canSeePublic = this.policy.evaluate(
      COMMENT_ADD_PUBLIC,
      actor,
      {
        requesterId: ticket.requesterId,
        ownerId: ticket.ownerId,
        studioId: ticket.studioId,
        department: ticket.department,
        owner: ticket.owner,
      },
    );
    if (!canSeePublic.allowed) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    return this.buildThreadShape(ticketId);
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

    if (comment.authorId !== actor.id) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const updated = await this.prisma.ticketComment.update({
      where: { id: commentId },
      data: { body, editedAt: new Date() },
      include: {
        ...COMMENT_INCLUDE,
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

    return mapCommentToResponse(updated);
  }

  /**
   * Build thread-shaped comment list: top-level comments with nested replies.
   * Deterministic ordering: createdAt ASC, id ASC at both levels.
   */
  async buildThreadShape(ticketId: string) {
    const allComments = await this.prisma.ticketComment.findMany({
      where: { ticketId },
      include: COMMENT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const mapped = allComments.map((c) => ({
      ...mapCommentToResponse(c),
      parentCommentId: c.parentCommentId,
    }));

    const topLevel = mapped.filter((c) => c.parentCommentId === null);
    const repliesByParent = new Map<string, typeof mapped>();
    for (const c of mapped) {
      if (c.parentCommentId) {
        const arr = repliesByParent.get(c.parentCommentId) ?? [];
        arr.push(c);
        repliesByParent.set(c.parentCommentId, arr);
      }
    }

    return topLevel.map((c) => ({
      ...c,
      replies: repliesByParent.get(c.id) ?? [],
    }));
  }

  /**
   * Returns IDs of users who can view a ticket (mentionable users).
   * Uses the same visibility rules as Stage 1 to determine who can see this ticket.
   */
  async getMentionableUserIds(
    ticketId: string,
    ticket?: {
      requesterId: string;
      ownerId: string | null;
      studioId: string | null;
      department?: { code: string } | null;
    },
  ): Promise<string[]> {
    const t =
      ticket ??
      (await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          requesterId: true,
          ownerId: true,
          studioId: true,
          department: { select: { code: true } },
        },
      }));
    if (!t) return [];

    // Build conditions: who can see this ticket?
    const userConditions: Array<{ id?: string; role?: Role | { in: Role[] }; departments?: object; scopeStudioIds?: object }> = [];

    // All ADMINs can see all tickets
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    const ids = new Set(admins.map((u) => u.id));

    // Requester and owner
    if (t.requesterId) ids.add(t.requesterId);
    if (t.ownerId) ids.add(t.ownerId);

    // DEPARTMENT_USERs who match the ticket's department
    if (t.department?.code) {
      const deptUsers = await this.prisma.userDepartment.findMany({
        where: { department: t.department.code as any },
        select: { userId: true },
      });
      for (const u of deptUsers) ids.add(u.userId);
    }

    // Users with studio scope that includes this ticket's studio
    if (t.studioId) {
      const studioScopeUsers = await this.prisma.userStudioScope.findMany({
        where: { studioId: t.studioId },
        select: { userId: true },
      });
      for (const u of studioScopeUsers) ids.add(u.userId);

      // Users whose primary studio matches
      const primaryStudioUsers = await this.prisma.user.findMany({
        where: { studioId: t.studioId, isActive: true },
        select: { id: true },
      });
      for (const u of primaryStudioUsers) ids.add(u.id);
    }

    // Watchers can also see the ticket
    const watchers = await this.prisma.ticketWatcher.findMany({
      where: { ticketId },
      select: { userId: true },
    });
    for (const w of watchers) ids.add(w.userId);

    // Filter to only active users
    if (ids.size === 0) return [];
    const activeUsers = await this.prisma.user.findMany({
      where: { id: { in: Array.from(ids) }, isActive: true },
      select: { id: true },
    });
    return activeUsers.map((u) => u.id);
  }

  /**
   * Returns full user objects for the mentionable users endpoint.
   */
  async getMentionableUsers(
    ticketId: string,
    actor: RequestUser,
    search?: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ...TICKET_FOR_VISIBILITY_SELECT,
      },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    this.visibility.assertCanView(ticket, actor);

    const mentionableIds = await this.getMentionableUserIds(ticketId, ticket);
    if (mentionableIds.length === 0) return [];

    const where: any = {
      id: { in: mentionableIds },
      isActive: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 100,
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      displayName: u.name ?? u.email,
    }));
  }
}
