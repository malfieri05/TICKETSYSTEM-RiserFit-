'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MapPin, Navigation, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { dispatchApi, ticketsApi, invalidateTicketLists } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { LocationLink } from '@/components/ui/LocationLink';
import { POLISH_THEME } from '@/lib/polish';
import {
  DISPATCH_TRADE_TYPE_LABELS,
  DISPATCH_READINESS_LABELS,
  DispatchTradeType,
  DispatchReadiness,
} from '@ticketing/types';

interface Props {
  ticketId: string;
  ticket: any;
  canManage: boolean;
  variant?: 'detail' | 'drawer';
}

export function DispatchRecommendationPanel({ ticketId, ticket, canManage, variant = 'detail' }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [groupNotes, setGroupNotes] = useState('');

  const isMaintenance = ticket?.ticketClass?.code === 'MAINTENANCE';
  if (!isMaintenance) return null;

  const { data: recData, isLoading: recLoading } = useQuery({
    queryKey: ['dispatch-recommendations', ticketId],
    queryFn: () => dispatchApi.getRecommendations(ticketId),
    enabled: !!ticketId && isMaintenance,
    retry: false,
  });
  const rec = recData?.data;

  const updateMut = useMutation({
    mutationFn: (data: { dispatchTradeType?: string; dispatchReadiness?: string }) =>
      ticketsApi.update(ticketId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      qc.invalidateQueries({ queryKey: ['dispatch-recommendations', ticketId] });
      invalidateTicketLists(qc);
    },
  });

  const createGroupMut = useMutation({
    mutationFn: (data: { tradeType: string; ticketIds: string[]; notes?: string }) =>
      dispatchApi.createGroup(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dispatch-recommendations', ticketId] });
      if (res.data?.id) {
        router.push(`/admin/dispatch/groups/${res.data.id}`);
      }
    },
  });

  const handleCreateGroup = () => {
    const tradeType = ticket.dispatchTradeType;
    if (!tradeType) return;
    const ids = [ticketId, ...Array.from(selectedIds)];
    createGroupMut.mutate({ tradeType, ticketIds: ids, notes: groupNotes || undefined });
  };

  const toggleCandidate = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const panelBorder = `1px solid ${POLISH_THEME.listBorder}`;

  return (
    <div className="mt-3 pt-3" style={{ borderTop: panelBorder }}>
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Package className="h-4 w-4" style={{ color: POLISH_THEME.accent }} />
        <span className="text-xs font-medium" style={{ color: POLISH_THEME.metaSecondary }}>
          Dispatch
        </span>
        {rec && (rec.summary.sameLocationCount > 0 || rec.summary.nearbyCount > 0) && (
          <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(52,120,196,0.1)', color: POLISH_THEME.accent }}>
            {rec.summary.sameLocationCount + rec.summary.nearbyCount} candidates
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Trade type + readiness editors */}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] font-medium block mb-1" style={{ color: POLISH_THEME.metaDim }}>Trade Type</label>
                <Select
                  value={ticket.dispatchTradeType ?? ''}
                  onChange={(e) => updateMut.mutate({ dispatchTradeType: e.target.value || undefined })}
                  className="text-xs"
                >
                  <option value="">Not set</option>
                  {Object.entries(DISPATCH_TRADE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] font-medium block mb-1" style={{ color: POLISH_THEME.metaDim }}>Readiness</label>
                <Select
                  value={ticket.dispatchReadiness ?? ''}
                  onChange={(e) => updateMut.mutate({ dispatchReadiness: e.target.value || undefined })}
                  className="text-xs"
                >
                  <option value="">Not set</option>
                  {Object.entries(DISPATCH_READINESS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {/* Loading */}
          {recLoading && (
            <p className="text-xs" style={{ color: POLISH_THEME.metaDim }}>Loading recommendations...</p>
          )}

          {/* Summary message (empty states) */}
          {rec?.summary.message && (
            <p className="text-xs" style={{ color: POLISH_THEME.metaDim }}>{rec.summary.message}</p>
          )}

          {/* Same-location candidates */}
          {rec && rec.sameLocationCandidates.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <MapPin className="h-3.5 w-3.5" style={{ color: POLISH_THEME.metaDim }} />
                <span className="text-xs font-medium" style={{ color: POLISH_THEME.metaSecondary }}>
                  Same Location ({rec.sameLocationCandidates.length})
                </span>
              </div>
              <div className="space-y-1">
                {rec.sameLocationCandidates.map((c: any) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    selected={selectedIds.has(c.id)}
                    onToggle={() => toggleCandidate(c.id)}
                    showCreate={showCreateFlow}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Nearby-location candidates */}
          {rec && rec.nearbyLocationCandidates.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Navigation className="h-3.5 w-3.5" style={{ color: POLISH_THEME.metaDim }} />
                <span className="text-xs font-medium" style={{ color: POLISH_THEME.metaSecondary }}>
                  Nearby ({rec.nearbyLocationCandidates.length})
                </span>
              </div>
              <div className="space-y-1">
                {rec.nearbyLocationCandidates.map((c: any) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    selected={selectedIds.has(c.id)}
                    onToggle={() => toggleCandidate(c.id)}
                    showCreate={showCreateFlow}
                    showDistance
                  />
                ))}
              </div>
            </div>
          )}

          {/* Create group flow */}
          {rec && (rec.sameLocationCandidates.length > 0 || rec.nearbyLocationCandidates.length > 0) && canManage && (
            <div>
              {!showCreateFlow ? (
                <Button size="sm" onClick={() => setShowCreateFlow(true)} className="text-xs">
                  Create Dispatch Group
                </Button>
              ) : (
                <div className="space-y-2 p-3 rounded-lg" style={{ background: 'var(--color-bg-page)', border: panelBorder }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    Create dispatch group
                  </p>
                  <p className="text-[10px]" style={{ color: POLISH_THEME.metaDim }}>
                    Current ticket is included. Select additional candidates above.
                    {selectedIds.size > 0 && ` ${selectedIds.size} selected.`}
                  </p>
                  <textarea
                    placeholder="Notes (optional)"
                    value={groupNotes}
                    onChange={(e) => setGroupNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs rounded-md p-2"
                    style={{ border: panelBorder, background: 'var(--color-bg-page)', color: 'var(--color-text-primary)' }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateGroup}
                      disabled={createGroupMut.isPending}
                      className="text-xs"
                    >
                      {createGroupMut.isPending ? 'Creating...' : `Create Group (${1 + selectedIds.size} tickets)`}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowCreateFlow(false); setSelectedIds(new Set()); }} className="text-xs">
                      Cancel
                    </Button>
                  </div>
                  {createGroupMut.isError && (
                    <p className="text-xs text-red-500">
                      {(createGroupMut.error as any)?.response?.data?.message ?? 'Failed to create group'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Can still create a group with just this ticket */}
          {rec && rec.sameLocationCandidates.length === 0 && rec.nearbyLocationCandidates.length === 0 && ticket.dispatchReadiness === 'READY_FOR_DISPATCH' && ticket.dispatchTradeType && canManage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                createGroupMut.mutate({
                  tradeType: ticket.dispatchTradeType,
                  ticketIds: [ticketId],
                });
              }}
              disabled={createGroupMut.isPending}
              className="text-xs"
            >
              Create Group (this ticket only)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CandidateRow({
  candidate,
  selected,
  onToggle,
  showCreate,
  showDistance,
}: {
  candidate: any;
  selected: boolean;
  onToggle: () => void;
  showCreate: boolean;
  showDistance?: boolean;
}) {
  const router = useRouter();
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
      style={{ background: selected ? 'rgba(52,120,196,0.08)' : 'transparent' }}
    >
      {showCreate && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded"
        />
      )}
      <button
        type="button"
        onClick={() => router.push(`/tickets/${candidate.id}`)}
        className="flex-1 text-left truncate hover:underline"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {candidate.title}
      </button>
      {candidate.studio?.id && candidate.studio?.name && (
        <LocationLink
          studioId={candidate.studio.id}
          studioName={candidate.studio.name}
          className="text-[10px] shrink-0"
        />
      )}
      {showDistance && candidate.distanceMiles != null && (
        <span className="text-[10px] shrink-0 font-medium" style={{ color: POLISH_THEME.accent }}>
          {candidate.distanceMiles} mi
        </span>
      )}
    </div>
  );
}
