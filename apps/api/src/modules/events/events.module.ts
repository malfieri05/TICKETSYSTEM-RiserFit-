import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DomainEventsService } from './domain-events.service';
import { QUEUES } from '../../common/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION_FANOUT }),
  ],
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class EventsModule {}
