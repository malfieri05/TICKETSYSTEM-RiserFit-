'use client';

import Link from 'next/link';
import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  List,
  FlaskConical,
  Loader2,
  RefreshCw,
  Check,
  AlertCircle,
  Plus,
  Minus,
  X,
  Trash2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { UploadDropzone } from '@/components/uploads/UploadDropzone';
import { adminApi, leaseIqApi, type LeaseIqSourceRow } from '@/lib/api';
import { POLISH_THEME } from '@/lib/polish';
import { InstantTooltip, TICKET_TAG_TOOLTIP_FONT_PX } from '@/components/tickets/TicketTagCapsule';
import { formatDistanceToNow } from 'date-fns';
import { HeaderInfoButton, InfoExplainerModal } from '@/components/ui/InfoExplainer';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { MaintenanceCountWithTooltip } from '@/components/ui/MaintenanceCountWithTooltip';

function SimulateLockedTooltipContent() {
  const fontPx = TICKET_TAG_TOOLTIP_FONT_PX * 0.9;
  return (
    <div className="text-left font-medium leading-snug" style={{ fontSize: `${fontPx}px` }}>
      <p className="mb-1.5">To unlock &apos;Simulate&apos;, First:</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>Upload a lease source on the &apos;Source&apos; tab.</li>
        <li>Then &apos;parse&apos; to create a ruleset.</li>
      </ul>
    </div>
  );
}

type TabId = 'source' | 'rules' | 'playground';

const LEASE_IQ_PDF_MAX_BYTES = 10 * 1024 * 1024;

function formatLeasePdfBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isLeasePdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function leaseIqConfidenceLabel(confidence: string): string {
  if (confidence === 'HIGH') return 'High';
  if (confidence === 'MEDIUM') return 'Medium';
  return 'Low';
}

function leaseSourceSecondaryLabel(row: LeaseIqSourceRow): string {
  if (row.sourceType === 'UPLOADED_PDF') {
    if (row.uploadedBytes != null) return formatLeasePdfBytes(row.uploadedBytes);
    if (row.textCharCount != null) return `${row.textCharCount.toLocaleString()} characters extracted`;
    return '—';
  }
  if (row.textCharCount != null) return `${row.textCharCount.toLocaleString()} characters`;
  return '—';
}

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'source', label: 'Source', icon: Upload },
  { id: 'rules', label: 'Rules', icon: List },
  { id: 'playground', label: 'Simulate', icon: FlaskConical },
];

interface StudioOption {
  id: string;
  name: string;
  marketName: string;
  activeMaintenanceCount: number;
  activeMaintenanceCategoryNames: string[];
}

