import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { LeaseSourceService } from './services/lease-source.service';
import { LeaseRuleSetService } from './services/lease-rule-set.service';
import { LeaseParseService } from './services/lease-parse.service';
import { LeaseEvaluationService } from './services/lease-evaluation.service';
import {
  PasteSourceDto,
  ParseSourcesDto,
  UpdateRulesDto,
  PublishDto,
  PlaygroundDto,
} from './dto/lease-iq.dto';

const PDF_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@Controller('admin/lease-iq')
@Roles(Role.ADMIN)
export class LeaseIQController {
  constructor(
    private readonly leaseSource: LeaseSourceService,
    private readonly leaseRuleSet: LeaseRuleSetService,
    private readonly leaseParse: LeaseParseService,
    private readonly leaseEvaluation: LeaseEvaluationService,
  ) {}

  // ─── Sources ───────────────────────────────────────────────────────────────

  @Post('studios/:studioId/sources/upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PDF_MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype === 'application/pdf' ||
          file.originalname?.match(/\.pdf$/i)
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF files are supported'), false);
        }
      },
    }),
  )
  async uploadSource(
    @Param('studioId') studioId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const source = await this.leaseSource.createFromUpload(
      studioId,
      file,
      user.id,
    );
    return { id: source.id };
  }

  @Post('studios/:studioId/sources/paste')
  @HttpCode(HttpStatus.CREATED)
  async pasteSource(
    @Param('studioId') studioId: string,
    @Body() dto: PasteSourceDto,
    @CurrentUser() user: RequestUser,
  ) {
    const source = await this.leaseSource.createFromPaste(
      studioId,
      dto.pastedText,
      user.id,
    );
    return { id: source.id };
  }

  @Get('studios/:studioId/sources')
  async listSources(@Param('studioId') studioId: string) {
    return this.leaseSource.listByStudio(studioId);
  }

  @Delete('studios/:studioId/sources/:sourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSource(
    @Param('studioId') studioId: string,
    @Param('sourceId') sourceId: string,
  ) {
    await this.leaseSource.deleteSource(studioId, sourceId);
  }

  // ─── Parse ────────────────────────────────────────────────────────────────

  @Post('studios/:studioId/parse')
  @HttpCode(HttpStatus.CREATED)
  async parse(
    @Param('studioId') studioId: string,
    @Body() dto: ParseSourcesDto,
  ) {
    return this.leaseParse.parseSourcesForStudio(studioId, dto.sourceIds);
  }

  // ─── Rulesets and rules ───────────────────────────────────────────────────

  /** Coverage for admin UI: draft/published (row icon) + published-only (aggregate count). */
  @Get('studios-with-rulesets')
  async studiosWithRulesets() {
    const [studioIds, publishedStudioIds] = await Promise.all([
      this.leaseRuleSet.getStudioIdsWithActiveRulesets(),
      this.leaseRuleSet.getStudioIdsWithPublishedRulesets(),
    ]);
    return { studioIds, publishedStudioIds };
  }

  @Get('studios/:studioId/rulesets')
  async listRulesets(@Param('studioId') studioId: string) {
    return this.leaseRuleSet.getRulesetsByStudio(studioId);
  }

  @Get('rulesets/:rulesetId')
  async getRuleset(@Param('rulesetId') rulesetId: string) {
    return this.leaseRuleSet.getRulesetWithRulesAndTerms(rulesetId);
  }

  @Patch('rulesets/:rulesetId/rules')
  async updateRules(
    @Param('rulesetId') rulesetId: string,
    @Body() dto: UpdateRulesDto,
  ) {
    return this.leaseRuleSet.updateRulesAndTerms(rulesetId, dto);
  }

  @Post('studios/:studioId/publish')
  async publish(
    @Param('studioId') studioId: string,
    @Body() dto: PublishDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leaseRuleSet.publish(studioId, dto.rulesetId, user.id);
  }

  @Post('playground')
  playground(@Body() dto: PlaygroundDto) {
    return this.leaseEvaluation.evaluateForPlayground(
      dto.studioId,
      dto.maintenanceCategoryId ?? null,
      dto.title,
      dto.description,
    );
  }

  @Get('copy-prompt')
  getCopyPrompt() {
    return {
      text: 'Paste your lease responsibility extraction below. Use sections: ## Landlord, ## Tenant, ## Shared. One term per line or comma-separated.',
    };
  }
}
