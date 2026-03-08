import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateMarketDto,
  UpdateMarketDto,
  CreateStudioDto,
  UpdateStudioDto,
} from './dto/admin.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ─── Categories ──────────────────────────────────────────────────────────

  // Readable by all authenticated users — needed for ticket create form
  @Get('categories')
  @Roles()
  listCategories() {
    return this.adminService.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.adminService.updateCategory(id, dto);
  }

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
  createMarket(@Body() dto: CreateMarketDto) {
    return this.adminService.createMarket(dto);
  }

  @Patch('markets/:id')
  updateMarket(@Param('id') id: string, @Body() dto: UpdateMarketDto) {
    return this.adminService.updateMarket(id, dto);
  }

  // ─── Studios ─────────────────────────────────────────────────────────────

  @Get('studios/:id/nearby')
  getNearbyStudios(
    @Param('id') id: string,
    @Query('radiusMiles') radiusMiles?: string,
  ) {
    const parsed = radiusMiles != null ? parseFloat(radiusMiles) : 25;
    const radius = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 25, 0), 100);
    return this.adminService.getNearbyStudios(id, radius);
  }

  @Get('studios')
  listStudios(@Query('marketId') marketId?: string) {
    return this.adminService.listStudios(marketId);
  }

  @Post('studios')
  createStudio(@Body() dto: CreateStudioDto) {
    return this.adminService.createStudio(dto);
  }

  @Patch('studios/:id')
  updateStudio(@Param('id') id: string, @Body() dto: UpdateStudioDto) {
    return this.adminService.updateStudio(id, dto);
  }
}
