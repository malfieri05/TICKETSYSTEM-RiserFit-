import { Injectable, Logger, Optional } from '@nestjs/common';
import { Subject } from 'rxjs';
import { SsePubSubService, sseUserChannel } from '../../../common/redis/sse-pubsub.service';

export interface SseNotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  ticketId?: string;
  createdAt: Date;
}

/** Payload for ticket_update SSE events (minimal; no full ticket data). */
export interface SseTicketUpdatePayload {
  ticketId: string;
  eventType: string;
  occurredAt: string;
}

/** Typed SSE message so the stream can emit both notification and ticket_update. */
export type SseStreamMessage =
  | { type: 'notification'; data: SseNotificationPayload }
  | { type: 'ticket_update'; data: SseTicketUpdatePayload };

/**
 * SseChannel — manages Server-Sent Event streams for real-time in-app notifications
 * and ticket update hints. When Redis SSE pub/sub is available, uses Redis for
 * multi-instance delivery; otherwise local-only (single instance).
 */
@Injectable()
export class SseChannel {
  private readonly logger = new Logger(SseChannel.name);
  private readonly streams = new Map<string, Subject<SseStreamMessage>>();

  constructor(
    @Optional() private readonly ssePubSub?: SsePubSubService,
  ) {}

  private get useRedis(): boolean {
    return !!this.ssePubSub?.available;
  }

  /** Called by the SSE controller to subscribe a user to their stream. */
  subscribe(userId: string): Subject<SseStreamMessage> {
    if (this.streams.has(userId)) {
      return this.streams.get(userId)!;
    }
    const subject = new Subject<SseStreamMessage>();
    this.streams.set(userId, subject);

    if (this.useRedis) {
      const channel = sseUserChannel(userId);
      this.ssePubSub!.subscribe(channel, (message: string) => {
        try {
          const parsed = JSON.parse(message) as SseStreamMessage;
          if (
            !subject.closed &&
            parsed &&
            typeof parsed.type === 'string' &&
            parsed.data != null
          ) {
            subject.next(parsed);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Redis SSE message parse error: ${msg}`);
        }
      });
    }

    this.logger.debug(`SSE stream opened for user ${userId}`);
    return subject;
  }

  /** Called when the client disconnects (SSE request closes). */
  unsubscribe(userId: string): void {
    const subject = this.streams.get(userId);
    if (subject) {
      if (this.useRedis) {
        this.ssePubSub!.unsubscribe(sseUserChannel(userId));
      }
      subject.complete();
      this.streams.delete(userId);
      this.logger.debug(`SSE stream closed for user ${userId}`);
    }
  }

  /** Push a notification to a user's live stream (if they're connected). */
  push(userId: string, payload: SseNotificationPayload): void {
    if (this.useRedis) {
      this.ssePubSub!
        .publish(
          sseUserChannel(userId),
          JSON.stringify({ type: 'notification', data: payload }),
        )
        .catch(() => {});
      return;
    }
    const subject = this.streams.get(userId);
    if (subject && !subject.closed) {
      subject.next({ type: 'notification', data: payload });
    }
  }

  /**
   * Push a ticket_update hint to a user's stream so the client can invalidate
   * ticket/list queries. Emits SSE with event: "ticket_update".
   */
  pushTicketUpdate(userId: string, payload: SseTicketUpdatePayload): void {
    if (this.useRedis) {
      this.ssePubSub!
        .publish(
          sseUserChannel(userId),
          JSON.stringify({ type: 'ticket_update', data: payload }),
        )
        .catch(() => {});
      return;
    }
    const subject = this.streams.get(userId);
    if (subject && !subject.closed) {
      subject.next({ type: 'ticket_update', data: payload });
    }
  }

  /** How many users currently have open SSE connections. */
  get activeConnections(): number {
    return this.streams.size;
  }
}
