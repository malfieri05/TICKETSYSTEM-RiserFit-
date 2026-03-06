import { Module } from '@nestjs/common';
import { SubtaskWorkflowController } from './subtask-workflow.controller';
import { SubtaskWorkflowService } from './subtask-workflow.service';

@Module({
  controllers: [SubtaskWorkflowController],
  providers: [SubtaskWorkflowService],
  exports: [SubtaskWorkflowService],
})
export class SubtaskWorkflowModule {}
