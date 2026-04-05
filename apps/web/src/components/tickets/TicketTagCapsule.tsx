'use client';

import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { POLISH_THEME } from '@/lib/polish';
import {
  TOOLTIP_PORTAL_Z_INDEX,
  TOOLTIP_VIEWPORT_MARGIN,
  TOOLTIP_MAX_WIDTH_CLASS,
  CONFIRM_DIALOG_Z_INDEX_BACKDROP,
  CONFIRM_DIALOG_Z_INDEX_PANEL,
} from '@/lib/tooltip-layer';
import { Button } from '@/components/ui/Button';

/** Solid capsule; label + remove control use black for contrast on pastel fills. */
const TAG_CAPSULE_FG = '#0a0a0a';

const TAG_COLOR_STYLES: Record<string, { background: string; color: string; border: string }> = {
  red:    { background: '#fca5a5', color: TAG_CAPSULE_FG, border: '1.25px solid #dc2626' },
  orange: { background: '#fdba74', color: TAG_CAPSULE_FG, border: '1.25px solid #ea580c' },
  yellow: { background: '#fde047', color: TAG_CAPSULE_FG, border: '1.25px solid #ca8a04' },
  green:  { background: '#86efac', color: TAG_CAPSULE_FG, border: '1.25px solid #16a34a' },
  blue:   { background: '#7dd3fc', color: TAG_CAPSULE_FG, border: '1.25px solid #0284c7' },
  purple: { background: '#e9d5ff', color: TAG_CAPSULE_FG, border: '1.25px solid #9333ea' },
};

function getPillStyle(color?: string | null) {
  return (color && TAG_COLOR_STYLES[color]) ? TAG_COLOR_STYLES[color] : TAG_COLOR_STYLES.orange;
}

const TOOLTIP_GAP = 6;

/** Exported for panel tooltip line spacing; base 11px × 1.75 × 0.9 */
export const TICKET_TAG_TOOLTIP_FONT_PX = 11 * 1.75 * 0.9;

/** Panel + feed tag hover: Added / By lines (same primary/sub scale as RequesterAvatar). */
export function TicketTagHoverMetaContent({
  createdAt,
  createdByDisplayName,
}: {
  createdAt: string;
  createdByDisplayName: string;
}) {
  const d = new Date(createdAt);
  const day = format(d, 'EEE');
  const whenTime = format(d, 'h:mm a');
  const shortDate = format(d, 'M/d/yy');
  const by = createdByDisplayName.trim() || 'Unknown';
  const muted = 'var(--color-text-muted)';
  return (
    <>
      <div className="text-[11px] font-medium break-words">
        <span className="italic" style={{ color: muted }}>
          Added:{' '}
        </span>
        <span style={{ color: POLISH_THEME.info }}>{day}</span>
        <span style={{ color: muted }}>{' · '}</span>
        <span style={{ color: POLISH_THEME.info }}>{whenTime}</span>
        <span style={{ color: muted }}>{' · '}</span>
        <span style={{ color: POLISH_THEME.info }}>{shortDate}</span>
      </div>
      <div className="mt-1.5 text-[11px] font-medium break-words" style={{ color: muted }}>
        <span className="italic">By:</span>
        <span className="not-italic"> {by}</span>
      </div>
    </>
  );
}

/** Feed row: same tooltip chrome as panel; tag name in quotes above Added/By. */
export function FeedTagHoverTooltipContent({
  name,
  createdAt,
  createdByDisplayName,
}: {
  name: string;
  createdAt: string;
  createdByDisplayName: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="font-semibold break-words"
        style={{ color: 'var(--color-text-primary)' }}
      >
        &ldquo;{name}&rdquo;
      </div>
      <div className="mt-2.5 flex w-full flex-col items-center">
        <TicketTagHoverMetaContent createdAt={createdAt} createdByDisplayName={createdByDisplayName} />
      </div>
    </div>
  );
}

type InstantTooltipProps = {
  content: ReactNode;
  children: ReactNode;
  /** Wrapper classes for the hover target */
  className?: string;
  /**
   * Short hints (e.g. control labels): smaller type and padding; same theme + above placement.
   */
  compact?: boolean;
  /** Default centered above target; `left` aligns with trigger’s left edge (e.g. dashboard help). */
  align?: 'center' | 'left';
  /** Override tooltip `max-width` (CSS value for inline style). */
  maxWidth?: string;
  /** Set on the portaled tooltip node for `aria-describedby` on the trigger. */
  tooltipId?: string;
  /** Default `above`; use `below` for triggers near the top of the viewport (e.g. maintenance count). */
  placement?: 'above' | 'below';
  /**
   * When true, do not flip to the opposite vertical side when near the viewport edge
   * (tooltip stays above/below per `placement`; position is clamped instead).
   */
  preventPlacementFlip?: boolean;
  /**
   * `tagDefault`: larger line-height scale for tag labels (legacy panel).
   * `requesterMatch`: same base/sub text scale as RequesterAvatar (`text-xs` + 11px muted subline).
   */
  typography?: 'tagDefault' | 'requesterMatch';
};

