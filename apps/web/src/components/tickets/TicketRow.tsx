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

export interface TicketTableRowProps {
  id: string;
  title: string;
  createdAt: string;
  commentCount: number;
  completedSubtasks: number;
  totalSubtasks: number;
  requesterDisplayName: string;
  isSelected: boolean;
  onSelect: () => void;
}

function TicketTableRowComponent({
  title,
  createdAt,
  commentCount,
  completedSubtasks,
  totalSubtasks,
  requesterDisplayName,
  isSelected,
  onSelect,
}: TicketTableRowProps) {
  const pct = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  return (
    <tr
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`cursor-pointer ${POLISH_CLASS.rowTransition} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-teal-500`}
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
      <td className={POLISH_CLASS.cellPadding}>
        <span className="font-medium line-clamp-1" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
      </td>
      <td className={`${POLISH_CLASS.cellPadding} text-xs whitespace-nowrap`} style={cellMuted}>
        {format(new Date(createdAt), 'MMM d, yyyy')}
      </td>
      <td className={POLISH_CLASS.cellPadding}>
        <div className="flex items-center gap-3">
          {commentCount > 0 && (
            <div className="flex items-center gap-1 text-xs" style={cellDim}>
              <MessageCircle className="h-3 w-3" />
              <span className="tabular-nums">{commentCount}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tabular-nums" style={cellMuted}>
              {completedSubtasks} / {totalSubtasks}
            </span>
            {totalSubtasks > 0 && (
              <div
                className="w-16 h-1.5 rounded-full overflow-hidden"
                style={{ background: POLISH_THEME.listBorder }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: pct === 100 ? '#22c55e' : POLISH_THEME.accent,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </td>
      <td className={POLISH_CLASS.cellPadding} style={{ color: POLISH_THEME.metaDim }}>
        {requesterDisplayName}
      </td>
    </tr>
  );
}

export const TicketTableRow = memo(TicketTableRowComponent);

/** Portal (My tickets / By studio) table row — primitive props for memo. */
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
  isResolvedOrClosed: boolean;
  onSelect: () => void;
}

function PortalTicketTableRowComponent({
  title,
  topicLabel,
  createdAt,
  requesterDisplayName,
  studioName,
  status,
  priority,
  updatedAt,
  commentCount,
  isResolvedOrClosed,
  onSelect,
}: PortalTicketTableRowProps) {
  return (
    <tr
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`cursor-pointer ${POLISH_CLASS.rowTransition} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-teal-500`}
      style={{ borderBottom: rowBorder }}
      onMouseEnter={(e) => (e.currentTarget.style.background = POLISH_THEME.rowHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td className={`${POLISH_CLASS.cellPadding} text-sm`} style={cellMuted}>
        {topicLabel}
      </td>
      <td className={`${POLISH_CLASS.cellPadding} text-xs whitespace-nowrap`} style={cellMuted}>
        {format(new Date(createdAt), 'MMM d, yyyy')}
      </td>
      <td className={POLISH_CLASS.cellPadding}>
        <span className="font-medium line-clamp-1" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
        <div className={`flex items-center gap-3 mt-0.5 text-xs`} style={{ color: POLISH_THEME.theadText }}>
          <span>{requesterDisplayName}</span>
          {commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              <span className="tabular-nums">{commentCount}</span>
            </span>
          )}
        </div>
      </td>
      <td className={`${POLISH_CLASS.cellPadding} text-xs`} style={cellDim}>
        {studioName}
      </td>
      <td className={POLISH_CLASS.cellPadding}>
        <StatusBadge status={status} />
      </td>
      <td className={POLISH_CLASS.cellPadding}>
        <PriorityBadge priority={priority} muted={isResolvedOrClosed} />
      </td>
      <td className={`${POLISH_CLASS.cellPadding} text-xs whitespace-nowrap`} style={{ color: POLISH_THEME.theadText }}>
        {updatedAt}
      </td>
    </tr>
  );
}

const PortalTicketTableRowWithBadges = memo(PortalTicketTableRowComponent);

export function PortalTicketTableRow(props: PortalTicketTableRowProps) {
  return <PortalTicketTableRowWithBadges {...props} />;
}
