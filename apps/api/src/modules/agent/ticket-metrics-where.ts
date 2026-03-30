import { Prisma } from '@prisma/client';

/**
 * Builds `createdAt` filter for agent ticket analytics from tool args.
 * `date_preset` uses the server's local timezone for "today".
 * Optional `created_after` / `created_before` (ISO) tighten the window (intersection).
 */
export function buildTicketCreatedAtFilter(
  args: Record<string, unknown>,
): Prisma.TicketWhereInput | null {
  const preset = args.date_preset ? String(args.date_preset).toLowerCase() : '';
  const afterRaw = args.created_after ? String(args.created_after) : '';
  const beforeRaw = args.created_before ? String(args.created_before) : '';

  const now = new Date();
  let gte: Date | undefined;
  let lt: Date | undefined;
  let lte: Date | undefined;

  if (preset === 'today') {
    gte = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    lt = new Date(gte);
    lt.setDate(lt.getDate() + 1);
  } else if (preset === 'last_7_days') {
    lte = now;
    gte = new Date(now);
    gte.setDate(gte.getDate() - 7);
  } else if (preset === 'last_30_days') {
    lte = now;
    gte = new Date(now);
    gte.setDate(gte.getDate() - 30);
  }

  if (afterRaw) {
    const d = new Date(afterRaw);
    if (!Number.isNaN(d.getTime())) {
      gte = gte ? new Date(Math.max(gte.getTime(), d.getTime())) : d;
    }
  }
  if (beforeRaw) {
    const d = new Date(beforeRaw);
    if (!Number.isNaN(d.getTime())) {
      if (lt !== undefined) {
        lt = new Date(Math.min(lt.getTime(), d.getTime()));
      } else if (lte !== undefined) {
        lte = new Date(Math.min(lte.getTime(), d.getTime()));
      } else {
        lte = d;
      }
    }
  }

  if (gte === undefined && lt === undefined && lte === undefined) {
    return null;
  }

  const range: Prisma.DateTimeFilter = {};
  if (gte !== undefined) range.gte = gte;
  if (lt !== undefined) range.lt = lt;
  if (lte !== undefined) range.lte = lte;
  return { createdAt: range };
}
