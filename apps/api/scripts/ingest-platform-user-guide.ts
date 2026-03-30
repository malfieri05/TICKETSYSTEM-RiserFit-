/**
 * Ingest docs/platform-user-guide.md into the knowledge base for Assistant RAG.
 * Requires DATABASE_URL, OPENAI_API_KEY, and a reachable Redis (BullMQ bootstrap).
 *
 * Idempotent by title: updates existing "Platform user guide (RAG)" document if present.
 *
 * Run from apps/api:
 *   npx ts-node --transpile-only -r dotenv/config scripts/ingest-platform-user-guide.ts
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/modules/ai/ingestion.service';
import { PrismaService } from '../src/common/database/prisma.service';

const DOC_TITLE = 'Platform user guide (RAG)';

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const mdPath = path.join(repoRoot, 'docs', 'platform-user-guide.md');
  if (!fs.existsSync(mdPath)) {
    throw new Error(`Missing ${mdPath}`);
  }
  const content = fs.readFileSync(mdPath, 'utf8');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const ingestion = app.get(IngestionService);

    const existing = await prisma.knowledgeDocument.findFirst({
      where: { title: DOC_TITLE },
      select: { id: true },
    });

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('No active ADMIN user found; cannot set uploadedById');
    }

    if (existing) {
      await ingestion.reingestExistingDocumentFromText(
        existing.id,
        DOC_TITLE,
        content,
        { documentType: 'general' },
      );
      console.log(`Re-ingested "${DOC_TITLE}" → documentId=${existing.id}`);
    } else {
      const { documentId, chunksCreated } = await ingestion.ingestText(
        DOC_TITLE,
        content,
        admin.id,
        { documentType: 'general', sourceType: 'repo', sourceUrl: 'docs/platform-user-guide.md' },
      );
      console.log(`Ingested "${DOC_TITLE}" → documentId=${documentId} chunks=${chunksCreated}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
