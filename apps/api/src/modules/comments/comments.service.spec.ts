import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { DomainEventsService } from '../events/domain-events.service';
import { MentionParserService } from './mention-parser.service';
import { TicketVisibilityService } from '../../common/permissions/ticket-visibility.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';

function makeActor(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'user-1',
    email: 'test@test.com',
    displayName: 'Test User',
    role: 'DEPARTMENT_USER',
    teamId: 'team-1',
    studioId: null,
    marketId: null,
    isActive: true,
    departments: [],
    scopeStudioIds: [],
    ...overrides,
  };
}

function makeTicketForVisibility(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    requesterId: 'requester-1',
    ownerId: 'owner-1',
    studioId: 'studio-1',
    owner: { team: { name: 'HR' } },
    ...overrides,
  };
}

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: jest.Mocked<PrismaService>;
  let visibility: { assertCanView: jest.Mock };
  let policy: { evaluate: jest.Mock };

  beforeEach(() => {
    prisma = {
      ticket: { findUnique: jest.fn() },
      ticketComment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn) =>
        typeof fn === 'function' ? fn(prisma) : Promise.resolve(),
      ),
    } as unknown as jest.Mocked<PrismaService>;

    visibility = { assertCanView: jest.fn() };
    policy = {
      evaluate: jest.fn().mockReturnValue({ allowed: true }),
    };

    service = new CommentsService(
      prisma,
      { log: jest.fn() } as unknown as AuditLogService,
      { emit: jest.fn() } as unknown as DomainEventsService,
      {
        extractMentions: jest.fn().mockResolvedValue([]),
      } as unknown as MentionParserService,
      visibility as unknown as TicketVisibilityService,
      policy as never,
    );
  });

  describe('create', () => {
    it('throws ForbiddenException when user cannot view ticket', async () => {
      const ticketId = 'ticket-1';
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(
        makeTicketForVisibility({ id: ticketId }),
      );
      policy.evaluate.mockReturnValueOnce({
        allowed: false,
        reason: 'ticket_not_visible',
      });

      await expect(
        service.create(ticketId, { body: 'Hello' }, makeActor()),
      ).rejects.toThrow(ForbiddenException);

      expect(policy.evaluate).toHaveBeenCalledTimes(1);
      expect(prisma.ticketComment.create).not.toHaveBeenCalled();
    });

    it('returns comment with canonical author shape (displayName from name)', async () => {
      const ticketId = 'ticket-1';
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(
        makeTicketForVisibility({ id: ticketId }),
      );
      const createdComment = {
        id: 'comment-1',
        body: 'Hello',
        authorId: 'user-1',
        author: {
          id: 'user-1',
          name: 'Jane Doe',
          email: 'jane@test.com',
          avatarUrl: null,
        },
        createdAt: new Date(),
        ticketId,
        isInternal: false,
        editedAt: null,
        mentions: [],
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          ...prisma,
          ticketComment: { create: jest.fn().mockResolvedValue(createdComment) },
          ticket: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.create(ticketId, { body: 'Hello' }, makeActor());

      expect(result.author).toBeDefined();
      expect(result.author?.displayName).toBe('Jane Doe');
      expect(result.author?.name).toBe('Jane Doe');
    });
  });

  describe('findByTicket', () => {
    it('throws ForbiddenException when user cannot view ticket', async () => {
      const ticketId = 'ticket-1';
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(
        makeTicketForVisibility({ id: ticketId }),
      );
      policy.evaluate.mockReturnValueOnce({
        allowed: false,
        reason: 'ticket_not_visible',
      });

      await expect(service.findByTicket(ticketId, makeActor())).rejects.toThrow(
        ForbiddenException,
      );

      expect(policy.evaluate).toHaveBeenCalledTimes(1);
      expect(prisma.ticketComment.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findByTicket('missing-ticket', makeActor()),
      ).rejects.toThrow(NotFoundException);

      expect(policy.evaluate).not.toHaveBeenCalled();
    });
  });
});