export default function LeaseIQPage() {
  const qc = useQueryClient();
  const [studioId, setStudioId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('source');
  const [locationFilter, setLocationFilter] = useState('');
  const [leaseIqInfoOpen, setLeaseIqInfoOpen] = useState(false);
  const closeLeaseIqInfo = useCallback(() => setLeaseIqInfoOpen(false), []);

  const { data: marketsData } = useQuery({
    queryKey: ['admin', 'markets'],
    queryFn: () => adminApi.listMarkets(),
  });

  const { data: rulesetCoverage, isLoading: rulesetCoverageLoading } = useQuery({
    queryKey: ['lease-iq', 'studios-with-rulesets'],
    queryFn: () => leaseIqApi.studiosWithRulesets(),
  });

  const publishedStudioIdsSet = useMemo(
    () => new Set((rulesetCoverage?.data?.publishedStudioIds ?? []) as string[]),
    [rulesetCoverage?.data?.publishedStudioIds],
  );

  const publishedLeaseIqLocationCount = publishedStudioIdsSet.size;

  const studios: StudioOption[] = useMemo(() => {
    const list = (marketsData?.data ?? []).flatMap(
      (m: {
        id: string;
        name: string;
        studios?: {
          id: string;
          name: string;
          activeMaintenanceCount?: number;
          activeMaintenanceCategoryNames?: string[];
        }[];
      }) =>
        (m.studios ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          marketName: m.name,
          activeMaintenanceCount: s.activeMaintenanceCount ?? 0,
          activeMaintenanceCategoryNames: s.activeMaintenanceCategoryNames ?? [],
        })),
    );
    list.sort((a, b) => a.marketName.localeCompare(b.marketName) || a.name.localeCompare(b.name));
    return list;
  }, [marketsData]);

  const filteredStudios = useMemo(() => {
    const q = locationFilter.trim().toLowerCase();
    if (!q) return studios;
    return studios.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.marketName.toLowerCase().includes(q),
    );
  }, [studios, locationFilter]);

  const totalLocationCount = studios.length;

  const selectedStudio = useMemo(
    () => (studioId ? studios.find((s) => s.id === studioId) ?? null : null),
    [studios, studioId],
  );
  const { data: studioRulesets } = useQuery({
    queryKey: ['lease-iq', 'rulesets', studioId],
    queryFn: () => leaseIqApi.listRulesets(studioId!),
    enabled: !!studioId,
  });
  const hasPublishedRulesetForStudio = (studioRulesets?.data ?? []).some((r) => r.status === 'PUBLISHED');

  useEffect(() => {
    if (tab === 'playground' && !hasPublishedRulesetForStudio) {
      setTab('source');
    }
  }, [tab, hasPublishedRulesetForStudio]);

  const panel = {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
  };

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        title={
          <div className="flex min-w-0 items-center gap-2">
            <h1
              className="min-w-0 truncate text-base font-semibold"
              style={{ color: 'var(--color-text-app-header)' }}
            >
              Lease IQ
            </h1>
            <HeaderInfoButton
              onClick={() => setLeaseIqInfoOpen(true)}
              ariaLabel="What is Lease IQ? Opens an explanation."
            />
          </div>
        }
      />
      <InfoExplainerModal
        open={leaseIqInfoOpen}
        onClose={closeLeaseIqInfo}
        titleId="lease-iq-about-title"
        title={<>What is &apos;Lease IQ&apos;?</>}
      >
        <ul className="list-disc space-y-2 pl-4">
          <li>
            Lease IQ functionality allows the admin to upload and store the current lease agreements per studio location,
            in the system.
          </li>
          <li>
            The lease agreement is then read and analyzed by the system (via &apos;Parse&apos;) in order to develop an
            operating &apos;ruleset&apos; per that location.
          </li>
        </ul>
        <p>
          Each new MAINTENANCE TICKET that is created is then filtered through this lease ruleset to determine whether
          the individual ticket falls under Landlord vs. Tenant responsibility.
        </p>
        <p>Upon determination, a simple label is added to the ticket itself that denotes 1 of 3 labels:</p>
        <ul className="ml-4 list-none space-y-1 border-l-2 pl-4" style={{ borderColor: 'var(--color-border-default)' }}>
          <li>1) Likely Landlord</li>
          <li>2) Likely Tenant</li>
          <li>3) Needs Human Review</li>
        </ul>
      </InfoExplainerModal>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left rail — half the former 40rem cap so list boxes read narrower */}
        <aside className="flex h-full min-h-0 w-full max-w-[20rem] flex-shrink-0 flex-col gap-4 overflow-hidden p-6">
          <div className="w-full min-w-0 space-y-1.5">
            <p className="text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
              Locations with a published Lease IQ ruleset:{' '}
              <span className="tabular-nums font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {rulesetCoverageLoading ? (
                  <>
                    <span aria-busy="true">…</span>/{totalLocationCount}
                  </>
                ) : (
                  <>
                    {publishedLeaseIqLocationCount}/{totalLocationCount}
                  </>
                )}
              </span>
            </p>
            <Input
              id="lease-iq-studio-filter"
              label="Studio (location)"
              type="search"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="Type to filter…"
              autoComplete="off"
              aria-controls="lease-iq-studio-list"
            />
          </div>
          <div className="dashboard-card flex min-h-0 flex-1 flex-col rounded-xl overflow-hidden" style={panel}>
            <div id="lease-iq-studio-list" className="min-h-[12rem] flex-1 overflow-y-auto">
              {studios.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No locations. Configure markets and studios in Locations first.
                </div>
              ) : filteredStudios.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {`No locations match "${locationFilter.trim()}".`}
                </div>
              ) : (
                filteredStudios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 border-b px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-[var(--color-bg-surface-raised)]"
                    style={{
                      borderColor: 'var(--color-border-default)',
                      background:
                        studioId === s.id ? POLISH_THEME.adminStudioListSelectedBg : undefined,
                      borderLeft:
                        studioId === s.id ? '3px solid var(--color-accent)' : '3px solid transparent',
                    }}
                    onClick={() => setStudioId(s.id)}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="flex min-w-0 items-baseline gap-1 text-sm font-medium"
                        style={{ color: 'var(--color-text-primary)' }}
                        title={`${s.name} — ${s.marketName}`}
                      >
                        <span className="min-w-0 truncate">{s.name}</span>
                        <span className="shrink-0">
                          <MaintenanceCountWithTooltip
                            count={s.activeMaintenanceCount}
                            categoryNames={s.activeMaintenanceCategoryNames}
                          />
                        </span>
                      </span>
                      <span className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }} title={s.marketName}>
                        {s.marketName}
                      </span>
                    </div>
                    {publishedStudioIdsSet.has(s.id) ? (
                      <InstantTooltip
                        content={
                          <span className="inline-flex items-center gap-1.5 text-left">
                            <Check
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2.5}
                              style={{ color: POLISH_THEME.success }}
                              aria-hidden
                            />
                            <span>Has published LeaseIQ ruleset</span>
                          </span>
                        }
                        compact
                        className="inline-flex shrink-0 text-[var(--color-text-muted)]"
                      >
                        <span className="inline-flex">
                          <FileText className="h-4 w-4 opacity-70" strokeWidth={2} aria-hidden />
                        </span>
                      </InstantTooltip>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Detail — Source / Rules / Playground to the right of the list */}
        <section
          className="min-h-[40vh] min-w-0 flex-1 overflow-y-auto border-t lg:min-h-0 lg:border-l lg:border-t-0"
          style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-page)' }}
        >
          {!studioId ? (
            <div
              className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-8 py-12 text-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <FileText className="h-10 w-10 opacity-40" aria-hidden />
              <p className="max-w-sm text-sm">Choose a location on the left to upload lease source, edit rules, or run simulations.</p>
            </div>
          ) : (
            <div className="p-6">
              {selectedStudio && (
                <div
                  className="dashboard-card mb-5 rounded-xl px-4 py-3"
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-default)',
                    boxShadow: 'var(--shadow-panel)',
                  }}
                >
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                    Selected location
                  </p>
                  <h2 className="mt-1 text-lg font-semibold leading-tight">
                    <Link
                      href={`/locations/${selectedStudio.id}`}
                      className="text-[var(--color-accent)] hover:text-[var(--color-accent)] hover:underline"
                      aria-label={`Open location profile for ${selectedStudio.name}`}
                    >
                      {selectedStudio.name}
                    </Link>
                  </h2>
                  <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {selectedStudio.marketName}
                  </p>
                </div>
              )}

              <div
                className="mb-6 flex flex-wrap gap-2 border-b"
                style={{ borderColor: 'var(--color-border-default)' }}
              >
                {TABS.map(({ id, label, icon: Icon }) => {
                  const simulateLocked = id === 'playground' && !hasPublishedRulesetForStudio;
                  const tabButton = (
                    <button
                      type="button"
                      onClick={() => {
                        if (simulateLocked) return;
                        setTab(id);
                      }}
                      aria-disabled={simulateLocked}
                      aria-label={
                        simulateLocked
                          ? 'Simulate (locked). To unlock: upload a lease source on the Source tab, then parse to create a ruleset.'
                          : undefined
                      }
                      className="flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors"
                      style={{
                        background: tab === id ? 'var(--color-bg-surface)' : 'transparent',
                        color: tab === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        borderBottom:
                          tab === id ? '2px solid var(--color-accent)' : '2px solid transparent',
                        opacity: simulateLocked ? 0.5 : 1,
                        cursor: simulateLocked ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                  return (
                    <Fragment key={id}>
                      {simulateLocked ? (
                        <InstantTooltip content={<SimulateLockedTooltipContent />} className="inline-flex">
                          {tabButton}
                        </InstantTooltip>
                      ) : (
                        tabButton
                      )}
                    </Fragment>
                  );
                })}
              </div>

              {tab === 'source' && (
                <SourceTab studioId={studioId} qc={qc} onParsed={() => setTab('rules')} />
              )}
              {tab === 'rules' && <RulesTab studioId={studioId} qc={qc} />}
              {tab === 'playground' && <PlaygroundTab studioId={studioId} />}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SourceTab({
  studioId,
  qc,
  onParsed,
}: {
  studioId: string;
  qc: QueryClient;
  onParsed: () => void;
}) {
  const [pastedText, setPastedText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<'upload' | 'paste'>('upload');
  const [uploadPickError, setUploadPickError] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const replacePdfInputRef = useRef<HTMLInputElement>(null);
  const prevSourceListLenRef = useRef(0);

  const { data: sources, isPending: sourcesLoading } = useQuery({
    queryKey: ['lease-iq', 'sources', studioId],
    queryFn: () => leaseIqApi.listSources(studioId),
    enabled: !!studioId,
  });

  const sourceList = useMemo(() => {
    const body = sources?.data;
    return Array.isArray(body) ? body : [];
  }, [sources?.data]);

  useEffect(() => {
    prevSourceListLenRef.current = 0;
  }, [studioId]);

  useEffect(() => {
    if (sourcesLoading) return;
    const len = sourceList.length;
    const prevLen = prevSourceListLenRef.current;
    prevSourceListLenRef.current = len;

    if (len === 0) {
      setSelectedSourceIds([]);
      return;
    }

    setSelectedSourceIds((prev) => {
      const valid = prev.filter((id) => sourceList.some((s) => s.id === id));
      if (valid.length > 0) return valid;
      if (prevLen === 0 && len > 0) return [sourceList[0].id];
      return prev;
    });
  }, [sourcesLoading, studioId, sourceList]);

  const selectedIdSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);
  const orderedSelectedIds = useMemo(
    () => sourceList.filter((s) => selectedIdSet.has(s.id)).map((s) => s.id),
    [sourceList, selectedIdSet],
  );

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!uploadFile) throw new Error('No file selected');
      return leaseIqApi.uploadSource(studioId, uploadFile);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'sources', studioId] });
      setUploadFile(null);
      const newId = res.data?.id;
      if (newId) setSelectedSourceIds([newId]);
    },
  });

  const pasteMutation = useMutation({
    mutationFn: () => leaseIqApi.pasteSource(studioId, pastedText),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'sources', studioId] });
      setPastedText('');
      const newId = res.data?.id;
      if (newId) setSelectedSourceIds([newId]);
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: (sourceId: string) => leaseIqApi.deleteSource(studioId, sourceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lease-iq', 'sources', studioId] }),
  });

  const parseMutation = useMutation({
    mutationFn: (sourceIds: string[]) => leaseIqApi.parse(studioId, sourceIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'rulesets', studioId] });
      qc.invalidateQueries({ queryKey: ['lease-iq', 'studios-with-rulesets'] });
      onParsed();
    },
  });

  const hasPendingLocalSource =
    uploadFile != null || (sourceMode === 'paste' && pastedText.trim().length > 0);
  const hasServerSources = sourceList.length > 0 && !sourcesLoading;
  const hasParseSelection = orderedSelectedIds.length > 0;
  const canParse = hasServerSources && hasParseSelection && !hasPendingLocalSource;
  const parseDisabled = parseMutation.isPending || !canParse || deleteSourceMutation.isPending;

  function toggleSourceSelected(id: string) {
    setSelectedSourceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-6" style={{ color: 'var(--color-text-primary)' }}>
      <section className="rounded-lg p-4" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
        <h3 className="font-medium mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Add lease source
        </h3>
        <SlidingSegmentedControl
          options={[
            { value: 'upload', label: 'Upload PDF' },
            { value: 'paste', label: 'Paste Text' },
          ]}
          value={sourceMode}
          onChange={(v) => setSourceMode(v as 'upload' | 'paste')}
          aria-label="Lease source input method"
          size="md"
          className="mb-4 w-fit"
        />

        {sourceMode === 'upload' ? (
          <>
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              PDF only, max 10 MB. Text is extracted for Lease IQ; the file may also be stored in object storage when configured.
            </p>
            {!uploadFile ? (
              <UploadDropzone
                label=""
                description=""
                maxSizeBytes={LEASE_IQ_PDF_MAX_BYTES}
                accept=".pdf,application/pdf"
                selectPrompt="Click to select a PDF file"
                onFilesSelected={(files) => {
                  setUploadPickError(null);
                  setUploadFile(files[0] ?? null);
                }}
              />
            ) : (
              <div className="space-y-2">
                <div
                  className="flex min-h-[152px] items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 outline-none transition-colors duration-150 hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-surface-raised)]"
                  style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-root)' }}
                  role="button"
                  tabIndex={0}
                  aria-label="Replace PDF file"
                  onClick={() => replacePdfInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      replacePdfInputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={replacePdfInputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      if (f.size > LEASE_IQ_PDF_MAX_BYTES) {
                        setUploadPickError('File must be 10 MB or smaller.');
                        return;
                      }
                      if (!isLeasePdfFile(f)) {
                        setUploadPickError('Only PDF files are allowed.');
                        return;
                      }
                      setUploadPickError(null);
                      setUploadFile(f);
                    }}
                  />
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="flex max-w-full items-center gap-4">
                      <div
                        className="flex h-11 w-10 shrink-0 items-center justify-center rounded border text-[11px] font-bold leading-none tracking-tight"
                        style={{
                          background: 'var(--color-bg-surface)',
                          borderColor: 'var(--color-border-default)',
                          color: POLISH_THEME.dueDateToday,
                        }}
                        aria-hidden
                      >
                        PDF
                      </div>
                      <div className="min-w-0 max-w-[min(16rem,calc(100vw-8rem))] text-left sm:max-w-xs">
                        <p
                          className="truncate text-sm font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                          title={uploadFile.name}
                        >
                          {uploadFile.name}
                        </p>
                        <p className="mt-0.5 text-xs font-medium tabular-nums" style={{ color: POLISH_THEME.success }}>
                          {formatLeasePdfBytes(uploadFile.size)}
                        </p>
                      </div>
                    </div>
                    <span className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Click to choose a different file
                    </span>
                  </div>
                </div>
                {uploadPickError && <p className="text-xs text-red-600">{uploadPickError}</p>}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="min-w-[16rem] justify-center"
                onClick={() => uploadMutation.mutate()}
                disabled={!uploadFile || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload
              </Button>
              {uploadFile && (
                <button
                  type="button"
                  className="text-sm font-medium underline-offset-2 hover:underline"
                  style={{ color: 'var(--color-accent)' }}
                  onClick={() => {
                    setUploadFile(null);
                    setUploadPickError(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Paste structured extraction text (e.g. sections for Landlord / Tenant and line items). Saved entries appear under Uploaded documents for parsing.
            </p>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste lease responsibility extraction (e.g. ## Landlord, HVAC, plumbing...)"
              rows={8}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                background: 'var(--color-bg-root)',
                borderColor: 'var(--color-border-default)',
                color: 'var(--color-text-primary)',
              }}
            />
            <Button
              onClick={() => pasteMutation.mutate()}
              disabled={!pastedText.trim() || pasteMutation.isPending}
            >
              {pasteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Save pasted text
            </Button>
          </>
        )}
      </section>

      <section className="rounded-lg p-4" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
        <h3 className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Uploaded documents
        </h3>
        <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Select one or more saved sources. Parse merges them in list order (newest at top) into one draft ruleset.
        </p>

        {sourcesLoading ? (
          <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Loading sources…
          </p>
        ) : sourceList.length === 0 ? (
          <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No sources yet for this location. Add a PDF or pasted text above.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-3 text-xs font-medium">
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                style={{ color: 'var(--color-accent)' }}
                onClick={() => setSelectedSourceIds(sourceList.map((s) => s.id))}
              >
                Select all
              </button>
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                style={{ color: 'var(--color-accent)' }}
                onClick={() => setSelectedSourceIds([])}
              >
                Clear selection
              </button>
            </div>
            <ul className="mb-6 space-y-2" aria-label="Saved lease sources for this location">
              {sourceList.map((row) => {
                const isPdf = row.sourceType === 'UPLOADED_PDF';
                const title = isPdf
                  ? row.originalFileName ?? 'Uploaded PDF'
                  : 'Pasted extraction';
                const checkId = `lease-src-${row.id}`;
                const deleting = deleteSourceMutation.isPending && deleteSourceMutation.variables === row.id;
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                    style={{
                      borderColor: 'var(--color-border-default)',
                      background: 'var(--color-bg-root)',
                    }}
                  >
                    <input
                      id={checkId}
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border cursor-pointer"
                      style={{ borderColor: 'var(--color-border-default)', accentColor: 'var(--color-accent)' }}
                      checked={selectedIdSet.has(row.id)}
                      onChange={() => toggleSourceSelected(row.id)}
                      aria-label={`Include ${title} in parse`}
                    />
                    <label htmlFor={checkId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-4">
                      <div
                        className="flex h-11 w-10 shrink-0 items-center justify-center rounded border text-[10px] font-bold leading-none tracking-tight"
                        style={{
                          background: 'var(--color-bg-surface)',
                          borderColor: 'var(--color-border-default)',
                          color: isPdf ? POLISH_THEME.dueDateToday : '#9333ea',
                        }}
                        aria-hidden
                      >
                        {isPdf ? 'PDF' : 'TEXT'}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text-primary)' }} title={title}>
                          {title}
                        </p>
                        <p className="mt-0.5 text-xs font-medium tabular-nums" style={{ color: POLISH_THEME.success }}>
                          {leaseSourceSecondaryLabel(row)}
                        </p>
                        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDistanceToNow(new Date(row.uploadedAt), { addSuffix: true })}
                        </p>
                      </div>
                    </label>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-2 transition-colors hover:bg-[var(--color-bg-surface-raised)] disabled:opacity-50"
                      style={{ color: 'var(--color-text-muted)' }}
                      aria-label={`Remove ${title}`}
                      disabled={deleting}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Remove "${title}" from this location? This cannot be undone.`,
                          )
                        ) {
                          return;
                        }
                        deleteSourceMutation.mutate(row.id);
                      }}
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="border-t pt-4" style={{ borderColor: 'var(--color-border-default)' }}>
          <h3 className="font-medium mb-2">Parse</h3>
          <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Create a DRAFT ruleset from the selected saved sources. A PDF you only picked in the field above is not used until you click Upload.
          </p>
          {!hasServerSources && !sourcesLoading && (
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Upload a PDF or save pasted text first — then select sources and parse.
            </p>
          )}
          {hasServerSources && hasPendingLocalSource && (
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Finish or clear your draft above before parsing so you are not surprised by which text is merged.
            </p>
          )}
          {hasServerSources && !hasPendingLocalSource && !hasParseSelection && (
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Select at least one document above to parse.
            </p>
          )}
          <Button
            size="lg"
            className="min-w-[16rem] justify-center"
            onClick={() => parseMutation.mutate(orderedSelectedIds)}
            disabled={parseDisabled}
            title={
              !hasServerSources && !sourcesLoading
                ? 'Add a lease source for this location first'
                : hasPendingLocalSource
                  ? 'Upload or clear your draft first'
                  : !hasParseSelection
                    ? 'Select one or more sources in the list'
                    : undefined
            }
          >
            {parseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Parse selected
          </Button>
          {parseMutation.isError && (
            <p className="mt-2 text-sm text-red-500">
              {(
                parseMutation.error as { response?: { data?: { message?: string } } } & Error
              ).response?.data?.message?.toString() ?? (parseMutation.error as Error).message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

type LeaseIqRuleRow = {
  id: string;
  ruleType: string;
  categoryScope: string | null;
  clauseReference: string | null;
  notes: string | null;
  priority: number;
  terms: Array<{ id: string; term: string; termType: string }>;
};

function LeaseIqRulesList({ rules }: { rules: LeaseIqRuleRow[] | undefined }) {
  const list = rules ?? [];
  if (list.length === 0) {
    return (
      <p className="text-sm py-3" style={{ color: 'var(--color-text-muted)' }}>
        No rules in this set.
      </p>
    );
  }
  return (
    <div
      className="max-h-[min(32rem,70vh)] space-y-0 overflow-y-auto rounded-lg p-4"
      style={{ background: 'var(--color-bg-root)', border: '1px solid var(--color-border-default)' }}
    >
      {list.map((rule) => (
        <div key={rule.id} className="border-b py-3 text-sm last:border-b-0" style={{ borderColor: 'var(--color-border-default)' }}>
          <div>
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {rule.ruleType.replace(/_/g, ' ')}
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>{` — priority ${rule.priority}`}</span>
          </div>
          {rule.categoryScope ? (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Category scope:
              </span>{' '}
              {rule.categoryScope}
            </p>
          ) : null}
          {rule.clauseReference ? (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Clause:
              </span>{' '}
              {rule.clauseReference}
            </p>
          ) : null}
          {rule.notes ? (
            <p
              className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {rule.notes}
            </p>
          ) : null}
          {rule.terms && rule.terms.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5" style={{ color: 'var(--color-text-primary)' }}>
              {rule.terms.map((t) => (
                <li key={t.id} className="text-sm">
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                    {t.termType}
                    {': '}
                  </span>
                  {t.term}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
              No terms
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function RulesTab({ studioId, qc }: { studioId: string; qc: QueryClient }) {
  const [publishedRulesOpen, setPublishedRulesOpen] = useState(false);

  useEffect(() => {
    setPublishedRulesOpen(false);
  }, [studioId]);

  const { data: rulesets } = useQuery({
    queryKey: ['lease-iq', 'rulesets', studioId],
    queryFn: () => leaseIqApi.listRulesets(studioId),
    enabled: !!studioId,
  });

  const draftRuleset = rulesets?.data?.find((r) => r.status === 'DRAFT');
  const publishedRuleset = rulesets?.data?.find((r) => r.status === 'PUBLISHED');

  const { data: rulesetDetail } = useQuery({
    queryKey: ['lease-iq', 'ruleset', draftRuleset?.id],
    queryFn: () => leaseIqApi.getRuleset(draftRuleset!.id),
    enabled: !!draftRuleset?.id,
  });

  const { data: publishedRulesetDetail, isPending: publishedDetailLoading } = useQuery({
    queryKey: ['lease-iq', 'ruleset', publishedRuleset?.id],
    queryFn: () => leaseIqApi.getRuleset(publishedRuleset!.id),
    enabled: !!publishedRuleset?.id && publishedRulesOpen,
  });

  const publishMutation = useMutation({
    mutationFn: () => leaseIqApi.publish(studioId, draftRuleset!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'rulesets', studioId] });
      qc.invalidateQueries({ queryKey: ['lease-iq', 'studios-with-rulesets'] });
    },
  });

  return (
    <div className="space-y-4" style={{ color: 'var(--color-text-primary)' }}>
      {publishedRuleset && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-stretch gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 shrink-0 rounded-full p-0"
              style={{
                border: '1px solid rgba(22, 163, 74, 0.45)',
                color: 'rgb(20, 83, 45)',
              }}
              onClick={() => setPublishedRulesOpen((o) => !o)}
              aria-expanded={publishedRulesOpen}
              aria-label={publishedRulesOpen ? 'Hide full text of published rules' : 'Show full text of published rules'}
            >
              {publishedRulesOpen ? <Minus className="h-4 w-4" strokeWidth={2.5} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
            </Button>
            <div
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
              style={{
                background: 'rgba(22, 163, 74, 0.12)',
                border: '1px solid rgba(22, 163, 74, 0.35)',
                color: 'rgb(20, 83, 45)',
              }}
            >
              <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span>
                Published ruleset has {publishedRuleset._count?.rules ?? 0} rules. (Current evaluation uses this set)
              </span>
            </div>
          </div>
          {publishedRulesOpen && (
            <div>
              {publishedDetailLoading ? (
                <div className="flex items-center gap-2 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Loading published rules…
                </div>
              ) : (
                <LeaseIqRulesList rules={publishedRulesetDetail?.data?.rules} />
              )}
            </div>
          )}
        </div>
      )}
      {!draftRuleset ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No DRAFT ruleset. Use the Source tab to upload or paste, then Parse to create a DRAFT.
        </p>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            DRAFT ruleset: {rulesetDetail?.data?.rules?.length ?? 0} rules. Edit via API or re-parse to replace.
          </p>
          <LeaseIqRulesList rules={rulesetDetail?.data?.rules} />
          <Button
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || (rulesetDetail?.data?.rules?.length ?? 0) === 0}
          >
            {publishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Publish rules for this location
          </Button>
          {publishMutation.isError && (
            <p className="text-sm text-red-500">{(publishMutation.error as Error).message}</p>
          )}
        </>
      )}
    </div>
  );
}

function PlaygroundTab({ studioId }: { studioId: string }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maintenanceCategoryId, setMaintenanceCategoryId] = useState<string>('');
  const [result, setResult] = useState<{
    suggestedResponsibility: string;
    confidence: string;
    matchedRuleIds: string[];
    matchedTerms: string[];
    explanation: string;
  } | null>(null);

  const { data: taxonomy } = useQuery({
    queryKey: ['admin', 'ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const maintenanceCategories = taxonomy?.data?.maintenanceCategories ?? [];

  const playgroundMutation = useMutation({
    mutationFn: () =>
      leaseIqApi.playground({
        studioId,
        maintenanceCategoryId: maintenanceCategoryId || undefined,
        title,
        description,
      }),
    onSuccess: (res) => {
      setResult(res.data);
    },
  });

  return (
    <div className="space-y-4" style={{ color: 'var(--color-text-primary)' }}>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Create 'demo tickets' to simulate how the published ruleset will classify it.
      </p>
      <div>
        <label className="block text-sm font-medium mb-1">Maintenance category (optional)</label>
        <select
          value={maintenanceCategoryId}
          onChange={(e) => setMaintenanceCategoryId(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm min-w-[200px]"
          style={{
            background: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
        >
          <option value="">— None —</option>
          {maintenanceCategories.map((c: { id: string; name: string }) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. HVAC not cooling"
      />
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{
            background: 'var(--color-bg-surface)',
            borderColor: 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
          placeholder="e.g. The air conditioner in the main room is not cooling."
        />
      </div>
      <Button
        onClick={() => playgroundMutation.mutate()}
        disabled={!title.trim() || !description.trim() || playgroundMutation.isPending}
      >
        {playgroundMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
        Run evaluation
      </Button>
      {result && (
        <div
          className="rounded-lg p-4 mt-4"
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <h4 className="font-medium mb-2">Result</h4>
          <p className="text-sm">
            <strong>Suggested responsibility:</strong> {result.suggestedResponsibility.replace(/_/g, ' ')}
          </p>
          <p className="text-sm flex items-center gap-1.5">
            <strong>Confidence:</strong> {leaseIqConfidenceLabel(result.confidence)}
            <InfoPopover ariaLabel="How confidence is calculated" direction="up">
              <p className="font-semibold mb-2" style={{ color: 'var(--color-accent)' }}>Confidence levels</p>
              <ul className="space-y-1.5">
                <li><span className="font-semibold">High:</span> Strong match — category and priority terms both point clearly to one party.</li>
                <li><span className="font-semibold">Medium:</span> Partial match — either a category or priority signal was found, but not both.</li>
                <li><span className="font-semibold">Low:</span> Weak match — only general keywords matched, or signals conflicted.</li>
              </ul>
            </InfoPopover>
          </p>
          <p className="text-sm mt-1">{result.explanation}</p>
          {result.matchedTerms?.length > 0 && (
            <p className="text-sm mt-1">
              Matched terms: {result.matchedTerms.join(', ')}
            </p>
          )}
        </div>
      )}
      {playgroundMutation.isError && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          {(playgroundMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
