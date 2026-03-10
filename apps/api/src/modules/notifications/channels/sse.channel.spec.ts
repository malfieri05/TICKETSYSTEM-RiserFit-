import { Test, TestingModule } from '@nestjs/testing';
import { SseChannel } from './sse.channel';
import { SsePubSubService, sseUserChannel } from '../../../common/redis/sse-pubsub.service';

describe('SseChannel', () => {
  describe('local-only mode (no Redis)', () => {
    it('delivers notification and ticket_update to local Subject', () => {
      const channel = new SseChannel(undefined);
      const sub = channel.subscribe('user-1');
      const notifications: unknown[] = [];
      const ticketUpdates: unknown[] = [];
      sub.subscribe((msg) => {
        if (msg.type === 'notification') notifications.push(msg.data);
        if (msg.type === 'ticket_update') ticketUpdates.push(msg.data);
      });

      channel.push('user-1', {
        id: 'n1',
        type: 'COMMENT_ADDED',
        title: 'Comment',
        body: 'Hi',
        createdAt: new Date(),
      });
      channel.pushTicketUpdate('user-1', {
        ticketId: 't1',
        eventType: 'TICKET_STATUS_CHANGED',
        occurredAt: new Date().toISOString(),
      });

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({ id: 'n1', title: 'Comment' });
      expect(ticketUpdates).toHaveLength(1);
      expect(ticketUpdates[0]).toMatchObject({
        ticketId: 't1',
        eventType: 'TICKET_STATUS_CHANGED',
      });
    });

    it('unsubscribe completes Subject and removes from map', () => {
      const channel = new SseChannel(undefined);
      const sub = channel.subscribe('user-1');
      let completed = false;
      sub.subscribe({ complete: () => { completed = true; } });
      expect(channel.activeConnections).toBe(1);
      channel.unsubscribe('user-1');
      expect(completed).toBe(true);
      expect(channel.activeConnections).toBe(0);
      channel.push('user-1', { id: 'n', type: 'X', title: '', body: '', createdAt: new Date() });
      expect(channel.activeConnections).toBe(0);
    });

    it('push to non-connected user is no-op', () => {
      const channel = new SseChannel(undefined);
      const sub = channel.subscribe('user-1');
      const received: unknown[] = [];
      sub.subscribe((msg) => received.push(msg));
      channel.push('user-2', { id: 'n', type: 'X', title: '', body: '', createdAt: new Date() });
      expect(received).toHaveLength(0);
    });
  });

  describe('Redis mode (mock SsePubSubService)', () => {
    it('subscribe registers Redis handler; handler delivers to Subject', (done) => {
      const published: { channel: string; message: string }[] = [];
      const handlers = new Map<string, (msg: string) => void>();
      const mockPubSub = {
        available: true,
        publish: jest.fn(async (ch: string, msg: string) => {
          published.push({ channel: ch, message: msg });
        }),
        subscribe: jest.fn((ch: string, h: (msg: string) => void) => {
          handlers.set(ch, h);
        }),
        unsubscribe: jest.fn((ch: string) => {
          handlers.delete(ch);
        }),
      };

      const channel = new SseChannel(mockPubSub as unknown as SsePubSubService);
      const sub = channel.subscribe('user-1');
      const received: unknown[] = [];
      sub.subscribe((msg) => {
        received.push(msg);
        if (received.length === 2) done();
      });

      expect(mockPubSub.subscribe).toHaveBeenCalledWith(
        sseUserChannel('user-1'),
        expect.any(Function),
      );

      const handler = handlers.get(sseUserChannel('user-1'))!;
      handler(
        JSON.stringify({
          type: 'notification',
          data: { id: 'n1', type: 'X', title: 'T', body: 'B', createdAt: new Date().toISOString() },
        }),
      );
      handler(
        JSON.stringify({
          type: 'ticket_update',
          data: {
            ticketId: 't1',
            eventType: 'SUBTASK_BECAME_READY',
            occurredAt: new Date().toISOString(),
          },
        }),
      );

      expect(received).toHaveLength(2);
      expect(received[0]).toMatchObject({ type: 'notification', data: { id: 'n1' } });
      expect(received[1]).toMatchObject({ type: 'ticket_update', data: { ticketId: 't1' } });
    });

    it('push and pushTicketUpdate publish to Redis and do not push locally', () => {
      const published: { channel: string; message: string }[] = [];
      const mockPubSub = {
        available: true,
        publish: jest.fn(async (ch: string, msg: string) => {
          published.push({ channel: ch, message: msg });
        }),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
      };

      const channel = new SseChannel(mockPubSub as unknown as SsePubSubService);
      channel.subscribe('user-1');
      channel.push('user-1', {
        id: 'n1',
        type: 'X',
        title: 'T',
        body: 'B',
        createdAt: new Date(),
      });
      channel.pushTicketUpdate('user-1', {
        ticketId: 't1',
        eventType: 'TICKET_CREATED',
        occurredAt: new Date().toISOString(),
      });

      expect(published).toHaveLength(2);
      expect(published[0].channel).toBe(sseUserChannel('user-1'));
      expect(JSON.parse(published[0].message)).toMatchObject({
        type: 'notification',
        data: { id: 'n1', title: 'T' },
      });
      expect(published[1].channel).toBe(sseUserChannel('user-1'));
      expect(JSON.parse(published[1].message)).toMatchObject({
        type: 'ticket_update',
        data: { ticketId: 't1', eventType: 'TICKET_CREATED' },
      });
    });

    it('unsubscribe calls Redis unsubscribe', () => {
      const mockPubSub = {
        available: true,
        publish: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
      };
      const channel = new SseChannel(mockPubSub as unknown as SsePubSubService);
      channel.subscribe('user-1');
      channel.unsubscribe('user-1');
      expect(mockPubSub.unsubscribe).toHaveBeenCalledWith(sseUserChannel('user-1'));
    });

    it('ignores malformed Redis message and logs (no next)', () => {
      const handlers = new Map<string, (msg: string) => void>();
      const mockPubSub = {
        available: true,
        publish: jest.fn(),
        subscribe: jest.fn((ch: string, h: (msg: string) => void) => {
          handlers.set(ch, h);
        }),
        unsubscribe: jest.fn(),
      };
      const channel = new SseChannel(mockPubSub as unknown as SsePubSubService);
      const sub = channel.subscribe('user-1');
      const received: unknown[] = [];
      sub.subscribe((msg) => received.push(msg));

      const handler = handlers.get(sseUserChannel('user-1'))!;
      handler('not json');
      handler('{}');
      handler(JSON.stringify({ type: 'notification' }));
      handler(JSON.stringify({ data: {} }));

      expect(received).toHaveLength(0);
    });
  });
});
