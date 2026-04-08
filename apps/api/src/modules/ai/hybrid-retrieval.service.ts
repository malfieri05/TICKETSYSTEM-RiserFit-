import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { IngestionService } from './ingestion.service';

/**
 * HybridRetrievalService — vector + keyword RAG retrieval with Reciprocal
 * Rank Fusion (RRF).
 *
 * Why hybrid:
 *   Pure semantic search (pgvector cosine) is great for paraphrases but
 *   brittle for proper nouns and branded terms. A user asking about
 *   "LeaseIQ" (one word, camelCase) can miss chunks that spell it
 *   "Lease IQ" if the embedding doesn't put them close enough. A tiny
 *   keyword-ILIKE side fixes that cheaply without a new extension or
 *   migration: we score every chunk by how many of the query's
 *   meaningful tokens appear literally in its content/title, rank it,
 *   and RRF-fuse it with the vector ranking.
 *
 * Why no tsvector / GIN index:
 *   The knowledge base stays in the low thousands of chunks for this
 *   app's scope, so an indexed FTS column is overkill. ILIKE on the
 *   scoped chunk set is fast enough (single digit ms on Neon) and
 *   keeps us migration-free. If the corpus grows past ~50k chunks we
 *   can add a generated tsvector column + GIN index and swap the
 *   keyword SQL.
 */

export type HybridDocScope = 'general_plus_product' | 'handbook';

export interface HybridChunkHit {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  pageNumber: number | null;
  /** Normalized hybrid score in [0, 1+), higher = better */
  score: number;
  /** 1-based rank in the vector search (or null if not in vector hits) */
  vectorRank: number | null;
  /** 1-based rank in the keyword search (or null if not in keyword hits) */
  keywordRank: number | null;
}

/** Reciprocal Rank Fusion constant — 60 is the de-facto standard. */
const RRF_K = 60;

/** Cosine distance ceiling — matches AiService default, override via env. */
const RAG_DISTANCE_THRESHOLD_DEFAULT = 0.78;

