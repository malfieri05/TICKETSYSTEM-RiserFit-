import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubtaskWorkflowService } from './subtask-workflow.service';
import { CreateWorkflowTemplateDto } from './dto/create-workflow-template.dto';
import { UpdateWorkflowTemplateDto } from './dto/update-workflow-template.dto';
import { CreateSubtaskTemplateDto } from './dto/create-subtask-template.dto';
import { UpdateSubtaskTemplateDto } from './dto/update-subtask-template.dto';
import { AddTemplateDependencyDto } from './dto/add-template-dependency.dto';
import { RemoveTemplateDependencyDto } from './dto/remove-template-dependency.dto';
import { ReorderSubtaskTemplatesDto } from './dto/reorder-subtask-templates.dto';

@Controller('subtask-workflow')
export class SubtaskWorkflowController {
  constructor(private readonly workflow: SubtaskWorkflowService) {}

  @Get('templates')
  @Roles('ADMIN')
  listWorkflowTemplates(
    @Query('ticketClassId') ticketClassId?: string,
    @Query('supportTopicId') supportTopicId?: string,
    @Query('maintenanceCategoryId') maintenanceCategoryId?: string,
  ) {
    return this.workflow.listWorkflowTemplates({
      ticketClassId: ticketClassId || undefined,
      supportTopicId: supportTopicId || undefined,
      maintenanceCategoryId: maintenanceCategoryId || undefined,
    });
  }

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

  @Post('templates/:id/subtask-templates/reorder')
  @Roles('ADMIN')
  reorderSubtaskTemplates(
    @Param('id') id: string,
    @Body() dto: ReorderSubtaskTemplatesDto,
  ) {
    return this.workflow.reorderSubtaskTemplates(id, dto.subtaskTemplateIds);
  }

  @Get('templates/:id/stats')
  @Roles('ADMIN')
  getTemplateStats(@Param('id') id: string) {
    return this.workflow.getTemplateStats(id);
  }

  @Get('templates/:id')
  @Roles('ADMIN')
  getWorkflowTemplate(@Param('id') id: string) {
    return this.workflow.getWorkflowTemplate(id);
  }

  @Patch('templates/:id')
  @Roles('ADMIN')
  updateWorkflowTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowTemplateDto,
  ) {
    return this.workflow.updateWorkflowTemplate(id, {
      name: dto.name,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });
  }

  @Delete('templates/:id')
  @Roles('ADMIN')
  deleteWorkflowTemplate(@Param('id') id: string) {
    return this.workflow.deleteWorkflowTemplate(id);
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
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  @Patch('subtask-templates/:id')
  @Roles('ADMIN')
  updateSubtaskTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateSubtaskTemplateDto,
  ) {
    return this.workflow.updateSubtaskTemplate(id, {
      title: dto.title,
      description: dto.description,
      departmentId: dto.departmentId,
      assignedUserId: dto.assignedUserId,
      sortOrder: dto.sortOrder,
    });
  }

  @Delete('subtask-templates/:id')
  @Roles('ADMIN')
  deleteSubtaskTemplate(@Param('id') id: string) {
    return this.workflow.deleteSubtaskTemplate(id);
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

  @Delete('template-dependencies')
  @Roles('ADMIN')
  removeTemplateDependency(@Body() dto: RemoveTemplateDependencyDto) {
    return this.workflow.removeTemplateDependency(
      dto.subtaskTemplateId,
      dto.dependsOnSubtaskTemplateId,
    );
  }
}
