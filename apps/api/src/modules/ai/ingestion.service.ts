import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import OpenAI from 'openai';
import { PrismaService } from '../../common/database/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { QUEUES, KNOWLEDGE_INGESTION_JOB_OPTIONS } from '../../common/queue/queue.constants';
import {
  chunkKnowledgeText,
  chunkKnowledgeTextWithPositions,
  clampChunkStringsForEmbedding,
  clampChunksForEmbeddingPositions,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_CHUNK_TARGET_CHARS,
  KNOWLEDGE_CHUNK_PIPELINE_VERSION,
  KnowledgeChunkOptions,
} from './knowledge-chunking';

// OpenAI text-embedding-3-small: 1536 dimensions, cheap & accurate
const EMBEDDING_MODEL = 'text-embedding-3-small';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private _openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly attachmentsService: AttachmentsService,
    @InjectQueue(QUEUES.KNOWLEDGE_INGESTION)
    private readonly knowledgeIngestionQueue: Queue,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key) {
      this.logger.warn(
        'OPENAI_API_KEY not set — AI features will be unavailable (dev mode)',
      );
    } else {
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

  private getChunkOptions(): KnowledgeChunkOptions {
    const t = parseInt(
      this.config.get<string>('KNOWLEDGE_CHUNK_TARGET_CHARS') ?? '',
      10,
    );
    const o = parseInt(
      this.config.get<string>('KNOWLEDGE_CHUNK_OVERLAP_CHARS') ?? '',
      10,
    );
    const targetChars =
      Number.isFinite(t) && t >= 400 ? t : DEFAULT_CHUNK_TARGET_CHARS;
    const overlapChars =
      Number.isFinite(o) && o >= 40 && o < targetChars
        ? o
        : DEFAULT_CHUNK_OVERLAP_CHARS;
    return { targetChars, overlapChars };
  }

  /** Smaller batches = smaller HTTP bodies and easier debugging when OpenAI rejects a batch. */
  private getEmbeddingBatchSize(): number {
    const raw = parseInt(
      this.config.get<string>('KNOWLEDGE_EMBEDDING_BATCH_SIZE') ?? '',
      10,
    );
    if (Number.isFinite(raw) && raw >= 1 && raw <= 64) return raw;
    return 10;
  }

  /** Extract plain text from a PDF buffer (shared by S3 ingestion and Riser embedded PDF). */
  async extractPlainTextFromPdfBuffer(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return (data?.text ?? '').trim();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Ingest raw text content into the knowledge base */
  async ingestText(
    title: string,
    content: string,
    uploadedById: string,
    opts: {
      sourceType?: string;
      sourceUrl?: string;
      s3Key?: string;
      mimeType?: string;
      sizeBytes?: number;
      documentType?: 'general' | 'handbook';
    } = {},
  ): Promise<{ documentId: string; chunksCreated: number }> {
    // Create the parent document record
    const doc = await this.prisma.knowledgeDocument.create({
      data: {
        title,
        sourceType: opts.sourceType ?? 'manual',
        sourceUrl: opts.sourceUrl ?? null,
        s3Key: opts.s3Key ?? null,
        mimeType: opts.mimeType ?? null,
        sizeBytes: opts.sizeBytes ?? null,
        documentType: opts.documentType ?? 'general',
        uploadedById,
      },
    });

    const chunkOpts = this.getChunkOptions();
    let chunks = chunkKnowledgeText(content, chunkOpts);
    chunks = clampChunkStringsForEmbedding(chunks, chunkOpts.overlapChars);
    this.logger.log(`Ingesting "${title}" → ${chunks.length} chunks`);

    const BATCH = this.getEmbeddingBatchSize();
    let chunkIndex = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await this.embedBatch(batch);

      await Promise.all(
        batch.map(
          (text, j) =>
            this.prisma.$executeRaw`
            INSERT INTO "document_chunks" ("id", "documentId", "chunkIndex", "content", "embedding", "tokenCount", "createdAt")
            VALUES (
              ${this.generateId()},
              ${doc.id},
              ${chunkIndex + j},
              ${text},
              ${`[${embeddings[j].join(',')}]`}::vector,
              ${Math.ceil(text.length / 4)},
              NOW()
            )
          `,
        ),
      );
      chunkIndex += batch.length;
    }

    await this.prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: {
        ingestionStatus: 'indexed',
        lastIndexedAt: new Date(),
        chunkPipelineVersion: KNOWLEDGE_CHUNK_PIPELINE_VERSION,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
      },
    });
    this.logger.log(
      `Ingestion complete: docId=${doc.id}, chunks=${chunks.length}`,
    );
    return { documentId: doc.id, chunksCreated: chunks.length };
  }

  /**
   * Fetch a public URL, extract readable text via html-to-text, and ingest it
   * into the knowledge base exactly like a pasted-text document.
   */
  async ingestUrl(
    title: string,
    url: string,
    uploadedById: string,
  ): Promise<{ documentId: string; chunksCreated: number }> {
    this.logger.log(`Fetching URL for ingestion: ${url}`);

    // Fetch with a browser-like UA so simple bot-blockers don't reject us
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; TicketingSystem-KnowledgeBot/1.0; +internal)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      html = await res.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch URL "${url}": ${msg}`);
    }

    // Convert HTML → plain text using the html-to-text library already installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { convert } = require('html-to-text') as {
      convert: (html: string, opts?: Record<string, unknown>) => string;
    };
    const plainText = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: 'a',      options: { ignoreHref: true } },
        { selector: 'img',    format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style',  format: 'skip' },
        { selector: 'nav',    format: 'skip' },
        { selector: 'footer', format: 'skip' },
        { selector: 'header', format: 'skip' },
      ],
    });

    if (!plainText.trim()) {
      throw new Error('No readable text could be extracted from the URL.');
    }

    this.logger.log(
      `URL fetched: ${url} → ${plainText.length} chars extracted`,
    );

    return this.ingestText(title, plainText, uploadedById, {
      sourceType: 'url',
      sourceUrl: url,
      sizeBytes: Buffer.byteLength(plainText, 'utf8'),
    });
  }

  /** Re-ingest an existing KnowledgeDocument from raw text (idempotent). */
  async reingestExistingDocumentFromText(
    documentId: string,
    title: string,
    content: string,
    opts: { documentType?: 'general' | 'handbook' } = {},
  ): Promise<void> {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new Error(`KnowledgeDocument ${documentId} not found`);
    }

    const chunkOpts = this.getChunkOptions();
    let chunks = chunkKnowledgeText(content, chunkOpts);
    chunks = clampChunkStringsForEmbedding(chunks, chunkOpts.overlapChars);
    this.logger.log(
      `Re-ingesting existing document ${documentId} ("${title}") → ${chunks.length} chunks`,
    );

    await this.prisma.documentChunk.deleteMany({ where: { documentId } });

    const BATCH = this.getEmbeddingBatchSize();
    let chunkIndex = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await this.embedBatch(batch);

      await Promise.all(
        batch.map(
          (textChunk, j) =>
            this.prisma.$executeRaw`
            INSERT INTO "document_chunks" ("id", "documentId", "chunkIndex", "content", "embedding", "tokenCount", "createdAt")
            VALUES (
              ${this.generateId()},
              ${documentId},
              ${chunkIndex + j},
              ${textChunk},
              ${`[${embeddings[j].join(',')}]`}::vector,
              ${Math.ceil(textChunk.length / 4)},
              NOW()
            )
          `,
        ),
      );
      chunkIndex += batch.length;
    }

    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        ingestionStatus: 'indexed',
        documentType: opts.documentType ?? doc.documentType ?? 'general',
        lastIndexedAt: new Date(),
        chunkPipelineVersion: KNOWLEDGE_CHUNK_PIPELINE_VERSION,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
      },
    });
  }

  /** Enqueue a knowledge ingestion job (upload or reindex). */
  async enqueueIngestionJob(documentId: string): Promise<void> {
    await this.knowledgeIngestionQueue.add(
      'ingest',
      { documentId },
      KNOWLEDGE_INGESTION_JOB_OPTIONS,
    );
  }

  /**
   * Run full ingestion for a document: fetch PDF from S3, extract text, chunk, embed, replace chunks.
   * Called by the knowledge-ingestion worker. On failure sets ingestionStatus = 'failed' and rethrows (worker logs).
   */
  async runIngestionForDocument(documentId: string): Promise<void> {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }
    if (!doc.s3Key) {
      throw new Error(`Document ${documentId} has no s3Key`);
    }

    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { ingestionStatus: 'indexing' },
    });

    try {
      const buffer = await this.attachmentsService.getObjectBuffer(doc.s3Key);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      const text = data?.text?.trim() ?? '';
      if (!text) {
        await this.prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: { ingestionStatus: 'failed' },
        });
        throw new Error('PDF produced no extractable text');
      }

      await this.prisma.documentChunk.deleteMany({ where: { documentId } });

      const chunkOpts = this.getChunkOptions();
      let chunksWithPos = chunkKnowledgeTextWithPositions(text, chunkOpts);
      chunksWithPos = clampChunksForEmbeddingPositions(
        chunksWithPos,
        chunkOpts.overlapChars,
      );
      this.logger.log(
        `Ingesting document ${documentId} → ${chunksWithPos.length} chunks`,
      );
      if (chunksWithPos.length === 0) {
        await this.prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: { ingestionStatus: 'failed' },
        });
        throw new Error(
          'Extracted text produced zero chunks after splitting; try paste-text ingest or a different PDF export.',
        );
      }

      const BATCH = this.getEmbeddingBatchSize();
      const numPages: number =
        typeof data?.numpages === 'number' && data.numpages > 0
          ? data.numpages
          : 0;
      const charsPerPage =
        numPages > 0 ? text.length / numPages : text.length || 1;
      let chunkIndex = 0;
      for (let i = 0; i < chunksWithPos.length; i += BATCH) {
        const batch = chunksWithPos.slice(i, i + BATCH);
        const embeddings = await this.embedBatch(batch.map((b) => b.content));
        await Promise.all(
          batch.map((chunk, j) => {
            const absoluteIndex = chunkIndex + j;
            let pageNumber: number | null = null;
            if (numPages > 0 && charsPerPage > 0) {
              const approxPage =
                Math.floor(chunk.start / charsPerPage) + 1;
              pageNumber = Math.min(
                numPages,
                Math.max(1, approxPage),
              );
            }
            return this.prisma.$executeRaw`
              INSERT INTO "document_chunks" ("id", "documentId", "chunkIndex", "content", "embedding", "tokenCount", "createdAt", "pageNumber")
              VALUES (
                ${this.generateId()},
                ${doc.id},
                ${absoluteIndex},
                ${chunk.content},
                ${`[${embeddings[j].join(',')}]`}::vector,
                ${Math.ceil(chunk.content.length / 4)},
                NOW(),
                ${pageNumber}
              )
            `;
          }),
        );
        chunkIndex += batch.length;
      }

      const storedChunks = await this.prisma.documentChunk.count({
        where: { documentId },
      });
      if (storedChunks === 0) {
        await this.prisma.knowledgeDocument.update({
          where: { id: documentId },
          data: { ingestionStatus: 'failed' },
        });
        throw new Error(
          'Chunk rows were not persisted after PDF ingestion (zero count). Re-index after fixing the server.',
        );
      }

      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          ingestionStatus: 'indexed',
          lastIndexedAt: new Date(),
          chunkPipelineVersion: KNOWLEDGE_CHUNK_PIPELINE_VERSION,
          sizeBytes: Buffer.byteLength(text, 'utf8'),
        },
      });
      this.logger.log(
        `Ingestion complete: documentId=${documentId}, chunks=${chunksWithPos.length} stored=${storedChunks}`,
      );
    } catch (err) {
      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { ingestionStatus: 'failed' },
      });
      throw err;
    }
  }

  /** Delete a document and all its chunks. Removes S3 object if s3Key is set. */
  async deleteDocument(documentId: string): Promise<void> {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (doc?.s3Key) {
      try {
        await this.attachmentsService.deleteObjectByKey(doc.s3Key);
      } catch (e) {
        this.logger.warn(`Failed to delete S3 object ${doc.s3Key}: ${e}`);
      }
    }
    await this.prisma.knowledgeDocument.delete({ where: { id: documentId } });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Embed a batch of strings using OpenAI */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });
      return response.data.map((item) => item.embedding);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const maxLen = texts.reduce((m, t) => Math.max(m, t.length), 0);
      if (/maximum|8192|token|too long|length/i.test(msg)) {
        this.logger.error(
          `OpenAI embeddings.create failed (batch=${texts.length}, longestInputChars=${maxLen}): ${msg}`,
        );
      }
      throw e;
    }
  }

  /** Embed a single string */
  async embedOne(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  private generateId(): string {
    // Generate a cuid-like ID using crypto
    return `clai${Math.random().toString(36).slice(2, 11)}${Date.now().toString(36)}`;
  }
}
