import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  CreateMarketDto,
  UpdateMarketDto,
  CreateStudioDto,
  UpdateStudioDto,
  UpsertStudioProfileDto,
} from './dto/admin.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { PolicyService } from '../../policy/policy.service';
import { ADMIN_TAXONOMY_MANAGE } from '../../policy/capabilities/capability-keys';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private policy: PolicyService,
  ) {}

  // Read-only ticket taxonomy (Stage 2); any authenticated user
  @Get('config/ticket-taxonomy')
  @Roles()
  getTicketTaxonomy() {
    return this.adminService.getTicketTaxonomy();
  }

  // ─── Markets ─────────────────────────────────────────────────────────────

  // Readable by all authenticated users
  @Get('markets')
  @Roles()
  listMarkets() {
    return this.adminService.listMarkets();
  }

  @Post('markets')
  createMarket(@Body() dto: CreateMarketDto, @CurrentUser() user: RequestUser) {
    const decision = this.policy.evaluate(ADMIN_TAXONOMY_MANAGE, user, null);
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to modify markets',
      );
    }
    return this.adminService.createMarket(dto);
  }

  @Patch('markets/:id')
  updateMarket(
    @Param('id') id: string,
    @Body() dto: UpdateMarketDto,
    @CurrentUser() user: RequestUser,
  ) {
    const decision = this.policy.evaluate(ADMIN_TAXONOMY_MANAGE, user, null);
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to modify markets',
      );
    }
    return this.adminService.updateMarket(id, dto);
  }

  // ─── Studios ─────────────────────────────────────────────────────────────

  @Get('studios/:id/nearby')
  getNearbyStudios(
    @Param('id') id: string,
    @Query('radiusMiles') radiusMiles?: string,
  ) {
    const parsed = radiusMiles != null ? parseFloat(radiusMiles) : 25;
    const radius = Math.min(
      Math.max(Number.isFinite(parsed) ? parsed : 25, 0),
      100,
    );
    return this.adminService.getNearbyStudios(id, radius);
  }

  @Get('studios')
  listStudios(@Query('marketId') marketId?: string) {
    return this.adminService.listStudios(marketId);
  }

  @Post('studios')
  createStudio(@Body() dto: CreateStudioDto, @CurrentUser() user: RequestUser) {
    const decision = this.policy.evaluate(ADMIN_TAXONOMY_MANAGE, user, null);
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to modify studios',
      );
    }
    return this.adminService.createStudio(dto);
  }

  @Patch('studios/:id/profile')
  upsertStudioProfile(
    @Param('id') id: string,
    @Body() dto: UpsertStudioProfileDto,
    @CurrentUser() user: RequestUser,
  ) {
    const decision = this.policy.evaluate(ADMIN_TAXONOMY_MANAGE, user, null);
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to modify studios',
      );
    }
    return this.adminService.upsertStudioProfile(id, dto);
  }

  @Patch('studios/:id')
  updateStudio(
    @Param('id') id: string,
    @Body() dto: UpdateStudioDto,
    @CurrentUser() user: RequestUser,
  ) {
    const decision = this.policy.evaluate(ADMIN_TAXONOMY_MANAGE, user, null);
    if (!decision.allowed) {
      throw new ForbiddenException(
        'You do not have permission to modify studios',
      );
    }
    return this.adminService.updateStudio(id, dto);
  }

  // ─── System monitoring (admin-only) ────────────────────────────────────────

  /**
   * GET /api/admin/system/services
   * Returns a curated list of external services that power the system plus a
   * small environment summary. Admin-only, read-only, and safe for exposure to
   * the web frontend (no secrets, only high-level metadata).
   */
  @Get('system/services')
  getSystemServices() {
    return this.adminService.getSystemServices();
  }
}
