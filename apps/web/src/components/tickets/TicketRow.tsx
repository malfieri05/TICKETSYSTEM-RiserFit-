'use client';

import { memo, useState, useCallback, useRef, useLayoutEffect, type CSSProperties } from 'react';
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
import type { TagColor, TicketStatus, TicketTagItem } from '@/types';
import { StatusBadge } from '@/components/ui/Badge';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { TOOLTIP_PORTAL_Z_INDEX, TOOLTIP_VIEWPORT_MARGIN } from '@/lib/tooltip-layer';
import { getMutationErrorMessage } from '@/lib/utils';
import { getDisplayNameInitials } from '@/lib/user-display';
import {
  FeedTagHoverTooltipContent,
  InstantTooltip,
  TicketTagCapsule,
} from '@/components/tickets/TicketTagCapsule';
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

/** Bottom rule on body cells — `border-separate` tables do not paint `tr` borders (CSS2.1). */
const feedRowTdDivider: CSSProperties = { borderBottom: `1px solid ${POLISH_THEME.innerBorder}` };
const cellMuted = { color: POLISH_THEME.metaSecondary } as const;
const cellDim = { color: POLISH_THEME.metaDim } as const;

/** Canonical ticket ID display: first 8 chars of internal CUID. */
export function formatTicketId(id: string): string {
  return id.slice(0, 8);
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
      <span className="text-xs font-medium whitespace-nowrap" style={{ color: POLISH_THEME.dueDateOverdue }}>
        {format(d, 'MMM d')}
      </span>
    );
  }
  if (isToday(d)) {
    return (
      <span className="text-xs font-medium" style={{ color: POLISH_THEME.dueDateToday }}>
        Today
      </span>
    );
  }
  if (isTomorrow(d)) {
    return (
      <span className="text-xs font-medium" style={{ color: POLISH_THEME.dueDateSoon }}>
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

/** List/detail `requester`: API returns `User.name`; types often include `displayName`. */
export type TicketRequesterLike = {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
};

/** Primary line for avatar + tooltip: prefer display name, then legal name, then email. */
export function ticketRequesterPrimaryLine(requester: TicketRequesterLike | null | undefined): string {
  if (!requester) return '—';
  const d = requester.displayName?.trim();
  const n = requester.name?.trim();
  const e = requester.email?.trim();
  return d || n || e || '—';
}

export function ticketRequesterEmail(requester: TicketRequesterLike | null | undefined): string | undefined {
  const e = requester?.email?.trim();
  return e || undefined;
}

export function RequesterAvatar({
  displayName,
  tooltipEmail,
}: {
  displayName: string;
  /** When set (and name is present), tooltip shows name as primary line and email as muted subtext. */
  tooltipEmail?: string;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const nameLine = displayName.trim();
  const emailLine = tooltipEmail?.trim();
  const primaryText = nameLine || emailLine || '—';
  const secondaryText =
    nameLine && emailLine && emailLine.toLowerCase() !== nameLine.toLowerCase() ? emailLine : undefined;

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;
    const tr = trigger.getBoundingClientRect();
    let left = tr.left + tr.width / 2;
    const top = tr.top - 6;
    if (panel) {
      const w = panel.getBoundingClientRect().width;
      const half = w / 2;
      const m = TOOLTIP_VIEWPORT_MARGIN;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
      left = Math.max(m + half, Math.min(vw - m - half, left));
    }
    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition, primaryText, secondaryText]);

  const initials = getDisplayNameInitials(nameLine || emailLine || '—');

  const panelStyle = {
    background: 'var(--color-bg-surface-raised)',
    border: `1px solid ${POLISH_THEME.listBorder}`,
    color: 'var(--color-text-primary)',
    boxShadow: 'var(--shadow-panel)',
    zIndex: TOOLTIP_PORTAL_Z_INDEX,
    left: pos.left,
    top: pos.top,
    transform: 'translate(-50%, -100%)',
  } as const;

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={() => setOpen(true)}
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
            ref={panelRef}
            role="tooltip"
            className="pointer-events-none fixed box-border w-max min-w-[10rem] max-w-[min(22rem,calc(100vw-1rem))] rounded-lg px-3 py-2 text-center text-xs leading-snug"
            style={panelStyle}
          >
            <div className="font-semibold break-words" style={{ color: 'var(--color-text-primary)' }}>
              {primaryText}
            </div>
            {secondaryText != null && (
              <div
                className="mt-1.5 min-w-0 max-w-full overflow-x-auto text-center text-[11px] font-medium [scrollbar-width:thin]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span className="inline-block min-w-full whitespace-nowrap">{secondaryText}</span>
              </div>
            )}
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
 * Column order: ID | Title | Status | Created | Tags | Due date | Progress | Requester
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
  { label: 'Status', key: 'status' },
  { label: 'Created', key: 'created' },
  { label: 'Tags', key: 'tags' },
  { label: 'Due date', key: 'dueDate' },
  { label: 'Progress', key: 'progress' },
  { label: 'Requester', key: 'requester' },
] as const;

const FEED_HEADER_COUNT = CANONICAL_FEED_HEADERS.length;

/**
 * Per-`<th>` chrome for the canonical feed header row: chrome background + rounded top corners;
 * light bottom rule only (no dark outline on top/sides).
 */
export function getFeedTheadThStyle(index: number, total: number = FEED_HEADER_COUNT): CSSProperties {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  return {
    background: POLISH_THEME.feedTheadBg,
    borderBottom: `1px solid ${POLISH_THEME.listBorder}`,
    ...(isFirst ? { borderTopLeftRadius: 'var(--radius-lg)' } : {}),
    ...(isLast ? { borderTopRightRadius: 'var(--radius-lg)' } : {}),
  };
}

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
  /** Called with trimmed label + chosen color; parent runs API + cache invalidation. */
  onAddTag?: (ticketId: string, label: string, color: TagColor) => Promise<void>;
  /** Remove tag after confirmation; same permission as add (department/admin). */
  onRemoveTag?: (ticketId: string, tagId: string) => Promise<void>;
  /** Tag id currently being removed (for loading state on that capsule). */
  removingTagId?: string | null;
  /** When true, disables Save for this row while a tag request is in flight. */
  isAddingTag?: boolean;
  commentCount: number;
  completedSubtasks: number;
  totalSubtasks: number;
  requesterDisplayName: string;
  /** Tooltip subtext under the name on requester avatar hover (typically email). */
  requesterEmail?: string;
  /** Highlight the row as selected (used by drawer-based ticket list). Defaults to false. */
  isSelected?: boolean;
  /** When false, ID cell is a slim placeholder (column collapsed). Defaults to true. */
  showIdColumn?: boolean;
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
  onRemoveTag,
  removingTagId = null,
  isAddingTag = false,
  commentCount,
  completedSubtasks,
  totalSubtasks,
  requesterDisplayName,
  requesterEmail,
  isSelected = false,
  showIdColumn = true,
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

  const saveTag = useCallback(async (color: TagColor) => {
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
      await onAddTag(id, label, color);
      cancelTagEdit();
    } catch (e) {
      setTagError(tagAddErrorMessage(e));
    }
  }, [cancelTagEdit, id, onAddTag, tagInput]);

  return (
    <tr
      data-ticket-id={id}
      onClick={() => onSelect(id)}
      role="button"
      tabIndex={-1}
      data-selected={isSelected ? 'true' : 'false'}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(id)}
      className={`ticket-feed-table-row cursor-pointer ${POLISH_CLASS.rowTransition} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--color-accent)]`}
      style={{
        background: isSelected ? POLISH_THEME.rowSelected : undefined,
      }}
    >
      {/* 1. ID — width/col animate via TicketFeedColgroup; text fades for smooth expand/collapse */}
      <td
        className={`py-3.5 align-middle text-xs font-mono transition-[padding-left,padding-right] duration-300 ease-out ${
          showIdColumn ? 'px-4' : 'px-2'
        }`}
        style={{ ...feedRowTdDivider, ...cellDim }}
      >
        <div
          className="whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out"
          style={{
            maxWidth: showIdColumn ? '12rem' : 0,
            opacity: showIdColumn ? 1 : 0,
            overflow: 'hidden',
          }}
        >
          {formatTicketId(id)}
        </div>
      </td>

      {/* 2. Title (+ sub-label); with comments: capped title track (40ch) + fixed comment track — icons share one vertical line */}
      <td className={POLISH_CLASS.cellPadding} style={feedRowTdDivider}>
        <div className="min-w-0">
          {commentCount > 0 ? (
            <div
              className="grid w-full min-w-0 items-center gap-x-1"
              style={{
                gridTemplateColumns: 'minmax(0, min(40ch, calc(100% - 3.5rem))) 2.75rem',
              }}
            >
              <span
                className="min-w-0 truncate font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {title}
              </span>
              <span
                className="inline-flex min-w-0 items-center justify-end gap-0.5 text-xs"
                style={cellDim}
                aria-label={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
              >
                <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
                <span className="tabular-nums">{commentCount}</span>
              </span>
            </div>
          ) : (
            <span
              className="block min-w-0 w-full max-w-[min(100%,46ch)] truncate font-medium"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </span>
          )}
          {subLabel ? (
            <span className="mt-0.5 block truncate text-xs" style={cellDim}>{subLabel}</span>
          ) : null}
        </div>
      </td>

      {/* 3. Status */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`} style={feedRowTdDivider}>
        <div className="flex justify-center">
          <StatusBadge status={status} />
        </div>
      </td>

      {/* 4. Created — Today / Yesterday / MMM d (muted only, no accent colors) */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`} style={feedRowTdDivider}>
        <FeedCreatedAtCell createdAtIso={createdAt} />
      </td>

      {/* 5. Tags — fixed max-width rail centered in column; + always same x; tags scroll to the right */}
      <td
        className={`${POLISH_CLASS.cellPadding} align-middle text-center`}
        style={feedRowTdDivider}
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
                  tabIndex={-1}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-[box-shadow,transform,background-color] duration-200 ease-out [box-shadow:var(--shadow-card)] hover:-translate-y-px hover:[box-shadow:var(--shadow-panel)] hover:bg-[var(--color-bg-surface-raised)] active:translate-y-0 active:[box-shadow:var(--shadow-card)]"
                  style={{
                    border: `1px dashed ${POLISH_THEME.listBorder}`,
                    color: POLISH_THEME.metaSecondary,
                    background: 'var(--color-bg-surface-raised)',
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
                onSave={(color) => void saveTag(color)}
                onCancel={cancelTagEdit}
                isAddingTag={isAddingTag}
              />
            </>
          ) : null}
          <div className="min-w-0 flex-1">
            <div
              className="ticket-tags-lateral-scroll min-w-0 overflow-x-auto overflow-y-hidden"
              style={{ marginBottom: 'calc(-4px * 0.3)' }}
            >
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
                      <TicketTagCapsule
                        tagId={t.id}
                        name={t.name}
                        color={t.color}
                        removeButtonTabIndex={-1}
                        tooltipTypography="requesterMatch"
                        removable={!!onRemoveTag}
                        onRemoveTag={
                          onRemoveTag ? (tagId) => onRemoveTag(id, tagId) : undefined
                        }
                        isRemoving={removingTagId === t.id}
                        hoverText={
                          <FeedTagHoverTooltipContent
                            name={t.name}
                            createdAt={t.createdAt}
                            createdByDisplayName={t.createdBy?.name ?? ''}
                          />
                        }
                      />
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </td>

      {/* 6. Due date — MMM d; Today / Tomorrow labels; past due in red */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`} style={feedRowTdDivider}>
        <FeedDueDateCell dueDateIso={dueDate} />
      </td>

      {/* 7. Progress — green bar + count, centered */}
      <td className={`${POLISH_CLASS.cellPadding} text-center`} style={feedRowTdDivider}>
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
      <td className={`${POLISH_CLASS.cellPadding} text-center`} style={feedRowTdDivider}>
        <div className="flex justify-center">
          <RequesterAvatar
            displayName={requesterDisplayName || '—'}
            tooltipEmail={requesterEmail}
          />
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
  onRemoveTag?: (ticketId: string, tagId: string) => Promise<void>;
  removingTagId?: string | null;
  isAddingTag?: boolean;
  requesterEmail?: string;
}

export function PortalTicketTableRow({
  id,
  title,
  topicLabel,
  createdAt,
  requesterDisplayName,
  requesterEmail,
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
  onRemoveTag,
  removingTagId,
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
      onRemoveTag={onRemoveTag}
      removingTagId={removingTagId}
      isAddingTag={isAddingTag}
      commentCount={commentCount}
      completedSubtasks={completedSubtasks}
      totalSubtasks={totalSubtasks}
      requesterDisplayName={requesterDisplayName}
      requesterEmail={requesterEmail}
      isSelected={false}
      onSelect={onSelect}
    />
  );
}
