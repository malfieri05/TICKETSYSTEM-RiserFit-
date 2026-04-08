'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Building2, Users, Phone, Tag, MapPin } from 'lucide-react';
import { api, adminStudiosApi, locationsApi, type StudioProfilePatch } from '@/lib/api';
import type { LocationProfileResponse, Market, Studio } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { MarketSearchSelect } from '@/components/ui/MarketSearchSelect';
import { LocationLink } from '@/components/ui/LocationLink';
import { LocationProfileSection } from '@/components/admin/LocationProfileSection';
import { POLISH_THEME } from '@/lib/polish';
import { cn } from '@/lib/utils';

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

/** Location profile section: accent borders on inputs while that section is being edited (ring avoided — parent uses overflow hidden for collapse). */
const profileSectionEditInputsClass = '[&_input]:!border-[var(--color-accent)]';

type FlatLocation = Studio & {
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activeMaintenanceCount?: number;
  activeMaintenanceCategoryNames?: string[];
  marketId: string;
  marketName: string;
};

type SelectedStudio = {
  id: string;
  name: string;
  formattedAddress?: string | null;
  marketName: string;
  latitude?: number | null;
  longitude?: number | null;
};

type ProfileFormState = {
  district: string;
  status: string;
  maturity: string;
  studioSize: string;
  priceTier: string;
  openType: string;
  studioOpenDate: string;
  rfSoftOpenDate: string;
  dm: string;
  gm: string;
  agm: string;
  edc: string;
  li: string;
  studioEmail: string;
  gmEmail: string;
  gmTeams: string;
  liEmail: string;
  studioCode: string;
  netsuiteName: string;
  ikismetName: string;
  crName: string;
  crId: string;
  paycomCode: string;
};

function emptyProfileForm(): ProfileFormState {
  return {
    district: '',
    status: '',
    maturity: '',
    studioSize: '',
    priceTier: '',
    openType: '',
    studioOpenDate: '',
    rfSoftOpenDate: '',
    dm: '',
    gm: '',
    agm: '',
    edc: '',
    li: '',
    studioEmail: '',
    gmEmail: '',
    gmTeams: '',
    liEmail: '',
    studioCode: '',
    netsuiteName: '',
    ikismetName: '',
    crName: '',
    crId: '',
    paycomCode: '',
  };
}

function profileResponseToForm(p: LocationProfileResponse): ProfileFormState {
  const pub = p.profile.public;
  const r = p.profile.restricted;
  return {
    district: pub.district ?? '',
    status: pub.status ?? '',
    maturity: pub.maturity ?? '',
    studioSize: pub.studioSize != null ? String(pub.studioSize) : '',
    priceTier: pub.priceTier != null ? String(pub.priceTier) : '',
    openType: pub.openType ?? '',
    studioOpenDate: pub.studioOpenDate ?? '',
    rfSoftOpenDate: pub.rfSoftOpenDate ?? '',
    dm: r?.ownership.dm ?? '',
    gm: r?.ownership.gm ?? '',
    agm: r?.ownership.agm ?? '',
    edc: r?.ownership.edc ?? '',
    li: r?.ownership.li ?? '',
    studioEmail: r?.contact.studioEmail ?? '',
    gmEmail: r?.contact.gmEmail ?? '',
    gmTeams: r?.contact.gmTeams ?? '',
    liEmail: r?.contact.liEmail ?? '',
    studioCode: r?.identifiers.studioCode ?? '',
    netsuiteName: r?.identifiers.netsuiteName ?? '',
    ikismetName: r?.identifiers.ikismetName ?? '',
    crName: r?.identifiers.crName ?? '',
    crId: r?.identifiers.crId ?? '',
    paycomCode: r?.identifiers.paycomCode ?? '',
  };
}

