import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface SseNotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  ticketId?: string;
  createdAt: Date;
}

/**
 * SseChannel — manages Server-Sent Event streams for real-time in-app notifications.
 *
 * Each authenticated user gets their own Subject. The SSE endpoint subscribes
 * to their Subject and pushes messages. When a notification is created for a user,
 * push() delivers it instantly if they have an active connection.
 *
 * Design:
 * - In-memory per-instance (fine for single-instance v1)
 * - Upgrade path: replace with Redis pub/sub for multi-instance later
 * - No memory leak: subjects are cleaned up when the client disconnects
 */
@Injectable()
export class SseChannel {
  private readonly logger = new Logger(SseChannel.name);
  private readonly streams = new Map<string, Subject<SseNotificationPayload>>();

  /** Called by the SSE controller to subscribe a user to their stream. */
  subscribe(userId: string): Subject<SseNotificationPayload> {
    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Subject());
      this.logger.debug(`SSE stream opened for user ${userId}`);
    }
    return this.streams.get(userId)!;
  }

  /** Called when the client disconnects (SSE request closes). */
  unsubscribe(userId: string): void {
    const subject = this.streams.get(userId);
    if (subject) {
      subject.complete();
      this.streams.delete(userId);
      this.logger.debug(`SSE stream closed for user ${userId}`);
    }
  }

  /** Push a notification to a user's live stream (if they're connected). */
  push(userId: string, payload: SseNotificationPayload): void {
    const subject = this.streams.get(userId);
    if (subject && !subject.closed) {
      subject.next(payload);
    }
    // Silently ignore if user isn't connected — they'll get it via email
    // or see it in the notifications panel next time they load the app.
  }

  /** How many users currently have open SSE connections. */
  get activeConnections(): number {
    return this.streams.size;
  }
}
