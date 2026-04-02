'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Market, Studio } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { MarketSearchSelect } from '@/components/ui/MarketSearchSelect';
import { MaintenanceCountWithTooltip } from '@/components/ui/MaintenanceCountWithTooltip';
import { LocationLink } from '@/components/ui/LocationLink';
import { POLISH_THEME } from '@/lib/polish';
import dynamic from 'next/dynamic';

const LocationsMap = dynamic(
  () => import('@/components/admin/LocationsMap').then((m) => m.LocationsMap),
  { ssr: false },
);

interface MarketWithStudios extends Market {
  studios: (Studio & {
    formattedAddress?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    activeMaintenanceCount?: number;
    activeMaintenanceCategoryNames?: string[];
  })[];
}

interface NearbyStudio {
  id: string;
  name: string;
  formattedAddress: string | null;
  marketName: string;
  distanceMiles: number;
  activeMaintenanceCount?: number;
  activeMaintenanceCategoryNames?: string[];
}

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

type FlatLocation = Studio & {
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activeMaintenanceCount?: number;
  activeMaintenanceCategoryNames?: string[];
  marketId: string;
  marketName: string;
};

export default function AdminMarketsPage() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormMarketId, setAddFormMarketId] = useState('');
  const [selectedStudio, setSelectedStudio] = useState<{
    id: string;
    name: string;
    formattedAddress?: string | null;
    marketName: string;
    latitude?: number | null;
    longitude?: number | null;
    activeMaintenanceCount?: number;
    activeMaintenanceCategoryNames?: string[];
  } | null>(null);
  const [editingStudio, setEditingStudio] = useState<{
    id: string;
    name: string;
    formattedAddress: string;
    latitude: string;
    longitude: string;
    marketName: string;
  } | null>(null);
  const [nearbyEnabled, setNearbyEnabled] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(25);

  const [addForm, setAddForm] = useState({ name: '', formattedAddress: '', latitude: '', longitude: '' });
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const { data, isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: () => api.get<MarketWithStudios[]>('/admin/markets'),
  });
  const markets = data?.data ?? [];

  const locations = useMemo(() => {
    const flat: FlatLocation[] = markets.flatMap((market) =>
      (market.studios ?? []).map((studio) => ({
        ...studio,
        marketId: market.id,
        marketName: market.name,
      })),
    );
    flat.sort((a, b) => {
      const byMarket = (a.marketName ?? '').localeCompare(b.marketName ?? '');
      if (byMarket !== 0) return byMarket;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    return flat;
  }, [markets]);

  const filteredLocations = useMemo(() => {
    let list = locations;
    if (selectedMarketId != null && selectedMarketId !== '') {
      list = list.filter((loc) => loc.marketId === selectedMarketId);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (loc) =>
        (loc.name ?? '').toLowerCase().includes(q) ||
        (loc.formattedAddress ?? '').toLowerCase().includes(q) ||
        (loc.marketName ?? '').toLowerCase().includes(q),
    );
  }, [locations, selectedMarketId, searchQuery]);

  const createStudioMut = useMutation({
    mutationFn: ({ marketId }: { marketId: string }) =>
      api.post('/admin/studios', {
        name: addForm.name.trim(),
        marketId,
        formattedAddress: addForm.formattedAddress.trim(),
        latitude: parseFloat(addForm.latitude),
        longitude: parseFloat(addForm.longitude),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markets'] });
      setAddForm({ name: '', formattedAddress: '', latitude: '', longitude: '' });
      setShowAddForm(false);
      setAddFormMarketId('');
    },
  });

  const updateStudioMut = useMutation({
    mutationFn: (payload: { id: string; name: string; formattedAddress: string; latitude: number; longitude: number }) =>
      api.patch(`/admin/studios/${payload.id}`, {
        name: payload.name.trim(),
        formattedAddress: payload.formattedAddress.trim(),
        latitude: payload.latitude,
        longitude: payload.longitude,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['markets'] });
      setEditingStudio(null);
    },
  });

  const validLat = (v: string) => {
    const n = parseFloat(v);
    return v !== '' && !Number.isNaN(n) && n >= -90 && n <= 90;
  };
  const validLng = (v: string) => {
    const n = parseFloat(v);
    return v !== '' && !Number.isNaN(n) && n >= -180 && n <= 180;
  };
  const addFormValid =
    addForm.name.trim() !== '' &&
    addForm.formattedAddress.trim() !== '' &&
    validLat(addForm.latitude) &&
    validLng(addForm.longitude);
  const editFormValid =
    editingStudio != null &&
    editingStudio.name.trim() !== '' &&
    editingStudio.formattedAddress.trim() !== '' &&
    validLat(editingStudio.latitude) &&
    validLng(editingStudio.longitude);

  const { data: nearbyData, isLoading: nearbyLoading, error: nearbyError } = useQuery({
    queryKey: ['admin', 'studios', selectedStudio?.id, 'nearby', radiusMiles],
    queryFn: () =>
      api.get<NearbyStudio[]>(`/admin/studios/${selectedStudio!.id}/nearby`, { params: { radiusMiles } }),
    enabled: !!selectedStudio && nearbyEnabled,
  });
  const nearbyStudios = nearbyData?.data ?? [];

  const openAddForm = () => {
    setAddFormMarketId(selectedMarketId ?? markets[0]?.id ?? '');
    setAddForm({ name: '', formattedAddress: '', latitude: '', longitude: '' });
    setShowAddForm(true);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        title={
          <h1 className="min-w-0 truncate text-base font-semibold">
            <span style={{ color: 'var(--color-text-app-header)' }}>Locations: </span>
            <span
              className="tabular-nums"
              style={{ color: 'var(--color-accent)' }}
              aria-live="polite"
            >
              {isLoading ? '…' : locations.length}
            </span>
          </h1>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div
          className="p-6 space-y-4 overflow-auto flex-shrink-0 flex flex-col"
          style={viewMode === 'map' ? { flex: 1 } : { maxWidth: '40rem' }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm flex-1 min-w-[200px] h-9"
            />
            <MarketSearchSelect
              markets={markets.map((m) => ({ id: m.id, name: m.name }))}
              value={selectedMarketId ?? ''}
              onChange={(id) => setSelectedMarketId(id === '' ? null : id)}
              className="min-w-[160px] h-9"
            />
            {!showAddForm && (
              <Button size="md" variant="secondary" onClick={openAddForm} className="w-fit shrink-0">
                <Plus className="h-4 w-4" />
                Add Location
              </Button>
            )}
          </div>

          {showAddForm && (
            <div className="dashboard-card rounded-xl p-4 space-y-3" style={panel}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Add Location</h3>
              <ComboBox
                label="State"
                placeholder="— Select state —"
                options={markets.map((m) => ({ value: m.id, label: m.name }))}
                value={addFormMarketId}
                onChange={setAddFormMarketId}
              />
              <Input label="Name" placeholder="Location name" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              <Input label="Formatted address" placeholder="e.g. 123 Main St, City, State" value={addForm.formattedAddress} onChange={(e) => setAddForm((f) => ({ ...f, formattedAddress: e.target.value }))} />
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Latitude</label>
                <input type="number" step="any" placeholder="-90 to 90" value={addForm.latitude} onChange={(e) => setAddForm((f) => ({ ...f, latitude: e.target.value }))} className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Longitude</label>
                <input type="number" step="any" placeholder="-180 to 180" value={addForm.longitude} onChange={(e) => setAddForm((f) => ({ ...f, longitude: e.target.value }))} className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Coordinates are used to calculate nearby locations for dispatching.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => createStudioMut.mutate({ marketId: addFormMarketId })} disabled={!addFormValid || !addFormMarketId} loading={createStudioMut.isPending}>Add</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              View:
            </span>
            <div className="inline-flex h-9 items-center rounded-[var(--radius-md)] border text-sm" style={{ borderColor: 'var(--color-border-default)' }}>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="h-full px-3 rounded-l-[var(--radius-md)] transition-colors duration-150"
                style={{
                  background: viewMode === 'list' ? 'var(--color-bg-surface-raised)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  borderRight: `1px solid var(--color-border-default)`,
                }}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className="h-full px-3 rounded-r-[var(--radius-md)] transition-colors duration-150"
                style={{
                  background: viewMode === 'map' ? 'var(--color-bg-surface-raised)' : 'transparent',
                  color: viewMode === 'map' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                Map
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
            </div>
          ) : markets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>No states yet</p>
              <p className="text-xs text-center max-w-sm">States are configured by your system administrator.</p>
            </div>
          ) : locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>No locations yet</p>
              <p className="text-xs text-center max-w-sm">Add a location using the button above.</p>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>No locations match your search.</p>
              <p className="text-xs">Try a different search or state filter.</p>
            </div>
          ) : viewMode === 'map' ? (
            <div
              className="relative"
              style={{ marginRight: '28rem' }} // leave space on the right for the details panel
            >
              <LocationsMap
                locations={filteredLocations}
                onLocationClick={(id) => {
                  const loc = locations.find((l) => l.id === id);
                  if (!loc) return;
                  setSelectedStudio({
                    id: loc.id,
                    name: loc.name,
                    formattedAddress: loc.formattedAddress ?? null,
                    marketName: loc.marketName,
                    latitude: loc.latitude ?? null,
                    longitude: loc.longitude ?? null,
                    activeMaintenanceCount: loc.activeMaintenanceCount ?? 0,
                    activeMaintenanceCategoryNames: loc.activeMaintenanceCategoryNames ?? [],
                  });
                }}
              />
            </div>
          ) : (
            <div className="dashboard-card rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col" style={panel}>
              <div className="flex-1 overflow-y-auto">
                {filteredLocations.map((loc) => {
                  const isSelected = selectedStudio?.id === loc.id;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 border-b px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-[var(--color-bg-surface-raised)]"
                      style={{
                        borderColor: 'var(--color-border-default)',
                        background: isSelected ? POLISH_THEME.adminStudioListSelectedBg : undefined,
                        borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                      }}
                      onClick={() =>
                        setSelectedStudio({
                          id: loc.id,
                          name: loc.name,
                          formattedAddress: loc.formattedAddress ?? null,
                          marketName: loc.marketName,
                          latitude: loc.latitude ?? null,
                          longitude: loc.longitude ?? null,
                          activeMaintenanceCount: loc.activeMaintenanceCount ?? 0,
                          activeMaintenanceCategoryNames: loc.activeMaintenanceCategoryNames ?? [],
                        })
                      }
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {loc.name}{' '}
                          <MaintenanceCountWithTooltip
                            count={loc.activeMaintenanceCount ?? 0}
                            categoryNames={loc.activeMaintenanceCategoryNames ?? []}
                          />
                        </span>
                        {loc.formattedAddress && (
                          <span className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {loc.formattedAddress}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {loc.marketName}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {selectedStudio && (
          <div
            className={
              viewMode === 'map'
                ? 'fixed right-4 top-24 bottom-6 z-50 w-full max-w-md border overflow-auto rounded-xl shadow-lg pointer-events-auto'
                : 'flex-shrink-0 w-full max-w-md border-l overflow-auto'
            }
            style={{
              background: viewMode === 'map' ? 'var(--color-bg-surface)' : 'var(--color-bg-surface)',
              borderColor: 'var(--color-border-default)',
            }}
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Location details</h3>
                <button
                  type="button"
                  onClick={() => { setSelectedStudio(null); setEditingStudio(null); }}
                  className="p-1 rounded transition-colors hover:bg-[var(--color-bg-surface)]"
                  style={{ color: 'var(--color-text-muted)' }}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {editingStudio ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Edit location</h4>
                  <Input label="Name" value={editingStudio.name} onChange={(e) => setEditingStudio((s) => (s ? { ...s, name: e.target.value } : null))} />
                  <Input label="Formatted address" value={editingStudio.formattedAddress} onChange={(e) => setEditingStudio((s) => (s ? { ...s, formattedAddress: e.target.value } : null))} />
                  <div>
                    <label className="text-sm font-medium text-[var(--color-text-primary)] block mb-1">Latitude</label>
                    <input type="number" step="any" placeholder="-90 to 90" value={editingStudio.latitude} onChange={(e) => setEditingStudio((s) => (s ? { ...s, latitude: e.target.value } : null))} className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[var(--color-text-primary)] block mb-1">Longitude</label>
                    <input type="number" step="any" placeholder="-180 to 180" value={editingStudio.longitude} onChange={(e) => setEditingStudio((s) => (s ? { ...s, longitude: e.target.value } : null))} className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }} />
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">Coordinates are used to calculate nearby locations for dispatching.</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateStudioMut.mutate({ id: editingStudio.id, name: editingStudio.name, formattedAddress: editingStudio.formattedAddress, latitude: parseFloat(editingStudio.latitude), longitude: parseFloat(editingStudio.longitude) })} disabled={!editFormValid} loading={updateStudioMut.isPending}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingStudio(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <LocationLink
                        studioId={selectedStudio.id}
                        studioName={selectedStudio.name}
                        className="text-sm font-medium"
                      />
                      <MaintenanceCountWithTooltip count={selectedStudio.activeMaintenanceCount ?? 0} categoryNames={selectedStudio.activeMaintenanceCategoryNames ?? []} />
                    </div>
                    {selectedStudio.formattedAddress && (
                      <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{selectedStudio.formattedAddress}</p>
                    )}
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>State: {selectedStudio.marketName}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditingStudio(selectedStudio ? { id: selectedStudio.id, name: selectedStudio.name, formattedAddress: selectedStudio.formattedAddress ?? '', latitude: selectedStudio.latitude != null ? String(selectedStudio.latitude) : '', longitude: selectedStudio.longitude != null ? String(selectedStudio.longitude) : '', marketName: selectedStudio.marketName } : null)}>Edit location</Button>
                </>
              )}

              <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>Nearby Locations</h4>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nearbyEnabled}
                    onChange={(e) => setNearbyEnabled(e.target.checked)}
                    className="rounded text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                    style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Enable nearby search</span>
                </label>
                {nearbyEnabled && (
                  <>
                    <div className="mb-3">
                      <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Radius: {radiusMiles} miles</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={radiusMiles}
                        onChange={(e) => setRadiusMiles(Number(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)]"
                        style={{ background: 'var(--color-border-default)' }}
                      />
                    </div>
                    {nearbyLoading && (
                      <div className="flex flex-col items-center justify-center py-4 gap-2">
                        <div className="animate-spin h-5 w-5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
                      </div>
                    )}
                    {nearbyError && (
                      <p className="text-sm text-amber-500 py-2">
                        {nearbyError instanceof Error && 'response' in nearbyError
                          ? (nearbyError as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Could not load nearby locations.'
                          : 'Could not load nearby locations.'}
                      </p>
                    )}
                    {!nearbyLoading && !nearbyError && nearbyStudios.length === 0 && (
                      <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>No other locations within this radius.</p>
                    )}
                    {!nearbyLoading && !nearbyError && nearbyStudios.length > 0 && (
                      <>
                        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                          Nearby locations within {radiusMiles} miles ({nearbyStudios.length} found)
                        </p>
                        <ul className="space-y-1.5">
                          {nearbyStudios.map((s) => (
                            <li key={s.id} className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                              {s.name} <MaintenanceCountWithTooltip count={s.activeMaintenanceCount ?? 0} categoryNames={s.activeMaintenanceCategoryNames ?? []} /> ({s.marketName}) — {s.distanceMiles} mi
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
