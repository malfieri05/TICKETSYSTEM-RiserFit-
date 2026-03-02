import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationFanoutProcessor } from './processors/notification-fanout.processor';
import { NotificationDispatchProcessor } from './processors/notification-dispatch.processor';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { QUEUES, FANOUT_JOB_OPTIONS, DISPATCH_JOB_OPTIONS } from '../common/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATION_FANOUT },
      { name: QUEUES.NOTIFICATION_DISPATCH },
    ),
    NotificationsModule,
  ],
  providers: [
    NotificationFanoutProcessor,
    NotificationDispatchProcessor,
  ],
})
export class WorkersModule {}
