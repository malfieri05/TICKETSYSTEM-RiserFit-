import { Injectable, Logger } from '@nestjs/common';
import { google, gmail_v1 } from 'googleapis';
import { PrismaService } from '../../../common/database/prisma.service';
import { EmailAutomationConfigService } from './email-automation-config.service';

/**
 * Stage 1: Poll Gmail by time window, dedupe by messageId, store raw emails in inbound_emails.
 * No classification or processing. Requires GMAIL_CREDENTIALS_JSON or GMAIL_CREDENTIALS_PATH
 * and optionally GMAIL_DELEGATED_USER for domain-wide delegation.
 */
@Injectable()
export class GmailIngestService {
  private readonly logger = new Logger(GmailIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: EmailAutomationConfigService,
  ) {}

  /**
   * Run one ingest cycle: fetch messages from Gmail (time window + optional label),
   * skip already-stored messageIds, persist new raw emails.
   */
  async runIngest(): Promise<{ fetched: number; stored: number; skipped: number }> {
    const config = await this.config.getConfigOrCreateDefault();
    if (!config.isEnabled) {
      this.logger.debug('Email automation is disabled — skipping ingest');
      return { fetched: 0, stored: 0, skipped: 0 };
    }

    const auth = await this.getAuthClient();
    if (!auth) {
      this.logger.warn('Gmail credentials not configured — skipping ingest');
      return { fetched: 0, stored: 0, skipped: 0 };
    }

    const gmail = google.gmail({ version: 'v1', auth });
    const userId = config.gmailLabel ? undefined : 'me'; // 'me' for delegated user
    const pollWindowHours = config.gmailPollWindowHours ?? 24;
    const query = this.buildQuery(pollWindowHours, config.gmailLabel);
    const labelIds = config.gmailLabel && this.isLabelId(config.gmailLabel) ? [config.gmailLabel] : undefined;

    let fetched = 0;
    let stored = 0;
    let skipped = 0;
    let pageToken: string | undefined;

    do {
      const listRes = await gmail.users.messages.list({
        userId: userId ?? 'me',
        q: query,
        labelIds,
        maxResults: 100,
        pageToken,
      });

      const messages = listRes.data.messages ?? [];
      pageToken = listRes.data.nextPageToken ?? undefined;
      fetched += messages.length;

      for (const ref of messages) {
        const messageId = ref.id!;
        const existing = await this.prisma.inboundEmail.findUnique({
          where: { messageId },
        });
        if (existing) {
          skipped++;
          continue;
        }

        try {
          const full = await gmail.users.messages.get({
            userId: userId ?? 'me',
            id: messageId,
            format: 'full',
          });
          await this.persistMessage(messageId, full.data);
          stored++;
        } catch (err) {
          this.logger.warn(`Failed to fetch or persist message ${messageId}: ${err}`);
        }
      }
    } while (pageToken);

    if (stored > 0 || fetched > 0) {
      this.logger.log(`Gmail ingest: fetched=${fetched}, stored=${stored}, skipped=${skipped}`);
    }
    return { fetched, stored, skipped };
  }

  /**
   * Prefer OAuth2 refresh token (any @gmail.com) when set in config;
   * otherwise fall back to service account (GMAIL_CREDENTIALS_* + optional GMAIL_DELEGATED_USER).
   */
  private async getAuthClient(): Promise<gmail_v1.Gmail['context']['_options']['auth'] | null> {
    const config = await this.config.getConfigOrCreateDefault();
    const refreshToken = config.gmailRefreshToken ?? null;

    if (refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );
      oauth2.setCredentials({ refresh_token: refreshToken });
      return oauth2 as unknown as gmail_v1.Gmail['context']['_options']['auth'];
    }

    const credentialsJson = process.env.GMAIL_CREDENTIALS_JSON;
    const credentialsPath = process.env.GMAIL_CREDENTIALS_PATH;
    const subject = process.env.GMAIL_DELEGATED_USER;

    let credentials: object;
    try {
      if (credentialsJson) {
        credentials = JSON.parse(credentialsJson);
      } else if (credentialsPath) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs');
        credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      } else {
        return null;
      }
    } catch {
      this.logger.warn('Invalid Gmail credentials (JSON parse or file read failed)');
      return null;
    }

    const creds = credentials as { private_key?: string; client_email?: string };
    const jwt = new google.auth.JWT({
      key: creds.private_key ?? undefined,
      email: creds.client_email,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      subject: subject || undefined,
    });

    return jwt as unknown as gmail_v1.Gmail['context']['_options']['auth'];
  }

  private buildQuery(pollWindowHours: number, labelName?: string | null): string {
    const seconds = Math.max(1, pollWindowHours * 3600);
    const parts = [`newer_than:${seconds}`];
    if (labelName && !this.isLabelId(labelName)) {
      parts.push(`in:${labelName}`);
    }
    return parts.join(' ');
  }

  private isLabelId(value: string): boolean {
    return value === 'INBOX' || value.startsWith('Label_') || value === 'UNREAD' || value === 'CATEGORY_';
  }

  private async persistMessage(messageId: string, msg: gmail_v1.Schema$Message): Promise<void> {
    const threadId = msg.threadId ?? null;
    const historyId = msg.historyId ?? null;
    const internalDate = msg.internalDate ? parseInt(msg.internalDate, 10) : Date.now();
    const receivedAt = new Date(internalDate);

    let subject: string | null = null;
    let fromAddress: string | null = null;
    const headers = msg.payload?.headers ?? [];
    for (const h of headers) {
      if (h.name?.toLowerCase() === 'subject') subject = h.value ?? null;
      if (h.name?.toLowerCase() === 'from') fromAddress = h.value ?? null;
    }

    let bodyPlain: string | null = null;
    let bodyHtml: string | null = null;
    this.extractBody(msg.payload, (plain, html) => {
      bodyPlain = plain;
      bodyHtml = html;
    });

    await this.prisma.inboundEmail.create({
      data: {
        messageId,
        threadId,
        historyId,
        subject,
        fromAddress,
        receivedAt,
        bodyPlain,
        bodyHtml,
      },
    });
  }

  private extractBody(
    payload: gmail_v1.Schema$MessagePart | undefined,
    out: (plain: string | null, html: string | null) => void,
  ): void {
    if (!payload) {
      out(null, null);
      return;
    }
    let plain: string | null = null;
    let html: string | null = null;

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      plain = this.decodeBase64Url(payload.body.data);
    }
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      html = this.decodeBase64Url(payload.body.data);
    }

    const parts = payload.parts ?? [];
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data && plain === null) {
        plain = this.decodeBase64Url(part.body.data);
      }
      if (part.mimeType === 'text/html' && part.body?.data && html === null) {
        html = this.decodeBase64Url(part.body.data);
      }
    }

    out(plain, html);
  }

  private decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
  }
}
