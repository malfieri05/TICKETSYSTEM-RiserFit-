import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { EmailAutomationConfigDto, EmailAutomationConfigRow } from '../dto/email-automation-config.dto';

/**
 * Manages the singleton email automation config row.
 * Used by Gmail ingest (poll window, label, isEnabled) and later stages (category, requester, thresholds).
 */
@Injectable()
export class EmailAutomationConfigService {
  private readonly logger = new Logger(EmailAutomationConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<EmailAutomationConfigRow | null> {
    const row = await this.prisma.emailAutomationConfig.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    return row as EmailAutomationConfigRow | null;
  }

  async getConfigOrCreateDefault(): Promise<EmailAutomationConfigRow> {
    let row = await this.getConfig();
    if (!row) {
      row = (await this.prisma.emailAutomationConfig.create({
        data: {
          gmailPollWindowHours: 24,
          minOrderNumberConfidence: 0.8,
          minAddressConfidence: 0.8,
          minItemConfidence: 0.8,
          isEnabled: false,
          updatedAt: new Date(),
        },
      })) as EmailAutomationConfigRow;
      this.logger.log('Created default email automation config');
    }
    return row;
  }

  async updateConfig(dto: EmailAutomationConfigDto): Promise<EmailAutomationConfigRow> {
    const existing = await this.getConfigOrCreateDefault();
    const updated = await this.prisma.emailAutomationConfig.update({
      where: { id: existing.id },
      data: {
        ...(dto.gmailLabel !== undefined && { gmailLabel: dto.gmailLabel }),
        ...(dto.gmailPollWindowHours !== undefined && { gmailPollWindowHours: dto.gmailPollWindowHours }),
        ...(dto.assemblyCategoryId !== undefined && { assemblyCategoryId: dto.assemblyCategoryId }),
        ...(dto.systemRequesterId !== undefined && { systemRequesterId: dto.systemRequesterId }),
        ...(dto.minOrderNumberConfidence !== undefined && { minOrderNumberConfidence: dto.minOrderNumberConfidence }),
        ...(dto.minAddressConfidence !== undefined && { minAddressConfidence: dto.minAddressConfidence }),
        ...(dto.minItemConfidence !== undefined && { minItemConfidence: dto.minItemConfidence }),
        ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
        updatedAt: new Date(),
      },
    });
    return updated as EmailAutomationConfigRow;
  }

  /** Store OAuth2 refresh token and connected email (any @gmail.com). */
  async setGmailOAuthTokens(refreshToken: string, connectedEmail: string): Promise<void> {
    const existing = await this.getConfigOrCreateDefault();
    await this.prisma.emailAutomationConfig.update({
      where: { id: existing.id },
      data: {
        gmailRefreshToken: refreshToken,
        gmailConnectedEmail: connectedEmail,
        updatedAt: new Date(),
      },
    });
    this.logger.log(`Gmail connected as ${connectedEmail}`);
  }

  /** Clear OAuth2 connection (e.g. admin disconnect). */
  async clearGmailConnection(): Promise<void> {
    const existing = await this.getConfigOrCreateDefault();
    await this.prisma.emailAutomationConfig.update({
      where: { id: existing.id },
      data: {
        gmailRefreshToken: null,
        gmailConnectedEmail: null,
        updatedAt: new Date(),
      },
    });
    this.logger.log('Gmail connection cleared');
  }
}
