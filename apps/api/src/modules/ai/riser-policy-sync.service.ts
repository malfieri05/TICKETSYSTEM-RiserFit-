import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { IngestionService } from './ingestion.service';
import { htmlToText } from 'html-to-text';

interface RiserPolicy {
  id: string;
  title: string;
  content: string; // HTML
  version?: string;
  review_on?: string | null;
  review_due?: string | null;
}

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
   * Policy IDs are currently sourced from RISER_POLICY_IDS (comma-separated).
   * This keeps implementation flexible until upstream list endpoints are finalized.
   */
  async syncAllPolicies(initiatorUserId?: string): Promise<{
    synced: number;
    skipped: number;
    failed: number;
    details: { id: string; status: 'synced' | 'skipped' | 'failed'; reason?: string }[];
  }> {
    const baseUrl = this.config.get<string>('RISER_API_BASE_URL');
    const apiKey = this.config.get<string>('RISER_API_KEY');
    const idsEnv = this.config.get<string>('RISER_POLICY_IDS');

    if (!baseUrl || !apiKey || !idsEnv) {
      this.logger.warn(
        'RISER_API_BASE_URL, RISER_API_KEY, or RISER_POLICY_IDS not set — skipping Riser policy sync.',
      );
      return { synced: 0, skipped: 0, failed: 0, details: [] };
    }

    const policyIds = idsEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const results: { id: string; status: 'synced' | 'skipped' | 'failed'; reason?: string }[] = [];
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const policyId of policyIds) {
      try {
        const policy = await this.fetchPolicy(baseUrl, apiKey, policyId);
        if (!policy) {
          failed += 1;
          results.push({
            id: policyId,
            status: 'failed',
            reason: 'Policy not found or empty response',
          });
          continue;
        }

        const changed = await this.upsertPolicyDocument(
          policy,
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
        this.logger.error(`Failed to sync Riser policy ${policyId}`, err as Error);
        results.push({
          id: policyId,
          status: 'failed',
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { synced, skipped, failed, details: results };
  }

  private async fetchPolicy(
    baseUrl: string,
    apiKey: string,
    policyId: string,
  ): Promise<RiserPolicy | null> {
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/opdocs/policy/${encodeURIComponent(policyId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      this.logger.warn(
        `Riser policy fetch failed for ${policyId}: ${res.status} ${res.statusText}`,
      );
      return null;
    }
    const json = (await res.json()) as unknown;
    const data = json as { id?: string; title?: string; content?: string; version?: string; review_on?: string; review_due?: string };
    if (!data.id || !data.title || !data.content) {
      this.logger.warn(`Riser policy ${policyId} missing id/title/content.`);
      return null;
    }
    return {
      id: data.id,
      title: data.title,
      content: data.content,
      version: data.version,
      review_on: data.review_on,
      review_due: data.review_due,
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

