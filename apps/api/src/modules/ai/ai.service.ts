import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../common/database/prisma.service';
import { IngestionService } from './ingestion.service';

// How many chunks to retrieve for context
const TOP_K = 5;
const TOP_K_HANDBOOK = 8;
// Cosine distance threshold — only use chunks that are sufficiently similar
const DISTANCE_THRESHOLD = 0.4;
// Model to use for chat completions
const CHAT_MODEL = 'gpt-4o-mini';

interface ChunkRow {
  id: string;
  content: string;
  document_id: string;
  document_title: string;
  distance: number;
}

export interface ChatResponse {
  answer: string;
  sources: Array<{ documentId: string; title: string; excerpt: string }>;
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
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) {
      this._openai = new OpenAI({ apiKey: key });
    }
  }

  private get openai(): OpenAI {
    if (!this._openai) {
      throw new Error('OPENAI_API_KEY is not configured. Set it in apps/api/.env to use AI features.');
    }
    return this._openai;
  }

  // ── Chat (RAG) ─────────────────────────────────────────────────────────────

  async chat(userMessage: string): Promise<ChatResponse> {
    // Step 1: Embed the user's question
    const queryEmbedding = await this.ingestion.embedOne(userMessage);

    // Step 2: Similarity search via pgvector cosine distance (<=>)
    const chunks = await this.prisma.$queryRaw<ChunkRow[]>`
      SELECT
        dc.id,
        dc.content,
        dc."documentId"    AS document_id,
        kd.title           AS document_title,
        dc.embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector AS distance
      FROM "document_chunks" dc
      JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
      WHERE kd."isActive" = true
        AND dc.embedding IS NOT NULL
        AND dc.embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector < ${DISTANCE_THRESHOLD}
      ORDER BY distance ASC
      LIMIT ${TOP_K}
    `;

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
If the answer cannot be found in the context, say so clearly and suggest they submit a ticket.
Keep answers concise and professional.

CONTEXT:
${contextBlocks}`;
    } else {
      systemPrompt = `You are a helpful internal support assistant for the company's ticketing system.
You don't have specific documentation for this question.
Provide a general helpful answer, and suggest the user submit a support ticket if they need further assistance.
Keep answers concise and professional.`;
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

    const answer = completion.choices[0]?.message?.content ?? 'Sorry, I could not generate a response.';

    // Step 5: Deduplicate sources (one entry per unique document)
    const seen = new Set<string>();
    const sources = chunks
      .filter((c) => {
        if (seen.has(c.document_id)) return false;
        seen.add(c.document_id);
        return true;
      })
      .map((c) => ({
        documentId: c.document_id,
        title: c.document_title,
        excerpt: c.content.slice(0, 200) + (c.content.length > 200 ? '…' : ''),
      }));

    return { answer, sources, usedContext };
  }

  /** Handbook-only RAG: same as chat() but filters to documentType = 'handbook'. Studio users only. */
  async chatHandbook(userMessage: string): Promise<ChatResponse> {
    const queryEmbedding = await this.ingestion.embedOne(userMessage);

    const chunks = await this.prisma.$queryRaw<ChunkRow[]>`
      SELECT
        dc.id,
        dc.content,
        dc."documentId"    AS document_id,
        kd.title           AS document_title,
        dc.embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector AS distance
      FROM "document_chunks" dc
      JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
      WHERE kd."isActive" = true
        AND kd."documentType" = 'handbook'
        AND dc.embedding IS NOT NULL
        AND dc.embedding <=> ${`[${queryEmbedding.join(',')}]`}::vector < ${DISTANCE_THRESHOLD}
      ORDER BY distance ASC
      LIMIT ${TOP_K_HANDBOOK}
    `;
    this.logger.debug(`Handbook RAG retrieved ${chunks.length} chunks`);

    let systemPrompt: string;
    let usedContext = false;

    if (chunks.length > 0) {
      usedContext = true;
      const contextBlocks = chunks
        .map((c, i) => `[Source ${i + 1}: ${c.document_title}]\n${c.content}`)
        .join('\n\n---\n\n');
      systemPrompt = `You are a helpful assistant. Answer the user's question using ONLY the company handbook context below. If the answer cannot be found in the context, say so clearly. Keep answers concise and professional.

CONTEXT:
${contextBlocks}`;
    } else {
      systemPrompt = `You are a helpful assistant for company handbook questions. You don't have relevant handbook content for this question. Say so and suggest they contact their manager or submit a ticket.`;
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

    const answer = completion.choices[0]?.message?.content ?? 'Sorry, I could not generate a response.';

    const seen = new Set<string>();
    const sources = chunks
      .filter((c) => {
        if (seen.has(c.document_id)) return false;
        seen.add(c.document_id);
        return true;
      })
      .map((c) => ({
        documentId: c.document_id,
        title: c.document_title,
        excerpt: c.content.slice(0, 200) + (c.content.length > 200 ? '…' : ''),
      }));

    return { answer, sources, usedContext };
  }

  // ── Document management ───────────────────────────────────────────────────

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
