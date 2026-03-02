import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../common/database/prisma.service';

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
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key) {
      this.logger.warn('OPENAI_API_KEY not set — AI features will be unavailable (dev mode)');
    } else {
      this._openai = new OpenAI({ apiKey: key });
    }
  }

  private get openai(): OpenAI {
    if (!this._openai) {
      throw new Error('OPENAI_API_KEY is not configured. Set it in apps/api/.env to use AI features.');
    }
    return this._openai;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Ingest raw text content into the knowledge base */
  async ingestText(
    title: string,
    content: string,
    uploadedById: string,
    opts: { sourceType?: string; sourceUrl?: string; s3Key?: string; mimeType?: string; sizeBytes?: number } = {},
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
        batch.map((text, j) =>
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

    this.logger.log(`Ingestion complete: docId=${doc.id}, chunks=${chunks.length}`);
    return { documentId: doc.id, chunksCreated: chunks.length };
  }

  /** Delete a document and all its chunks */
  async deleteDocument(documentId: string): Promise<void> {
    // Chunks are cascade-deleted via FK
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
