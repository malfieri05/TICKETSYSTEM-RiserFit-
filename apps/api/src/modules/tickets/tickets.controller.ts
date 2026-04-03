import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CommentsService } from '../comments/comments.service';
import { LeaseEvaluationService } from '../lease-iq/services/lease-evaluation.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { Role } from '@prisma/client';
import { EvaluationTrigger } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketFiltersDto } from './dto/ticket-filters.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { AddTicketTagDto } from './dto/add-ticket-tag.dto';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly commentsService: CommentsService,
    private readonly leaseEvaluation: LeaseEvaluationService,
  ) {}

  // POST /api/tickets
  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: RequestUser) {
    return this.ticketsService.create(dto, user);
  }

  // GET /api/tickets/my-summary?page=1&limit=50
  @Get('my-summary')
  getMySummary(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const limitNum = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
      : 50;
    return this.ticketsService.getMySummary(user, pageNum, limitNum);
  }

  // GET /api/tickets/scope-summary — Studio Portal dashboard (must be before :id)
  @Get('scope-summary')
  getScopeSummary(@CurrentUser() user: RequestUser) {
    return this.ticketsService.getScopeSummary(user);
  }

  // GET /api/tickets/inbox-folders — Department inbox topic folders with active counts (Stage 23)
  @Get('inbox-folders')
  @Roles(Role.DEPARTMENT_USER, Role.ADMIN)
  getInboxFolders(@CurrentUser() user: RequestUser) {
    return this.ticketsService.getInboxFolders(user);
  }

  // GET /api/tickets?status=&ticketClassId=&supportTopicId=&maintenanceCategoryId=&page=&limit=
  @Get()
  findAll(
    @Query() filters: TicketFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.findAll(filters, user);
  }

  // GET /api/tickets/:id/lease-iq-result
  @Get(':id/lease-iq-result')
  async getLeaseIqResult(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ticketsService.findById(id, user);
    return this.leaseEvaluation.getResultForTicket(id);
  }

  // POST /api/tickets/:id/lease-iq/evaluate — manual re-evaluate (ADMIN)
  @Post(':id/lease-iq/evaluate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async reEvaluateLeaseIq(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ticketsService.findById(id, user);
    await this.leaseEvaluation.evaluate(id, EvaluationTrigger.MANUAL);
    return this.leaseEvaluation.getResultForTicket(id);
  }

  // GET /api/tickets/:ticketId/mentionable-users?search=...
  @Get(':ticketId/mentionable-users')
  getMentionableUsers(
    @Param('ticketId') ticketId: string,
    @Query('search') search: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.getMentionableUsers(ticketId, user, search);
  }

  // POST /api/tickets/:id/tags
  @Post(':id/tags')
  @HttpCode(HttpStatus.CREATED)
  addTicketTag(
    @Param('id') id: string,
    @Body() dto: AddTicketTagDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.addTag(id, dto, user);
  }

  // DELETE /api/tickets/:id/tags/:tagId
  @Delete(':id/tags/:tagId')
  @HttpCode(HttpStatus.OK)
  removeTicketTag(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.removeTag(id, tagId, user);
  }

  // GET /api/tickets/:id
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.findById(id, user);
  }

  // PATCH /api/tickets/:id
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.update(id, dto, user);
  }

  // PATCH /api/tickets/:id/assign
  @Patch(':id/assign')
  @Roles('DEPARTMENT_USER', 'ADMIN')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.assign(id, dto.ownerId, user);
  }

  // PATCH /api/tickets/:id/status — DEPARTMENT_USER and ADMIN only (Stage 23: studio users cannot transition)
  @Patch(':id/status')
  @Roles(Role.DEPARTMENT_USER, Role.ADMIN)
  transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.transitionStatus(id, dto.status, user);
  }

  // POST /api/tickets/:id/watch
  @Post(':id/watch')
  @HttpCode(HttpStatus.OK)
  addWatcher(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.addWatcher(id, user.id);
  }

  // DELETE /api/tickets/:id/watch
  @Delete(':id/watch')
  @HttpCode(HttpStatus.OK)
  removeWatcher(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.removeWatcher(id, user.id);
  }

  // GET /api/tickets/:id/history
  @Get(':id/history')
  getHistory(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.getHistory(id, user);
  }
}
