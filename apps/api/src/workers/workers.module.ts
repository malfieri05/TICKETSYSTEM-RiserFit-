import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationFanoutProcessor } from './processors/notification-fanout.processor';
import { NotificationDispatchProcessor } from './processors/notification-dispatch.processor';
import { StaleTicketProcessor } from './processors/stale-ticket.processor';
import { SchedulerService } from './scheduler.service';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { SlaModule } from '../modules/sla/sla.module';
import { AiModule } from '../modules/ai/ai.module';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { QUEUES } from '../common/queue/queue.constants';
import { KnowledgeIngestionProcessor } from './processors/knowledge-ingestion.processor';
import { EmailAutomationModule } from '../modules/email-automation/email-automation.module';
import { EmailIngestProcessor } from './processors/email-ingest.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATION_FANOUT },
      { name: QUEUES.NOTIFICATION_DISPATCH },
      { name: QUEUES.SCHEDULED },
      { name: QUEUES.KNOWLEDGE_INGESTION },
      { name: QUEUES.EMAIL_INGEST },
    ),
    NotificationsModule,
    SlaModule,
    AiModule,
    PermissionsModule,
    EmailAutomationModule,
  ],
  providers: [
    NotificationFanoutProcessor,
    NotificationDispatchProcessor,
    StaleTicketProcessor,
    KnowledgeIngestionProcessor,
    EmailIngestProcessor,
    SchedulerService,
  ],
})
export class WorkersModule {}
