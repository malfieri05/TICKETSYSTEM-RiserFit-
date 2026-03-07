import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { WorkflowAnalyticsService } from './workflow-analytics.service';

@Controller('admin/workflow-analytics')
@Roles(Role.ADMIN)
export class WorkflowAnalyticsController {
  constructor(private readonly workflowAnalyticsService: WorkflowAnalyticsService) {}

  @Get('templates')
  getTemplates() {
    return this.workflowAnalyticsService.getTemplates();
  }

  @Get('departments')
  getDepartments() {
    return this.workflowAnalyticsService.getDepartments();
  }

  @Get('bottlenecks')
  getBottlenecks() {
    return this.workflowAnalyticsService.getBottlenecks();
  }
}
