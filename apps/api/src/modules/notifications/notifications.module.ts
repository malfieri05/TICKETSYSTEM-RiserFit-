import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SseChannel } from './channels/sse.channel';
import { EmailChannel } from './channels/email.channel';
import { QUEUES } from '../../common/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION_DISPATCH }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, SseChannel, EmailChannel],
  exports: [NotificationsService, SseChannel, EmailChannel],
})
export class NotificationsModule {}
