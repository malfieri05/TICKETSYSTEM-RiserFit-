import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainEvent } from './domain-event.types';
import {
  QUEUES,
  FANOUT_JOB_OPTIONS,
  FanOutJobData,
} from '../../common/queue/queue.constants';

/**
 * DomainEventsService — the bridge between domain mutations and the notification pipeline.
 *
 * Called AFTER a successful DB write. Enqueues a fan-out job into BullMQ.
 * The fan-out worker determines WHO gets notified and on WHICH channels.
 *
 * This keeps services clean: they just call emit() and move on.
 * All notification logic lives in the worker, not in business services.
 */
@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);

  constructor(
    @InjectQueue(QUEUES.NOTIFICATION_FANOUT)
    private fanoutQueue: Queue,
  ) {}

  async emit(event: DomainEvent): Promise<void> {
    try {
      const jobData: FanOutJobData = {
        eventType: event.type,
        ticketId: event.ticketId,
        actorId: event.actorId,
        payload: event.payload as unknown as Record<string, unknown>,
        occurredAt: event.occurredAt.toISOString(),
      };

      // Idempotency: anchor to persisted entity where available (e.g. one comment → one fan-out job)
      const payload = event.payload as { commentId?: string } | undefined;
      const jobId =
        (event.type === 'COMMENT_ADDED' || event.type === 'MENTION_IN_COMMENT') &&
        payload?.commentId
          ? `${event.type}_${event.ticketId}_${payload.commentId}`
          : `${event.type}_${event.ticketId}_${event.occurredAt.getTime()}`;

      await this.fanoutQueue.add(event.type, jobData, {
        ...FANOUT_JOB_OPTIONS,
        jobId,
      });

      this.logger.debug(
        `Domain event enqueued: ${event.type} for ticket ${event.ticketId}`,
      );
    } catch (error) {
      // Non-fatal: log but don't crash the request.
      // The mutation already succeeded — we don't roll it back for a queue failure.
      // Dead-letter monitoring will catch persistent failures.
      this.logger.error(
        `Failed to enqueue domain event ${event.type} for ticket ${event.ticketId}: ${error}`,
      );
    }
  }
}
