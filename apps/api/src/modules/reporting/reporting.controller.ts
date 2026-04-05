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

@Controller('reporting')
@Roles(Role.ADMIN, Role.DEPARTMENT_USER)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  // GET /api/reporting/summary
  // Total tickets, open, resolved, avg resolution time
  @Get('summary')
  getSummary() {
    return this.reportingService.getSummary();
  }

  // GET /api/reporting/volume?days=30  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD (dashboard timeframe)
  @Get('volume')
  getVolumeByDay(
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (from || to) {
      if (!from || !to) {
        throw new BadRequestException(
          'Query params "from" and "to" must both be provided (YYYY-MM-DD) for a date range.',
        );
      }
      return this.reportingService.getVolumeByDayInRange(from, to);
    }
    return this.reportingService.getVolumeByDay(days ? parseInt(days, 10) : 30);
  }

  // GET /api/reporting/by-status
  @Get('by-status')
  getByStatus() {
    return this.reportingService.getByStatus();
  }

  // GET /api/reporting/by-priority
  @Get('by-priority')
  getByPriority() {
    return this.reportingService.getByPriority();
  }

  // GET /api/reporting/by-category
  @Get('by-category')
  getByCategory() {
    return this.reportingService.getByCategory();
  }

  // GET /api/reporting/by-market
  @Get('by-market')
  getByMarket() {
    return this.reportingService.getByMarket();
  }

  // GET /api/reporting/resolution-time
  // Average resolution time in hours, broken down by category
  @Get('resolution-time')
  getResolutionTimeByCategory() {
    return this.reportingService.getResolutionTimeByCategory();
  }

  // GET /api/reporting/completion-time/owners
  // Average completion time (created -> closed/resolved) grouped by ticket owner
  @Get('completion-time/owners')
  getCompletionTimeByOwner() {
    return this.reportingService.getCompletionTimeByOwner();
  }

  // GET /api/reporting/workflow-timing
  @Get('workflow-timing')
  getWorkflowTiming() {
    return this.reportingService.getWorkflowTiming();
  }

  // GET /api/reporting/by-location (alias for by-market)
  @Get('by-location')
  getByLocation() {
    return this.reportingService.getByMarket();
  }

  // GET /api/reporting/export
  // Download all tickets as a CSV file
  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="tickets-export.csv"')
  async exportCsv(@Res() res: Response) {
    const csv = await this.reportingService.exportTicketsCsv();
    res.send(csv);
  }

  // ── Dispatch: open maintenance only (Stage 13, ADMIN only) ─────────────────
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
