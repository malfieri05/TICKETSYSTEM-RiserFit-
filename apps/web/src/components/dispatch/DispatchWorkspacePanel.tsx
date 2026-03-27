'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronDown, MapPin } from 'lucide-react';
import { dispatchApi, ticketsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { LocationLink } from '@/components/ui/LocationLink';
import { CreateDispatchGroupModal } from './CreateDispatchGroupModal';

const DEFAULT_RADIUS = 10;
const MIN_RADIUS = 1;
const MAX_RADIUS = 50;

/** Submission field key → display label (match ticket detail / drawer). */
function formatFieldLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize formResponses to array of { fieldKey, value } for display. */
function normalizeFormResponses(
  formResponses: { fieldKey: string; value: string }[] | Record<string, string> | undefined
): { fieldKey: string; value: string }[] {
  if (!formResponses) return [];
  if (Array.isArray(formResponses)) return formResponses;
  return Object.entries(formResponses).map(([fieldKey, value]) => ({ fieldKey, value: String(value ?? '') }));
}

/** Uniform ticket summary for Grouping Workspace: title, location, #, status, date, requested by, LeaseIQ. */
function WorkspaceTicketSummary({ ticket }: { ticket: any }) {
  const requesterName =
    ticket.requester?.displayName ?? ticket.requester?.name ?? (ticket.requester as { displayName?: string } | undefined)?.displayName ?? '—';
  const leaseIq = ticket.leaseIqResult;

  return (
    <div className="min-w-0 flex-1 space-y-1 text-xs">
      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{ticket.title}</p>
      <p className="flex items-center gap-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
        <MapPin className="h-3 w-3 shrink-0" />
        {ticket.studio?.id ? (
          <>
            <LocationLink
              studioId={ticket.studio.id}
              studioName={ticket.studio.name}
              className="text-xs"
            />
            {ticket.studio.formattedAddress && (
              <span className="truncate">· {ticket.studio.formattedAddress}</span>
            )}
          </>
        ) : (
          <span>No location</span>
        )}
      </p>
      <p className="flex items-center gap-2 flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
        <span>#{String(ticket.id).slice(0, 8)}</span>
        <StatusBadge status={ticket.status} />
        <span>{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ''}</span>
      </p>
      {requesterName && requesterName !== '—' && (
        <p style={{ color: 'var(--color-text-muted)' }}>Requested by {requesterName}</p>
      )}
      {leaseIq != null && (
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Lease IQ</span>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded"
            style={{
              background:
                leaseIq.suggestedResponsibility === 'LIKELY_LANDLORD'
                  ? 'rgba(34,197,94,0.15)'
                  : leaseIq.suggestedResponsibility === 'LIKELY_TENANT'
                    ? 'rgba(234,179,8,0.15)'
                    : 'rgba(148,163,184,0.2)',
              color: 'var(--color-text-primary)',
            }}
          >
            {leaseIq.suggestedResponsibility.replace(/_/g, ' ')}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            ({leaseIq.confidence} confidence)
          </span>
        </div>
      )}
    </div>
  );
}

/** Smooth height expand/collapse (grid 0fr → 1fr). Caches last children while closing so exit animates when parent passes null. */
function WorkspaceCollapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [cachedView, setCachedView] = useState<React.ReactNode>(null);

  useEffect(() => {
    if (open && children != null) {
      setCachedView(children);
    }
  }, [open, children]);

  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => setCachedView(null), 320);
    return () => window.clearTimeout(id);
  }, [open]);

  const toShow = open ? (children ?? cachedView) : cachedView;

  return (
    <div
      className="grid workspace-collapsible-grid"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {toShow}
      </div>
    </div>
  );
}

interface Props {
  anchorTicketId: string;
  onClose: () => void;
}

