import { Module } from '@nestjs/common';
import { SubtasksController } from './subtasks.controller';
import { SubtasksService } from './subtasks.service';
import { AuditLogModule } from '../../common/audit-log/audit-log.module';
import { EventsModule } from '../events/events.module';
import { SubtaskWorkflowModule } from '../subtask-workflow/subtask-workflow.module';
import { PermissionsModule } from '../../common/permissions/permissions.module';
import { PolicyModule } from '../../policy/policy.module';

@Module({
  imports: [
    AuditLogModule,
    EventsModule,
    SubtaskWorkflowModule,
    PermissionsModule,
    PolicyModule,
  ],
  controllers: [SubtasksController],
  providers: [SubtasksService],
  exports: [SubtasksService],
})
export class SubtasksModule {}