/**
 * Hover label with no delay, portaled to `document.body` so it is not clipped
 * by overflow regions. Clamps horizontally (and flips above/below when needed) so the panel
 * keeps a readable width and stays on-screen.
 */
export function InstantTooltip({
  content,
  children,
  className,
  compact,
  align = 'center',
  maxWidth: maxWidthProp,
  tooltipId,
  placement: placementProp = 'above',
  preventPlacementFlip = false,
  typography = 'tagDefault',
}: InstantTooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, transform: 'translate(-50%, -100%)' });

  const reposition = useCallback(() => {
    const wrap = wrapRef.current;
    const panel = panelRef.current;
    if (!wrap || typeof window === 'undefined') return;
    const tr = wrap.getBoundingClientRect();
    const m = TOOLTIP_VIEWPORT_MARGIN;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let placementEff: 'above' | 'below' = placementProp;

    let top =
      placementEff === 'below' ? tr.bottom + TOOLTIP_GAP : tr.top - TOOLTIP_GAP;
    let transform: string =
      placementEff === 'below'
        ? align === 'center'
          ? 'translate(-50%, 0)'
          : 'translate(0, 0)'
        : align === 'center'
          ? 'translate(-50%, -100%)'
          : 'translateY(-100%)';

    let left = align === 'center' ? tr.left + tr.width / 2 : tr.left;

    if (panel) {
      const pr = panel.getBoundingClientRect();
      const w = pr.width;
      const h = pr.height;

      if (w > 0) {
        if (align === 'center') {
          const half = w / 2;
          const cx = tr.left + tr.width / 2;
          left = Math.max(m + half, Math.min(vw - m - half, cx));
        } else {
          left = Math.max(m, Math.min(vw - m - w, left));
        }
      }

      if (h > 0) {
        if (!preventPlacementFlip) {
          if (placementEff === 'above') {
            const topEdge = top - h;
            if (topEdge < m) {
              placementEff = 'below';
              top = tr.bottom + TOOLTIP_GAP;
              transform =
                align === 'center' ? 'translate(-50%, 0)' : 'translate(0, 0)';
            }
          } else if (top + h > vh - m) {
            placementEff = 'above';
            top = tr.top - TOOLTIP_GAP;
            transform =
              align === 'center' ? 'translate(-50%, -100%)' : 'translateY(-100%)';
          }
        }

        if (placementEff === 'above') {
          const topEdge = top - h;
          if (topEdge < m) {
            top = m + h;
          }
        } else if (top + h > vh - m) {
          top = vh - m - h;
        }
      }
    }

    setPos({ top, left, transform });
  }, [align, placementProp, preventPlacementFlip]);

  const show = useCallback(() => {
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const raf = requestAnimationFrame(() => reposition());
    const onMove = () => reposition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, reposition, content]);

  const textAlign = align === 'left' ? 'text-left' : 'text-center';
  const maxWidthStyle = maxWidthProp ?? undefined;
  const requesterMatch = typography === 'requesterMatch' && !compact;

  const compactClass = compact
    ? `pointer-events-none fixed box-border rounded-lg px-2.5 py-1.5 ${textAlign} text-xs font-medium leading-tight shadow-[var(--shadow-panel)] ${TOOLTIP_MAX_WIDTH_CLASS} whitespace-nowrap [scrollbar-width:thin] overflow-x-auto overflow-y-hidden`
    : `pointer-events-none fixed box-border w-max rounded-lg px-3 py-2 ${textAlign} leading-snug shadow-[var(--shadow-panel)] break-words whitespace-pre-line ${TOOLTIP_MAX_WIDTH_CLASS} ${
        requesterMatch ? 'min-w-[10rem] text-xs' : 'font-medium'
      }`;

  const tooltip =
    open && typeof document !== 'undefined'
      ? createPortal(
          <span
            ref={panelRef}
            id={tooltipId}
            role="tooltip"
            className={compactClass}
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.transform,
              zIndex: TOOLTIP_PORTAL_Z_INDEX,
              maxWidth: maxWidthStyle,
              fontSize: compact || requesterMatch ? undefined : `${TICKET_TAG_TOOLTIP_FONT_PX}px`,
              background: 'var(--color-bg-surface-raised)',
              color: 'var(--color-text-primary)',
              border: `1px solid ${POLISH_THEME.listBorder}`,
            }}
          >
            {content}
          </span>,
          document.body,
        )
      : null;

  return (
    <span
      ref={wrapRef}
      className={className}
      aria-describedby={open && tooltipId ? tooltipId : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {tooltip}
    </span>
  );
}

