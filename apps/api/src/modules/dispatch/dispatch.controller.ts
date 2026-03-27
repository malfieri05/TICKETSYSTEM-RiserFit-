import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  DispatchRecommendationService,
  type RecommendationResult,
} from './services/dispatch-recommendation.service';
import { DispatchGroupService } from './services/dispatch-group.service';
import { DispatchTemplateService } from './services/dispatch-template.service';
import { DispatchClassificationService } from './services/dispatch-classification.service';
import {
  CreateDispatchGroupDto,
  UpdateDispatchGroupDto,
  AddDispatchGroupItemDto,
  ReorderDispatchGroupItemsDto,
  DispatchGroupFiltersDto,
  DispatchReadyFiltersDto,
  RecommendationQueryDto,
  WorkspaceNearbyQueryDto,
  CreateDispatchTemplateDto,
  UpdateDispatchTemplateDto,
} from './dto/dispatch.dto';

@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly recommendationService: DispatchRecommendationService,
    private readonly groupService: DispatchGroupService,
    private readonly templateService: DispatchTemplateService,
    private readonly classificationService: DispatchClassificationService,
  ) {}

  // ─── Workspace (Grouping Workspace) — register before parameterized routes ───

  @Get('workspace/nearby')
  getWorkspaceNearby(@Query() query: WorkspaceNearbyQueryDto) {
    return this.recommendationService.getNearbyForWorkspace(
      query.anchorTicketId,
      query.radiusMiles,
    );
  }

  // ─── Recommendations ───────────────────────────────────────────────────────

  @Get('recommendations/:ticketId')
  getRecommendations(
    @Param('ticketId') ticketId: string,
    @Query() query: RecommendationQueryDto,
  ): Promise<RecommendationResult> {
    return this.recommendationService.getRecommendations(
      ticketId,
      query.radiusMiles,
      query.tradeType,
    );
  }

  // ─── Classification ────────────────────────────────────────────────────────

  @Get('classification/suggest/:maintenanceCategoryId')
  async getSuggestedTradeType(
    @Param('maintenanceCategoryId') maintenanceCategoryId: string,
  ) {
    const suggested =
      await this.classificationService.getSuggestedTradeType(
        maintenanceCategoryId,
      );
    return { suggestedDispatchTradeType: suggested };
  }

  // ─── Dispatch-ready tickets ────────────────────────────────────────────────

  @Get('ready')
  getDispatchReadyTickets(@Query() filters: DispatchReadyFiltersDto) {
    return this.groupService.getDispatchReadyTickets(filters);
  }

  // ─── Groups CRUD ───────────────────────────────────────────────────────────

  @Get('groups')
  listGroups(@Query() filters: DispatchGroupFiltersDto) {
    return this.groupService.findAll(filters);
  }

  @Get('groups/:id')
  getGroup(@Param('id') id: string) {
    return this.groupService.findById(id);
  }

  @Post('groups')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  @HttpCode(HttpStatus.CREATED)
  createGroup(
    @Body() dto: CreateDispatchGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.create({
      ...dto,
      actorId: user.id,
    });
  }

  @Patch('groups/:id')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateDispatchGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.updateGroup(id, dto, user.id);
  }

  // ─── Group items ───────────────────────────────────────────────────────────

  @Post('groups/:id/items')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  @HttpCode(HttpStatus.CREATED)
  addItem(
    @Param('id') groupId: string,
    @Body() dto: AddDispatchGroupItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.addItem(groupId, dto.ticketId, user.id);
  }

  @Delete('groups/:id/items/:itemId')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @Param('id') groupId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.removeItem(groupId, itemId, user.id);
  }

  @Patch('groups/:id/items/reorder')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  reorderItems(
    @Param('id') groupId: string,
    @Body() dto: ReorderDispatchGroupItemsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupService.reorderItems(groupId, dto.order, user.id);
  }

  // ─── Templates (Grouping Workspace — rule-only, no apply in V1) ─────────────

  @Post('templates')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  @HttpCode(HttpStatus.CREATED)
  createTemplate(
    @Body() dto: CreateDispatchTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.templateService.create(
      {
        name: dto.name,
        dispatchTradeType: dto.dispatchTradeType,
        maintenanceCategoryId: dto.maintenanceCategoryId,
        anchorStudioId: dto.anchorStudioId,
        radiusMiles: dto.radiusMiles,
      },
      user.id,
    );
  }

  @Get('templates')
  listTemplates() {
    return this.templateService.findAll();
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.templateService.findById(id);
  }

  @Patch('templates/:id')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateDispatchTemplateDto,
  ) {
    return this.templateService.update(id, {
      name: dto.name,
      dispatchTradeType: dto.dispatchTradeType,
      maintenanceCategoryId: dto.maintenanceCategoryId,
      anchorStudioId: dto.anchorStudioId,
      radiusMiles: dto.radiusMiles,
    });
  }

  @Delete('templates/:id')
  @Roles('ADMIN', 'DEPARTMENT_USER')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTemplate(@Param('id') id: string) {
    return this.templateService.delete(id);
  }
}
