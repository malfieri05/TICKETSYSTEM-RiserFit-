import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolRouterService } from './tool-router.service';

@Module({
  imports: [AiModule, TicketsModule],
  controllers: [AgentController],
  providers: [AgentService, ToolRouterService],
  exports: [AgentService],
})
export class AgentModule {}
