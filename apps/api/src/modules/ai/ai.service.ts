import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../common/database/prisma.service';
import { IngestionService } from './ingestion.service';
import { RiserPolicySyncService } from './riser-policy-sync.service';

// How many chunks to retrieve for context (general + handbook chat; overridden by RAG_TOP_K env)
const RAG_TOP_K_DEFAULT = 10;
/** Cosine distance (<=>): lower = more similar. ~0.78 passes more paraphrases; tighten with RAG_DISTANCE_THRESHOLD env if needed. */
const RAG_DISTANCE_THRESHOLD_DEFAULT = 0.78;
/** When strict filter returns nothing, pull this many nearest chunks anyway (model can still say "not in docs"). */
const RAG_FALLBACK_TOP_K = 8;
// Model to use for chat completions
const CHAT_MODEL = 'gpt-4o-mini';

/** Appended to every assistant system prompt: who built the platform and how to reach them. */
const ARK_SOLUTIONS_KNOWLEDGE = `Platform vendor: This system was built by ARK Solutions. When the user asks who built or developed the software, who to contact for vendor issues, large changes, new features, or hands-on implementation help, answer with: ARK Solutions — 503-764-5097 (text or call) or mike@arksolutions.ai.`;

interface ChunkRow {
  id: string;
  content: string;
  document_id: string;
  document_title: string;
  distance: number;
  page_number: number | null;
}