/** Matches `ThemeBadge`: same height/typography as Status and Priority capsules */
const TAG_CAPSULE_BADGE_CLASS =
  'inline-flex max-w-full min-w-0 items-center truncate px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]';

type RemoveTagConfirmProps = {
  name: string;
  open: boolean;
  isRemoving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function RemoveTagConfirmDialog({ name, open, isRemoving, onCancel, onConfirm }: RemoveTagConfirmProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 cursor-default border-0 p-0"
        style={{
          zIndex: CONFIRM_DIALOG_Z_INDEX_BACKDROP,
          background: 'rgba(0,0,0,0.35)',
        }}
        aria-label="Dismiss"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-tag-confirm-title"
        aria-describedby="remove-tag-confirm-desc"
        className="fixed left-1/2 top-1/2 w-[min(calc(100vw-2rem),20rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-center shadow-[var(--shadow-panel)]"
        style={{
          zIndex: CONFIRM_DIALOG_Z_INDEX_PANEL,
          background: 'var(--color-bg-surface-raised)',
          border: `1px solid ${POLISH_THEME.listBorder}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p id="remove-tag-confirm-title" className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Remove Tag?
        </p>
        <p
          id="remove-tag-confirm-desc"
          className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Remove tag &quot;{name}&quot; from this ticket.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" type="button" onClick={onConfirm} loading={isRemoving}>
            Remove
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}

type CapsuleProps = {
  name: string;
  /** Global tag id (required when `removable` + `onRemoveTag`). */
  tagId?: string;
  /** Use `-1` in dense lists (e.g. ticket feed) so Tab skips remove controls between filters. */
  removeButtonTabIndex?: number;
  color?: string | null;
  /**
   * When set (e.g. panel view), hover tooltip shows this instead of the tag name
   * (string or rich content).
   */
  hoverText?: ReactNode;
  /** Use with rich `hoverText` to match Requester column tooltip typography. */
  tooltipTypography?: 'tagDefault' | 'requesterMatch';
  removable?: boolean;
  onRemoveTag?: (tagId: string) => Promise<void>;
  isRemoving?: boolean;
};

export function TicketTagCapsule({
  name,
  tagId,
  removeButtonTabIndex,
  color,
  hoverText,
  tooltipTypography = 'tagDefault',
  removable = false,
  onRemoveTag,
  isRemoving = false,
}: CapsuleProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tooltipContent = hoverText ?? name;
  const pillStyle = getPillStyle(color);
  const showRemove = Boolean(removable && tagId && onRemoveTag);

  const handleConfirmRemove = useCallback(async () => {
    if (!tagId || !onRemoveTag) return;
    try {
      await onRemoveTag(tagId);
      setConfirmOpen(false);
    } catch {
      /* parent handles error feedback; keep dialog open */
    }
  }, [onRemoveTag, tagId]);

  return (
    <>
      <span className="inline-flex max-w-full min-w-0 items-center align-middle rounded-full overflow-hidden">
        <span
          className="inline-flex max-w-full min-w-0 items-center rounded-full box-border"
          style={{
            background: pillStyle.background,
            border: pillStyle.border,
          }}
        >
          <InstantTooltip
            content={tooltipContent}
            typography={tooltipTypography}
            className="inline-flex min-w-0 max-w-full flex-1 items-center"
          >
            <span className={TAG_CAPSULE_BADGE_CLASS} style={{ color: pillStyle.color }}>
              {name}
            </span>
          </InstantTooltip>
          {showRemove ? (
            <button
              type="button"
              {...(removeButtonTabIndex !== undefined ? { tabIndex: removeButtonTabIndex } : {})}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 disabled:opacity-40"
              style={{
                color: pillStyle.color,
                marginRight: '2px',
              }}
              aria-label={`Remove tag ${name}`}
              disabled={isRemoving}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
          ) : null}
        </span>
      </span>
      <RemoveTagConfirmDialog
        name={name}
        open={confirmOpen}
        isRemoving={isRemoving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirmRemove()}
      />
    </>
  );
}
