/**
 * Ingest the Rovi product help corpus (docs/rovi/articles/*.md) into the
 * knowledge base as KnowledgeDocuments with documentType = 'product_help'.
 *
 * Each markdown file must begin with YAML front matter containing at minimum:
 *
 *   ---
 *   slug: my-feature
 *   title: "My feature"
 *   feature: "My feature"
 *   roles: [ADMIN]
 *   primary_routes:
 *     - /some/path
 *   related_routes: []
 *   synonyms: [my feature, myFeature]
 *   summary: "One-sentence description."
 *   ---
 *
 * This script is idempotent by slug:
 *   - If a product_help doc with title "Rovi Help — {title}" already exists,
 *     it is re-ingested in place (chunks replaced, metadata updated).
 *   - If the markdown file no longer exists for a product_help doc whose
 *     title starts with "Rovi Help — ", the doc (and its chunks) is deleted
 *     so the corpus stays in sync with the repo.
 *
 * The synonyms from front matter are appended to the embedded content so
 * vector search handles "LeaseIQ" / "Lease IQ" / "lease iq"-style variants,
 * and the hybrid keyword side of knowledge_search sees them too.
 *
 * Required env: DATABASE_URL, OPENAI_API_KEY, reachable Redis.
 *
 * Run from apps/api:
 *   npm run ingest:product-help
 * or
 *   npx ts-node --transpile-only -r dotenv/config scripts/ingest-product-help.ts
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/modules/ai/ingestion.service';
import { PrismaService } from '../src/common/database/prisma.service';

const TITLE_PREFIX = 'Rovi Help — ';

interface ArticleFrontMatter {
  slug: string;
  title: string;
  feature?: string;
  roles?: string[];
  primary_routes?: string[];
  related_routes?: string[];
  synonyms?: string[];
  summary?: string;
}

interface Article {
  filePath: string;
  frontMatter: ArticleFrontMatter;
  body: string;
}

/**
 * Tiny YAML front matter parser tailored to the shape we use in docs/rovi.
 * We only support: scalar strings, quoted strings, inline arrays `[a, b]`,
 * and block arrays on the following lines with `- item` entries.
 * This avoids pulling in a YAML dep for a script.
 */
function parseFrontMatter(raw: string): {
  fm: Record<string, unknown>;
  body: string;
} {
  if (!raw.startsWith('---')) {
    return { fm: {}, body: raw };
  }
  const end = raw.indexOf('\n---', 3);
  if (end === -1) {
    return { fm: {}, body: raw };
  }
  const fmText = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s*\n/, '');

  const fm: Record<string, unknown> = {};
  const lines = fmText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!match) {
      i++;
      continue;
    }
    const key = match[1];
    const rest = match[2];

    if (rest === '') {
      // Block list
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*-\s+/, '').trim();
        items.push(stripQuotes(item));
        i++;
      }
      fm[key] = items;
      continue;
    }

    // Inline array
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      const items = inner
        ? inner.split(',').map((s) => stripQuotes(s.trim()))
        : [];
      fm[key] = items;
      i++;
      continue;
    }

    // Scalar string
    fm[key] = stripQuotes(rest.trim());
    i++;
  }

  return { fm, body };
}

