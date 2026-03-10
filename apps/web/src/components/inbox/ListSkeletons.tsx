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
            <td className={POLISH_CLASS.cellPadding} colSpan={7}>
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

/** Portal table (7 columns): multiple placeholder bars per row for realistic load. */
export function PortalTableSkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${POLISH_THEME.rowBorder}` }}>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-20" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-24" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-4 rounded w-3/4 max-w-xs" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-16" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-5 rounded w-14" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-5 rounded w-14" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-20" style={skeletonRow} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

/** Skeleton rows for /tickets table (4 columns). */
export function TicketsTableSkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      <style>{SKELETON_STYLE}</style>
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${POLISH_THEME.rowBorder}` }}>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-4 rounded w-3/4 max-w-xs" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-24" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-20" style={skeletonRow} />
            </td>
            <td className={POLISH_CLASS.cellPadding}>
              <div className="h-3 rounded w-28" style={skeletonRow} />
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