function parseOptionalInt(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

function dateOrNull(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

function formToPatch(f: ProfileFormState): StudioProfilePatch {
  return {
    district: f.district,
    status: f.status,
    maturity: f.maturity,
    studioSize: parseOptionalInt(f.studioSize),
    priceTier: parseOptionalInt(f.priceTier),
    openType: f.openType,
    studioOpenDate: dateOrNull(f.studioOpenDate),
    rfSoftOpenDate: dateOrNull(f.rfSoftOpenDate),
    dm: f.dm,
    gm: f.gm,
    agm: f.agm,
    edc: f.edc,
    li: f.li,
    studioEmail: f.studioEmail,
    gmEmail: f.gmEmail,
    gmTeams: f.gmTeams,
    liEmail: f.liEmail,
    studioCode: f.studioCode,
    netsuiteName: f.netsuiteName,
    ikismetName: f.ikismetName,
    crName: f.crName,
    crId: f.crId,
    paycomCode: f.paycomCode,
  };
}

type ProfileSectionId = 'public' | 'ownership' | 'contact' | 'identifiers';

function sectionFormKeys(section: ProfileSectionId): (keyof ProfileFormState)[] {
  switch (section) {
    case 'public':
      return [
        'district',
        'status',
        'maturity',
        'openType',
        'studioSize',
        'priceTier',
        'studioOpenDate',
        'rfSoftOpenDate',
      ];
    case 'ownership':
      return ['dm', 'gm', 'agm', 'edc', 'li'];
    case 'contact':
      return ['studioEmail', 'gmEmail', 'gmTeams', 'liEmail'];
    case 'identifiers':
      return ['studioCode', 'netsuiteName', 'ikismetName', 'crName', 'crId', 'paycomCode'];
  }
}

function revertProfileSection(
  prev: ProfileFormState,
  data: LocationProfileResponse,
  section: ProfileSectionId,
): ProfileFormState {
  const fresh = profileResponseToForm(data);
  const next = { ...prev };
  for (const k of sectionFormKeys(section)) {
    next[k] = fresh[k];
  }
  return next;
}

export default function AdminMarketsPage() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormMarketId, setAddFormMarketId] = useState('');
  const [selectedStudio, setSelectedStudio] = useState<SelectedStudio | null>(null);
  const [editingStudio, setEditingStudio] = useState<{
    id: string;
    name: string;
    formattedAddress: string;
    latitude: string;
    longitude: string;
    marketName: string;
    externalCode: string;
    isActive: boolean;
  } | null>(null);
  const [nearbyEnabled, setNearbyEnabled] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(25);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm);
  const [secOp, setSecOp] = useState(false);
  const [secOwn, setSecOwn] = useState(false);
  const [secContact, setSecContact] = useState(false);
  const [secId, setSecId] = useState(false);
  const [profileEditingSection, setProfileEditingSection] = useState<ProfileSectionId | null>(null);

  const [addForm, setAddForm] = useState({ name: '', formattedAddress: '', latitude: '', longitude: '' });

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

  const profileQuery = useQuery({
    queryKey: ['location-profile', selectedStudio?.id],
    queryFn: async () => {
      const res = await locationsApi.getProfile(selectedStudio!.id);
      return res.data;
    },
    enabled: !!selectedStudio && !showAddForm,
  });

  useEffect(() => {
    if (!profileQuery.data || !selectedStudio) return;
    setProfileForm(profileResponseToForm(profileQuery.data));
  }, [profileQuery.data, selectedStudio?.id]);

  useEffect(() => {
    setProfileEditingSection(null);
  }, [selectedStudio?.id]);

  const createStudioMut = useMutation({
    mutationFn: ({ marketId }: { marketId: string }) =>
      api.post<{
        id: string;
        name: string;
        formattedAddress: string | null;
        latitude: number | null;
        longitude: number | null;
        market: { id: string; name: string };
      }>('/admin/studios', {
        name: addForm.name.trim(),
        marketId,
        formattedAddress: addForm.formattedAddress.trim(),
        latitude: parseFloat(addForm.latitude),
        longitude: parseFloat(addForm.longitude),
      }),
    onSuccess: (res) => {
      const s = res.data;
      qc.invalidateQueries({ queryKey: ['markets'] });
      setAddForm({ name: '', formattedAddress: '', latitude: '', longitude: '' });
      setShowAddForm(false);
      setAddFormMarketId('');
      setSelectedStudio({
        id: s.id,
        name: s.name,
        formattedAddress: s.formattedAddress,
        marketName: s.market.name,
        latitude: s.latitude,
        longitude: s.longitude,
      });
    },
  });

  const updateStudioMut = useMutation({
    mutationFn: (payload: {
      id: string;
      name: string;
      formattedAddress: string;
      latitude: number;
      longitude: number;
      externalCode: string | null;
      isActive: boolean;
    }) =>
      api.patch(`/admin/studios/${payload.id}`, {
        name: payload.name.trim(),
        formattedAddress: payload.formattedAddress.trim(),
        latitude: payload.latitude,
        longitude: payload.longitude,
        externalCode: payload.externalCode,
        isActive: payload.isActive,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['markets'] });
      qc.invalidateQueries({ queryKey: ['location-profile', vars.id] });
      setEditingStudio(null);
    },
  });

  const saveProfileMut = useMutation({
    mutationFn: ({ studioId, patch }: { studioId: string; patch: StudioProfilePatch }) =>
      adminStudiosApi.patchStudioProfile(studioId, patch),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['location-profile', vars.studioId] });
      setProfileEditingSection(null);
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
    enabled: !!selectedStudio && !showAddForm && nearbyEnabled,
  });
  const nearbyStudios = nearbyData?.data ?? [];

  const openAddForm = () => {
    setSelectedStudio(null);
    setEditingStudio(null);
    setAddFormMarketId(selectedMarketId ?? markets[0]?.id ?? '');
    setAddForm({ name: '', formattedAddress: '', latitude: '', longitude: '' });
    setShowAddForm(true);
  };

  const pickStudio = (loc: FlatLocation) => {
    setShowAddForm(false);
    setEditingStudio(null);
    setSelectedStudio({
      id: loc.id,
      name: loc.name,
      formattedAddress: loc.formattedAddress ?? null,
      marketName: loc.marketName,
      latitude: loc.latitude ?? null,
      longitude: loc.longitude ?? null,
    });
  };

  const clearWorkspace = () => {
    setSelectedStudio(null);
    setEditingStudio(null);
    setShowAddForm(false);
    setProfileForm(emptyProfileForm());
  };

  const studioIdentity = profileQuery.data?.studio;
  const leasePublished = profileQuery.data?.hasPublishedLeaseIqRuleset;
  const missingProfile =
    profileQuery.data?.profile.metadataAvailability === 'missing';
  const showAdminProfileOwnership =
    (profileQuery.data?.visibility.showOwnership ?? false) || !!missingProfile;
  const showAdminProfileContact =
    (profileQuery.data?.visibility.showContact ?? false) || !!missingProfile;
  const showAdminProfileIdentifiers =
    (profileQuery.data?.visibility.showIdentifiers ?? false) || !!missingProfile;

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-bg-page)' }}>
      <Header title={isLoading ? 'Locations' : `Locations (${locations.length})`} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex h-full min-h-0 w-full max-w-[40rem] flex-shrink-0 flex-col gap-4 overflow-hidden p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              elevated
              className="min-w-[200px] max-w-sm flex-1"
            />
            <MarketSearchSelect
              markets={markets.map((m) => ({ id: m.id, name: m.name }))}
              value={selectedMarketId ?? ''}
              onChange={(id) => setSelectedMarketId(id === '' ? null : id)}
              className="min-w-[160px]"
            />
            {!showAddForm && (
              <Button size="md" variant="primary" onClick={openAddForm} className="w-fit shrink-0">
                <Plus className="h-4 w-4" />
                Add Location
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Loading…
              </span>
            </div>
          ) : markets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                No states yet
              </p>
              <p className="max-w-sm text-center text-xs">States are configured by your system administrator.</p>
            </div>
          ) : locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                No locations yet
              </p>
              <p className="max-w-sm text-center text-xs">Add a location from the workspace on the right.</p>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                No locations match your search.
              </p>
              <p className="text-xs">Try a different search or state filter.</p>
            </div>
          ) : (
            <div className="dashboard-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl" style={panel}>
              <div className="min-h-[12rem] flex-1 overflow-y-auto">
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
                      onClick={() => pickStudio(loc)}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {loc.name}
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
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          {showAddForm ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Add location
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded p-1 transition-colors hover:bg-[var(--color-bg-surface-raised)]"
                  style={{ color: 'var(--color-text-muted)' }}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="dashboard-card space-y-3 rounded-xl p-4 shadow-[var(--shadow-sm)]" style={panel}>
                <ComboBox
                  label="State"
                  placeholder="— Select state —"
                  options={markets.map((m) => ({ value: m.id, label: m.name }))}
                  value={addFormMarketId}
                  onChange={setAddFormMarketId}
                />
                <Input
                  label="Name"
                  placeholder="Location name"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                />
                <Input
                  label="Formatted address"
                  placeholder="e.g. 123 Main St, City, State"
                  value={addForm.formattedAddress}
                  onChange={(e) => setAddForm((f) => ({ ...f, formattedAddress: e.target.value }))}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="-90 to 90"
                    value={addForm.latitude}
                    onChange={(e) => setAddForm((f) => ({ ...f, latitude: e.target.value }))}
                    className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50"
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="-180 to 180"
                    value={addForm.longitude}
                    onChange={(e) => setAddForm((f) => ({ ...f, longitude: e.target.value }))}
                    className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50"
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border-default)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Coordinates are used to calculate nearby locations for dispatching.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => createStudioMut.mutate({ marketId: addFormMarketId })}
                    disabled={!addFormValid || !addFormMarketId}
                    loading={createStudioMut.isPending}
                  >
                    Add
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : selectedStudio ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Location workspace
                </h2>
                <button
                  type="button"
                  onClick={clearWorkspace}
                  className="rounded p-1 transition-colors hover:bg-[var(--color-bg-surface-raised)]"
                  style={{ color: 'var(--color-text-muted)' }}
                  aria-label="Close workspace"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  className="dashboard-card rounded-xl p-6 shadow-[var(--shadow-sm)] lg:col-span-2"
                  style={panel}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <Building2
                          className="h-6 w-6 shrink-0"
                          style={{ color: 'var(--color-accent)' }}
                          aria-hidden
                        />
                        <LocationLink
                          studioId={selectedStudio.id}
                          studioName={studioIdentity?.name ?? selectedStudio.name}
                          className="text-[1.3125rem] font-semibold leading-snug"
                        />
                        {studioIdentity && !studioIdentity.isActive && (
                          <span
                            className="rounded px-2 py-1 text-[1.125rem] font-medium leading-none"
                            style={{
                              background: 'var(--color-bg-surface-raised)',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            Inactive
                          </span>
                        )}
                        {leasePublished && (
                          <span
                            className="rounded px-2 py-1 text-[1.125rem] font-medium leading-none"
                            style={{ color: 'var(--color-accent)' }}
                          >
                            Lease IQ published
                          </span>
                        )}
                      </div>
                      {(studioIdentity?.formattedAddress ?? selectedStudio.formattedAddress) && (
                        <p
                          className="mt-2 flex items-start gap-2 text-[1.3125rem] leading-snug"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <MapPin
                            className="mt-1 h-[1.3125rem] w-[1.3125rem] shrink-0"
                            aria-hidden
                          />
                          <span>{studioIdentity?.formattedAddress ?? selectedStudio.formattedAddress}</span>
                        </p>
                      )}
                      <p
                        className="mt-2 font-mono text-lg leading-snug"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {studioIdentity?.market.name ?? selectedStudio.marketName}
                        {studioIdentity?.externalCode != null && studioIdentity.externalCode !== ''
                          ? ` · ${studioIdentity.externalCode}`
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="dashboard-card space-y-3 rounded-xl p-4 shadow-[var(--shadow-sm)]" style={panel}>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    Core location
                  </h3>
                  {editingStudio ? (
                    <>
                      <Input
                        label="Name"
                        value={editingStudio.name}
                        onChange={(e) => setEditingStudio((s) => (s ? { ...s, name: e.target.value } : null))}
                      />
                      <Input
                        label="Formatted address"
                        value={editingStudio.formattedAddress}
                        onChange={(e) =>
                          setEditingStudio((s) => (s ? { ...s, formattedAddress: e.target.value } : null))
                        }
                      />
                      <Input
                        label="External code"
                        placeholder="Optional unique code"
                        value={editingStudio.externalCode}
                        onChange={(e) =>
                          setEditingStudio((s) => (s ? { ...s, externalCode: e.target.value } : null))
                        }
                      />
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingStudio.isActive}
                          onChange={(e) =>
                            setEditingStudio((s) => (s ? { ...s, isActive: e.target.checked } : null))
                          }
                          className="rounded text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                          style={{
                            borderColor: 'var(--color-border-default)',
                            background: 'var(--color-bg-surface)',
                          }}
                        />
                        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          Active location
                        </span>
                      </label>
                      <div>
                        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          Latitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={editingStudio.latitude}
                          onChange={(e) =>
                            setEditingStudio((s) => (s ? { ...s, latitude: e.target.value } : null))
                          }
                          className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                          style={{
                            background: 'var(--color-bg-surface)',
                            border: '1px solid var(--color-border-default)',
                            color: 'var(--color-text-primary)',
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          Longitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={editingStudio.longitude}
                          onChange={(e) =>
                            setEditingStudio((s) => (s ? { ...s, longitude: e.target.value } : null))
                          }
                          className="block w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                          style={{
                            background: 'var(--color-bg-surface)',
                            border: '1px solid var(--color-border-default)',
                            color: 'var(--color-text-primary)',
                          }}
                        />
                      </div>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Coordinates are used for dispatching and nearby search.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            updateStudioMut.mutate({
                              id: editingStudio.id,
                              name: editingStudio.name,
                              formattedAddress: editingStudio.formattedAddress,
                              latitude: parseFloat(editingStudio.latitude),
                              longitude: parseFloat(editingStudio.longitude),
                              externalCode:
                                editingStudio.externalCode.trim() === ''
                                  ? null
                                  : editingStudio.externalCode.trim(),
                              isActive: editingStudio.isActive,
                            })
                          }
                          disabled={!editFormValid}
                          loading={updateStudioMut.isPending}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingStudio(null)}>
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        Name, address, coordinates, external code, and active flag.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const id = studioIdentity?.id ?? selectedStudio.id;
                          setEditingStudio({
                            id,
                            name: studioIdentity?.name ?? selectedStudio.name,
                            formattedAddress:
                              studioIdentity?.formattedAddress ?? selectedStudio.formattedAddress ?? '',
                            latitude:
                              studioIdentity?.latitude != null
                                ? String(studioIdentity.latitude)
                                : selectedStudio.latitude != null
                                  ? String(selectedStudio.latitude)
                                  : '',
                            longitude:
                              studioIdentity?.longitude != null
                                ? String(studioIdentity.longitude)
                                : selectedStudio.longitude != null
                                  ? String(selectedStudio.longitude)
                                  : '',
                            marketName: studioIdentity?.market.name ?? selectedStudio.marketName,
                            externalCode: studioIdentity?.externalCode ?? '',
                            isActive: studioIdentity?.isActive ?? true,
                          });
                        }}
                      >
                        Edit core fields
                      </Button>
                    </>
                  )}
                </div>

                <div className="dashboard-card space-y-3 rounded-xl p-4 shadow-[var(--shadow-sm)]" style={panel}>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    Nearby locations
                  </h3>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={nearbyEnabled}
                      onChange={(e) => setNearbyEnabled(e.target.checked)}
                      className="rounded text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                      style={{
                        borderColor: 'var(--color-border-default)',
                        background: 'var(--color-bg-surface)',
                      }}
                    />
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      Enable nearby search
                    </span>
                  </label>
                  {nearbyEnabled && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          Radius: {radiusMiles} miles
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={radiusMiles}
                          onChange={(e) => setRadiusMiles(Number(e.target.value))}
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg accent-[var(--color-accent)]"
                          style={{ background: 'var(--color-border-default)' }}
                        />
                      </div>
                      {nearbyLoading && (
                        <div className="flex flex-col items-center gap-2 py-4">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Loading…
                          </span>
                        </div>
                      )}
                      {nearbyError && (
                        <p className="text-sm text-amber-500 py-2">
                          {nearbyError instanceof Error && 'response' in nearbyError
                            ? (nearbyError as { response?: { data?: { message?: string } } }).response?.data
                                ?.message ?? 'Could not load nearby locations.'
                            : 'Could not load nearby locations.'}
                        </p>
                      )}
                      {!nearbyLoading && !nearbyError && nearbyStudios.length === 0 && (
                        <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
                          No other locations within this radius.
                        </p>
                      )}
                      {!nearbyLoading && !nearbyError && nearbyStudios.length > 0 && (
                        <>
                          <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Within {radiusMiles} miles ({nearbyStudios.length} found)
                          </p>
                          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                            {nearbyStudios.map((s) => (
                              <li key={s.id} className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                {s.name} ({s.marketName}) — {s.distanceMiles} mi
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  )}
                </div>

                {profileQuery.isLoading && (
                  <div
                    className="dashboard-card flex items-center gap-2 rounded-xl p-4 lg:col-span-2"
                    style={panel}
                  >
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      Loading profile…
                    </span>
                  </div>
                )}

                {profileQuery.isError && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm lg:col-span-2">
                    Could not load location profile. Try again or check your connection.
                  </div>
                )}

                {profileQuery.data && (
                  <>
                    {missingProfile && (
                      <p
                        className="text-sm lg:col-span-2"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        No profile record yet. Open a section, choose <strong>Edit</strong>, fill fields, then{' '}
                        <strong>Save</strong> for that section — the first save creates the profile used on the public
                        location page.
                      </p>
                    )}

                    <div className="lg:col-span-2">
                      <LocationProfileSection
                        title="Studio details (public)"
                        icon={Building2}
                        open={secOp}
                        onToggle={() => setSecOp((o) => !o)}
                        headerActions={
                          selectedStudio ? (
                            profileEditingSection === 'public' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={saveProfileMut.isPending}
                                  onClick={() => {
                                    if (profileQuery.data) {
                                      setProfileForm((f) => revertProfileSection(f, profileQuery.data!, 'public'));
                                    }
                                    setProfileEditingSection(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  loading={saveProfileMut.isPending}
                                  onClick={() =>
                                    saveProfileMut.mutate({
                                      studioId: selectedStudio.id,
                                      patch: formToPatch(profileForm),
                                    })
                                  }
                                >
                                  Save
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={profileEditingSection != null}
                                onClick={() => {
                                  setSecOp(true);
                                  setProfileEditingSection('public');
                                }}
                              >
                                Edit
                              </Button>
                            )
                          ) : null
                        }
                      >
                        <div
                          className={cn(
                            'grid gap-3 sm:grid-cols-2',
                            profileEditingSection !== 'public' && 'pointer-events-none',
                            profileEditingSection === 'public' && profileSectionEditInputsClass,
                          )}
                        >
                          <Input
                            label="District"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.district}
                            onChange={(e) => setProfileForm((f) => ({ ...f, district: e.target.value }))}
                          />
                          <Input
                            label="Status"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.status}
                            onChange={(e) => setProfileForm((f) => ({ ...f, status: e.target.value }))}
                          />
                          <Input
                            label="Maturity"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.maturity}
                            onChange={(e) => setProfileForm((f) => ({ ...f, maturity: e.target.value }))}
                          />
                          <Input
                            label="Open type"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.openType}
                            onChange={(e) => setProfileForm((f) => ({ ...f, openType: e.target.value }))}
                          />
                          <Input
                            label="Studio size"
                            type="number"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.studioSize}
                            onChange={(e) => setProfileForm((f) => ({ ...f, studioSize: e.target.value }))}
                          />
                          <Input
                            label="Price tier"
                            type="number"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.priceTier}
                            onChange={(e) => setProfileForm((f) => ({ ...f, priceTier: e.target.value }))}
                          />
                          <Input
                            label="Studio open date"
                            placeholder="YYYY-MM-DD"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.studioOpenDate}
                            onChange={(e) => setProfileForm((f) => ({ ...f, studioOpenDate: e.target.value }))}
                          />
                          <Input
                            label="RF soft open date"
                            placeholder="YYYY-MM-DD"
                            readOnly={profileEditingSection !== 'public'}
                            tabIndex={profileEditingSection === 'public' ? undefined : -1}
                            value={profileForm.rfSoftOpenDate}
                            onChange={(e) => setProfileForm((f) => ({ ...f, rfSoftOpenDate: e.target.value }))}
                          />
                        </div>
                      </LocationProfileSection>
                    </div>

                    {showAdminProfileOwnership && (
                      <div className="lg:col-span-2">
                        <LocationProfileSection
                          title="Ownership & team"
                          icon={Users}
                          open={secOwn}
                          onToggle={() => setSecOwn((o) => !o)}
                          headerActions={
                            selectedStudio ? (
                              profileEditingSection === 'ownership' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={saveProfileMut.isPending}
                                    onClick={() => {
                                      if (profileQuery.data) {
                                        setProfileForm((f) => revertProfileSection(f, profileQuery.data!, 'ownership'));
                                      }
                                      setProfileEditingSection(null);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    loading={saveProfileMut.isPending}
                                    onClick={() =>
                                      saveProfileMut.mutate({
                                        studioId: selectedStudio.id,
                                        patch: formToPatch(profileForm),
                                      })
                                    }
                                  >
                                    Save
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={profileEditingSection != null}
                                  onClick={() => {
                                    setSecOwn(true);
                                    setProfileEditingSection('ownership');
                                  }}
                                >
                                  Edit
                                </Button>
                              )
                            ) : null
                          }
                        >
                          <div
                            className={cn(
                              'grid gap-3 sm:grid-cols-2',
                              profileEditingSection !== 'ownership' && 'pointer-events-none',
                              profileEditingSection === 'ownership' && profileSectionEditInputsClass,
                            )}
                          >
                            <Input
                              label="DM"
                              readOnly={profileEditingSection !== 'ownership'}
                              tabIndex={profileEditingSection === 'ownership' ? undefined : -1}
                              value={profileForm.dm}
                              onChange={(e) => setProfileForm((f) => ({ ...f, dm: e.target.value }))}
                            />
                            <Input
                              label="GM"
                              readOnly={profileEditingSection !== 'ownership'}
                              tabIndex={profileEditingSection === 'ownership' ? undefined : -1}
                              value={profileForm.gm}
                              onChange={(e) => setProfileForm((f) => ({ ...f, gm: e.target.value }))}
                            />
                            <Input
                              label="AGM"
                              readOnly={profileEditingSection !== 'ownership'}
                              tabIndex={profileEditingSection === 'ownership' ? undefined : -1}
                              value={profileForm.agm}
                              onChange={(e) => setProfileForm((f) => ({ ...f, agm: e.target.value }))}
                            />
                            <Input
                              label="EDC"
                              readOnly={profileEditingSection !== 'ownership'}
                              tabIndex={profileEditingSection === 'ownership' ? undefined : -1}
                              value={profileForm.edc}
                              onChange={(e) => setProfileForm((f) => ({ ...f, edc: e.target.value }))}
                            />
                            <Input
                              label="LI"
                              readOnly={profileEditingSection !== 'ownership'}
                              tabIndex={profileEditingSection === 'ownership' ? undefined : -1}
                              value={profileForm.li}
                              onChange={(e) => setProfileForm((f) => ({ ...f, li: e.target.value }))}
                            />
                          </div>
                        </LocationProfileSection>
                      </div>
                    )}

                    {showAdminProfileContact && (
                      <div className="lg:col-span-2">
                        <LocationProfileSection
                          title="Contact information"
                          icon={Phone}
                          open={secContact}
                          onToggle={() => setSecContact((o) => !o)}
                          headerActions={
                            selectedStudio ? (
                              profileEditingSection === 'contact' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={saveProfileMut.isPending}
                                    onClick={() => {
                                      if (profileQuery.data) {
                                        setProfileForm((f) => revertProfileSection(f, profileQuery.data!, 'contact'));
                                      }
                                      setProfileEditingSection(null);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    loading={saveProfileMut.isPending}
                                    onClick={() =>
                                      saveProfileMut.mutate({
                                        studioId: selectedStudio.id,
                                        patch: formToPatch(profileForm),
                                      })
                                    }
                                  >
                                    Save
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={profileEditingSection != null}
                                  onClick={() => {
                                    setSecContact(true);
                                    setProfileEditingSection('contact');
                                  }}
                                >
                                  Edit
                                </Button>
                              )
                            ) : null
                          }
                        >
                          <div
                            className={cn(
                              'grid gap-3 sm:grid-cols-2',
                              profileEditingSection !== 'contact' && 'pointer-events-none',
                              profileEditingSection === 'contact' && profileSectionEditInputsClass,
                            )}
                          >
                            <Input
                              label="Studio email"
                              readOnly={profileEditingSection !== 'contact'}
                              tabIndex={profileEditingSection === 'contact' ? undefined : -1}
                              value={profileForm.studioEmail}
                              onChange={(e) => setProfileForm((f) => ({ ...f, studioEmail: e.target.value }))}
                            />
                            <Input
                              label="GM email"
                              readOnly={profileEditingSection !== 'contact'}
                              tabIndex={profileEditingSection === 'contact' ? undefined : -1}
                              value={profileForm.gmEmail}
                              onChange={(e) => setProfileForm((f) => ({ ...f, gmEmail: e.target.value }))}
                            />
                            <Input
                              label="GM Teams"
                              readOnly={profileEditingSection !== 'contact'}
                              tabIndex={profileEditingSection === 'contact' ? undefined : -1}
                              value={profileForm.gmTeams}
                              onChange={(e) => setProfileForm((f) => ({ ...f, gmTeams: e.target.value }))}
                            />
                            <Input
                              label="LI email"
                              readOnly={profileEditingSection !== 'contact'}
                              tabIndex={profileEditingSection === 'contact' ? undefined : -1}
                              value={profileForm.liEmail}
                              onChange={(e) => setProfileForm((f) => ({ ...f, liEmail: e.target.value }))}
                            />
                          </div>
                        </LocationProfileSection>
                      </div>
                    )}

                    {showAdminProfileIdentifiers && (
                      <div className="lg:col-span-2">
                        <LocationProfileSection
                          title="Internal identifiers"
                          icon={Tag}
                          open={secId}
                          onToggle={() => setSecId((o) => !o)}
                          headerActions={
                            selectedStudio ? (
                              profileEditingSection === 'identifiers' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={saveProfileMut.isPending}
                                    onClick={() => {
                                      if (profileQuery.data) {
                                        setProfileForm((f) =>
                                          revertProfileSection(f, profileQuery.data!, 'identifiers'),
                                        );
                                      }
                                      setProfileEditingSection(null);
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    loading={saveProfileMut.isPending}
                                    onClick={() =>
                                      saveProfileMut.mutate({
                                        studioId: selectedStudio.id,
                                        patch: formToPatch(profileForm),
                                      })
                                    }
                                  >
                                    Save
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={profileEditingSection != null}
                                  onClick={() => {
                                    setSecId(true);
                                    setProfileEditingSection('identifiers');
                                  }}
                                >
                                  Edit
                                </Button>
                              )
                            ) : null
                          }
                        >
                          <div
                            className={cn(
                              'grid gap-3 sm:grid-cols-2',
                              profileEditingSection !== 'identifiers' && 'pointer-events-none',
                              profileEditingSection === 'identifiers' && profileSectionEditInputsClass,
                            )}
                          >
                            <Input
                              label="Studio code"
                              readOnly={profileEditingSection !== 'identifiers'}
                              tabIndex={profileEditingSection === 'identifiers' ? undefined : -1}
                              value={profileForm.studioCode}
                              onChange={(e) => setProfileForm((f) => ({ ...f, studioCode: e.target.value }))}
                            />
                            <Input
                              label="NetSuite name"
                              readOnly={profileEditingSection !== 'identifiers'}
                              tabIndex={profileEditingSection === 'identifiers' ? undefined : -1}
                              value={profileForm.netsuiteName}
                              onChange={(e) => setProfileForm((f) => ({ ...f, netsuiteName: e.target.value }))}
                            />
                            <Input
                              label="Ikismet name"
                              readOnly={profileEditingSection !== 'identifiers'}
                              tabIndex={profileEditingSection === 'identifiers' ? undefined : -1}
                              value={profileForm.ikismetName}
                              onChange={(e) => setProfileForm((f) => ({ ...f, ikismetName: e.target.value }))}
                            />
                            <Input
                              label="CR name"
                              readOnly={profileEditingSection !== 'identifiers'}
                              tabIndex={profileEditingSection === 'identifiers' ? undefined : -1}
                              value={profileForm.crName}
                              onChange={(e) => setProfileForm((f) => ({ ...f, crName: e.target.value }))}
                            />
                            <Input
                              label="CR ID"
                              readOnly={profileEditingSection !== 'identifiers'}
                              tabIndex={profileEditingSection === 'identifiers' ? undefined : -1}
                              value={profileForm.crId}
                              onChange={(e) => setProfileForm((f) => ({ ...f, crId: e.target.value }))}
                            />
                            <Input
                              label="Paycom code"
                              readOnly={profileEditingSection !== 'identifiers'}
                              tabIndex={profileEditingSection === 'identifiers' ? undefined : -1}
                              value={profileForm.paycomCode}
                              onChange={(e) => setProfileForm((f) => ({ ...f, paycomCode: e.target.value }))}
                            />
                          </div>
                        </LocationProfileSection>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              className="dashboard-card mx-auto max-w-lg rounded-xl p-8 text-center shadow-[var(--shadow-sm)]"
              style={panel}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Select a location
              </p>
              <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Choose a studio from the list on the left, or use <strong>Add Location</strong> to create
                one. This workspace is where you edit core data and the public location profile.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
