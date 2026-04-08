import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RiserSyncDto } from './dto/ai.dto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { IngestionService } from './ingestion.service';
import { htmlToText } from 'html-to-text';
import { KNOWLEDGE_CHUNK_PIPELINE_VERSION } from './knowledge-chunking';

/**
 * RiserU Op Central API — contract confirmed from vendor docs.
 *
 * Docs: https://riseru.opcentral.com.au/#/api-documentation/overview
 *
 * - GET {baseUrl}/v1/opdocs/policy/{policy_id} with x-api-key
 * - Response: id, title, content (HTML), optional version, review_*, embedded_pdf, attachments, etc.
 * - We ingest HTML (and body fallback) plus optional embedded_pdf text extraction.
 */

interface RiserPolicy {
  id: string;
  title: string;
  content: string; // HTML
  version?: string;
  review_on?: string | null;
  review_due?: string | null;
  /** Raw API field for PDF extraction (url string, base64, or object). */
  embeddedPdf?: unknown;
}

type FetchPolicyResult = { policy: RiserPolicy } | { reason: string };

@Injectable()
export class RiserPolicySyncService {
  private readonly logger = new Logger(RiserPolicySyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
  ) {}

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

  async syncAllPolicies(
    initiatorUserId?: string,
    dto?: RiserSyncDto,
  ): Promise<{
    synced: number;
    skipped: number;
    failed: number;
    details: { id: string; status: 'synced' | 'skipped' | 'failed'; reason?: string }[];
    configMissing?: boolean;
  }> {
    const hasAnyBody =
      (dto?.baseUrl?.trim() ?? '') !== '' ||
      (dto?.apiKey?.trim() ?? '') !== '' ||
      (dto?.policyIds?.trim() ?? '') !== '';

    let baseUrl: string;
    let apiKey: string;
    let idsEnv: string;

    if (hasAnyBody) {
      const b = dto!.baseUrl?.trim() || '';
      const k = dto!.apiKey?.trim() || '';
      const ids = dto!.policyIds?.trim() || '';
      if (!b || !k || !ids) {
        throw new BadRequestException(
          'Provide all three fields (API base URL, API key, and policy IDs), or leave them all empty to use RISER_API_BASE_URL, RISER_API_KEY, and RISER_POLICY_IDS from the server environment.',
        );
      }
      baseUrl = b;
      apiKey = k;
      idsEnv = ids;
    } else {
      baseUrl = this.config.get<string>('RISER_API_BASE_URL')?.trim() || '';
      apiKey = this.config.get<string>('RISER_API_KEY')?.trim() || '';
      idsEnv = this.config.get<string>('RISER_POLICY_IDS')?.trim() || '';
    }

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

    const results: {
      id: string;
      status: 'synced' | 'skipped' | 'failed';
      reason?: string;
    }[] = [];
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const policyId of policyIds) {
      try {
        const fetchResult = await this.fetchPolicy(baseUrl, apiKey, policyId);
        if ('reason' in fetchResult) {
          failed += 1;
          results.push({
            id: policyId,
            status: 'failed',
            reason: fetchResult.reason,
          });
          continue;
        }

        const changed = await this.upsertPolicyDocument(
          fetchResult.policy,
          baseUrl,
          apiKey,
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

  /**
   * Re-fetch a Riser policy by upstream id and re-chunk / re-embed (no S3 file).
   */
  async reindexRiserDocument(documentId: string): Promise<void> {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.upstreamProvider !== 'riser' || !doc.upstreamId) {
      throw new NotFoundException('Riser knowledge document not found');
    }

    const baseUrl = this.config.get<string>('RISER_API_BASE_URL')?.trim() || '';
    const apiKey = this.config.get<string>('RISER_API_KEY')?.trim() || '';
    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        'RISER_API_BASE_URL and RISER_API_KEY must be set to reindex Riser documents',
      );
    }

    const fetchResult = await this.fetchPolicy(
      baseUrl,
      apiKey,
      doc.upstreamId,
    );
    if ('reason' in fetchResult) {
      throw new BadRequestException(fetchResult.reason);
    }

    const policy = fetchResult.policy;
    const plain = await this.buildIngestPlainText(policy, baseUrl, apiKey);
    if (!plain) {
      throw new BadRequestException('No extractable text for this policy');
    }

    const reviewOn = policy.review_on ? new Date(policy.review_on) : null;
    const reviewDue = policy.review_due ? new Date(policy.review_due) : null;
    const now = new Date();

    await this.ingestion.reingestExistingDocumentFromText(
      doc.id,
      policy.title,
      plain,
      { documentType: 'handbook' },
    );

    await this.prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: {
        title: policy.title,
        upstreamVersion: policy.version ?? null,
        reviewOn,
        reviewDue,
        lastSyncedAt: now,
        chunkPipelineVersion: KNOWLEDGE_CHUNK_PIPELINE_VERSION,
        sizeBytes: Buffer.byteLength(plain, 'utf8'),
      },
    });

    this.logger.log(
      `Riser reindex documentId=${documentId} upstreamId=${doc.upstreamId} plainChars=${plain.length}`,
    );
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
        this.logger.warn(
          `Riser policy fetch ${policyId}: 401 Unauthorized — check RISER_API_KEY. ${snippet ? `Body: ${snippet}` : ''}`,
        );
        return { reason: 'Unauthorized (check RISER_API_KEY)' };
      }
      if (status === 403) {
        this.logger.warn(
          `Riser policy fetch ${policyId}: 403 Forbidden. ${snippet ? `Body: ${snippet}` : ''}`,
        );
        return { reason: 'Forbidden (API key may lack access)' };
      }
      if (status === 404) {
        this.logger.debug(`Riser policy fetch ${policyId}: 404 Not found.`);
        return { reason: 'Policy not found' };
      }
      if ((status === 400 || status === 481) && /invalid|policy\s*id/i.test(snippet)) {
        this.logger.warn(
          `Riser policy fetch ${policyId}: invalid policy ID (manual IDs from /manuals/all are not policy IDs).`,
        );
        return {
          reason:
            'Policy ID invalid. Use policy IDs (not manual IDs from /manuals/all). Get policy IDs from the RiserU dashboard or try known IDs (e.g. 100, 200).',
        };
      }
      this.logger.warn(
        `Riser policy fetch ${policyId}: ${status} ${res.statusText}. ${snippet ? `Body: ${snippet}` : ''}`,
      );
      return {
        reason: `Upstream error ${status}${snippet ? `: ${snippet}` : ''}`,
      };
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
    const id = obj.id != null ? String(obj.id) : undefined;
    const title = typeof obj.title === 'string' ? obj.title : undefined;
    const content =
      typeof obj.content === 'string'
        ? obj.content
        : typeof obj.body === 'string'
          ? obj.body
          : undefined;
    const version = obj.version != null ? String(obj.version) : undefined;
    const reviewOn = obj.review_on != null ? String(obj.review_on) : null;
    const reviewDue = obj.review_due != null ? String(obj.review_due) : null;
    const embeddedPdf = obj.embedded_pdf ?? obj.embeddedPdf;

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
        embeddedPdf,
      },
    };
  }

  private stripHtmlScripts(html: string): string {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  }

  private htmlToPlain(html: string): string {
    const cleaned = this.stripHtmlScripts(html);
    const headingOptions = {
      uppercase: false,
      leadingLineBreaks: 1,
      trailingLineBreaks: 1,
    };
    return htmlToText(cleaned, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'h1', options: { ...headingOptions } },
        { selector: 'h2', options: { ...headingOptions } },
        { selector: 'h3', options: { ...headingOptions } },
        { selector: 'h4', options: { ...headingOptions } },
        { selector: 'h5', options: { ...headingOptions } },
        { selector: 'h6', options: { ...headingOptions } },
        {
          selector: 'table',
          options: {
            uppercaseHeadings: false,
            rowSpacing: 1,
          },
        },
        { selector: 'ul', options: { itemPrefix: '• ' } },
        { selector: 'ol', options: { uppercase: false } },
      ],
    }).trim();
  }

  private resolveAssetUrl(baseUrl: string, u: string): string {
    const t = u.trim();
    if (/^https?:\/\//i.test(t)) return t;
    const b = baseUrl.replace(/\/+$/, '');
    const path = t.startsWith('/') ? t : `/${t}`;
    return `${b}${path}`;
  }

  private parseEmbeddedPdfSpec(
    embedded: unknown,
  ): { url?: string; base64?: string } | null {
    if (embedded == null) return null;
    if (typeof embedded === 'string') {
      const s = embedded.trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s)) return { url: s };
      const compact = s.replace(/\s/g, '');
      if (
        compact.length > 80 &&
        /^[A-Za-z0-9+/]+=*$/.test(compact.slice(0, 200))
      ) {
        return { base64: compact };
      }
      return { url: s };
    }
    if (typeof embedded === 'object') {
      const o = embedded as Record<string, unknown>;
      for (const key of ['url', 'file_url', 'href', 'src'] as const) {
        if (typeof o[key] === 'string' && (o[key] as string).trim()) {
          return { url: (o[key] as string).trim() };
        }
      }
      if (typeof o.data === 'string' && o.data.trim()) {
        return { base64: o.data.replace(/\s/g, '') };
      }
      if (typeof o.base64 === 'string' && o.base64.trim()) {
        return { base64: o.base64.replace(/\s/g, '') };
      }
    }
    return null;
  }

  private async fetchPdfBuffer(
    spec: { url?: string; base64?: string },
    baseUrl: string,
    apiKey: string,
  ): Promise<Buffer | null> {
    if (spec.base64) {
      try {
        return Buffer.from(spec.base64, 'base64');
      } catch {
        this.logger.warn('Riser embedded_pdf: invalid base64');
        return null;
      }
    }
    if (!spec.url) return null;
    const resolved = this.resolveAssetUrl(baseUrl, spec.url);
    try {
      let res = await fetch(resolved, {
        headers: { 'x-api-key': apiKey },
      });
      if (res.status === 401 || res.status === 403) {
        res = await fetch(resolved);
      }
      if (!res.ok) {
        this.logger.warn(
          `Riser embedded PDF fetch failed ${res.status} for ${resolved.slice(0, 80)}…`,
        );
        return null;
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Riser embedded PDF fetch error: ${msg}`);
      return null;
    }
  }

  private async buildIngestPlainText(
    policy: RiserPolicy,
    baseUrl: string,
    apiKey: string,
  ): Promise<string> {
    const htmlLen = policy.content.length;
    let fromHtml = this.htmlToPlain(policy.content);
    const parts: string[] = [];
    if (fromHtml) parts.push(fromHtml);

    const spec = this.parseEmbeddedPdfSpec(policy.embeddedPdf);
    let pdfChars = 0;
    if (spec) {
      const buf = await this.fetchPdfBuffer(spec, baseUrl, apiKey);
      if (buf && buf.length > 0) {
        const pdfHeader = buf.subarray(0, 5).toString('ascii');
        if (pdfHeader.startsWith('%PDF')) {
          try {
            const pdfText = await this.ingestion.extractPlainTextFromPdfBuffer(buf);
            if (pdfText) {
              pdfChars = pdfText.length;
              parts.push(
                '\n\n---\nEmbedded policy PDF (extracted text)\n---\n\n' +
                  pdfText,
              );
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`Riser policy ${policy.id}: PDF parse failed — ${msg}`);
          }
        }
      }
    }

    const combined = parts.join('\n').trim();
    const chunkPreview = combined
      ? // rough chunk count uses same defaults as ingestion (1600 target)
        Math.max(1, Math.ceil(combined.length / 1400))
      : 0;

    this.logger.log(
      `Riser policy ${policy.id} "${policy.title.slice(0, 60)}": htmlChars=${htmlLen} plainHtmlChars=${fromHtml.length} pdfExtractChars=${pdfChars} combinedChars=${combined.length} estChunks≥${chunkPreview}`,
    );

    return combined;
  }

  private async upsertPolicyDocument(
    policy: RiserPolicy,
    baseUrl: string,
    apiKey: string,
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

    const pipelineOk =
      existing &&
      existing.chunkPipelineVersion >= KNOWLEDGE_CHUNK_PIPELINE_VERSION;

    if (
      pipelineOk &&
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

    const text = await this.buildIngestPlainText(policy, baseUrl, apiKey);

    if (!text) {
      this.logger.warn(`Riser policy ${policy.id} produced no text after conversion.`);
      return false;
    }

    if (!existing) {
      const uploaderId = await this.getUploaderId(initiatorUserId);
      if (!uploaderId) {
        throw new Error(
          'No uploader user available to associate with Riser policy document.',
        );
      }
      const { documentId, chunksCreated } = await this.ingestion.ingestText(
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
      this.logger.log(
        `Riser policy ${policy.id} indexed: chunksCreated=${chunksCreated} combinedChars=${text.length}`,
      );
      return true;
    }

    await this.ingestion.reingestExistingDocumentFromText(
      existing.id,
      policy.title,
      text,
      { documentType: 'handbook' },
    );

    const chunksCount = await this.prisma.documentChunk.count({
      where: { documentId: existing.id },
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

    this.logger.log(
      `Riser policy ${policy.id} re-indexed: chunks=${chunksCount} combinedChars=${text.length}`,
    );

    return true;
  }
}
