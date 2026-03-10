import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationFanoutProcessor } from './processors/notification-fanout.processor';
import { NotificationDispatchProcessor } from './processors/notification-dispatch.processor';
import { StaleTicketProcessor } from './processors/stale-ticket.processor';
import { SchedulerService } from './scheduler.service';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { SlaModule } from '../modules/sla/sla.module';
import { AiModule } from '../modules/ai/ai.module';
import { QUEUES } from '../common/queue/queue.constants';
import { KnowledgeIngestionProcessor } from './processors/knowledge-ingestion.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATION_FANOUT },
      { name: QUEUES.NOTIFICATION_DISPATCH },
      { name: QUEUES.SCHEDULED },
      { name: QUEUES.KNOWLEDGE_INGESTION },
    ),
    NotificationsModule, // provides NotificationsService + channel adapters
    SlaModule, // provides SlaService for breach computation
    AiModule, // provides IngestionService for knowledge-ingestion processor
  ],
  providers: [
    NotificationFanoutProcessor,
    NotificationDispatchProcessor,
    StaleTicketProcessor,
    KnowledgeIngestionProcessor,
    SchedulerService,
  ],
})
export class WorkersModule {}