/**
 * Stop words we drop from the keyword half of retrieval. These would
 * match *every* chunk and drown out meaningful signal.
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'could',
  'do',
  'does',
  'for',
  'from',
  'get',
  'go',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'no',
  'not',
  'of',
  'on',
  'or',
  'the',
  'this',
  'that',
  'to',
  'use',
  'using',
  'was',
  'we',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'you',
  'your',
  'does',
  'did',
  'should',
  'would',
]);

@Injectable()
export class HybridRetrievalService {
  private readonly logger = new Logger(HybridRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ingestion: IngestionService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async hybridSearch(
    query: string,
    limit: number,
    scope: HybridDocScope = 'general_plus_product',
  ): Promise<HybridChunkHit[]> {
    // Pull more than `limit` from each side so RRF has room to re-rank.
    const poolSize = Math.max(limit * 2, 12);

    const [vectorHits, keywordHits] = await Promise.all([
      this.vectorSearch(query, poolSize, scope).catch((err) => {
        this.logger.warn(
          `vector search failed (falling back to keyword only): ${err instanceof Error ? err.message : err}`,
        );
        return [] as HybridChunkHit[];
      }),
      this.keywordSearch(query, poolSize, scope).catch((err) => {
        this.logger.warn(
          `keyword search failed (falling back to vector only): ${err instanceof Error ? err.message : err}`,
        );
        return [] as HybridChunkHit[];
      }),
    ]);

    return this.rrfFuse(vectorHits, keywordHits, limit);
  }

  async vectorSearch(
    query: string,
    limit: number,
    scope: HybridDocScope,
  ): Promise<HybridChunkHit[]> {
    let embedding: number[];
    try {
      embedding = await this.ingestion.embedOne(query);
    } catch (err) {
      this.logger.debug(
        `embedding unavailable, skipping vector search: ${err instanceof Error ? err.message : err}`,
      );
      return [];
    }

    const embLiteral = `[${embedding.join(',')}]`;
    const threshold = this.getDistanceThreshold();
    const docScope = this.buildDocScopeSql(scope);

    // First: filtered by distance threshold
    let rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        document_id: string;
        document_title: string;
        page_number: number | null;
        distance: number;
      }>
    >`
      SELECT dc.id, dc.content, kd.id AS document_id, kd.title AS document_title,
             dc."pageNumber" AS page_number,
             dc.embedding <=> ${embLiteral}::vector AS distance
      FROM "document_chunks" dc
      JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
      WHERE kd."isActive" = true
        AND dc.embedding IS NOT NULL
        ${docScope}
        AND dc.embedding <=> ${embLiteral}::vector < ${threshold}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    // Fallback: nearest-neighbor without threshold
    if (rows.length === 0) {
      rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          document_id: string;
          document_title: string;
          page_number: number | null;
          distance: number;
        }>
      >`
        SELECT dc.id, dc.content, kd.id AS document_id, kd.title AS document_title,
               dc."pageNumber" AS page_number,
               dc.embedding <=> ${embLiteral}::vector AS distance
        FROM "document_chunks" dc
        JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
        WHERE kd."isActive" = true
          AND dc.embedding IS NOT NULL
          ${docScope}
        ORDER BY distance ASC
        LIMIT ${limit}
      `;
    }

    return rows.map((r, idx) => ({
      id: r.id,
      documentId: r.document_id,
      documentTitle: r.document_title,
      content: r.content,
      pageNumber: r.page_number,
      score: 0, // filled in by rrfFuse
      vectorRank: idx + 1,
      keywordRank: null,
    }));
  }

  async keywordSearch(
    query: string,
    limit: number,
    scope: HybridDocScope,
  ): Promise<HybridChunkHit[]> {
    const tokens = this.extractKeywords(query);
    if (tokens.length === 0) return [];

    const docScope = this.buildDocScopeSql(scope);

    // Build an ILIKE OR chain. We score each chunk by how many tokens
    // it matches — title hits count double because article titles tend
    // to contain the canonical feature name.
    //
    // We use parameterized Prisma.sql fragments so user input is safe.
    const contentScore = Prisma.join(
      tokens.map(
        (t) =>
          Prisma.sql`(CASE WHEN dc.content ILIKE ${`%${t}%`} THEN 1 ELSE 0 END)`,
      ),
      ' + ',
    );
    const titleScore = Prisma.join(
      tokens.map(
        (t) =>
          Prisma.sql`(CASE WHEN kd.title ILIKE ${`%${t}%`} THEN 2 ELSE 0 END)`,
      ),
      ' + ',
    );
    const matchPredicate = Prisma.join(
      tokens.map(
        (t) =>
          Prisma.sql`(dc.content ILIKE ${`%${t}%`} OR kd.title ILIKE ${`%${t}%`})`,
      ),
      ' OR ',
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        document_id: string;
        document_title: string;
        page_number: number | null;
        kw_score: number;
      }>
    >`
      SELECT dc.id, dc.content, kd.id AS document_id, kd.title AS document_title,
             dc."pageNumber" AS page_number,
             (${contentScore}) + (${titleScore}) AS kw_score
      FROM "document_chunks" dc
      JOIN "knowledge_documents" kd ON kd.id = dc."documentId"
      WHERE kd."isActive" = true
        AND dc.embedding IS NOT NULL
        ${docScope}
        AND (${matchPredicate})
      ORDER BY kw_score DESC, dc."chunkIndex" ASC
      LIMIT ${limit}
    `;

    return rows.map((r, idx) => ({
      id: r.id,
      documentId: r.document_id,
      documentTitle: r.document_title,
      content: r.content,
      pageNumber: r.page_number,
      score: 0,
      vectorRank: null,
      keywordRank: idx + 1,
    }));
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Extract meaningful keyword tokens from a free-text query.
   *
   * - Lowercases
   * - Splits on whitespace and punctuation
   * - Drops stop words, tokens shorter than 3 chars (except when the
   *   original query has only one token, so "sla" / "rbac" / "kpi"
   *   still count)
   * - For camelCase inputs like "LeaseIQ", ALSO emits the de-camelCased
   *   form "lease iq" as an extra phrase token, so content that uses
   *   "Lease IQ" still matches
   */
  extractKeywords(query: string): string[] {
    if (!query || typeof query !== 'string') return [];
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Split on anything that isn't a word character
    const raw = trimmed
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean);

    const singleToken = raw.length === 1;
    const tokens = new Set<string>();
    for (const t of raw) {
      if (STOP_WORDS.has(t)) continue;
      if (!singleToken && t.length < 3) continue;
      tokens.add(t);
    }

    // De-camelCase the original query string to catch "LeaseIQ" → "lease iq"
    const decamel = trimmed
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase();
    if (decamel !== trimmed.toLowerCase()) {
      const decamelWords = decamel.split(/[^a-z0-9]+/).filter(Boolean);
      for (const t of decamelWords) {
        if (STOP_WORDS.has(t)) continue;
        if (!singleToken && t.length < 3) continue;
        tokens.add(t);
      }
      const phrase = decamel.replace(/\s+/g, ' ').trim();
      if (phrase && phrase.includes(' ')) {
        if (singleToken) {
          // Whole query was one camel token (e.g. "LeaseIQ" → "lease iq")
          tokens.add(phrase);
        } else {
          // Multi-word query: add compact camel-split phrases (e.g. "lease iq") when
          // adjacent decamel words concatenate to a raw token like "leaseiq", not the full sentence.
          const rawSet = new Set(raw);
          for (let i = 0; i < decamelWords.length - 1; i++) {
            const a = decamelWords[i];
            const b = decamelWords[i + 1];
            if (STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue;
            // Biword matches camel-split names (e.g. lease + iq → leaseiq); allow 2-char tails like "iq".
            if (rawSet.has(a + b)) tokens.add(`${a} ${b}`);
          }
        }
      }
    }

    // Cap total tokens to keep SQL bounded
    return Array.from(tokens).slice(0, 10);
  }

  /**
   * Reciprocal Rank Fusion. For each candidate chunk, score =
   * sum over sources of 1 / (RRF_K + rank_in_source). Missing from a
   * source contributes 0. Standard, robust, and tuning-free.
   */
  private rrfFuse(
    vectorHits: HybridChunkHit[],
    keywordHits: HybridChunkHit[],
    limit: number,
  ): HybridChunkHit[] {
    const byId = new Map<string, HybridChunkHit>();

    for (const h of vectorHits) {
      byId.set(h.id, { ...h });
    }
    for (const h of keywordHits) {
      const existing = byId.get(h.id);
      if (existing) {
        existing.keywordRank = h.keywordRank;
      } else {
        byId.set(h.id, { ...h });
      }
    }

    const merged = Array.from(byId.values());
    for (const m of merged) {
      const vScore = m.vectorRank != null ? 1 / (RRF_K + m.vectorRank) : 0;
      const kScore = m.keywordRank != null ? 1 / (RRF_K + m.keywordRank) : 0;
      m.score = vScore + kScore;
    }

    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, limit);
  }

  private buildDocScopeSql(scope: HybridDocScope): Prisma.Sql {
    if (scope === 'handbook') {
      return Prisma.sql`
        AND kd."documentType" = 'handbook'
        AND (
          kd."upstreamProvider" = 'riser'
          OR kd."upstreamProvider" IS NULL
          OR kd."upstreamProvider" = ''
        )
      `;
    }
    // Default: everything except handbook PDFs that aren't Riser-sourced,
    // so /assistant sees general, product_help, and the Riser handbook.
    return Prisma.sql`
      AND (
        kd."documentType" != 'handbook'
        OR kd."upstreamProvider" = 'riser'
        OR (
          kd."documentType" = 'handbook'
          AND (kd."upstreamProvider" IS NULL OR kd."upstreamProvider" = '')
        )
      )
    `;
  }

  private getDistanceThreshold(): number {
    const v = this.config.get<string>('RAG_DISTANCE_THRESHOLD');
    const n = v != null ? parseFloat(v) : RAG_DISTANCE_THRESHOLD_DEFAULT;
    return Number.isFinite(n) ? n : RAG_DISTANCE_THRESHOLD_DEFAULT;
  }
}
