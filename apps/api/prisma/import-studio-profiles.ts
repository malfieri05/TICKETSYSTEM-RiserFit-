/**
 * Upsert StudioProfile rows from a CSV (Riser studio master sheet or repo template).
 *
 * Matching studios (same keys as seed-locations):
 * - `externalCode` / `external code` / `slug` column if present, else slugify("Studio Name") → studios.externalCode
 * - Fallback: case-insensitive studio name
 *
 * RISERFIT exports often use a 2-row header: pass --header-row=1 (0-based) to use the second row as column names.
 * Ignore the last N data rows (e.g. locations not in scope): --skip-bottom=11 (default 0; use 11 for the full RISERFIT sheet).
 *
 * Default file resolution (first that exists):
 *   1. STUDIO_MASTER_CSV env
 *   2. --file=path
 *   3. ../../docs/studio-master-data.csv (repo root)
 *   4. ~/Desktop/RISERFIT - Studio Master Sheet - Mikey Info.csv
 *
 * Run (from apps/api):
 *   npx ts-node --transpile-only prisma/import-studio-profiles.ts
 *   npx ts-node --transpile-only prisma/import-studio-profiles.ts --header-row=1 --skip-bottom=11
 *   npx ts-node --transpile-only prisma/import-studio-profiles.ts --dry-run
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'studio';
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i += 1;
      let field = '';
      while (i < line.length && line[i] !== '"') {
        field += line[i] === '\\' ? line[++i] || '' : line[i];
        i += 1;
      }
      if (line[i] === '"') i += 1;
      out.push(field);
      if (line[i] === ',') i += 1;
    } else {
      const comma = line.indexOf(',', i);
      const field = comma === -1 ? line.slice(i) : line.slice(i, comma);
      out.push(field.trim());
      i = comma === -1 ? line.length : comma + 1;
    }
  }
  return out;
}

function parseArgs(): {
  file?: string;
  headerRow: number;
  skipBottom: number;
  dryRun: boolean;
} {
  let file: string | undefined;
  let headerRow = 0;
  let skipBottom = 0;
  let dryRun = false;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--file=')) file = a.slice('--file='.length);
    else if (a.startsWith('--header-row=')) headerRow = Math.max(0, parseInt(a.slice('--header-row='.length), 10) || 0);
    else if (a.startsWith('--skip-bottom=')) skipBottom = Math.max(0, parseInt(a.slice('--skip-bottom='.length), 10) || 0);
    else if (a === '--dry-run') dryRun = true;
  }
  return { file, headerRow, skipBottom, dryRun };
}

function isSentinel(v: string): boolean {
  const t = v.trim().toLowerCase();
  return (
    t === '' ||
    t === '#n/a' ||
    t === 'n/a' ||
    t === 'tbd' ||
    t === '--' ||
    t === '-' ||
    t === 'null'
  );
}

function pick(rec: Record<string, string>, aliases: string[]): string {
  for (const k of aliases) {
    const key = normalizeHeader(k);
    const v = rec[key];
    if (v !== undefined && !isSentinel(v)) return v.trim();
  }
  return '';
}

function parseDate(value: string): Date | null {
  const v = value.trim();
  if (!v || isSentinel(v)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v.slice(0, 10) + 'T12:00:00.000Z');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    return new Date(Date.UTC(year, month, day, 12, 0, 0));
  }
  return null;
}

function parseIntMaybe(value: string): number | null {
  if (!value || isSentinel(value)) return null;
  const n = parseInt(value.replace(/,/g, '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((h, i) => {
    rec[normalizeHeader(h)] = (row[i] ?? '').trim();
  });
  return rec;
}

function resolveCsvPath(cliFile?: string): string | null {
  if (process.env.STUDIO_MASTER_CSV && fs.existsSync(process.env.STUDIO_MASTER_CSV)) {
    return process.env.STUDIO_MASTER_CSV;
  }
  if (cliFile && fs.existsSync(cliFile)) return path.resolve(cliFile);

  const repoDocs = path.join(__dirname, '..', '..', '..', 'docs', 'studio-master-data.csv');
  if (fs.existsSync(repoDocs)) return repoDocs;

  const desktop = path.join(os.homedir(), 'Desktop', 'RISERFIT - Studio Master Sheet - Mikey Info.csv');
  if (fs.existsSync(desktop)) return desktop;

  return null;
}

function loadCsv(filePath: string, headerRow: number, skipBottom: number): { headers: string[]; rows: string[][] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < headerRow + 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[headerRow]);
  let dataLines = lines.slice(headerRow + 1);
  if (skipBottom > 0 && dataLines.length > skipBottom) {
    dataLines = dataLines.slice(0, -skipBottom);
  }
  const rows = dataLines.map((l) => parseCsvLine(l)).filter((r) => r.some((c) => c.trim() !== ''));
  return { headers, rows };
}

async function findStudioId(studioName: string, externalHint: string): Promise<{ id: string; name: string } | null> {
  const name = studioName.trim();
  if (!name) return null;

  const hint = externalHint.trim();
  if (hint) {
    const byHint = await prisma.studio.findFirst({
      where: { externalCode: hint },
      select: { id: true, name: true },
    });
    if (byHint) return byHint;
    const slug = slugify(hint);
    const bySlug = await prisma.studio.findFirst({
      where: { externalCode: slug },
      select: { id: true, name: true },
    });
    if (bySlug) return bySlug;
  }

  const slugFromName = slugify(name);
  const byCode = await prisma.studio.findFirst({
    where: { externalCode: slugFromName },
    select: { id: true, name: true },
  });
  if (byCode) return byCode;

  const byName = await prisma.studio.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  return byName;
}

function profileFromRow(rec: Record<string, string>) {
  const studioOpenDate = parseDate(pick(rec, ['studio open date', 'studioOpenDate']));
  const rfSoftOpenDate = parseDate(pick(rec, ['rf soft open date', 'rfSoftOpenDate']));

  return {
    district: pick(rec, ['district', 'dist.', 'dist']) || null,
    status: pick(rec, ['status', 'studio status']) || null,
    maturity: pick(rec, ['maturity']) || null,
    studioSize: parseIntMaybe(pick(rec, ['studio size', 'studioSize'])),
    priceTier: parseIntMaybe(pick(rec, ['price tier', 'priceTier'])),
    openType: pick(rec, ['open type', 'openType']) || null,
    studioOpenDate,
    rfSoftOpenDate,

    dm: pick(rec, ['dm', 'district manager']) || null,
    gm: pick(rec, ['gm', 'general manager']) || null,
    agm: pick(rec, ['agm']) || null,
    edc: pick(rec, ['edc']) || null,
    li: pick(rec, ['li', 'lead instructor']) || null,

    studioEmail: pick(rec, ['studio email', 'studioEmail']) || null,
    gmEmail: pick(rec, ['gm email', 'studio gm email', 'gmEmail']) || null,
    gmTeams: pick(rec, ['gm teams', 'studio gm riser teams chat', 'gmTeams']) || null,
    liEmail: pick(rec, ['li email', 'li cp email', 'liEmail']) || null,

    studioCode: pick(rec, ['studio code', 'studioCode']) || null,
    netsuiteName: pick(rec, ['netsuite name', 'studio netsuite', 'netsuiteName', 'net suite name']) || null,
    ikismetName: pick(rec, ['ikismet name', 'studio ikizmet', 'studio ikismet', 'ikimist name', 'ikismist name', 'ikismetName']) || null,
    crName: pick(rec, ['cr name', 'studio cr', 'crName']) || null,
    crId: pick(rec, ['cr id', 'crId', 'cr #']) || null,
    paycomCode: pick(rec, ['paycom code', 'paycomCode', 'paycom_studio_code']) || null,
  };
}

async function main() {
  const { file: cliFile, headerRow, skipBottom, dryRun } = parseArgs();
  const csvPath = resolveCsvPath(cliFile);
  if (!csvPath) {
    console.error(
      'No CSV found. Set STUDIO_MASTER_CSV, pass --file=..., or place docs/studio-master-data.csv at repo root.',
    );
    process.exit(1);
  }

  console.log(`📄 ${csvPath} (header row index ${headerRow}, skip bottom ${skipBottom}${dryRun ? ', DRY RUN' : ''})`);

  const { headers, rows } = loadCsv(csvPath, headerRow, skipBottom);
  if (headers.length === 0 || rows.length === 0) {
    console.error('No headers or data rows after parsing.');
    process.exit(1);
  }

  let upserted = 0;
  const missing: string[] = [];
  const skippedEmpty: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rec = rowToRecord(headers, rows[i]);
    const studioName = pick(rec, ['studio name', 'studioName', 'name']);
    const externalHint = pick(rec, ['externalCode', 'external code', 'slug', 'url slug']);

    if (!studioName) {
      skippedEmpty.push(i + headerRow + 2);
      continue;
    }

    const studio = await findStudioId(studioName, externalHint);
    if (!studio) {
      missing.push(studioName);
      continue;
    }

    const data = profileFromRow(rec);
    if (dryRun) {
      console.log(`Would upsert profile for "${studio.name}" (${studio.id})`);
      upserted += 1;
      continue;
    }

    await prisma.studioProfile.upsert({
      where: { studioId: studio.id },
      create: { studioId: studio.id, ...data },
      update: data,
    });
    upserted += 1;
    console.log(`📍 ${studio.name}`);
  }

  if (missing.length) {
    console.warn(`\n⚠️  No Studio match for ${missing.length} row(s):`);
    missing.slice(0, 30).forEach((n) => console.warn(`   - ${n}`));
    if (missing.length > 30) console.warn(`   … and ${missing.length - 30} more`);
  }
  if (skippedEmpty.length) {
    console.warn(`\nSkipped ${skippedEmpty.length} row(s) with no studio name.`);
  }

  console.log(`\n✅ Studio profiles: ${upserted} ${dryRun ? 'would be ' : ''}written.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
