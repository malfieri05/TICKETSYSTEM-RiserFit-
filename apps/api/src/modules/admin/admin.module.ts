import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../../common/database/database.module';
import { PolicyModule } from '../../policy/policy.module';
import { QUEUES } from '../../common/queue/queue.constants';

@Module({
  imports: [
    DatabaseModule,
    PolicyModule,
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION_FANOUT }),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
