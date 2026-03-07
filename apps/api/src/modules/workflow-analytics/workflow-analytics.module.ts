import { Module } from '@nestjs/common';
import { WorkflowAnalyticsController } from './workflow-analytics.controller';
import { WorkflowAnalyticsService } from './workflow-analytics.service';

@Module({
  controllers: [WorkflowAnalyticsController],
  providers: [WorkflowAnalyticsService],
  exports: [WorkflowAnalyticsService],
})
export class WorkflowAnalyticsModule {}
