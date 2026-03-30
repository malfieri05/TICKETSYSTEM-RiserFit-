import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ReportingModule } from '../reporting/reporting.module';
import { PermissionsModule } from '../../common/permissions/permissions.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolRouterService } from './tool-router.service';

@Module({
  imports: [AiModule, TicketsModule, ReportingModule, PermissionsModule],
  controllers: [AgentController],
  providers: [AgentService, ToolRouterService],
  exports: [AgentService],
})
export class AgentModule {}
