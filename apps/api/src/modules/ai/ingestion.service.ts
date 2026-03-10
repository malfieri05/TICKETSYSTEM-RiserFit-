import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import OpenAI from 'openai';
import { PrismaService } from '../../common/database/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  QUEUES,
  KnowledgeIngestionJobData,
  KNOWLEDGE_INGESTION_JOB_OPTIONS,
} from '../../common/queue/queue.constants';

// How many characters per chunk (~300 tokens ≈ 1200 chars for English text)
const CHUNK_SIZE = 1200;
// Overlap between consecutive chunks to preserve context at boundaries
const CHUNK_OVERLAP = 150;
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

    const chunks = this.splitIntoChunks(content);
    this.logger.log(`Ingesting "${title}" → ${chunks.length} chunks`);

    // Embed in batches of 20 (stay well within OpenAI rate limits)
    const BATCH = 20;
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
      data: { ingestionStatus: 'indexed', lastIndexedAt: new Date() },
    });
    this.logger.log(
      `Ingestion complete: docId=${doc.id}, chunks=${chunks.length}`,
    );
    return { documentId: doc.id, chunksCreated: chunks.length };
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

    const chunks = this.splitIntoChunks(content);
    this.logger.log(
      `Re-ingesting existing document ${documentId} ("${title}") → ${chunks.length} chunks`,
    );

    await this.prisma.documentChunk.deleteMany({ where: { documentId } });

    const BATCH = 20;
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

      const chunksWithPos = this.splitIntoChunksWithPositions(text);
      this.logger.log(
        `Ingesting document ${documentId} → ${chunksWithPos.length} chunks`,
      );

      const BATCH = 20;
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
          batch.map(
            (chunk, j) => {
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
              this.prisma.$executeRaw`
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
            `},
          ),
        );
        chunkIndex += batch.length;
      }

      await this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { ingestionStatus: 'indexed', lastIndexedAt: new Date() },
      });
      this.logger.log(
        `Ingestion complete: documentId=${documentId}, chunks=${chunks.length}`,
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

  /** Split text into overlapping chunks */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      chunks.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks.filter((c) => c.length > 20); // drop tiny trailing fragments
  }

  /** Split text into overlapping chunks, preserving start index (for page approximation) */
  private splitIntoChunksWithPositions(
    text: string,
  ): { content: string; start: number }[] {
    const chunks: { content: string; start: number }[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      const slice = text.slice(start, end).trim();
      if (slice.length > 20) {
        chunks.push({ content: slice, start });
      }
      if (end >= text.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks;
  }

  /** Embed a batch of strings using OpenAI */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });
    return response.data.map((item) => item.embedding);
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
