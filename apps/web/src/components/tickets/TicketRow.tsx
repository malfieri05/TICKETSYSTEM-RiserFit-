'use client';

import { memo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  isBefore,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfDay,
} from 'date-fns';
import { MessageCircle, Plus } from 'lucide-react';
import type { TicketStatus, TicketTagItem } from '@/types';
import { StatusBadge } from '@/components/ui/Badge';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { getMutationErrorMessage } from '@/lib/utils';
import { InstantTooltip, TicketTagCapsule } from '@/components/tickets/TicketTagCapsule';
import { TicketTagAddPopover } from '@/components/tickets/TicketTagAddPopover';

function tagAddErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { code?: string; message?: string } } })?.response
    ?.data;
  const code = data?.code;
  if (code === 'TAG_ALREADY_EXISTS_ON_TICKET') {
    return 'That tag is already on this ticket.';
  }
  if (code === 'TAG_LIMIT_REACHED') {
    return 'This ticket already has the maximum number of tags.';
  }
  if (code === 'INVALID_TAG_INPUT') {
    return typeof data?.message === 'string' ? data.message : 'Invalid tag label.';
  }
  if (code === 'FORBIDDEN_TAG_CREATION') {
    return 'You do not have permission to add tags.';
  }
  if (code === 'TICKET_NOT_FOUND') {
    return 'Ticket not found.';
  }
  return getMutationErrorMessage(err, 'Could not add tag.');
}

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

/** Feed due column: past due (red date), Today (orange), Tomorrow (yellow), else short date. */
export function FeedDueDateCell({ dueDateIso }: { dueDateIso: string }) {
  if (!dueDateIso?.trim()) {
    return <span className="text-xs" style={{ color: POLISH_THEME.innerBorder }}>—</span>;
  }
  const d = parseISO(dueDateIso);
  if (Number.isNaN(d.getTime())) {
    return <span className="text-xs" style={{ color: POLISH_THEME.innerBorder }}>—</span>;
  }
  const dueDay = startOfDay(d);
  const todayStart = startOfDay(new Date());
  if (isBefore(dueDay, todayStart)) {
    return (
      <span className="text-xs font-medium whitespace-nowrap" style={{ color: '#dc2626' }}>
        {format(d, 'MMM d')}
      </span>
    );
  }
  if (isToday(d)) {
    return (
      <span className="text-xs font-medium" style={{ color: '#ea580c' }}>
        Today
      </span>
    );
  }
  if (isTomorrow(d)) {
    return (
      <span className="text-xs font-medium" style={{ color: '#ca8a04' }}>
        Tomorrow
      </span>
    );
  }
  return (
    <span className="text-xs whitespace-nowrap" style={cellMuted}>
      {format(d, 'MMM d')}
    </span>
  );
}

/** Feed created column: Today / Yesterday (same muted color as dates), else MMM d. */
export function FeedCreatedAtCell({ createdAtIso }: { createdAtIso: string }) {
  if (!createdAtIso?.trim()) {
    return <span className="text-xs" style={{ color: POLISH_THEME.innerBorder }}>—</span>;
  }
  const d = parseISO(createdAtIso);
  if (Number.isNaN(d.getTime())) {
    return <span className="text-xs" style={{ color: POLISH_THEME.innerBorder }}>—</span>;
  }
  if (isToday(d)) {
    return <span className="text-xs whitespace-nowrap" style={cellMuted}>Today</span>;
  }
  if (isYesterday(d)) {
    return <span className="text-xs whitespace-nowrap" style={cellMuted}>Yesterday</span>;
  }
  return (
    <span className="text-xs whitespace-nowrap" style={cellMuted}>
      {format(d, 'MMM d')}
    </span>
  );
}

/** Above app chrome (Header z-30, drawers, etc.); portal avoids overflow clipping on feed scrollers. */
const REQUESTER_TOOLTIP_Z = 100_000;

