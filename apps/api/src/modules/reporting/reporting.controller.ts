import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportingService } from './reporting.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { DispatchFiltersDto } from './dto/dispatch-filters.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@Controller('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  // GET /api/reporting/summary
  @Get('summary')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER)
  getSummary() {
    return this.reportingService.getSummary();
  }

  // GET /api/reporting/volume?days=30  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD (dashboard timeframe)
  @Get('volume')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER, Role.STUDIO_USER)
  getVolumeByDay(
    @CurrentUser() user: RequestUser,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('studioId') studioId?: string,
  ) {
    if (from || to) {
      if (!from || !to) {
        throw new BadRequestException(
          'Query params "from" and "to" must both be provided (YYYY-MM-DD) for a date range.',
        );
      }
      return this.reportingService.getVolumeByDayInRange(user, from, to, studioId);
    }
    return this.reportingService.getVolumeByDay(
      user,
      days ? parseInt(days, 10) : 30,
      studioId,
    );
  }

  @Get('by-status')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER)
  getByStatus() {
    return this.reportingService.getByStatus();
  }

  @Get('by-priority')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER)
  getByPriority() {
    return this.reportingService.getByPriority();
  }

  @Get('by-category')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER)
  getByCategory() {
    return this.reportingService.getByCategory();
  }

  @Get('by-market')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER)
  getByMarket() {
    return this.reportingService.getByMarket();
  }

  @Get('resolution-time')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER, Role.STUDIO_USER)
  getResolutionTimeByCategory(
    @CurrentUser() user: RequestUser,
    @Query('studioId') studioId?: string,
  ) {
    return this.reportingService.getResolutionTimeByCategory(user, studioId);
  }

  @Get('completion-time/owners')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER, Role.STUDIO_USER)
  getCompletionTimeByOwner(
    @CurrentUser() user: RequestUser,
    @Query('studioId') studioId?: string,
  ) {
    return this.reportingService.getCompletionTimeByOwner(user, studioId);
  }

  @Get('workflow-timing')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER, Role.STUDIO_USER)
  getWorkflowTiming(
    @CurrentUser() user: RequestUser,
    @Query('studioId') studioId?: string,
  ) {
    return this.reportingService.getWorkflowTiming(user, studioId);
  }

  @Get('by-location')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER)
  getByLocation() {
    return this.reportingService.getByMarket();
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.DEPARTMENT_USER)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="tickets-export.csv"')
  async exportCsv(@Res() res: Response) {
    const csv = await this.reportingService.exportTicketsCsv();
    res.send(csv);
  }

  @Get('dispatch/by-studio')
  @Roles(Role.ADMIN)
  getDispatchByStudio(@Query() filters: DispatchFiltersDto) {
    return this.reportingService.getDispatchByStudio(filters);
  }

  @Get('dispatch/by-category')
  @Roles(Role.ADMIN)
  getDispatchByCategory(@Query() filters: DispatchFiltersDto) {
    return this.reportingService.getDispatchByCategory(filters);
  }

  @Get('dispatch/by-market')
  @Roles(Role.ADMIN)
  getDispatchByMarket(@Query() filters: DispatchFiltersDto) {
    return this.reportingService.getDispatchByMarket(filters);
  }

  @Get('dispatch/studios-with-multiple')
  @Roles(Role.ADMIN)
  getDispatchStudiosWithMultiple(@Query() filters: DispatchFiltersDto) {
    return this.reportingService.getDispatchStudiosWithMultiple(filters);
  }
}
