import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../common/queue/queue.constants';

/**
 * SchedulerService — registers repeatable (cron) jobs into BullMQ on startup.
 *
 * BullMQ stores repeatable job schedules in Redis, so they survive process restarts.
 * We check if the job already exists before adding to avoid creating duplicates.
 *
 * Jobs registered here:
 * - stale-ticket-check: runs every hour, checks for SLA breaches + sends escalations
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  // How often to check for breached SLAs (default: every hour)
  private readonly checkIntervalMs =
    parseInt(process.env.SLA_CHECK_INTERVAL_MS ?? '3600000', 10);

  constructor(
    @InjectQueue(QUEUES.SCHEDULED)
    private scheduledQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.ensureStaleTicketJob();
  }

  private async ensureStaleTicketJob() {
    try {
      // Check if the repeatable job is already registered in Redis
      const existingJobs = await this.scheduledQueue.getRepeatableJobs();
      const alreadyRegistered = existingJobs.some((j) => j.name === 'stale-ticket-check');

      if (alreadyRegistered) {
        this.logger.log('Stale-ticket cron job already registered — skipping');
        return;
      }

      await this.scheduledQueue.add(
        'stale-ticket-check',
        {}, // empty payload — processor fetches all data from DB
        {
          repeat: { every: this.checkIntervalMs },
          // Stable job ID prevents duplicate cron entries if called concurrently
          jobId: 'stale-ticket-check-repeatable',
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      );

      this.logger.log(
        `Stale-ticket cron registered — runs every ${this.checkIntervalMs / 1000 / 60} minutes`,
      );
    } catch (err) {
      // Non-fatal: the API boots fine even if cron registration fails (e.g. Redis down)
      this.logger.error(`Failed to register stale-ticket cron: ${err}`);
    }
  }
}
