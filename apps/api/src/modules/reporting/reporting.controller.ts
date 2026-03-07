import { Controller, Get, Query, Res, Header } from '@nestjs/common';
import { Response } from 'express';
import { ReportingService } from './reporting.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { MaintenanceReportFiltersDto } from './dto/maintenance-report-filters.dto';

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

  // GET /api/reporting/volume?days=30
  // Ticket volume per day over last N days
  @Get('volume')
  getVolumeByDay(@Query('days') days?: string) {
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

  // ─── Maintenance reporting (Stage 12, ADMIN only) ─────────────────────────
  @Get('maintenance/by-studio')
  @Roles(Role.ADMIN)
  getMaintenanceByStudio(@Query() filters: MaintenanceReportFiltersDto) {
    return this.reportingService.getMaintenanceByStudio(filters);
  }

  @Get('maintenance/by-category')
  @Roles(Role.ADMIN)
  getMaintenanceByCategory(@Query() filters: MaintenanceReportFiltersDto) {
    return this.reportingService.getMaintenanceByCategory(filters);
  }

  @Get('maintenance/by-market')
  @Roles(Role.ADMIN)
  getMaintenanceByMarket(@Query() filters: MaintenanceReportFiltersDto) {
    return this.reportingService.getMaintenanceByMarket(filters);
  }

  @Get('maintenance/repeat-issues')
  @Roles(Role.ADMIN)
  getMaintenanceRepeatIssues(@Query() filters: MaintenanceReportFiltersDto) {
    return this.reportingService.getMaintenanceRepeatIssues(filters);
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
}
