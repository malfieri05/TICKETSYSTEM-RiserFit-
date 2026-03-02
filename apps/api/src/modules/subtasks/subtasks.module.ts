import { Module } from '@nestjs/common';
import { SubtasksController } from './subtasks.controller';
import { SubtasksService } from './subtasks.service';
import { AuditLogModule } from '../../common/audit-log/audit-log.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AuditLogModule, EventsModule],
  controllers: [SubtasksController],
  providers: [SubtasksService],
  exports: [SubtasksService],
})
export class SubtasksModule {}
