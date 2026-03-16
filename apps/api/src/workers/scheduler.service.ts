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
 * - email-ingest-run: runs every 20 min, polls Gmail and stores raw emails (when enabled in config)
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  // How often to check for breached SLAs (default: every hour)
  private readonly checkIntervalMs = parseInt(
    process.env.SLA_CHECK_INTERVAL_MS ?? '3600000',
    10,
  );

  // Gmail ingest: every 20 minutes (config.isEnabled controls whether ingest actually fetches)
  private readonly emailIngestIntervalMs = 20 * 60 * 1000;

  constructor(
    @InjectQueue(QUEUES.SCHEDULED)
    private scheduledQueue: Queue,
    @InjectQueue(QUEUES.EMAIL_INGEST)
    private emailIngestQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.ensureStaleTicketJob();
    await this.ensureEmailIngestJob();
  }

  private async ensureStaleTicketJob() {
    try {
      // Check if the repeatable job is already registered in Redis
      const existingJobs = await this.scheduledQueue.getRepeatableJobs();
      const alreadyRegistered = existingJobs.some(
        (j) => j.name === 'stale-ticket-check',
      );

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

  private async ensureEmailIngestJob() {
    try {
      const existingJobs = await this.emailIngestQueue.getRepeatableJobs();
      const alreadyRegistered = existingJobs.some(
        (j) => j.name === 'email-ingest-run',
      );

      if (alreadyRegistered) {
        this.logger.log('Email ingest cron job already registered — skipping');
        return;
      }

      await this.emailIngestQueue.add(
        'email-ingest-run',
        {},
        {
          repeat: { every: this.emailIngestIntervalMs },
          jobId: 'email-ingest-run-repeatable',
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      );

      this.logger.log(
        `Email ingest cron registered — runs every ${this.emailIngestIntervalMs / 1000 / 60} minutes`,
      );
    } catch (err) {
      this.logger.error(`Failed to register email ingest cron: ${err}`);
    }
  }
}
