import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubtaskWorkflowService } from './subtask-workflow.service';
import { CreateWorkflowTemplateDto } from './dto/create-workflow-template.dto';
import { CreateSubtaskTemplateDto } from './dto/create-subtask-template.dto';
import { AddTemplateDependencyDto } from './dto/add-template-dependency.dto';

@Controller('subtask-workflow')
export class SubtaskWorkflowController {
  constructor(private readonly workflow: SubtaskWorkflowService) {}

  @Post('templates')
  @Roles('ADMIN')
  createWorkflowTemplate(@Body() dto: CreateWorkflowTemplateDto) {
    return this.workflow.createWorkflowTemplate({
      ticketClassId: dto.ticketClassId,
      departmentId: dto.departmentId ?? undefined,
      supportTopicId: dto.supportTopicId ?? undefined,
      maintenanceCategoryId: dto.maintenanceCategoryId ?? undefined,
      name: dto.name ?? undefined,
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  @Get('templates/:id')
  @Roles('ADMIN')
  getWorkflowTemplate(@Param('id') id: string) {
    return this.workflow.getWorkflowTemplate(id);
  }

  @Post('subtask-templates')
  @Roles('ADMIN')
  createSubtaskTemplate(@Body() dto: CreateSubtaskTemplateDto) {
    return this.workflow.createSubtaskTemplate({
      workflowTemplateId: dto.workflowTemplateId,
      title: dto.title,
      description: dto.description ?? undefined,
      departmentId: dto.departmentId,
      assignedUserId: dto.assignedUserId ?? undefined,
      isRequired: dto.isRequired ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  @Post('template-dependencies')
  @Roles('ADMIN')
  addTemplateDependency(@Body() dto: AddTemplateDependencyDto) {
    return this.workflow.addTemplateDependency(
      dto.workflowTemplateId,
      dto.subtaskTemplateId,
      dto.dependsOnSubtaskTemplateId,
    );
  }
}
