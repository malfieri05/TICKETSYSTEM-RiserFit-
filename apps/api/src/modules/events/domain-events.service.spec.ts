import { DomainEventsService } from './domain-events.service';
import type { DomainEvent } from './domain-event.types';

describe('DomainEventsService', () => {
  let service: DomainEventsService;
  let fanoutQueue: { add: jest.Mock };

  beforeEach(() => {
    fanoutQueue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new DomainEventsService(
      fanoutQueue as never,
    );
  });

  describe('emit', () => {
    it('uses jobId anchored to commentId for COMMENT_ADDED', async () => {
      const event: DomainEvent = {
        type: 'COMMENT_ADDED',
        ticketId: 'ticket-1',
        actorId: 'user-1',
        occurredAt: new Date(1234567890000),
        payload: {
          commentId: 'comment-abc',
          authorId: 'user-1',
          authorName: 'Jane',
          requesterId: 'r1',
          bodyPreview: 'Hello',
          isInternal: false,
        },
      };

      await service.emit(event);

      expect(fanoutQueue.add).toHaveBeenCalledTimes(1);
      expect(fanoutQueue.add).toHaveBeenCalledWith(
        'COMMENT_ADDED',
        expect.any(Object),
        expect.objectContaining({
          jobId: 'COMMENT_ADDED_ticket-1_comment-abc',
        }),
      );
    });

    it('uses jobId anchored to commentId for MENTION_IN_COMMENT', async () => {
      const event: DomainEvent = {
        type: 'MENTION_IN_COMMENT',
        ticketId: 'ticket-1',
        actorId: 'user-1',
        occurredAt: new Date(1234567890000),
        payload: {
          commentId: 'comment-xyz',
          mentionedUserIds: ['u2'],
          authorId: 'user-1',
          authorName: 'Jane',
          bodyPreview: 'Hi @u2',
        },
      };

      await service.emit(event);

      expect(fanoutQueue.add).toHaveBeenCalledWith(
        'MENTION_IN_COMMENT',
        expect.any(Object),
        expect.objectContaining({
          jobId: 'MENTION_IN_COMMENT_ticket-1_comment-xyz',
        }),
      );
    });

    it('uses timestamp-based jobId when payload has no commentId', async () => {
      const occurredAt = new Date(1234567890000);
      const event: DomainEvent = {
        type: 'TICKET_CREATED',
        ticketId: 'ticket-1',
        actorId: 'user-1',
        occurredAt,
        payload: {
          requesterId: 'r1',
          title: 'Test ticket',
        },
      };

      await service.emit(event);

      expect(fanoutQueue.add).toHaveBeenCalledWith(
        'TICKET_CREATED',
        expect.any(Object),
        expect.objectContaining({
          jobId: `TICKET_CREATED_ticket-1_${occurredAt.getTime()}`,
        }),
      );
    });
  });
});
