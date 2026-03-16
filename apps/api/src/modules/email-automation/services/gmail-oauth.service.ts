import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/**
 * Gmail OAuth2 for any @gmail.com account (no Google Workspace required).
 * Uses GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and API_PUBLIC_URL for redirect URI.
 */
@Injectable()
export class GmailOAuthService {
  private readonly logger = new Logger(GmailOAuthService.name);

  getRedirectUri(): string {
    const base = process.env.API_PUBLIC_URL ?? 'http://localhost:3001';
    return `${base.replace(/\/$/, '')}/api/admin/email-automation/gmail/callback`;
  }

  /** Returns Google OAuth2 consent URL (open in browser to connect Gmail). */
  getAuthUrl(): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the API .env (see Email Automation docs).',
      );
    }
    const redirectUri = this.getRedirectUri();
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    return oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
  }

  /**
   * Exchange authorization code for tokens and fetch connected account email.
   */
  async exchangeCodeAndGetEmail(code: string): Promise<{ refreshToken: string; email: string }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Gmail OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the API .env.',
      );
    }
    const oauth2 = new google.auth.OAuth2(
      clientId,
      clientSecret,
      this.getRedirectUri(),
    );
    const { tokens } = await oauth2.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      throw new Error('Google did not return a refresh token (prompt=consent may be required)');
    }
    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress ?? '';
    if (!email) {
      throw new Error('Could not read Gmail profile email');
    }
    return { refreshToken, email };
  }
}
