import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS ?? '500',
  10,
);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    // Use Neon pooled endpoint in production (e.g. ...-pooler.region.aws.neon.tech) to avoid exhausting connections.
    const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? '20', 10);
    const adapter = new PrismaPg({
      connectionString,
      max: poolSize,
    });
    const logConfig: Prisma.LogDefinition[] | undefined =
      SLOW_QUERY_THRESHOLD_MS > 0
        ? [{ emit: 'event', level: 'query' }]
        : process.env.NODE_ENV === 'development'
          ? (['query'] as unknown as Prisma.LogDefinition[])
          : [];
    super({
      adapter,
      log: logConfig,
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');

    if (SLOW_QUERY_THRESHOLD_MS > 0) {
      this.$on(
        'query' as never,
        (e: { duration: number; query?: string }) => {
          if (e.duration >= SLOW_QUERY_THRESHOLD_MS) {
            const queryPreview =
              typeof e.query === 'string'
                ? e.query.slice(0, 200).replace(/\s+/g, ' ')
                : 'unknown';
            this.logger.warn(
              `Slow query: ${e.duration}ms — ${queryPreview}${(e.query?.length ?? 0) > 200 ? '...' : ''}`,
              { durationMs: e.duration },
            );
          }
        },
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
