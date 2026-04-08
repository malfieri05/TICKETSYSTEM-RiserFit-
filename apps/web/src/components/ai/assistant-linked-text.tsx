'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { matchAppHelpRoute } from '@/lib/app-help-routes';

/** Prisma default cuid: 25 chars, starts with "c". */
const CUID_TICKET_RE = /^c[a-z0-9]{24}$/;

function isWordBoundary(ch: string | undefined): boolean {
  return ch == null || ch === '' || !/[a-zA-Z0-9]/.test(ch);
}

export type StudioLinkTarget = { id: string; name: string };

export type ToolResultEntry = { tool: string; result: unknown };

/**
 * Collect ticket ids and uniquely-identifiable titles from this turn's tool payloads
 * so we can link the model's summary text to /tickets/:id.
 */
export function collectTicketLinkHints(toolResults: ToolResultEntry[] | undefined): {
  ids: Set<string>;
  uniqueTitleToId: Map<string, string>;
} {
  const pairs: { id: string; title?: string }[] = [];
  if (!toolResults) return { ids: new Set(), uniqueTitleToId: new Map() };

  for (const { tool, result } of toolResults) {
    if (!result || typeof result !== 'object' || result === null) continue;
    if ('error' in result && typeof (result as { error?: unknown }).error === 'string') continue;

    const r = result as Record<string, unknown>;

    if (tool === 'search_tickets' && Array.isArray(r.tickets)) {
      for (const t of r.tickets) {
        if (t && typeof t === 'object' && typeof (t as { id?: unknown }).id === 'string') {
          const id = (t as { id: string }).id;
          const title =
            typeof (t as { title?: unknown }).title === 'string'
              ? (t as { title: string }).title
              : undefined;
          pairs.push({ id, title });
        }
      }
      continue;
    }

    const tid = typeof r.ticket_id === 'string' ? r.ticket_id : null;
    if (!tid || !CUID_TICKET_RE.test(tid)) continue;

    const title = typeof r.title === 'string' ? r.title : undefined;
    if (
      tool === 'get_ticket' ||
      tool === 'create_ticket' ||
      tool === 'update_ticket_status' ||
      tool === 'assign_ticket' ||
      tool === 'add_ticket_comment'
    ) {
      pairs.push({ id: tid, title });
    }
  }

  const ids = new Set(pairs.map((p) => p.id));
  const titleCount = new Map<string, number>();
  for (const p of pairs) {
    if (p.title) titleCount.set(p.title, (titleCount.get(p.title) ?? 0) + 1);
  }
  const uniqueTitleToId = new Map<string, string>();
  for (const p of pairs) {
    if (p.title && titleCount.get(p.title) === 1) uniqueTitleToId.set(p.title, p.id);
  }

  return { ids, uniqueTitleToId };
}

export function flattenStudiosFromMarkets(
  markets: { studios?: { id: string; name: string }[] }[] | undefined,
): StudioLinkTarget[] {
  if (!markets?.length) return [];
  const out: StudioLinkTarget[] = [];
  for (const m of markets) {
    for (const s of m.studios ?? []) {
      const name = s.name?.trim();
      if (name) out.push({ id: s.id, name });
    }
  }
  out.sort((a, b) => b.name.length - a.name.length);
  return out;
}

const linkClass =
  'font-medium text-[var(--color-accent)] underline underline-offset-2 hover:opacity-90 break-all';

export function AssistantLinkedText({
  text,
  studios,
  toolResults,
}: {
  text: string;
  studios: StudioLinkTarget[];
  toolResults?: ToolResultEntry[];
}) {
  const hints = collectTicketLinkHints(toolResults);
  const titlesSorted = [...hints.uniqueTitleToId.entries()].sort((a, b) => b[0].length - a[0].length);

  const parts: ReactNode[] = [];
  let buf = '';
  let partKey = 0;

  const flushBuf = () => {
    if (buf) {
      parts.push(buf);
      buf = '';
    }
  };

  let pos = 0;
  while (pos < text.length) {
    const before = pos > 0 ? text[pos - 1] : '';

    const routeHit = matchAppHelpRoute(text, pos);
    if (routeHit) {
      flushBuf();
      const raw = text.slice(pos, pos + routeHit.length);
      parts.push(
        <Link key={`rt-${partKey++}`} href={routeHit.href} className={linkClass}>
          {raw}
        </Link>,
      );
      pos += routeHit.length;
      continue;
    }

    const slice25 = text.slice(pos, pos + 25);
    if (
      slice25.length === 25 &&
      CUID_TICKET_RE.test(slice25) &&
      isWordBoundary(before) &&
      isWordBoundary(text[pos + 25])
    ) {
      flushBuf();
      parts.push(
        <Link key={`tk-${partKey++}`} href={`/tickets/${slice25}`} className={linkClass}>
          {slice25}
        </Link>,
      );
      pos += 25;
      continue;
    }

    const studioMatches: StudioLinkTarget[] = [];
    for (const s of studios) {
      const n = s.name.length;
      if (pos + n > text.length) continue;
      const seg = text.slice(pos, pos + n);
      if (seg.toLowerCase() !== s.name.toLowerCase()) continue;
      if (!isWordBoundary(before) || !isWordBoundary(text[pos + n])) continue;
      studioMatches.push(s);
    }
    if (studioMatches.length > 0) {
      const maxLen = Math.max(...studioMatches.map((m) => m.name.length));
      const longest = studioMatches.filter((m) => m.name.length === maxLen);
      const uniqueIds = new Set(longest.map((m) => m.id));
      if (uniqueIds.size === 1) {
        const studioHit = longest[0];
        flushBuf();
        const raw = text.slice(pos, pos + studioHit.name.length);
        parts.push(
          <Link key={`st-${partKey++}`} href={`/locations/${studioHit.id}`} className={linkClass}>
            {raw}
          </Link>,
        );
        pos += studioHit.name.length;
        continue;
      }
      flushBuf();
      parts.push(text.slice(pos, pos + maxLen));
      pos += maxLen;
      continue;
    }

    let titleId: string | null = null;
    let titleLen = 0;
    for (const [title, id] of titlesSorted) {
      const n = title.length;
      if (pos + n > text.length) continue;
      const seg = text.slice(pos, pos + n);
      if (seg.toLowerCase() !== title.toLowerCase()) continue;
      if (!isWordBoundary(before) || !isWordBoundary(text[pos + n])) continue;
      titleId = id;
      titleLen = n;
      break;
    }
    if (titleId && titleLen > 0) {
      flushBuf();
      const raw = text.slice(pos, pos + titleLen);
      parts.push(
        <Link key={`tt-${partKey++}`} href={`/tickets/${titleId}`} className={linkClass}>
          {raw}
        </Link>,
      );
      pos += titleLen;
      continue;
    }

    buf += text[pos];
    pos += 1;
  }
  flushBuf();

  return <>{parts}</>;
}
