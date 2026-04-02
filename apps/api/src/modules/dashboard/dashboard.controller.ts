import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: RequestUser,
    @Query('studioId') studioId?: string,
    /** Inclusive KPI window start (YYYY-MM-DD, local calendar day). */
    @Query('from') from?: string,
    /** Inclusive KPI window end (YYYY-MM-DD). */
    @Query('to') to?: string,
  ) {
    if ((from && !to) || (!from && to)) {
      throw new BadRequestException(
        'Query params "from" and "to" must both be provided (YYYY-MM-DD) or both omitted.',
      );
    }
    return this.dashboardService.getSummary(
      user,
      studioId || undefined,
      from || undefined,
      to || undefined,
    );
  }
}
