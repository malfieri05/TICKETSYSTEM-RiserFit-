'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Market, Studio } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface MarketWithStudios extends Market {
  studios: Studio[];
}

export default function AdminMarketsPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingMarket, setAddingMarket] = useState(false);
  const [addingStudioFor, setAddingStudioFor] = useState<string | null>(null);

  const [marketName, setMarketName] = useState('');
  const [marketCode, setMarketCode] = useState('');
  const [studioName, setStudioName] = useState('');
  const [studioCode, setStudioCode] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: () => api.get<MarketWithStudios[]>('/admin/markets'),
  });
  const markets = data?.data ?? [];

  const createMarketMut = useMutation({
    mutationFn: () => api.post('/admin/markets', { name: marketName, code: marketCode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markets'] });
      setMarketName(''); setMarketCode(''); setAddingMarket(false);
    },
  });

  const createStudioMut = useMutation({
    mutationFn: ({ marketId }: { marketId: string }) =>
      api.post('/admin/studios', { name: studioName, code: studioCode, marketId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markets'] });
      setStudioName(''); setStudioCode(''); setAddingStudioFor(null);
    },
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">New Market</h3>
            <Input label="Name" value={marketName} onChange={(e) => setMarketName(e.target.value)} placeholder="e.g. Northeast" />
            <Input label="Code" value={marketCode} onChange={(e) => setMarketCode(e.target.value)} placeholder="e.g. NE" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMarketMut.mutate()} disabled={!marketName.trim() || !marketCode.trim()} loading={createMarketMut.isPending}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setAddingMarket(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-6 w-6 rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : markets.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No markets yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {markets.map((market) => (
              <div key={market.id}>
                {/* Market row */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggle(market.id)}
                >
                  {expanded.has(market.id) ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="font-medium text-gray-900">{market.name}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{market.code}</span>
                  <span className="ml-auto text-xs text-gray-400">{market.studios?.length ?? 0} studios</span>
                </div>

                {/* Studios */}
                {expanded.has(market.id) && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    {(market.studios ?? []).map((studio) => (
                      <div key={studio.id} className="flex items-center gap-2 pl-10 pr-4 py-2 border-b border-gray-100 last:border-b-0">
                        <span className="text-sm text-gray-700">{studio.name}</span>
                        <span className="text-xs text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded">{studio.code}</span>
                      </div>
                    ))}

                    {addingStudioFor === market.id ? (
                      <div className="pl-10 pr-4 py-3 space-y-2 border-t border-gray-100">
                        <div className="flex gap-2">
                          <Input placeholder="Studio name" value={studioName} onChange={(e) => setStudioName(e.target.value)} className="flex-1" />
                          <Input placeholder="Code" value={studioCode} onChange={(e) => setStudioCode(e.target.value)} className="w-20" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => createStudioMut.mutate({ marketId: market.id })} disabled={!studioName.trim() || !studioCode.trim()} loading={createStudioMut.isPending}>Add</Button>
                          <Button size="sm" variant="secondary" onClick={() => setAddingStudioFor(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingStudioFor(market.id)}
                        className="w-full text-left pl-10 pr-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 flex items-center gap-1"
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
