import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { SubtasksService } from './subtasks.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

@Controller('tickets/:ticketId/subtasks')
export class SubtasksController {
  constructor(private readonly subtasksService: SubtasksService) {}

  // POST /api/tickets/:ticketId/subtasks
  @Post()
  create(
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateSubtaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.subtasksService.create(ticketId, dto, user);
  }

  // GET /api/tickets/:ticketId/subtasks
  @Get()
  findAll(@Param('ticketId') ticketId: string) {
    return this.subtasksService.findByTicket(ticketId);
  }

  // PATCH /api/tickets/:ticketId/subtasks/:subtaskId
  @Patch(':subtaskId')
  update(
    @Param('subtaskId') subtaskId: string,
    @Body() dto: UpdateSubtaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.subtasksService.update(subtaskId, dto, user);
  }
}
