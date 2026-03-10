import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { AuditLogModule } from '../../common/audit-log/audit-log.module';
import { EventsModule } from '../events/events.module';
import { SlaModule } from '../sla/sla.module';
import { PermissionsModule } from '../../common/permissions/permissions.module';
import { PolicyModule } from '../../policy/policy.module';
import { TicketFormsModule } from '../ticket-forms/ticket-forms.module';
import { SubtaskWorkflowModule } from '../subtask-workflow/subtask-workflow.module';

@Module({
  imports: [
    AuditLogModule,
    EventsModule,
    SlaModule,
    PermissionsModule,
    TicketFormsModule,
    SubtaskWorkflowModule,
    PolicyModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
