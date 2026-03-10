import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { Public } from '../modules/auth/decorators/public.decorator';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../common/queue/queue.constants';

@Controller('health')
@Public()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.NOTIFICATION_FANOUT)
    private readonly fanoutQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION_DISPATCH)
    private readonly dispatchQueue: Queue,
  ) {}

  /**
   * GET /api/health
   * Readiness: DB (and optionally Redis) connectivity.
   * Returns 200 + { status: "ok" } or 503 + { status: "unhealthy", reason }.
   */
  @Get()
  async check() {
    const dbOk = await this.checkDatabase();
    if (!dbOk.ok) {
      throw new ServiceUnavailableException({
        status: 'unhealthy',
        reason: dbOk.reason ?? 'database',
      });
    }
    const redisOk = await this.checkRedis();
    if (!redisOk.ok) {
      throw new ServiceUnavailableException({
        status: 'unhealthy',
        reason: redisOk.reason ?? 'redis',
      });
    }
    return { status: 'ok' };
  }

  /**
   * GET /api/health/queues
   * Queue depth for notification fan-out and dispatch (operational visibility).
   */
  @Get('queues')
  async queues() {
    const [fanout, dispatch] = await Promise.all([
      this.fanoutQueue.getJobCounts(),
      this.dispatchQueue.getJobCounts(),
    ]);
    return {
      notificationFanout: fanout,
      notificationDispatch: dispatch,
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Health check: database failed — ${message}`);
      return { ok: false, reason: `database: ${message}` };
    }
  }

  private async checkRedis(): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.fanoutQueue.getJobCounts();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Health check: redis failed — ${message}`);
      return { ok: false, reason: `redis: ${message}` };
    }
  }
}