function stripQuotes(s: string): string {
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function loadArticles(articlesDir: string): Article[] {
  if (!fs.existsSync(articlesDir)) {
    throw new Error(`Missing articles directory: ${articlesDir}`);
  }
  const files = fs
    .readdirSync(articlesDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const articles: Article[] = [];
  for (const f of files) {
    const filePath = path.join(articlesDir, f);
    const raw = fs.readFileSync(filePath, 'utf8');
    const { fm, body } = parseFrontMatter(raw);

    // Validate required fields
    const slug = fm.slug as string | undefined;
    const title = fm.title as string | undefined;
    if (!slug || !title) {
      throw new Error(
        `Article ${f} is missing required front matter: slug and title`,
      );
    }

    const frontMatter: ArticleFrontMatter = {
      slug,
      title,
      feature: (fm.feature as string) || undefined,
      roles: Array.isArray(fm.roles) ? (fm.roles as string[]) : undefined,
      primary_routes: Array.isArray(fm.primary_routes)
        ? (fm.primary_routes as string[])
        : undefined,
      related_routes: Array.isArray(fm.related_routes)
        ? (fm.related_routes as string[])
        : undefined,
      synonyms: Array.isArray(fm.synonyms)
        ? (fm.synonyms as string[])
        : undefined,
      summary: (fm.summary as string) || undefined,
    };

    articles.push({ filePath, frontMatter, body });
  }
  return articles;
}

/**
 * Build the final content the ingestion service will chunk + embed.
 * We prepend a compact metadata block so both vector AND keyword search see
 * the feature name, role list, primary routes, synonyms, and summary —
 * this is how we protect against brittle queries like "LeaseIQ" vs
 * "Lease IQ" vs "lease iq".
 */
function buildDocumentContent(article: Article): string {
  const fm = article.frontMatter;
  const lines: string[] = [];

  lines.push(`# ${fm.title}`);
  if (fm.feature) lines.push(`Feature: ${fm.feature}`);
  if (fm.roles && fm.roles.length)
    lines.push(`Allowed roles: ${fm.roles.join(', ')}`);
  if (fm.primary_routes && fm.primary_routes.length)
    lines.push(`Primary routes: ${fm.primary_routes.join(', ')}`);
  if (fm.related_routes && fm.related_routes.length)
    lines.push(`Related routes: ${fm.related_routes.join(', ')}`);
  if (fm.synonyms && fm.synonyms.length) {
    // Include a dense synonym line so ILIKE keyword search + embeddings both
    // pick up on "LeaseIQ" / "Lease IQ" / "lease iq" style variants.
    lines.push(`Also known as: ${fm.synonyms.join(', ')}`);
  }
  if (fm.summary) lines.push(`Summary: ${fm.summary}`);
  lines.push('');
  lines.push(article.body.trim());

  return lines.join('\n');
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const articlesDir = path.join(repoRoot, 'docs', 'rovi', 'articles');

  const articles = loadArticles(articlesDir);
  console.log(
    `Found ${articles.length} product help articles in ${articlesDir}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const ingestion = app.get(IngestionService);

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error(
        'No active ADMIN user found; cannot set uploadedById for product help docs',
      );
    }

    const wantedTitles = new Set<string>();
    let ingested = 0;
    let reingested = 0;

    // Ingest / re-ingest every article.
    for (const article of articles) {
      const title = `${TITLE_PREFIX}${article.frontMatter.title}`;
      wantedTitles.add(title);
      const content = buildDocumentContent(article);
      const sourceUrl = path.relative(repoRoot, article.filePath);

      const existing = await prisma.knowledgeDocument.findFirst({
        where: { title, documentType: 'product_help' },
        select: { id: true },
      });

      if (existing) {
        await ingestion.reingestExistingDocumentFromText(
          existing.id,
          title,
          content,
          { documentType: 'product_help' },
        );
        await prisma.knowledgeDocument.update({
          where: { id: existing.id },
          data: {
            sourceType: 'repo',
            sourceUrl,
            isActive: true,
          },
        });
        reingested++;
        console.log(
          `  ↻ re-ingested "${title}" (slug=${article.frontMatter.slug}, id=${existing.id})`,
        );
      } else {
        const { documentId, chunksCreated } = await ingestion.ingestText(
          title,
          content,
          admin.id,
          {
            documentType: 'product_help',
            sourceType: 'repo',
            sourceUrl,
            sizeBytes: Buffer.byteLength(content, 'utf8'),
          },
        );
        ingested++;
        console.log(
          `  + ingested "${title}" (slug=${article.frontMatter.slug}, id=${documentId}, chunks=${chunksCreated})`,
        );
      }
    }

    // Delete any stale product_help docs whose markdown file no longer exists.
    const stale = await prisma.knowledgeDocument.findMany({
      where: {
        documentType: 'product_help',
        title: { startsWith: TITLE_PREFIX },
      },
      select: { id: true, title: true },
    });

    let deleted = 0;
    for (const doc of stale) {
      if (!wantedTitles.has(doc.title)) {
        await ingestion.deleteDocument(doc.id);
        deleted++;
        console.log(`  − deleted stale "${doc.title}" (id=${doc.id})`);
      }
    }

    console.log(
      `\nProduct help corpus sync complete: ingested=${ingested}, re-ingested=${reingested}, deleted=${deleted}, total active=${articles.length}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
