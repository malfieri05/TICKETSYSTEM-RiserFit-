import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { QUEUES } from '../common/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATION_FANOUT },
      { name: QUEUES.NOTIFICATION_DISPATCH },
    ),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
