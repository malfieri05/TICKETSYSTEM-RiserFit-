import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { IngestionService } from './ingestion.service';
import { htmlToText } from 'html-to-text';

/**
 * RiserU Op Central API — contract confirmed from vendor docs.
 *
 * Docs: https://riseru.opcentral.com.au/#/api-documentation/overview
 *
 * Confirmed:
 * - Auth: Header x-api-key: <RISER_API_KEY> (Op Central requirement).
 * - Base URL: RISER_API_BASE_URL with no trailing slash (we normalize).
 *   Example: https://riseru.api.opcentral.com.au
 * - Endpoint: GET {baseUrl}/v1/opdocs/policy/{policy_id}
 * - Note: Policy IDs are not the same as manual IDs from GET /v1/opdocs/manuals/all. Use policy IDs (e.g. from RiserU dashboard).
 *
 * Policy Details response (vendor-documented):
 * - id (number or string), title, content (HTML) — required.
 * - version (number or string), review_on, review_due (YYYY-MM-DD HH:MM:SS) — optional.
 * - videos, attachments, embedded_pdf — we ignore for sync; we only ingest id, title, content, version, review_*.
 * We defensively accept body as fallback for content.
 */

interface RiserPolicy {
  id: string;
  title: string;
  content: string; // HTML
  version?: string;
  review_on?: string | null;
  review_due?: string | null;
}

type FetchPolicyResult =
  | { policy: RiserPolicy }
  | { reason: string };

@Injectable()
export class RiserPolicySyncService {
  private readonly logger = new Logger(RiserPolicySyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
  ) {}

  /**
   * Determine which user should be recorded as the "uploader" for Riser policies.
   * Priority:
   * 1) First ADMIN user
   * 2) The initiating user (current admin triggering the sync)
   * If neither is available, return null instead of throwing so callers can
   * treat this as an operational failure rather than a 400.
   */
  private async getUploaderId(
    initiatorUserId?: string,
  ): Promise<string | null> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (admin) return admin.id;
    if (initiatorUserId) return initiatorUserId;

