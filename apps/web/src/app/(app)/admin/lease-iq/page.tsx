'use client';

import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { adminApi, leaseIqApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

type TabId = 'source' | 'rules' | 'playground';

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'source', label: 'Source', icon: Upload },
  { id: 'rules', label: 'Rules', icon: List },
  { id: 'playground', label: 'Playground', icon: FlaskConical },
];

interface StudioOption {
  id: string;
  name: string;
  marketName: string;
}

export default function LeaseIQPage() {
  const qc = useQueryClient();
  const [studioId, setStudioId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('source');

  const { data: marketsData } = useQuery({
    queryKey: ['admin', 'markets'],
    queryFn: () => adminApi.listMarkets(),
  });

  const studios: StudioOption[] = useMemo(() => {
    const list = (marketsData?.data ?? []).flatMap((m: { id: string; name: string; studios: { id: string; name: string }[] }) =>
      (m.studios ?? []).map((s) => ({ id: s.id, name: s.name, marketName: m.name })),
    );
    list.sort((a, b) => a.marketName.localeCompare(b.marketName) || a.name.localeCompare(b.name));
    return list;
  }, [marketsData]);

  const studioOptions = useMemo(
    () => studios.map((s) => ({ value: s.id, label: `${s.name} (${s.marketName})` })),
    [studios],
  );

  const displayStudios = useMemo(() => {
    if (!studioId) return studios;
    const selected = studios.find((s) => s.id === studioId);
    if (!selected) return studios;
    const rest = studios.filter((s) => s.id !== studioId);
    return [selected, ...rest];
  }, [studios, studioId]);

  const panel = {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-root)' }}>
      <Header title="Lease IQ" />
      <main className="p-6 max-w-5xl mx-auto">
        <div className="mb-4 max-w-md">
          <ComboBox
            label="Studio (location)"
            options={studioOptions}
            value={studioId ?? ''}
            onChange={(v) => setStudioId(v || null)}
            placeholder="Select a studio"
            clearable={true}
          />
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Select a studio from the list below to manage lease rules and test evaluations.
        </p>

        <div
          className="rounded-xl overflow-hidden mb-6"
          style={panel}
        >
          <div className="max-h-64 overflow-y-auto">
            {displayStudios.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No locations. Configure markets and studios in Locations first.
              </div>
            ) : (
              displayStudios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left flex flex-col gap-0.5 px-4 py-3 border-b last:border-b-0 cursor-pointer transition-colors duration-150 hover:bg-[var(--color-bg-surface-raised)]"
                  style={{
                    borderColor: 'var(--color-border-default)',
                    background:
                      studioId === s.id
                        ? 'rgba(52, 120, 196, 0.12)'
                        : undefined,
                    borderLeft:
                      studioId === s.id
                        ? '3px solid var(--color-accent)'
                        : '3px solid transparent',
                  }}
                  onClick={() => setStudioId(s.id)}
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {s.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {s.marketName}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {studioId && (
          <>
            <div
              className="flex gap-2 border-b mb-6"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
                  style={{
                    background: tab === id ? 'var(--color-bg-surface)' : 'transparent',
                    color: tab === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    borderBottom:
                      tab === id ? '2px solid var(--color-accent)' : '2px solid transparent',
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {tab === 'source' && (
              <SourceTab studioId={studioId} qc={qc} onParsed={() => setTab('rules')} />
            )}
            {tab === 'rules' && <RulesTab studioId={studioId} qc={qc} />}
            {tab === 'playground' && <PlaygroundTab studioId={studioId} />}
          </>
        )}
      </main>
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

  const { data: sources } = useQuery({
    queryKey: ['lease-iq', 'sources', studioId],
    queryFn: () => leaseIqApi.listSources(studioId),
    enabled: !!studioId,
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!uploadFile) throw new Error('No file selected');
      return leaseIqApi.uploadSource(studioId, uploadFile);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'sources', studioId] });
      setUploadFile(null);
    },
  });

  const pasteMutation = useMutation({
    mutationFn: () => leaseIqApi.pasteSource(studioId, pastedText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'sources', studioId] });
      setPastedText('');
    },
  });

  const parseMutation = useMutation({
    mutationFn: () => leaseIqApi.parse(studioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'rulesets', studioId] });
      onParsed();
    },
  });

  const lastSource = sources?.data?.[0];

  return (
    <div className="space-y-6" style={{ color: 'var(--color-text-primary)' }}>
      <section className="rounded-lg p-4" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
        <h3 className="font-medium mb-2">Upload PDF</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!uploadFile || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </div>
      </section>

      <section className="rounded-lg p-4" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
        <h3 className="font-medium mb-2">Paste extraction</h3>
        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste lease responsibility extraction (e.g. ## Landlord, HVAC, plumbing...)"
          rows={6}
          className="w-full rounded-lg border px-3 py-2 text-sm mb-2"
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
          {pasteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save pasted text
        </Button>
      </section>

      {lastSource && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Last source: {lastSource.sourceType} — {lastSource.originalFileName ?? 'pasted'} —{' '}
          {formatDistanceToNow(new Date(lastSource.uploadedAt), { addSuffix: true })}
        </p>
      )}

      <section className="rounded-lg p-4" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
        <h3 className="font-medium mb-2">Parse</h3>
        <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
          Create a DRAFT ruleset from the latest source. You can then edit rules and publish.
        </p>
        <Button
          onClick={() => parseMutation.mutate()}
          disabled={parseMutation.isPending}
        >
          {parseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Parse latest source
        </Button>
        {parseMutation.isError && (
          <p className="mt-2 text-sm text-red-500">
            {(parseMutation.error as Error).message}
          </p>
        )}
      </section>
    </div>
  );
}

function RulesTab({ studioId, qc }: { studioId: string; qc: QueryClient }) {
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

  const publishMutation = useMutation({
    mutationFn: () => leaseIqApi.publish(studioId, draftRuleset!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lease-iq', 'rulesets', studioId] });
    },
  });

  return (
    <div className="space-y-4" style={{ color: 'var(--color-text-primary)' }}>
      {publishedRuleset && (
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
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
          <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
            {(rulesetDetail?.data?.rules ?? []).map((rule: { id: string; ruleType: string; priority: number; terms: { term: string; termType: string }[] }) => (
              <div key={rule.id} className="text-sm py-2 border-b last:border-b-0" style={{ borderColor: 'var(--color-border-default)' }}>
                <span className="font-medium">{rule.ruleType}</span> (priority {rule.priority}) —{' '}
                {rule.terms?.map((t: { term: string }) => t.term).join(', ') || 'no terms'}
              </div>
            ))}
          </div>
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
        Run evaluation against the published ruleset for this studio. No ticket is created.
          </p>
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
          <p className="text-sm">
            <strong>Confidence:</strong> {result.confidence}
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