export interface ChatResponse {
  answer: string;
  sources: Array<{
    documentId: string;
    title: string;
    excerpt: string;
    /** First page among cited chunks (backwards compatible) */
    pageNumber?: number | null;
    /** Sorted unique pages from all retrieved chunks for this document */
    pagesLabel?: string;
  }>;
  usedContext: boolean;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private _openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ingestion: IngestionService,
    private readonly riserPolicySync: RiserPolicySyncService,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) {
      this._openai = new OpenAI({ apiKey: key });
    }
  }

  private get openai(): OpenAI {
    if (!this._openai) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Set it in apps/api/.env to use AI features.',
      );
    }
    return this._openai;
  }

  /** One source row per document; merge page numbers from all chunks used in RAG. */
  private buildAggregatedSources(chunks: ChunkRow[]): ChatResponse['sources'] {
    const order: string[] = [];
    const byDoc = new Map<
      string,
      { title: string; excerpt: string; pages: Set<number> }
    >();

    for (const c of chunks) {
      if (!byDoc.has(c.document_id)) {
        order.push(c.document_id);
        byDoc.set(c.document_id, {
          title: c.document_title,
          excerpt:
            c.content.slice(0, 200) + (c.content.length > 200 ? '…' : ''),
          pages: new Set(),
        });
      }
      const row = byDoc.get(c.document_id)!;
      if (c.page_number != null && c.page_number > 0) {
        row.pages.add(Math.floor(c.page_number));
      }
    }

    return order.map((id) => {
      const r = byDoc.get(id)!;
      const sorted = [...r.pages].sort((a, b) => a - b);
      return {
        documentId: id,
        title: r.title,
        excerpt: r.excerpt,
        ...(sorted.length > 0
          ? {
              pageNumber: sorted[0],
              pagesLabel: `Pages ${sorted.join(', ')}`,
            }
          : {}),
      };
    });
  }

  // ── Chat (RAG) ─────────────────────────────────────────────────────────────

  async chat(userMessage: string): Promise<ChatResponse> {
    // Step 1: Embed the user's question
    const queryEmbedding = await this.ingestion.embedOne(userMessage);
    const embLiteral = `[${queryEmbedding.join(',')}]`;
    const threshold = this.getDistanceThreshold();
    const topK = this.getTopK();

    // Step 2: Similarity search — include general docs + all handbooks (Riser + manual uploads)
    let chunks = await this.prisma.$queryRaw<ChunkRow[]>`
      SELECT
        dc.id,
        dc.content,
        dc."documentId"    AS document_id,
        kd.title           AS document_title,
        dc."pageNumber"    AS page_number,
        dc.embedding <=> ${embLiteral}::vector AS distance
      FROM "document_chunks" dc
      JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
      WHERE kd."isActive" = true
        AND (
          kd."documentType" != 'handbook'
          OR kd."upstreamProvider" = 'riser'
          OR (
            kd."documentType" = 'handbook'
            AND (kd."upstreamProvider" IS NULL OR kd."upstreamProvider" = '')
          )
        )
        AND dc.embedding IS NOT NULL
        AND dc.embedding <=> ${embLiteral}::vector < ${threshold}
      ORDER BY distance ASC
      LIMIT ${topK}
    `;

    if (chunks.length === 0) {
      this.logger.log(
        'RAG: no chunks under distance threshold; using nearest-neighbor fallback',
      );
      chunks = await this.prisma.$queryRaw<ChunkRow[]>`
        SELECT
          dc.id,
          dc.content,
          dc."documentId"    AS document_id,
          kd.title           AS document_title,
          dc."pageNumber"    AS page_number,
          dc.embedding <=> ${embLiteral}::vector AS distance
        FROM "document_chunks" dc
        JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
        WHERE kd."isActive" = true
          AND (
            kd."documentType" != 'handbook'
            OR kd."upstreamProvider" = 'riser'
            OR (
              kd."documentType" = 'handbook'
              AND (kd."upstreamProvider" IS NULL OR kd."upstreamProvider" = '')
            )
          )
          AND dc.embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${RAG_FALLBACK_TOP_K}
      `;
    }

    this.logger.debug(`RAG retrieved ${chunks.length} chunks for query`);

    // Step 3: Build context string from retrieved chunks
    let systemPrompt: string;
    let usedContext = false;

    if (chunks.length > 0) {
      usedContext = true;
      const contextBlocks = chunks
        .map((c, i) => `[Source ${i + 1}: ${c.document_title}]\n${c.content}`)
        .join('\n\n---\n\n');

      systemPrompt = `You are a helpful internal support assistant for the company's ticketing system.
Answer the user's question using ONLY the context provided below.
If the answer cannot be found in the context, say so clearly and suggest they contact their manager or team for help.
Keep answers concise and professional. Never suggest submitting a ticket.

${ARK_SOLUTIONS_KNOWLEDGE}

CONTEXT:
${contextBlocks}`;
    } else {
      systemPrompt = `You are a helpful internal support assistant for the company's ticketing system.
You don't have specific documentation for this question.
Provide a general helpful answer, and suggest they contact their manager or team if they need further assistance.
Keep answers concise and professional. Never suggest submitting a ticket.

${ARK_SOLUTIONS_KNOWLEDGE}`;
    }

    // Step 4: Call GPT
    const completion = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    const answer =
      completion.choices[0]?.message?.content ??
      'Sorry, I could not generate a response.';

    const sources = this.buildAggregatedSources(chunks);

    return { answer, sources, usedContext };
  }

  /** Handbook-only RAG: same as chat() but filters to documentType = 'handbook'. Studio users only. */
  async chatHandbook(userMessage: string): Promise<ChatResponse> {
    const queryEmbedding = await this.ingestion.embedOne(userMessage);
    const embLiteral = `[${queryEmbedding.join(',')}]`;
    const threshold = this.getDistanceThreshold();
    const topK = this.getTopK();

    let chunks = await this.prisma.$queryRaw<ChunkRow[]>`
      SELECT
        dc.id,
        dc.content,
        dc."documentId"    AS document_id,
        kd.title           AS document_title,
        dc."pageNumber"    AS page_number,
        dc.embedding <=> ${embLiteral}::vector AS distance
      FROM "document_chunks" dc
      JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
      WHERE kd."isActive" = true
        AND kd."documentType" = 'handbook'
        AND (
          kd."upstreamProvider" = 'riser'
          OR kd."upstreamProvider" IS NULL
          OR kd."upstreamProvider" = ''
        )
        AND dc.embedding IS NOT NULL
        AND dc.embedding <=> ${embLiteral}::vector < ${threshold}
      ORDER BY distance ASC
      LIMIT ${topK}
    `;

    if (chunks.length === 0) {
      this.logger.log(
        'Handbook RAG: no chunks under threshold; using nearest-neighbor fallback',
      );
      chunks = await this.prisma.$queryRaw<ChunkRow[]>`
        SELECT
          dc.id,
          dc.content,
          dc."documentId"    AS document_id,
          kd.title           AS document_title,
          dc."pageNumber"    AS page_number,
          dc.embedding <=> ${embLiteral}::vector AS distance
        FROM "document_chunks" dc
        JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
        WHERE kd."isActive" = true
          AND kd."documentType" = 'handbook'
          AND (
            kd."upstreamProvider" = 'riser'
            OR kd."upstreamProvider" IS NULL
            OR kd."upstreamProvider" = ''
          )
          AND dc.embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${RAG_FALLBACK_TOP_K}
      `;
    }

    this.logger.debug(`Handbook RAG retrieved ${chunks.length} chunks`);

    let systemPrompt: string;
    let usedContext = false;

    if (chunks.length > 0) {
      usedContext = true;
      const contextBlocks = chunks
        .map((c, i) => `[Source ${i + 1}: ${c.document_title}]\n${c.content}`)
        .join('\n\n---\n\n');
      systemPrompt = `You are a helpful assistant. Answer the user's question using ONLY the company handbook context below. If the answer cannot be found in the context, say so clearly. Keep answers concise and professional.

${ARK_SOLUTIONS_KNOWLEDGE}

CONTEXT:
${contextBlocks}`;
    } else {
      systemPrompt = `You are a helpful assistant for company handbook questions. You don't have relevant handbook content for this question. Say so and suggest they contact their manager or team. Never suggest submitting a ticket.

${ARK_SOLUTIONS_KNOWLEDGE}`;
    }

    const completion = await this.openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    const answer =
      completion.choices[0]?.message?.content ??
      'Sorry, I could not generate a response.';

    const sources = this.buildAggregatedSources(chunks);

    return { answer, sources, usedContext };
  }

  private getDistanceThreshold(): number {
    const v = this.config.get<string>('RAG_DISTANCE_THRESHOLD');
    const n = v != null ? parseFloat(v) : RAG_DISTANCE_THRESHOLD_DEFAULT;
    return Number.isFinite(n) ? n : RAG_DISTANCE_THRESHOLD_DEFAULT;
  }

  private getTopK(): number {
    const v = this.config.get<string>('RAG_TOP_K');
    const n = v != null ? parseInt(v, 10) : RAG_TOP_K_DEFAULT;
    return Number.isInteger(n) && n > 0 ? n : RAG_TOP_K_DEFAULT;
  }

  // ── Document management ───────────────────────────────────────────────────

  async createHandbookDocument(
    title: string,
    uploadedById: string,
    opts: { mimeType?: string; sizeBytes?: number },
  ) {
    return this.prisma.knowledgeDocument.create({
      data: {
        title,
        sourceType: 'file',
        mimeType: opts.mimeType ?? null,
        sizeBytes: opts.sizeBytes ?? null,
        documentType: 'handbook',
        ingestionStatus: 'pending',
        uploadedById,
      },
    });
  }

  async updateDocumentS3Key(documentId: string, s3Key: string) {
    return this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { s3Key },
    });
  }

  async reindexDocument(documentId: string): Promise<void> {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    if (doc.upstreamProvider === 'riser' && doc.upstreamId) {
      await this.riserPolicySync.reindexRiserDocument(documentId);
      return;
    }
    if (!doc.s3Key)
      throw new NotFoundException('Document has no stored file to re-index');
    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { ingestionStatus: 'indexing' },
    });
    await this.ingestion.enqueueIngestionJob(documentId);
  }

  async listDocuments() {
    return this.prisma.knowledgeDocument.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        sourceType: true,
        sourceUrl: true,
        mimeType: true,
        sizeBytes: true,
        documentType: true,
        isActive: true,
        ingestionStatus: true,
        lastIndexedAt: true,
        upstreamProvider: true,
        upstreamId: true,
        upstreamVersion: true,
        reviewOn: true,
        reviewDue: true,
        lastSyncedAt: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
        _count: { select: { chunks: true } },
      },
    });
  }

  async toggleDocument(documentId: string, isActive: boolean) {
    return this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { isActive },
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.ingestion.deleteDocument(documentId);
  }
}
