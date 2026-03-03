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
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketFiltersDto } from './dto/ticket-filters.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // POST /api/tickets
  @Post()
  create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.create(dto, user);
  }

  // GET /api/tickets/my-summary
  @Get('my-summary')
  getMySummary(@CurrentUser() user: RequestUser) {
    return this.ticketsService.getMySummary(user);
  }

  // GET /api/tickets?status=&categoryId=&page=&limit=
  @Get()
  findAll(
    @Query() filters: TicketFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.findAll(filters, user);
  }

  // GET /api/tickets/:id
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
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
  @Roles('AGENT', 'MANAGER', 'ADMIN')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.assign(id, dto.ownerId, user);
  }

  // PATCH /api/tickets/:id/status
  @Patch(':id/status')
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
  addWatcher(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.addWatcher(id, user.id);
  }

  // DELETE /api/tickets/:id/watch
  @Delete(':id/watch')
  @HttpCode(HttpStatus.OK)
  removeWatcher(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.removeWatcher(id, user.id);
  }

  // GET /api/tickets/:id/history
  @Get(':id/history')
  getHistory(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.getHistory(id, user);
  }
}