function RequesterAvatar({ displayName }: { displayName: string }) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const syncPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: r.left + r.width / 2,
      top: r.top - 6,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncPosition();
    const onMove = () => syncPosition();
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
    };
  }, [open, syncPosition]);

  const initials = getInitials(displayName);

  const panelStyle = {
    background: 'var(--color-bg-surface-raised)',
    border: `1px solid ${POLISH_THEME.listBorder}`,
    color: 'var(--color-text-primary)',
    boxShadow: 'var(--shadow-panel)',
    zIndex: REQUESTER_TOOLTIP_Z,
    left: pos.left,
    top: pos.top,
    transform: 'translate(-50%, -100%)',
  } as const;

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={() => {
          syncPosition();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
      >
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
      </div>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
            style={panelStyle}
          >
            {displayName}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Canonical feed header definitions — used by all ticket list surfaces
 * (tickets page, inbox/actionable, and portal) to ensure consistent column order.
 *
 * Column order: ID | Title | Created | Tags | Status | Due date | Progress | Requester
 * (comment count appears inline after title when there are comments.)
 */
/** Columns whose header and cell content should be center-aligned. */
const CENTERED_COLS = new Set([
  'created',
  'tags',
  'status',
  'dueDate',
  'progress',
  'requester',
]);

/**
 * Returns the correct `<th>` class for a given column key.
 * Created, Tags, Status, Due date, Progress, Requester are centered; ID and Title stay left.
 */
export function getThClass(key: string): string {
  return CENTERED_COLS.has(key) ? POLISH_CLASS.tableHeaderCenter : POLISH_CLASS.tableHeader;
}

export const CANONICAL_FEED_HEADERS = [
  { label: 'ID', key: 'id' },
  { label: 'Title', key: 'title' },
  { label: 'Created', key: 'created' },
  { label: 'Tags', key: 'tags' },
  { label: 'Status', key: 'status' },
  { label: 'Due date', key: 'dueDate' },
  { label: 'Progress', key: 'progress' },
  { label: 'Requester', key: 'requester' },
] as const;

export interface TicketTableRowProps {
  id: string;
  title: string;
  /** Optional secondary line shown under the title (e.g. "Topic · Studio" for portal rows). */
  subLabel?: string;
  status: TicketStatus;
  /** ISO due date from API */
  dueDate: string;
  createdAt: string;
  tags?: TicketTagItem[];
  /** When true, show inline add control (non–studio users). */
  canAddTag?: boolean;
  /** Called with trimmed label; parent runs API + cache invalidation. */
  onAddTag?: (ticketId: string, label: string) => Promise<void>;
  /** When true, disables Save for this row while a tag request is in flight. */
  isAddingTag?: boolean;
  commentCount: number;
  completedSubtasks: number;
  totalSubtasks: number;
  requesterDisplayName: string;
  /** Highlight the row as selected (used by drawer-based ticket list). Defaults to false. */
  isSelected?: boolean;
  onSelect: (id: string) => void;
}

function TicketTableRowComponent({
  id,
  title,
  subLabel,
  status,
  dueDate,
  createdAt,
  tags = [],
  canAddTag = false,
  onAddTag,
  isAddingTag = false,
  commentCount,
  completedSubtasks,
  totalSubtasks,
  requesterDisplayName,
  isSelected = false,
  onSelect,
}: TicketTableRowProps) {
  const pct = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const addTagBtnRef = useRef<HTMLButtonElement>(null);

  const cancelTagEdit = useCallback(() => {
    setTagEditorOpen(false);
    setTagInput('');
    setTagError(null);
  }, []);

  const saveTag = useCallback(async () => {
    if (!onAddTag) return;
    const label = tagInput.trim();
    if (!label) {
      setTagError('Enter a tag label.');
      return;
    }
    if (label.length > 80) {
      setTagError('Tag is too long (max 80 characters).');
      return;
    }
    setTagError(null);
    try {
      await onAddTag(id, label);
      cancelTagEdit();
    } catch (e) {
      setTagError(tagAddErrorMessage(e));
    }
  }, [cancelTagEdit, id, onAddTag, tagInput]);

  return (
    <tr
      onClick={() => onSelect(id)}
      role="button"
      tabIndex={0}
      data-selected={isSelected ? 'true' : 'false'}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(id)}
      className={`ticket-feed-table-row cursor-pointer ${POLISH_CLASS.rowTransition} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--color-accent)]`}
      style={{
        borderBottom: rowBorder,
        background: isSelected ? POLISH_THEME.rowSelected : undefined,
      }}
    >
      {/* 1. ID */}
      <td className={`${POLISH_CLASS.cellPadding} text-xs font-mono whitespace-nowrap`} style={cellDim}>
        {formatTicketId(id)}
      </td>

      {/* 2. Title (+ optional sub-label); comment icon + count inline when there are comments */}
      <td className={POLISH_CLASS.cellPadding}>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="min-w-0 flex-1 font-medium line-clamp-1"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </span>
            {commentCount > 0 ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-xs"
                style={cellDim}
                aria-label={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
              >
                <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
                <span className="tabular-nums">{commentCount}</span>
              </span>
            ) : null}
          </div>
          {subLabel ? (
            <span className="mt-0.5 block truncate text-xs" style={cellDim}>{subLabel}</span>
          ) : null}
        </div>
      </td>

      {/* 3. Created — Today / Yesterday / MMM d (muted only, no accent colors) */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`}>
        <FeedCreatedAtCell createdAtIso={createdAt} />
      </td>

      {/* 4. Tags — fixed max-width rail centered in column; + always same x; tags scroll to the right */}
      <td
        className={`${POLISH_CLASS.cellPadding} align-middle text-center`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex w-full max-w-[280px] items-center gap-1.5">
          {canAddTag && onAddTag ? (
            <>
              <InstantTooltip content="Add tag" compact className="inline-flex shrink-0">
                <button
                  ref={addTagBtnRef}
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-[var(--color-bg-surface-raised)]"
                  style={{
                    border: `1px dashed ${POLISH_THEME.listBorder}`,
                    color: POLISH_THEME.metaSecondary,
                  }}
                  aria-label="Add tag"
                  aria-expanded={tagEditorOpen}
                  onClick={() => {
                    if (tagEditorOpen) {
                      cancelTagEdit();
                    } else {
                      setTagError(null);
                      setTagEditorOpen(true);
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </InstantTooltip>
              <TicketTagAddPopover
                open={tagEditorOpen}
                anchorRef={addTagBtnRef}
                tagInput={tagInput}
                onTagInputChange={setTagInput}
                tagError={tagError}
                onSave={() => void saveTag()}
                onCancel={cancelTagEdit}
                isAddingTag={isAddingTag}
              />
            </>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="ticket-tags-lateral-scroll min-w-0 overflow-x-auto overflow-y-hidden">
              <div className="flex min-h-[1.75rem] w-max max-w-none items-center justify-start gap-1 whitespace-nowrap">
                {tags.length === 0 ? (
                  !(canAddTag && onAddTag) ? (
                    <span className="shrink-0 text-xs" style={{ color: POLISH_THEME.innerBorder }}>
                      —
                    </span>
                  ) : null
                ) : (
                  tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex max-w-[min(140px,45vw)] shrink-0 items-center"
                    >
                      <TicketTagCapsule name={t.name} />
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </td>

      {/* 5. Status */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`}>
        <div className="flex justify-center">
          <StatusBadge status={status} />
        </div>
      </td>

      {/* 6. Due date — MMM d; Today / Tomorrow labels; past due in red */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`}>
        <FeedDueDateCell dueDateIso={dueDate} />
      </td>

      {/* 7. Progress — green bar + count, centered */}
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

      {/* 8. Requester — circle with initials + hover tooltip with full name */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`}>
        <div className="flex justify-center">
          <RequesterAvatar displayName={requesterDisplayName || '—'} />
        </div>
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
  dueDate: string;
  updatedAt: string;
  commentCount: number;
  completedSubtasks?: number;
  totalSubtasks?: number;
  isResolvedOrClosed: boolean;
  onSelect: (id: string) => void;
  tags?: TicketTagItem[];
  canAddTag?: boolean;
  onAddTag?: (ticketId: string, label: string) => Promise<void>;
  isAddingTag?: boolean;
}

export function PortalTicketTableRow({
  id,
  title,
  topicLabel,
  createdAt,
  requesterDisplayName,
  studioName,
  status,
  dueDate,
  commentCount,
  completedSubtasks = 0,
  totalSubtasks = 0,
  onSelect,
  tags,
  canAddTag,
  onAddTag,
  isAddingTag,
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
      dueDate={dueDate}
      createdAt={createdAt}
      tags={tags}
      canAddTag={canAddTag}
      onAddTag={onAddTag}
      isAddingTag={isAddingTag}
      commentCount={commentCount}
      completedSubtasks={completedSubtasks}
      totalSubtasks={totalSubtasks}
      requesterDisplayName={requesterDisplayName}
      isSelected={false}
      onSelect={onSelect}
    />
  );
}
