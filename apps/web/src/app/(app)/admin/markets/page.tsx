'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Market, Studio } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface MarketWithStudios extends Market {
  studios: (Studio & { formattedAddress?: string | null })[];
}

interface NearbyStudio {
  id: string;
  name: string;
  formattedAddress: string | null;
  marketName: string;
  distanceMiles: number;
}

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

export default function AdminMarketsPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingMarket, setAddingMarket] = useState(false);
  const [addingStudioFor, setAddingStudioFor] = useState<string | null>(null);
  const [marketName, setMarketName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [selectedStudio, setSelectedStudio] = useState<{
    id: string;
    name: string;
    formattedAddress?: string | null;
    marketName: string;
  } | null>(null);
  const [nearbyEnabled, setNearbyEnabled] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(25);

  const { data, isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: () => api.get<MarketWithStudios[]>('/admin/markets'),
  });
  const markets = data?.data ?? [];

  const createMarketMut = useMutation({
    mutationFn: () => api.post('/admin/markets', { name: marketName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['markets'] }); setMarketName(''); setAddingMarket(false); },
  });

  const createStudioMut = useMutation({
    mutationFn: ({ marketId }: { marketId: string }) => api.post('/admin/studios', { name: studioName, marketId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['markets'] }); setStudioName(''); setAddingStudioFor(null); },
  });

  const { data: nearbyData, isLoading: nearbyLoading, error: nearbyError } = useQuery({
    queryKey: ['admin', 'studios', selectedStudio?.id, 'nearby', radiusMiles],
    queryFn: () =>
      api.get<NearbyStudio[]>(`/admin/studios/${selectedStudio!.id}/nearby`, { params: { radiusMiles } }),
    enabled: !!selectedStudio && nearbyEnabled,
  });
  const nearbyStudios = nearbyData?.data ?? [];

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header
        title="Markets & Studios"
        action={
          <Button size="sm" onClick={() => setAddingMarket(true)}>
            <Plus className="h-4 w-4" />
            Add Market
          </Button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="p-6 space-y-4 max-w-2xl overflow-auto flex-shrink-0">
        {addingMarket && (
          <div className="rounded-xl p-4 space-y-3" style={panel}>
            <h3 className="text-sm font-semibold text-gray-100">New Market</h3>
            <Input label="Name" value={marketName} onChange={(e) => setMarketName(e.target.value)} placeholder="e.g. Northeast" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMarketMut.mutate()} disabled={!marketName.trim()} loading={createMarketMut.isPending}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setAddingMarket(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
          </div>
        ) : markets.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: '#555555' }}>No markets yet.</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={panel}>
            {markets.map((market, i) => (
              <div key={market.id} style={i > 0 ? { borderTop: '1px solid #2a2a2a' } : undefined}>
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#222222')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => toggle(market.id)}
                >
                  {expanded.has(market.id)
                    ? <ChevronDown className="h-4 w-4" style={{ color: '#555555' }} />
                    : <ChevronRight className="h-4 w-4" style={{ color: '#555555' }} />}
                  <span className="font-medium text-gray-200">{market.name}</span>
                  <span className="ml-auto text-xs" style={{ color: '#555555' }}>{market.studios?.length ?? 0} studios</span>
                </div>

                {expanded.has(market.id) && (
                  <div style={{ borderTop: '1px solid #222222', background: '#111111' }}>
                    {(market.studios ?? []).map((studio) => (
                      <button
                        key={studio.id}
                        type="button"
                        className="w-full text-left flex items-center gap-2 pl-10 pr-4 py-2 transition-colors"
                        style={{ borderBottom: '1px solid #1a1a1a', color: '#888888' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a1a')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        onClick={() =>
                          setSelectedStudio({
                            id: studio.id,
                            name: studio.name,
                            formattedAddress: studio.formattedAddress ?? null,
                            marketName: market.name,
                          })
                        }
                      >
                        <span className="text-sm">{studio.name}</span>
                      </button>
                    ))}
                    {addingStudioFor === market.id ? (
                      <div className="pl-10 pr-4 py-3 space-y-2" style={{ borderTop: '1px solid #222222' }}>
                        <Input placeholder="Studio name" value={studioName} onChange={(e) => setStudioName(e.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => createStudioMut.mutate({ marketId: market.id })} disabled={!studioName.trim()} loading={createStudioMut.isPending}>Add</Button>
                          <Button size="sm" variant="secondary" onClick={() => setAddingStudioFor(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingStudioFor(market.id)}
                        className="w-full text-left pl-10 pr-4 py-2 text-sm flex items-center gap-1 transition-colors"
                        style={{ color: '#14b8a6', borderTop: '1px solid #222222' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a1a')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add studio
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>

        {selectedStudio && (
          <div
            className="flex-shrink-0 w-full max-w-md border-l overflow-auto"
            style={{ background: '#111111', borderColor: '#2a2a2a' }}
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-100">Location details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedStudio(null)}
                  className="p-1 rounded hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">{selectedStudio.name}</p>
                {selectedStudio.formattedAddress && (
                  <p className="text-sm mt-1" style={{ color: '#888888' }}>{selectedStudio.formattedAddress}</p>
                )}
                <p className="text-xs mt-1" style={{ color: '#666666' }}>Market: {selectedStudio.marketName}</p>
              </div>

              <div className="pt-4 border-t" style={{ borderColor: '#2a2a2a' }}>
                <h4 className="text-sm font-semibold text-gray-200 mb-3">Nearby Studios</h4>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nearbyEnabled}
                    onChange={(e) => setNearbyEnabled(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-teal-500 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-300">Enable nearby search</span>
                </label>
                {nearbyEnabled && (
                  <>
                    <div className="mb-3">
                      <label className="text-xs text-gray-500 block mb-1">Radius: {radiusMiles} miles</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={radiusMiles}
                        onChange={(e) => setRadiusMiles(Number(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-teal-500"
                        style={{ background: '#2a2a2a' }}
                      />
                    </div>
                    {nearbyLoading && (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin h-5 w-5 rounded-full border-2 border-teal-500 border-t-transparent" />
                      </div>
                    )}
                    {nearbyError && (
                      <p className="text-sm text-amber-500 py-2">
                        {nearbyError instanceof Error && 'response' in nearbyError
                          ? (nearbyError as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Could not load nearby studios.'
                          : 'Could not load nearby studios.'}
                      </p>
                    )}
                    {!nearbyLoading && !nearbyError && nearbyStudios.length === 0 && (
                      <p className="text-sm text-gray-500 py-2">No other studios within this radius.</p>
                    )}
                    {!nearbyLoading && !nearbyError && nearbyStudios.length > 0 && (
                      <>
                        <p className="text-xs text-gray-500 mb-2">
                          Nearby studios within {radiusMiles} miles ({nearbyStudios.length} found)
                        </p>
                        <ul className="space-y-1.5">
                          {nearbyStudios.map((s) => (
                            <li key={s.id} className="text-sm" style={{ color: '#cccccc' }}>
                              {s.name} ({s.marketName}) — {s.distanceMiles} mi
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
