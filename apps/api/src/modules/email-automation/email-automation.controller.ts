import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '@prisma/client';
import { EmailAutomationConfigService } from './services/email-automation-config.service';
import { GmailIngestService } from './services/gmail-ingest.service';
import { GmailOAuthService } from './services/gmail-oauth.service';
import { AddressMatchingService } from './services/address-matching.service';
import { ReprocessEmailService } from './services/reprocess-email.service';
import { EmailPatternPlaygroundService } from './services/email-pattern-playground.service';
import { EmailAutomationConfigDto } from './dto/email-automation-config.dto';
import { EmailPatternPlaygroundDto } from './dto/playground.dto';
import {
  CreateAssemblyTriggerItemDto,
  UpdateAssemblyTriggerItemDto,
} from './dto/assembly-trigger.dto';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * Admin-only endpoints for email automation.
 */
@Controller('admin/email-automation')
@Roles(Role.ADMIN)
export class EmailAutomationController {
  constructor(
    private readonly configService: EmailAutomationConfigService,
    private readonly gmailIngest: GmailIngestService,
    private readonly gmailOAuth: GmailOAuthService,
    private readonly addressMatching: AddressMatchingService,
    private readonly reprocessEmailService: ReprocessEmailService,
    private readonly playground: EmailPatternPlaygroundService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('config')
  async getConfig() {
    const config = await this.configService.getConfigOrCreateDefault();
    const { gmailRefreshToken: _, ...safe } = config as Record<string, unknown>;
    return safe;
  }

  @Get('gmail/auth-url')
  getGmailAuthUrl() {
    return { url: this.gmailOAuth.getAuthUrl() };
  }

  @Public()
  @Get('gmail/callback')
  async gmailCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const redirectPath = '/admin/email-automation';
    const redirectUrl = `${frontendBase.replace(/\/$/, '')}${redirectPath}`;

    if (error || !code) {
      const params = new URLSearchParams(error ? { gmail_error: error } : {});
      return res.redirect(`${redirectUrl}?${params.toString()}`);
    }
    try {
      const { refreshToken, email } = await this.gmailOAuth.exchangeCodeAndGetEmail(code);
      await this.configService.setGmailOAuthTokens(refreshToken, email);
      return res.redirect(`${redirectUrl}?gmail_connected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Exchange failed';
      return res.redirect(`${redirectUrl}?gmail_error=${encodeURIComponent(message)}`);
    }
  }

  @Post('gmail/disconnect')
  async gmailDisconnect() {
    await this.configService.clearGmailConnection();
    return { ok: true };
  }

  @Patch('config')
  updateConfig(@Body() dto: EmailAutomationConfigDto) {
    return this.configService.updateConfig(dto);
  }

  @Post('ingest/run')
  runIngest() {
    return this.gmailIngest.runIngest();
  }

  // ─── Assembly trigger list ─────────────────────────────────────────────────

  @Get('assembly-items')
  listAssemblyItems() {
    return this.prisma.assemblyTriggerItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  @Post('assembly-items')
  createAssemblyItem(@Body() dto: CreateAssemblyTriggerItemDto) {
    return this.prisma.assemblyTriggerItem.create({
      data: {
        keywordOrPhrase: dto.keywordOrPhrase,
        displayName: dto.displayName ?? null,
        matchMode: dto.matchMode ?? 'SUBSTRING',
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        updatedAt: new Date(),
      },
    });
  }

  @Patch('assembly-items/:id')
  updateAssemblyItem(
    @Param('id') id: string,
    @Body() dto: UpdateAssemblyTriggerItemDto,
  ) {
    return this.prisma.assemblyTriggerItem.update({
      where: { id },
      data: {
        ...(dto.keywordOrPhrase !== undefined && { keywordOrPhrase: dto.keywordOrPhrase }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.matchMode !== undefined && { matchMode: dto.matchMode }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        updatedAt: new Date(),
      },
    });
  }

  @Delete('assembly-items/:id')
  deleteAssemblyItem(@Param('id') id: string) {
    return this.prisma.assemblyTriggerItem.delete({ where: { id } });
  }

  // ─── Normalized studio addresses ──────────────────────────────────────────

  @Get('normalized-addresses')
  listNormalizedAddresses() {
    return this.prisma.studioAddressNormalized.findMany({
      include: { studio: { select: { id: true, name: true } } },
      orderBy: { studioId: 'asc' },
    });
  }

  @Post('normalized-addresses/refresh')
  refreshNormalizedAddresses() {
    return this.addressMatching.refreshNormalizedAddresses();
  }

  // ─── Inbound emails and reprocess ─────────────────────────────────────────

  @Get('emails')
  listEmails(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('classification') classification?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const where =
      classification && ['ORDER_CONFIRMATION', 'DELIVERY_CONFIRMATION', 'OTHER'].includes(classification)
        ? { classification }
        : {};
    return this.prisma.inboundEmail.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip,
      take: limitNum,
      select: {
        id: true,
        messageId: true,
        subject: true,
        fromAddress: true,
        receivedAt: true,
        classification: true,
        classificationConfidence: true,
        processedAt: true,
        createdAt: true,
      },
    });
  }

  @Get('emails/:id')
  getEmail(@Param('id') id: string) {
    return this.prisma.inboundEmail.findUniqueOrThrow({
      where: { id },
      include: {
        vendorOrderRecords: { include: { lineItems: true } },
        deliveryEvents: true,
        reviewItems: true,
      },
    });
  }

  @Post('emails/:id/reprocess')
  reprocessEmail(@Param('id') id: string) {
    return this.reprocessEmailService.reprocess(id);
  }

  // ─── Review queue ────────────────────────────────────────────────────────

  @Get('review-queue')
  listReviewQueue(
    @Query('reason') reason?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const where: { reason?: import('@prisma/client').EmailAutomationReviewReason; status?: import('@prisma/client').EmailAutomationReviewStatus } = {};
    if (reason) where.reason = reason as import('@prisma/client').EmailAutomationReviewReason;
    if (status) where.status = status as import('@prisma/client').EmailAutomationReviewStatus;
    return this.prisma.emailAutomationReviewItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      include: {
        email: { select: { id: true, subject: true, fromAddress: true, receivedAt: true } },
        order: { select: { id: true, orderNumber: true, vendorIdentifier: true } },
      },
    });
  }

  @Patch('review-queue/:id/resolve')
  resolveReviewItem(@Param('id') id: string, @Body() body: { resolvedBy?: string }) {
    return this.prisma.emailAutomationReviewItem.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: body.resolvedBy ?? null,
        updatedAt: new Date(),
      },
    });
  }

  @Patch('review-queue/:id/dismiss')
  dismissReviewItem(@Param('id') id: string) {
    return this.prisma.emailAutomationReviewItem.update({
      where: { id },
      data: { status: 'DISMISSED', resolvedAt: new Date(), updatedAt: new Date() },
    });
  }

  // ─── Event log ───────────────────────────────────────────────────────────

  @Post('email-pattern-playground')
  async emailPatternPlayground(@Body() dto: EmailPatternPlaygroundDto) {
    return this.playground.run(dto.rawEmail, dto.subject, dto.body);
  }

  @Get('events')
  listEvents(
    @Query('emailId') emailId?: string,
    @Query('eventType') eventType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const where: { emailId?: string; eventType?: string } = {};
    if (emailId) where.emailId = emailId;
    if (eventType) where.eventType = eventType;
    return this.prisma.emailAutomationEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    });
  }
}
