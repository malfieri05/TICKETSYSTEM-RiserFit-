import { Injectable, Logger } from '@nestjs/common';
import * as postmark from 'postmark';
import { Resend } from 'resend';

type InviteMailBackend = 'resend' | 'postmark' | 'none';

@Injectable()
export class InviteMailService {
  private readonly logger = new Logger(InviteMailService.name);
  private readonly backend: InviteMailBackend;
  private readonly fromEmail: string;
  private postmarkClient: postmark.ServerClient | null = null;
  private resendClient: Resend | null = null;

  constructor() {
    const resendKey = process.env.RESEND_API_KEY;
    const postmarkToken = process.env.POSTMARK_API_TOKEN;

    this.fromEmail =
      process.env.INVITE_FROM_EMAIL ??
      process.env.RESEND_FROM_EMAIL ??
      process.env.POSTMARK_FROM_EMAIL ??
      'Riser Fitness <onboarding@resend.dev>';

    if (resendKey) {
      this.backend = 'resend';
      this.resendClient = new Resend(resendKey);
      this.logger.log('Invite emails: Resend');
      return;
    }

    if (postmarkToken) {
      this.backend = 'postmark';
      this.postmarkClient = new postmark.ServerClient(postmarkToken);
      this.logger.log('Invite emails: Postmark');
      return;
    }

    this.backend = 'none';
    this.logger.warn(
      'Neither RESEND_API_KEY nor POSTMARK_API_TOKEN set — invite emails logged only (dev)',
    );
  }

  async sendInvite(params: {
    to: string;
    inviteLink: string;
    seedName: string;
  }): Promise<void> {
    const subject = 'Complete your Riser Fitness account';
    const textBody = `Hi ${params.seedName},\n\nUse this one-time link to set your password and activate your account:\n${params.inviteLink}\n\nIf you did not expect this email, ignore it.\n`;
    const htmlBody = `<p>Hi ${escapeHtml(params.seedName)},</p><p><a href="${escapeHtml(params.inviteLink)}">Complete your account setup</a></p><p>If you did not expect this email, you can ignore it.</p>`;

    if (this.backend === 'none') {
      this.logger.log(`[DEV INVITE EMAIL] To: ${params.to} | Link: [redacted]`);
      return;
    }

    if (this.backend === 'resend' && this.resendClient) {
      const { data, error } = await this.resendClient.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject,
        text: textBody,
        html: htmlBody,
      });
      if (error) {
        this.logger.error(`Resend invite failed: ${error.message}`);
        throw new Error(error.message);
      }
      this.logger.log(`Invite email queued/sent via Resend id=${data?.id ?? 'n/a'}`);
      return;
    }

    if (this.backend === 'postmark' && this.postmarkClient) {
      await this.postmarkClient.sendEmail({
        From: this.fromEmail,
        To: params.to,
        Subject: subject,
        TextBody: textBody,
        HtmlBody: htmlBody,
        MessageStream: 'outbound',
      });
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
