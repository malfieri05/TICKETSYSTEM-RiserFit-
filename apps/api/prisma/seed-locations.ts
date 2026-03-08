/**
 * Seed/import Riser Fitness locations from riser-locations.csv into Market + Studio.
 * Idempotent: uses externalCode (slug from studio name) as stable upsert key; updates existing, creates new; never deletes.
 * Run with: npm run seed:locations (from apps/api).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

const CSV_PATH = path.join(__dirname, 'seed-data', 'riser-locations.csv');

/** Slugify studio name for externalCode: "Oro Valley" → "oro-valley" */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'studio';
}

/** Normalize studio name for fallback matching: lowercase, trim, collapse spaces */
function normalizeStudioName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Parse a single CSV line respecting quoted fields */
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

/** Parse CSV file; first row = headers, rest = data */
function parseCsv(filePath: string): { headers: string[]; rows: string[][] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((l) => parseCsvLine(l));
  return { headers, rows };
}

/** Map row array to object by header names (CSV columns may have spaces/caps) */
function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((h, i) => {
    rec[h] = row[i] ?? '';
  });
  return rec;
}

async function main() {
  console.log('📍 Loading locations from', CSV_PATH);
  const { headers, rows } = parseCsv(CSV_PATH);
  if (headers.length === 0 || rows.length === 0) {
    console.log('No headers or rows found.');
    return;
  }

  // CSV columns (actual header names from file)
  const get = (rec: Record<string, string>, keys: string[]): string => {
    for (const k of keys) {
      const v = rec[k];
      if (v !== undefined && v !== '') return v.trim();
    }
    return '';
  };
  const getNum = (rec: Record<string, string>, keys: string[]): number | null => {
    const v = get(rec, keys);
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  // For first run after schema change: studios may exist without externalCode; we match by normalized name then set externalCode
  const studiosWithoutCode = await prisma.studio.findMany({
    where: { externalCode: null },
    select: { id: true, name: true },
  });
  const byNormalizedName = new Map<string, (typeof studiosWithoutCode)[number]>();
  for (const s of studiosWithoutCode) {
    const key = normalizeStudioName(s.name);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, s);
  }

  let created = 0;
  let updated = 0;
  const marketCache = new Map<string, string>(); // market name -> id

  const dataForStudio = (rec: Record<string, string>, studioName: string, marketId: string) => {
    const latitude = getNum(rec, ['Latitude', 'latitude']);
    const longitude = getNum(rec, ['Longitude', 'longitude']);
    const formattedAddress = get(rec, ['Formatted address', 'formatted_address']);
    return {
      name: studioName.trim(),
      marketId,
      ...(formattedAddress && { formattedAddress }),
      ...(latitude != null && { latitude }),
      ...(longitude != null && { longitude }),
    };
  };

  for (const row of rows) {
    const rec = rowToRecord(headers, row);
    const studioName = get(rec, ['Studio Name', 'studio_name']);
    const state = get(rec, ['State', 'state']);

    if (!studioName) continue;

    const externalCode = slugify(studioName);

    // Resolve market: use state as market name (e.g. "California", "Arizona")
    if (!state) {
      console.warn(`Skipping "${studioName}": no state`);
      continue;
    }
    let marketId = marketCache.get(state);
    if (!marketId) {
      const market = await prisma.market.upsert({
        where: { name: state },
        create: { name: state },
        update: {},
        select: { id: true },
      });
      marketId = market.id;
      marketCache.set(state, marketId);
    }

    const payload = dataForStudio(rec, studioName, marketId);

    // Primary: upsert by externalCode (stable key)
    const existingByCode = await prisma.studio.findUnique({
      where: { externalCode },
      select: { id: true },
    });

    if (existingByCode) {
      await prisma.studio.update({
        where: { id: existingByCode.id },
        data: payload,
      });
      updated += 1;
    } else {
      // Fallback: studio may exist from a previous run without externalCode; match by normalized name
      const normalizedKey = normalizeStudioName(studioName);
      const existingByName = byNormalizedName.get(normalizedKey);

      if (existingByName) {
        await prisma.studio.update({
          where: { id: existingByName.id },
          data: { ...payload, externalCode },
        });
        byNormalizedName.delete(normalizedKey); // so we don't match again
        updated += 1;
      } else {
        await prisma.studio.create({
          data: { ...payload, externalCode },
        });
        created += 1;
      }
    }
  }

  console.log(`✅ Locations import complete: ${created} created, ${updated} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
