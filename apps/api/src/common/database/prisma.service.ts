import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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
    super({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