export function DispatchWorkspacePanel({ anchorTicketId, onClose }: Props) {
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS);
  const [anchorExpanded, setAnchorExpanded] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(() => new Set([anchorTicketId]));
  const [expandedNearbyId, setExpandedNearbyId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    setSelectedTicketIds(new Set([anchorTicketId]));
  }, [anchorTicketId]);

  const { data: anchorTicketRes } = useQuery({
    queryKey: ['ticket', anchorTicketId],
    queryFn: () => ticketsApi.get(anchorTicketId),
    enabled: !!anchorTicketId,
  });
  const anchorTicket = anchorTicketRes?.data;

  const { data: nearbyRes, isLoading: nearbyLoading } = useQuery({
    queryKey: ['dispatch', 'workspace', 'nearby', anchorTicketId, radiusMiles],
    queryFn: () => dispatchApi.getWorkspaceNearby({ anchorTicketId, radiusMiles }),
    enabled: !!anchorTicketId && radiusMiles > 0,
  });
  const anchorFromNearby = nearbyRes?.data?.anchor ?? null;
  const nearbyList = nearbyRes?.data?.nearby ?? [];
  const nearbyMessage = nearbyRes?.data?.message;

  const anchor = anchorTicket ?? anchorFromNearby;

  const selectedIdsArray = useMemo(() => Array.from(selectedTicketIds), [selectedTicketIds]);
  /** Require at least one non-anchor ticket selected before creating a group. */
  const hasNearbySelection = useMemo(
    () => Array.from(selectedTicketIds).some((id) => id !== anchorTicketId),
    [selectedTicketIds, anchorTicketId],
  );
  const allSelectedReady = useMemo(() => {
    if (!anchorTicketId) return false;
    const anchorReady = anchor?.dispatchReadiness === 'READY_FOR_DISPATCH';
    const nearbyById = new Map(nearbyList.map((n: any) => [n.id, n]));
    for (const id of selectedTicketIds) {
      if (id === anchorTicketId) {
        if (!anchorReady) return false;
      } else {
        const n = nearbyById.get(id);
        if (!n || n.dispatchReadiness !== 'READY_FOR_DISPATCH') return false;
      }
    }
    return true;
  }, [anchorTicketId, anchor?.dispatchReadiness, nearbyList, selectedTicketIds]);

  const toggleSelected = (id: string) => {
    if (id === anchorTicketId) return;
    setSelectedTicketIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandedNearby = (id: string) => {
    setExpandedNearbyId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div
        className="flex-1 min-w-0 flex flex-col h-full overflow-hidden border-l"
        style={{
          background: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border-default)',
        }}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-chrome)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Grouping Workspace</span>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring p-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-surface-raised)] transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Anchor card (single card with inline expand/collapse) — full width */}
          {anchor && (
            <div className="rounded-[var(--radius-lg)] overflow-hidden surface-card">
              <div className="flex items-start gap-2 px-3 py-2" style={{ background: 'var(--color-bg-surface-inset)' }}>
                <button
                  type="button"
                  onClick={() => setAnchorExpanded(!anchorExpanded)}
                  className="focus-ring shrink-0 p-0.5 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-surface)] mt-0.5 motion-reduce:transition-none"
                  style={{ color: 'var(--color-text-muted)' }}
                  aria-label={anchorExpanded ? 'Collapse' : 'Expand'}
                >
                  <ChevronDown
                    className="h-4 w-4 transition-transform duration-300 ease-out motion-reduce:transition-none"
                    style={{ transform: anchorExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  />
                </button>
                <div className="min-w-0 flex-1" onClick={() => setAnchorExpanded(!anchorExpanded)}>
                  <WorkspaceTicketSummary ticket={anchor} />
                </div>
              </div>
              <WorkspaceCollapsible open={anchorExpanded}>
                <FormResponsesExpandable
                  description={anchor.description}
                  formResponses={anchor.formResponses}
                />
              </WorkspaceCollapsible>
            </div>
          )}

          {/* Nearby controls — keep narrow and centered */}
          <div className="max-w-[50%] mx-auto space-y-4">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Nearby</h3>
            <div className="surface-inset flex items-center gap-3 mb-4 px-3 py-2">
              <label className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                Radius (mi): {radiusMiles}
              </label>
              <input
                type="range"
                min={MIN_RADIUS}
                max={MAX_RADIUS}
                value={radiusMiles}
                onChange={(e) => setRadiusMiles(Number(e.target.value))}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: 'var(--color-accent)', background: 'var(--color-border-default)' }}
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!hasNearbySelection}
              title={
                hasNearbySelection
                  ? undefined
                  : 'Select one or more nearby tickets to include in the dispatch group.'
              }
              onClick={() => setCreateModalOpen(true)}
            >
              Create Dispatch Group
            </Button>
          </div>

          {/* Nearby results feed — full width */}
          <div className="space-y-1">
            {nearbyMessage && (
              <p className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>{nearbyMessage}</p>
            )}
            {nearbyLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              </div>
            ) : nearbyList.length === 0 ? (
              <p className="text-xs py-4" style={{ color: 'var(--color-text-muted)' }}>No nearby tickets in radius.</p>
            ) : (
              nearbyList.map((t: any) => (
                <NearbyRow
                  key={t.id}
                  ticket={t}
                  isAnchor={t.id === anchorTicketId}
                  isSelected={selectedTicketIds.has(t.id)}
                  isExpanded={expandedNearbyId === t.id}
                  onToggleSelect={() => toggleSelected(t.id)}
                  onToggleExpand={() => toggleExpandedNearby(t.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {createModalOpen && anchor && (
        <CreateDispatchGroupModal
          anchorTicket={anchor}
          anchorTicketId={anchorTicketId}
          selectedTicketIds={selectedIdsArray}
          radiusMiles={radiusMiles}
          allSelectedReady={allSelectedReady}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => setCreateModalOpen(false)}
        />
      )}
    </>
  );
}

function FormResponsesExpandable({
  description,
  formResponses,
}: {
  description?: string | null;
  formResponses: { fieldKey: string; value: string }[] | Record<string, string> | undefined;
}) {
  const list = normalizeFormResponses(formResponses);
  return (
    <div
      className="px-3 pb-3 pt-4 pl-11 border-t text-xs space-y-2"
      style={{
        borderColor: 'var(--color-border-default)',
        color: 'var(--color-text-secondary)',
        background: 'color-mix(in srgb, var(--color-bg-surface-inset) 50%, var(--color-bg-surface))',
      }}
    >
      {description && (
        <p className="whitespace-pre-wrap">{description}</p>
      )}
      {list.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Submitted form data</p>
          <dl className="space-y-1">
            {list.map((r) => (
              <div key={r.fieldKey} className="grid grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)] gap-x-3 gap-y-0.5 items-baseline">
                <dt className="break-words font-medium" style={{ color: 'var(--color-text-muted)' }}>{formatFieldLabel(r.fieldKey)}:</dt>
                <dd className="min-w-0 break-words" style={{ color: 'var(--color-text-primary)' }}>{r.value || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function NearbyRow({
  ticket,
  isAnchor,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
}: {
  ticket: any;
  isAnchor: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  const { data: detailRes } = useQuery({
    queryKey: ['ticket', ticket.id],
    queryFn: () => ticketsApi.get(ticket.id),
    enabled: isExpanded && !!ticket.id,
  });
  const expandedDetail = detailRes?.data;

  // Main row uses uniform summary (same as anchor). Use full ticket when expanded so requester/Lease IQ show.
  const displayTicket = expandedDetail ?? ticket;

  return (
    <div
      className="rounded-[var(--radius-lg)] overflow-hidden"
      style={{
        border: '1px solid var(--color-border-default)',
        background: isSelected ? 'rgba(var(--color-accent-rgb, 52, 120, 196), 0.08)' : 'var(--color-bg-surface-inset)',
      }}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        {!isAnchor && (
          <button
            type="button"
            onClick={onToggleSelect}
            className="focus-ring shrink-0 w-5 h-5 rounded-[var(--radius-md)] border flex items-center justify-center text-xs mt-0.5"
            style={{ borderColor: 'var(--color-border-default)', color: isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
            aria-label={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected ? '✓' : ''}
          </button>
        )}
        {isAnchor && (
          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5" style={{ background: 'var(--color-accent)', color: '#fff' }}>Anchor</span>
        )}
        <button
          type="button"
          onClick={() => onToggleExpand()}
          className="focus-ring shrink-0 p-0.5 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-surface)] mt-0.5 motion-reduce:transition-none"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <ChevronDown
            className="h-4 w-4 transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </button>
        <div className="min-w-0 flex-1" onClick={() => onToggleExpand()}>
          <WorkspaceTicketSummary ticket={displayTicket} />
          {ticket.dispatchReadiness === 'READY_FOR_DISPATCH' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 inline-block" style={{ background: 'rgba(52,120,196,0.15)', color: 'var(--color-accent)' }}>
              Ready for Dispatch
            </span>
          )}
        </div>
      </div>
      <WorkspaceCollapsible open={isExpanded}>
        {isExpanded && expandedDetail ? (
          <FormResponsesExpandable
            description={expandedDetail.description}
            formResponses={expandedDetail.formResponses}
          />
        ) : isExpanded ? (
          <div
            className="flex items-center justify-center py-6 border-t text-xs"
            style={{
              borderColor: 'var(--color-border-default)',
              color: 'var(--color-text-muted)',
              background: 'color-mix(in srgb, var(--color-bg-surface-inset) 50%, var(--color-bg-surface))',
            }}
          >
            <div className="animate-spin h-5 w-5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          </div>
        ) : null}
      </WorkspaceCollapsible>
    </div>
  );
}
