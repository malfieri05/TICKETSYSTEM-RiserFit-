'use client';

import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

const skeletonRow = {
  background: `linear-gradient(90deg, ${POLISH_THEME.innerBorder} 25%, ${POLISH_THEME.listBorder} 50%, ${POLISH_THEME.innerBorder} 75%)`,
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.2s ease-in-out infinite',
} as React.CSSProperties;

const SKELETON_STYLE = `
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

/** Fixed-height skeleton row for table layout (single bar, full width). */
export function TableSkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${POLISH_THEME.rowBorder}` }}>
            <td className={POLISH_CLASS.cellPadding} colSpan={8}>
              <div
                className="h-4 rounded w-full max-w-md"
                style={skeletonRow}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

/** Portal-style table: multiple placeholder bars per row for realistic load. */
export function PortalTableSkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${POLISH_THEME.rowBorder}` }}>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-16" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-4 rounded w-3/4 max-w-xs" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-24" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-4 rounded w-20" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-5 rounded w-20" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-5 rounded w-16" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="flex flex-col items-center gap-1.5">
                <div className="h-3 rounded w-12" style={skeletonRow} />
                <div className="h-1.5 rounded w-16" style={skeletonRow} />
              </div>
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-24" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-8" style={skeletonRow} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

/**
 * Skeleton rows for the canonical 8-column feed table
 * (ID | Title | Status | Created | Tags | Due date | Progress | Requester).
 * Column count matches CANONICAL_FEED_HEADERS so there is no horizontal shift
 * when the real data replaces the skeleton.
 */
export function TicketsTableSkeletonRows({
  count = 5,
  showIdColumn = true,
}: {
  count?: number;
  /** Match TicketTableRow / TicketFeedThead ID column visibility. */
  showIdColumn?: boolean;
}) {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${POLISH_THEME.rowBorder}` }}>
            {/* ID or slim column when collapsed */}
            {showIdColumn ? (
              <td className={POLISH_CLASS.cellPadding}>
                <div className="h-3 rounded w-16" style={skeletonRow} />
              </td>
            ) : (
              <td className="px-2 py-3.5 transition-[padding-left,padding-right] duration-300 ease-out" aria-hidden />
            )}
            {/* Title (wider — comments inline in real rows) */}
            <td className={POLISH_CLASS.cellPadding}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-4 flex-1 rounded max-w-xs" style={skeletonRow} />
                <div className="h-3 w-10 shrink-0 rounded" style={skeletonRow} />
              </div>
            </td>
            {/* Status */}
            <td className={`${POLISH_CLASS.cellPadding} text-center`}>
              <div className="h-5 rounded w-20 mx-auto" style={skeletonRow} />
            </td>
            {/* Created */}
            <td className={`${POLISH_CLASS.cellPadding} text-center`}>
              <div className="h-3 rounded w-24 mx-auto" style={skeletonRow} />
            </td>
            {/* Tags — match TicketRow fixed rail (max-w 280), bar after imaginary + slot */}
            <td className={`${POLISH_CLASS.cellPadding} text-center`}>
              <div className="mx-auto flex w-full max-w-[280px] items-center gap-1.5">
                <div className="h-7 w-7 shrink-0 rounded-full" style={{ visibility: 'hidden' }} aria-hidden />
                <div className="h-4 min-w-0 flex-1 rounded w-20" style={skeletonRow} />
              </div>
            </td>
            {/* Due date */}
            <td className={`${POLISH_CLASS.cellPadding} text-center`}>
              <div className="h-4 rounded w-14 mx-auto" style={skeletonRow} />
            </td>
            {/* Progress */}
            <td className={POLISH_CLASS.cellPadding}>
              <div className="flex flex-col items-center gap-1.5">
                <div className="h-3 rounded w-12" style={skeletonRow} />
                <div className="h-1.5 rounded w-16" style={skeletonRow} />
              </div>
            </td>
            {/* Requester */}
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-24" style={skeletonRow} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

/** Skeleton for inbox card list (button rows). */
export function InboxListSkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${POLISH_CLASS.cellPadding} flex flex-col gap-2`}
          style={{ borderTop: i > 0 ? `1px solid ${POLISH_THEME.rowBorder}` : undefined }}
        >
          <div className="h-4 rounded w-2/3 max-w-sm" style={skeletonRow} />
          <div className="h-3 rounded w-1/2 max-w-xs" style={skeletonRow} />
        </div>
      ))}
    </>
  );
}