    this.logger.error(
      'No ADMIN or initiating user found to associate as uploader for Riser policies.',
    );
    return null;
  }

  /**
   * Sync a set of Riser policies into the knowledge base.
   * Policy IDs are sourced from RISER_POLICY_IDS (comma-separated).
   * When env is missing, returns configMissing: true so the UI can show a clear message.
   */
  async syncAllPolicies(initiatorUserId?: string): Promise<{
    synced: number;
    skipped: number;
    failed: number;
    details: { id: string; status: 'synced' | 'skipped' | 'failed'; reason?: string }[];
    configMissing?: boolean;
  }> {
    const baseUrl = this.config.get<string>('RISER_API_BASE_URL')?.trim() || '';
    const apiKey = this.config.get<string>('RISER_API_KEY')?.trim() || '';
    const idsEnv = this.config.get<string>('RISER_POLICY_IDS')?.trim() || '';

    if (!baseUrl || !apiKey || !idsEnv) {
      this.logger.warn(
        'Riser sync skipped: RISER_API_BASE_URL, RISER_API_KEY, or RISER_POLICY_IDS not set. Set all three in .env to enable sync.',
      );
      return {
        synced: 0,
        skipped: 0,
        failed: 0,
        details: [],
        configMissing: true,
      };
    }

    const policyIds = idsEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (policyIds.length === 0) {
      this.logger.warn(
        'Riser sync skipped: RISER_POLICY_IDS is set but contains no valid policy IDs (comma-separated list).',
      );
      return {
        synced: 0,
        skipped: 0,
        failed: 0,
        details: [],
        configMissing: true,
      };
    }

    const results: { id: string; status: 'synced' | 'skipped' | 'failed'; reason?: string }[] = [];
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const policyId of policyIds) {
      try {
        const fetchResult = await this.fetchPolicy(baseUrl, apiKey, policyId);
        if ('reason' in fetchResult) {
          failed += 1;
          results.push({ id: policyId, status: 'failed', reason: fetchResult.reason });
          continue;
        }

        const changed = await this.upsertPolicyDocument(
          fetchResult.policy,
          initiatorUserId,
        );
        if (!changed) {
          skipped += 1;
          results.push({ id: policyId, status: 'skipped' });
          continue;
        }

        synced += 1;
        results.push({ id: policyId, status: 'synced' });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Riser sync policy ${policyId}: ${message}`,
          err instanceof Error ? err.stack : undefined,
        );
        results.push({ id: policyId, status: 'failed', reason: message });
      }
    }

    return { synced, skipped, failed, details: results };
  }

  private async fetchPolicy(
    baseUrl: string,
    apiKey: string,
    policyId: string,
  ): Promise<FetchPolicyResult> {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${normalizedBase}/v1/opdocs/policy/${encodeURIComponent(policyId)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Riser policy fetch ${policyId}: network error — ${msg}`);
      return { reason: `Network error: ${msg}` };
    }

    const status = res.status;
    const bodyText = await res.text();

    if (!res.ok) {
      const snippet = bodyText.slice(0, 200).replace(/\s+/g, ' ').trim();
      if (status === 401) {
        this.logger.warn(`Riser policy fetch ${policyId}: 401 Unauthorized — check RISER_API_KEY. ${snippet ? `Body: ${snippet}` : ''}`);
        return { reason: 'Unauthorized (check RISER_API_KEY)' };
      }
      if (status === 403) {
        this.logger.warn(`Riser policy fetch ${policyId}: 403 Forbidden. ${snippet ? `Body: ${snippet}` : ''}`);
        return { reason: 'Forbidden (API key may lack access)' };
      }
      if (status === 404) {
        this.logger.debug(`Riser policy fetch ${policyId}: 404 Not found.`);
        return { reason: 'Policy not found' };
      }
      // 400/481 = invalid policy ID. Manual IDs from /manuals/all are NOT valid for /policy/{id}.
      if ((status === 400 || status === 481) && /invalid|policy\s*id/i.test(snippet)) {
        this.logger.warn(`Riser policy fetch ${policyId}: invalid policy ID (manual IDs from /manuals/all are not policy IDs).`);
        return {
          reason:
            'Policy ID invalid. Use policy IDs (not manual IDs from /manuals/all). Get policy IDs from the RiserU dashboard or try known IDs (e.g. 100, 200).',
        };
      }
      this.logger.warn(
        `Riser policy fetch ${policyId}: ${status} ${res.statusText}. ${snippet ? `Body: ${snippet}` : ''}`,
      );
      return { reason: `Upstream error ${status}${snippet ? `: ${snippet}` : ''}` };
    }

    let data: unknown;
    try {
      data = bodyText ? (JSON.parse(bodyText) as unknown) : null;
    } catch {
      this.logger.warn(`Riser policy ${policyId}: response was not valid JSON.`);
      return { reason: 'Invalid JSON response' };
    }

    if (data == null || typeof data !== 'object') {
      this.logger.warn(`Riser policy ${policyId}: empty or non-object response.`);
      return { reason: 'Empty or malformed response' };
    }

    const obj = data as Record<string, unknown>;
    // Vendor docs: id can be number (e.g. 1); version can be number (e.g. 1.2)
    const id = obj.id != null ? String(obj.id) : undefined;
    const title = typeof obj.title === 'string' ? obj.title : undefined;
    const content = typeof obj.content === 'string' ? obj.content : (typeof obj.body === 'string' ? obj.body : undefined);
    const version = obj.version != null ? String(obj.version) : undefined;
    const reviewOn = obj.review_on != null ? String(obj.review_on) : null;
    const reviewDue = obj.review_due != null ? String(obj.review_due) : null;

    if (!id || !title) {
      this.logger.warn(`Riser policy ${policyId}: missing id or title.`);
      return { reason: 'Missing id or title' };
    }
    if (!content || content.trim().length === 0) {
      this.logger.warn(`Riser policy ${policyId}: missing or empty content/body.`);
      return { reason: 'Missing or empty content' };
    }

    return {
      policy: {
        id,
        title,
        content: content.trim(),
        version,
        review_on: reviewOn || undefined,
        review_due: reviewDue || undefined,
      },
    };
  }

  private async upsertPolicyDocument(
    policy: RiserPolicy,
    initiatorUserId?: string,
  ): Promise<boolean> {
    const existing = await this.prisma.knowledgeDocument.findFirst({
      where: {
        upstreamProvider: 'riser',
        upstreamId: policy.id,
      },
    });

    const reviewOn = policy.review_on ? new Date(policy.review_on) : null;
    const reviewDue = policy.review_due ? new Date(policy.review_due) : null;
    const now = new Date();

    // If nothing changed at metadata level, we can conservatively skip re-indexing.
    if (
      existing &&
      existing.upstreamVersion === policy.version &&
      existing.reviewOn?.getTime() === reviewOn?.getTime() &&
      existing.reviewDue?.getTime() === reviewDue?.getTime()
    ) {
      await this.prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: { lastSyncedAt: now },
      });
      return false;
    }

    // Convert HTML to text for ingestion
    const text = htmlToText(policy.content, {
      wordwrap: false,
      selectors: [{ selector: 'a', options: { ignoreHref: true } }],
    }).trim();

    if (!text) {
      this.logger.warn(`Riser policy ${policy.id} produced no text after HTML conversion.`);
      return false;
    }

    if (!existing) {
      // Create new document + ingest text; treat as handbook
      const uploaderId = await this.getUploaderId(initiatorUserId);
      if (!uploaderId) {
        // Operational failure: no suitable uploader user. Let caller record as failed.
        throw new Error(
          'No uploader user available to associate with Riser policy document.',
        );
      }
      const { documentId } = await this.ingestion.ingestText(
        policy.title,
        text,
        uploaderId,
        {
          sourceType: 'url',
          documentType: 'handbook',
        },
      );
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          upstreamProvider: 'riser',
          upstreamId: policy.id,
          upstreamVersion: policy.version ?? null,
          reviewOn,
          reviewDue,
          lastSyncedAt: now,
        },
      });
      return true;
    }

    // Re-ingest for existing document: delete chunks, re-embed, update metadata.
    await this.ingestion.reingestExistingDocumentFromText(existing.id, policy.title, text, {
      documentType: 'handbook',
    });

    await this.prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: {
        upstreamVersion: policy.version ?? null,
        reviewOn,
        reviewDue,
        lastSyncedAt: now,
      },
    });

    return true;
  }
}

