'use client';

import { memo } from 'react';
import { format } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import type { TicketStatus, TicketPriority } from '@/types';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

const rowBorder = `1px solid ${POLISH_THEME.rowBorder}`;
const cellMuted = { color: POLISH_THEME.metaSecondary } as const;
const cellDim = { color: POLISH_THEME.metaDim } as const;

/** Canonical ticket ID display: first 8 chars of internal CUID. */
export function formatTicketId(id: string): string {
  return id.slice(0, 8);
}

/** Initials from display name: "First Last" -> "FL", "Madison" -> "MA", "A" -> "A". */
function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  }
  const one = trimmed.slice(0, 2);
  return one.length === 1 ? one.toUpperCase() : one.toUpperCase();
}

function RequesterAvatar({ displayName }: { displayName: string }) {
  const initials = getInitials(displayName);
  return (
    <div className="relative group inline-flex">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors"
        style={{
          background: 'var(--color-bg-surface-raised)',
          border: `1px solid ${POLISH_THEME.listBorder}`,
          color: 'var(--color-text-primary)',
        }}
        aria-hidden
      >
        {initials}
      </div>
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20"
        style={{
          background: 'var(--color-bg-surface-raised)',
          border: `1px solid ${POLISH_THEME.listBorder}`,
          color: 'var(--color-text-primary)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        {displayName}
      </div>
    </div>
  );
}

/**
 * Canonical feed header definitions — used by all ticket list surfaces
 * (tickets page, inbox/actionable, and portal) to ensure consistent column order.
 *
 * Column order: ID | Title | Created | Status | Priority | Progress | Requester | Comments
 */
/** Columns whose header and cell content should be center-aligned. */
const CENTERED_COLS = new Set(['progress', 'requester', 'comments']);

/**
 * Returns the correct `<th>` class for a given column key.
 * Progress, Requester, and Comments are center-aligned; all others left-align.
 */
export function getThClass(key: string): string {
  return CENTERED_COLS.has(key) ? POLISH_CLASS.tableHeaderCenter : POLISH_CLASS.tableHeader;
}

export const CANONICAL_FEED_HEADERS = [
  { label: 'ID', key: 'id' },
  { label: 'Title', key: 'title' },
  { label: 'Created', key: 'created' },
  { label: 'Status', key: 'status' },
  { label: 'Priority', key: 'priority' },
  { label: 'Progress', key: 'progress' },
  { label: 'Requester', key: 'requester' },
  { label: 'Comments', key: 'comments' },
] as const;

export interface TicketTableRowProps {
  id: string;
  title: string;
  /** Optional secondary line shown under the title (e.g. "Topic · Studio" for portal rows). */
  subLabel?: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  commentCount: number;
  completedSubtasks: number;
  totalSubtasks: number;
  requesterDisplayName: string;
  /** Highlight the row as selected (used by drawer-based ticket list). Defaults to false. */
  isSelected?: boolean;
  onSelect: () => void;
}

function TicketTableRowComponent({
  id,
  title,
  subLabel,
  status,
  priority,
  createdAt,
  commentCount,
  completedSubtasks,
  totalSubtasks,
  requesterDisplayName,
  isSelected = false,
  onSelect,
}: TicketTableRowProps) {
  const pct = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  return (
    <tr
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`cursor-pointer ${POLISH_CLASS.rowTransition} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--color-accent)]`}
      style={{
        borderBottom: rowBorder,
        background: isSelected ? POLISH_THEME.rowSelected : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = POLISH_THEME.rowHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isSelected ? POLISH_THEME.rowSelected : 'transparent';
      }}
    >
      {/* 1. ID */}
      <td className={`${POLISH_CLASS.cellPadding} text-xs font-mono whitespace-nowrap`} style={cellDim}>
        {formatTicketId(id)}
      </td>

      {/* 2. Title (+ optional sub-label) */}
      <td className={POLISH_CLASS.cellPadding}>
        <span className="font-medium line-clamp-1" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
        {subLabel && (
          <span className="block text-xs mt-0.5 truncate" style={cellDim}>{subLabel}</span>
        )}
      </td>

      {/* 3. Created */}
      <td className={`${POLISH_CLASS.cellPadding} text-xs whitespace-nowrap`} style={cellMuted}>
        {format(new Date(createdAt), 'MMM d, yyyy')}
      </td>

      {/* 4. Status */}
      <td className={POLISH_CLASS.cellPadding}>
        <StatusBadge status={status} />
      </td>

      {/* 5. Priority */}
      <td className={POLISH_CLASS.cellPadding}>
        <PriorityBadge priority={priority} />
      </td>

      {/* 6. Progress — green bar + count, centered; Comments icon is in its own column */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`}>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-medium tabular-nums" style={cellMuted}>
            {completedSubtasks} / {totalSubtasks}
          </span>
          {totalSubtasks > 0 ? (
            <div
              className="w-16 h-1.5 rounded-full overflow-hidden"
              style={{ background: POLISH_THEME.listBorder }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: POLISH_THEME.progressGreen,
                }}
              />
            </div>
          ) : (
            <div className="w-16 h-1.5 rounded-full" style={{ background: POLISH_THEME.listBorder }} />
          )}
        </div>
      </td>

      {/* 7. Requester — circle with initials + hover tooltip with full name */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`}>
        <div className="flex justify-center">
          <RequesterAvatar displayName={requesterDisplayName || '—'} />
        </div>
      </td>

      {/* 8. Comments */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`}>
        {commentCount > 0 ? (
          <div className="flex items-center justify-center gap-1 text-xs" style={cellDim}>
            <MessageCircle className="h-3 w-3" />
            <span className="tabular-nums">{commentCount}</span>
          </div>
        ) : (
          <span className="text-xs" style={{ color: POLISH_THEME.innerBorder }}>—</span>
        )}
      </td>
    </tr>
  );
}

export const TicketTableRow = memo(TicketTableRowComponent);

/**
 * Portal row adapter — kept for backward compatibility.
 * Maps portal-specific props (topicLabel, studioName, updatedAt) to the canonical
 * TicketTableRow format. The portal page should migrate to using TicketTableRow directly.
 *
 * @deprecated Use TicketTableRow with subLabel prop instead.
 */
export interface PortalTicketTableRowProps {
  id: string;
  title: string;
  topicLabel: string;
  createdAt: string;
  requesterDisplayName: string;
  studioName: string;
  status: TicketStatus;
  priority: TicketPriority;
  updatedAt: string;
  commentCount: number;
  completedSubtasks?: number;
  totalSubtasks?: number;
  isResolvedOrClosed: boolean;
  onSelect: () => void;
}

export function PortalTicketTableRow({
  id,
  title,
  topicLabel,
  createdAt,
  requesterDisplayName,
  studioName,
  status,
  priority,
  commentCount,
  completedSubtasks = 0,
  totalSubtasks = 0,
  onSelect,
}: PortalTicketTableRowProps) {
  const subLabel = [topicLabel !== '—' ? topicLabel : '', studioName !== '—' ? studioName : '']
    .filter(Boolean)
    .join(' · ') || undefined;

  return (
    <TicketTableRow
      id={id}
      title={title}
      subLabel={subLabel}
      status={status}
      priority={priority}
      createdAt={createdAt}
      commentCount={commentCount}
      completedSubtasks={completedSubtasks}
      totalSubtasks={totalSubtasks}
      requesterDisplayName={requesterDisplayName}
      isSelected={false}
      onSelect={onSelect}
    />
  );
}
