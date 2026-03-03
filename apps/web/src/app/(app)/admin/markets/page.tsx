'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Market, Studio } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface MarketWithStudios extends Market {
  studios: Studio[];
}

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

export default function AdminMarketsPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingMarket, setAddingMarket] = useState(false);
  const [addingStudioFor, setAddingStudioFor] = useState<string | null>(null);
  const [marketName, setMarketName] = useState('');
  const [studioName, setStudioName] = useState('');

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

      <div className="p-6 space-y-4 max-w-2xl">
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
                      <div key={studio.id} className="flex items-center gap-2 pl-10 pr-4 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
                        <span className="text-sm" style={{ color: '#888888' }}>{studio.name}</span>
                      </div>
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
    </div>
  );
}
