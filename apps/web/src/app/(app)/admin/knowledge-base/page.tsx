'use client';

import { useState, useRef, FormEvent, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { BookOpen, Upload, Trash2, Eye, EyeOff, FileText, Plus, Loader2, CheckCircle, AlertCircle, X, RefreshCw, Globe, Folder, ChevronRight, ChevronDown, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { aiApi } from '@/lib/api';
import { HeaderInfoButton, InfoExplainerModal } from '@/components/ui/InfoExplainer';

type IngestMode = 'text' | 'file' | 'pdf' | 'url' | 'connect-api';

interface DocRow {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  documentType: string | null;
  isActive: boolean;
  ingestionStatus: string;
  lastIndexedAt: string | null;
  upstreamProvider: string | null;
  upstreamId: string | null;
  upstreamVersion: string | null;
  reviewOn: string | null;
  reviewDue: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
  _count: { chunks: number };
}

/** Product-help articles ingested with titles like "Rovi Help — …" */
function isRoviHelpDocumentTitle(title: string): boolean {
  return /^Rovi Help\s*[—–-]\s*/i.test(title.trim());
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SourceTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; style: React.CSSProperties }> = {
    manual: { label: 'Text',  style: { background: 'rgba(59,130,246,0.15)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.3)' } },
    file:   { label: 'File',  style: { background: 'rgba(168,85,247,0.15)', color: '#9333ea', border: '1px solid rgba(168,85,247,0.3)' } },
    url:    { label: 'URL',   style: { background: 'rgba(34,197,94,0.15)',  color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)'  } },
  };
  const cfg = map[type] ?? { label: type, style: { background: 'var(--color-bg-surface-raised)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-default)' } };
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={cfg.style}>
      {cfg.label}
    </span>
  );
}

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

const INGEST_MODE_ORDER = ['pdf', 'url', 'text', 'file', 'connect-api'] as const satisfies readonly IngestMode[];

type DocsPanelTab = 'documents' | 'connected-apis';

function ingestModeLabel(m: IngestMode): string {
  if (m === 'text') return 'Paste Text';
  if (m === 'pdf') return 'Handbook PDF';
  if (m === 'url') return 'Website URL';
  if (m === 'connect-api') return 'Connect API';
  return 'Upload File';
}

/** Shared row for library tables (Documents + Connected APIs). */
function KbLibraryDocRow({
  doc,
  nested,
  borderTop,
  reindexPending,
  onReindex,
  onToggleActive,
  onDelete,
}: {
  doc: DocRow;
  nested?: boolean;
  borderTop?: string;
  reindexPending: boolean;
  onReindex: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="hover:bg-[var(--color-bg-surface)]" style={{ borderTop }}>
      <td
        className={cn(
          'px-4 py-3 font-medium text-[var(--color-text-primary)] max-w-xs',
          nested && 'pl-8',
        )}
      >
        <span className="line-clamp-1">{doc.title}</span>
      </td>
      <td className="px-4 py-3">
        {doc.upstreamProvider === 'riser' ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: 'rgba(56,189,248,0.16)',
              color: '#0284c7',
              border: '1px solid rgba(56,189,248,0.45)',
            }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
            Riser policy
          </span>
        ) : (
          <SourceTypeBadge type={doc.sourceType} />
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs" style={{ color: doc.documentType === 'handbook' ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
          {doc.documentType === 'handbook' ? 'Handbook' : 'General'}
        </span>
      </td>
      <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{doc._count.chunks}</td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatBytes(doc.sizeBytes)}</td>
      <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>{doc.uploadedBy.name}</td>
      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
        {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {doc.upstreamProvider === 'riser' ? (
          <div className="space-y-0.5">
            {doc.upstreamId ? (
              <div>
                <span className="font-medium">Policy ID:</span>{' '}
                <span className="font-mono text-[11px]">{doc.upstreamId}</span>
              </div>
            ) : null}
            <div>
              <span className="font-medium">Version:</span>{' '}
              {doc.upstreamVersion ?? '—'}
            </div>
            <div>
              <span className="font-medium">Review:</span>{' '}
              {doc.reviewOn ? formatDistanceToNow(new Date(doc.reviewOn), { addSuffix: true }) : '—'}
            </div>
            <div>
              <span className="font-medium">Next due:</span>{' '}
              {doc.reviewDue ? formatDistanceToNow(new Date(doc.reviewDue), { addSuffix: true }) : '—'}
            </div>
          </div>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          style={
            doc.ingestionStatus === 'indexed'
              ? { background: 'rgba(34,197,94,0.15)', color: '#16a34a' }
              : doc.ingestionStatus === 'indexing'
                ? { background: 'rgba(251,191,36,0.15)', color: '#d97706' }
                : doc.ingestionStatus === 'pending'
                  ? { background: 'rgba(59,130,246,0.15)', color: '#2563eb' }
                  : doc.ingestionStatus === 'failed'
                    ? { background: 'rgba(239,68,68,0.15)', color: '#dc2626' }
                    : { background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }
          }
          title={
            doc.ingestionStatus === 'indexed'
              ? 'Indexed — ready for chat'
              : doc.ingestionStatus === 'indexing'
                ? 'Indexing — processing in progress'
                : doc.ingestionStatus === 'pending'
                  ? 'Pending — queued for ingestion'
                  : doc.ingestionStatus === 'failed'
                    ? 'Failed — check logs or re-index'
                    : undefined
          }
        >
          {doc.ingestionStatus === 'indexed'
            ? 'Indexed'
            : doc.ingestionStatus === 'indexing'
              ? 'Indexing'
              : doc.ingestionStatus === 'pending'
                ? 'Pending'
                : doc.ingestionStatus === 'failed'
                  ? 'Failed'
                  : doc.ingestionStatus}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          style={doc.isActive
            ? { background: 'rgba(34,197,94,0.15)', color: '#16a34a' }
            : { background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}
        >
          {doc.isActive ? 'On' : 'Off'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            title="Re-index document"
            disabled={doc.ingestionStatus === 'indexing' || reindexPending}
            onClick={() => onReindex(doc.id)}
            className="rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:text-[var(--color-accent)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={doc.isActive ? 'Disable' : 'Enable'}
            onClick={() => onToggleActive(doc.id, !doc.isActive)}
            className="rounded-md p-1.5 transition-colors hover:text-[var(--color-text-secondary)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {doc.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            type="button"
            title="Delete permanently"
            onClick={() => {
              if (window.confirm(`Delete "${doc.title}" and all its chunks? This cannot be undone.`)) {
                onDelete(doc.id);
              }
            }}
            className="rounded-md p-1.5 transition-colors hover:text-red-600"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function KnowledgeBasePage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<IngestMode>('pdf');
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [knowledgeBaseInfoOpen, setKnowledgeBaseInfoOpen] = useState(false);
  const closeKnowledgeBaseInfo = useCallback(() => setKnowledgeBaseInfoOpen(false), []);
  const [pdfDragDepth, setPdfDragDepth] = useState(0);
  const [fileDragDepth, setFileDragDepth] = useState(0);
  /** Collapsed by default so long Rovi Help lists do not dominate the table. */
  const [roviHelpOpen, setRoviHelpOpen] = useState(false);
  const [docsPanelTab, setDocsPanelTab] = useState<DocsPanelTab>('documents');
  const [riserBaseUrl, setRiserBaseUrl] = useState('');
  const [riserApiKey, setRiserApiKey] = useState('');
  const [riserPolicyIds, setRiserPolicyIds] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ai-documents'],
    queryFn: () => aiApi.listDocuments(),
    select: (r) => r.data,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => aiApi.deleteDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-documents'] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      aiApi.toggleDocument(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-documents'] }),
  });

  const reindexMut = useMutation({
    mutationFn: (id: string) => aiApi.reindexDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-documents'] }),
  });

  const riserSyncMut = useMutation({
    mutationFn: (body?: { baseUrl: string; apiKey: string; policyIds: string }) =>
      aiApi.syncRiserPolicies(body),
    onSuccess: (res) => {
      const { synced, skipped, failed, configMissing, details } = res.data;
      if (configMissing) {
        setSyncResult(
          'Riser sync not configured. Choose Connect API above and enter base URL, API key, and policy IDs, or set RISER_API_BASE_URL, RISER_API_KEY, and RISER_POLICY_IDS in apps/api/.env.',
        );
        return;
      }
      const detailReasons = details?.filter((d) => d.reason).map((d) => `${d.id}: ${d.reason}`);
      const reasonSuffix = detailReasons?.length ? ` — ${detailReasons.slice(0, 3).join('; ')}${(detailReasons.length > 3 ? '…' : '')}` : '';
      setSyncResult(
        `Riser sync finished — ${synced} synced, ${skipped} skipped, ${failed} failed.${reasonSuffix}`,
      );
      qc.invalidateQueries({ queryKey: ['ai-documents'] });
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      let msg: string | undefined;
      if (typeof data?.message === 'string') msg = data.message;
      else if (Array.isArray(data?.message)) {
        msg = data!.message.filter((m): m is string => typeof m === 'string').join(', ');
      }
      setSyncResult(msg ?? 'Riser sync failed unexpectedly. Check API logs for details.');
    },
  });

  const runRiserSync = useCallback(() => {
    const b = riserBaseUrl.trim();
    const k = riserApiKey.trim();
    const p = riserPolicyIds.trim();
    if (b || k || p) {
      if (!b || !k || !p) {
        setSyncResult(
          'Fill all three fields (API base URL, API key, policy IDs), or clear them all to sync using server environment variables.',
        );
        return;
      }
      riserSyncMut.mutate({ baseUrl: b, apiKey: k, policyIds: p });
      return;
    }
    riserSyncMut.mutate(undefined);
  }, [riserApiKey, riserBaseUrl, riserPolicyIds, riserSyncMut.mutate]);

  const handleIngest = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'connect-api') return;
    if (!title.trim()) return;
    if (mode === 'text' && !textContent.trim()) return;
    if (mode === 'file' && !file) return;
    if (mode === 'pdf' && !pdfFile) return;
    if (mode === 'url' && !urlInput.trim()) return;

    setIngesting(true);
    setIngestResult(null);

    try {
      if (mode === 'url') {
        const res = await aiApi.ingestUrl(title.trim(), urlInput.trim());
        setIngestResult({ ok: true, message: `✓ Ingested "${title}" from URL — ${res.data.chunksCreated} chunks created` });
      } else if (mode === 'text') {
        const res = await aiApi.ingestText(title.trim(), textContent.trim());
        setIngestResult({ ok: true, message: `✓ Ingested "${title}" — ${res.data.chunksCreated} chunks created` });
      } else if (mode === 'pdf') {
        const res = await aiApi.ingestPdf(title.trim(), pdfFile!);
        const isQueueFail = res.data.status === 'uploaded_queue_failed';
        setIngestResult({
          ok: !isQueueFail,
          message: res.data.message ?? `✓ Uploaded "${title}". Indexing in progress.`,
        });
      } else {
        const res = await aiApi.ingestFile(title.trim(), file!);
        setIngestResult({ ok: true, message: `✓ Ingested "${title}" — ${res.data.chunksCreated} chunks created` });
      }
      setTitle(''); setTextContent(''); setUrlInput(''); setFile(null); setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['ai-documents'] });
    } catch (e: unknown) {
      const data = (
        e as { response?: { data?: { message?: string | string[] } } }
      ).response?.data;
      let serverMsg: string | undefined;
      if (typeof data?.message === 'string') serverMsg = data.message;
      else if (Array.isArray(data?.message)) {
        serverMsg = data.message.filter((m): m is string => typeof m === 'string').join(', ');
      }
      setIngestResult({
        ok: false,
        message:
          serverMsg ?? 'Ingestion failed. Check the API logs for details.',
      });
    } finally {
      setIngesting(false);
    }
  };

  const docs: DocRow[] = data ?? [];

  const { roviHelpDocs, otherDocs } = useMemo(() => {
    const rovi: DocRow[] = [];
    const rest: DocRow[] = [];
    for (const d of docs) {
      (isRoviHelpDocumentTitle(d.title) ? rovi : rest).push(d);
    }
    return { roviHelpDocs: rovi, otherDocs: rest };
  }, [docs]);

  const riserPolicyDocs = useMemo(
    () =>
      [...docs]
        .filter((d) => d.upstreamProvider === 'riser')
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
    [docs],
  );

  const canIngest =
    mode !== 'connect-api' &&
    title.trim().length > 0 &&
    (mode === 'url'
      ? urlInput.trim().length > 0
      : mode === 'text'
        ? textContent.trim().length > 0
        : mode === 'pdf'
          ? pdfFile != null
          : file != null);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        title={
          <div className="flex min-w-0 items-center gap-2">
            <h1
              className="min-w-0 truncate text-base font-semibold"
              style={{ color: 'var(--color-text-app-header)' }}
            >
              Knowledge Base
            </h1>
            <HeaderInfoButton
              onClick={() => setKnowledgeBaseInfoOpen(true)}
              ariaLabel="What is Knowledge base? Opens an explanation."
            />
          </div>
        }
      />
      <InfoExplainerModal
        open={knowledgeBaseInfoOpen}
        onClose={closeKnowledgeBaseInfo}
        titleId="knowledge-base-about-title"
        title={<>What is &apos;Knowledge base&apos;?</>}
      >
        <ul className="list-disc space-y-2 pl-4">
          <li>
            Upload any company documents or information that you want the &apos;AI Assistant&apos; to have access to.
          </li>
        </ul>
        <p>This allows the bot to answer any questions from users on company specific content.</p>
      </InfoExplainerModal>

      <div className="flex-1 p-6 space-y-6 overflow-auto">

        {/* ── Ingest panel ── */}
        <div className="dashboard-card rounded-xl p-6" style={panel}>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-[var(--color-accent)]" />
            Add Knowledge Document
          </h2>

          <SlidingSegmentedControl
            options={INGEST_MODE_ORDER.map((m) => ({
              value: m,
              label: ingestModeLabel(m),
            }))}
            value={mode}
            onChange={(v) => {
              setMode(v as IngestMode);
              setIngestResult(null);
              setSyncResult(null);
            }}
            aria-label="Document ingest method"
            size="md"
            className="mb-4"
          />

          {mode === 'connect-api' ? (
            <div className="space-y-4">
              <div
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-xs"
                style={{
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <Plug className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden />
                <div className="space-y-1.5">
                  <p>
                    <span className="font-semibold text-[var(--color-text-primary)]">RiserU (Op Central)</span> — each policy is fetched with{' '}
                    <code className="rounded bg-[var(--color-bg-surface-raised)] px-1 py-0.5 text-[10px]">GET …/v1/opdocs/policy/&#123;id&#125;</code> and the{' '}
                    <code className="rounded bg-[var(--color-bg-surface-raised)] px-1 py-0.5 text-[10px]">x-api-key</code> header. Values are used only for this sync and are{' '}
                    <span className="font-medium">not stored</span> on the server.
                  </p>
                  <p style={{ color: 'var(--color-text-muted)' }}>
                    Leave all fields empty and click Sync to use <span className="font-medium">RISER_API_BASE_URL</span>, <span className="font-medium">RISER_API_KEY</span>, and{' '}
                    <span className="font-medium">RISER_POLICY_IDS</span> from the API environment. Synced policies appear under Knowledge library → Connected APIs.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">Riser API base URL</label>
                <Input
                  type="url"
                  placeholder="https://your-tenant.riseru.opcentral.com.au"
                  value={riserBaseUrl}
                  onChange={(e) => setRiserBaseUrl(e.target.value)}
                  className="w-full max-w-xl"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">API key</label>
                <Input
                  type="password"
                  placeholder="x-api-key value from RiserU"
                  value={riserApiKey}
                  onChange={(e) => setRiserApiKey(e.target.value)}
                  className="w-full max-w-xl"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">Policy IDs</label>
                <textarea
                  value={riserPolicyIds}
                  onChange={(e) => setRiserPolicyIds(e.target.value)}
                  placeholder="Comma-separated policy IDs, e.g. 100, 200, 305"
                  rows={3}
                  className="w-full max-w-xl resize-y rounded-lg px-3 py-2 font-mono text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}
                />
              </div>
              {syncResult ? (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-surface-raised)' }}>
                  {syncResult}
                </div>
              ) : null}
              <Button type="button" onClick={runRiserSync} disabled={riserSyncMut.isPending}>
                {riserSyncMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Sync Riser policies
                  </>
                )}
              </Button>
            </div>
          ) : (
          <form onSubmit={handleIngest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Document Title</label>
              <Input
                placeholder="e.g. HVAC Maintenance Procedure"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full max-w-lg"
                required
              />
            </div>

            {mode === 'url' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Website URL</label>
                  <div className="relative max-w-lg">
                    <Globe
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                      style={{ color: 'var(--color-text-muted)' }}
                    />
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/page"
                      className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                      style={{
                        background: 'var(--color-bg-surface)',
                        border: '1px solid var(--color-border-default)',
                        color: 'var(--color-text-primary)',
                      }}
                      required
                    />
                  </div>
                </div>
                <div
                  className="flex w-full max-w-lg items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
                  style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--color-text-secondary)' }}
                >
                  <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#3b82f6' }} />
                  <span>
                    The system will fetch the page, strip navigation and ads, extract the readable text content, and index it into the knowledge base — just like a pasted document. The bot does not need live web access.
                  </span>
                </div>
              </div>
            ) : mode === 'text' ? (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Content</label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your document text here…"
                  rows={8}
                  className="w-full rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono resize-y"
                  style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}
                  required
                />
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{textContent.length.toLocaleString()} characters</p>
              </div>
            ) : mode === 'pdf' ? (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Handbook PDF (max 25 MB)</label>
                <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Uploaded PDFs are ingested as handbook documents and appear in the Studio Handbook chat.</p>
                <div
                  onClick={() => pdfInputRef.current?.click()}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (![...e.dataTransfer.types].includes('Files')) return;
                    setPdfDragDepth((d) => d + 1);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPdfDragDepth((d) => Math.max(0, d - 1));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if ([...e.dataTransfer.types].includes('Files')) {
                      e.dataTransfer.dropEffect = 'copy';
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPdfDragDepth(0);
                    const dropped = e.dataTransfer.files[0];
                    if (dropped && (dropped.type === 'application/pdf' || dropped.name.endsWith('.pdf'))) {
                      setPdfFile(dropped);
                    }
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg p-6 cursor-pointer border-2 border-dashed transition-all duration-200 ease-out',
                    !pdfFile && pdfDragDepth === 0 && 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-surface-raised)]',
                    !pdfFile && pdfDragDepth > 0 && 'scale-[1.02] border-[var(--color-accent)]',
                    pdfFile && 'border-[var(--color-accent)]',
                  )}
                  style={
                    pdfFile
                      ? {
                          background: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-surface))',
                          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent)',
                        }
                      : pdfDragDepth > 0
                        ? {
                            background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-bg-root))',
                            boxShadow:
                              '0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
                          }
                        : undefined
                  }
                >
                  {pdfFile ? (
                    <>
                      <FileText className="h-8 w-8 text-[var(--color-accent)]" />
                      <p className="text-sm font-medium text-[var(--color-accent)]">{pdfFile.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatBytes(pdfFile.size)}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPdfFile(null); if (pdfInputRef.current) pdfInputRef.current.value = ''; }}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload
                        className={cn('h-8 w-8 transition-transform duration-200', pdfDragDepth > 0 && 'scale-110')}
                        style={{ color: pdfDragDepth > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                      />
                      <p className="text-sm font-medium" style={{ color: pdfDragDepth > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                        {pdfDragDepth > 0 ? 'Drop PDF to upload' : 'Click or drag & drop a PDF file'}
                      </p>
                      {pdfDragDepth > 0 && (
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Release to add</p>
                      )}
                    </>
                  )}
                  <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">File (.txt or .md, max 10 MB)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (![...e.dataTransfer.types].includes('Files')) return;
                    setFileDragDepth((d) => d + 1);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFileDragDepth((d) => Math.max(0, d - 1));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if ([...e.dataTransfer.types].includes('Files')) {
                      e.dataTransfer.dropEffect = 'copy';
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFileDragDepth(0);
                    const dropped = e.dataTransfer.files[0];
                    if (dropped && (dropped.name.endsWith('.txt') || dropped.name.endsWith('.md') || dropped.type === 'text/plain' || dropped.type === 'text/markdown')) {
                      setFile(dropped);
                    }
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg p-6 cursor-pointer border-2 border-dashed transition-all duration-200 ease-out',
                    !file && fileDragDepth === 0 && 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-surface-raised)]',
                    !file && fileDragDepth > 0 && 'scale-[1.02] border-[var(--color-accent)]',
                    file && 'border-[var(--color-accent)]',
                  )}
                  style={
                    file
                      ? {
                          background: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-surface))',
                          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent)',
                        }
                      : fileDragDepth > 0
                        ? {
                            background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-bg-root))',
                            boxShadow:
                              '0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
                          }
                        : undefined
                  }
                >
                  {file ? (
                    <>
                      <FileText className="h-8 w-8 text-[var(--color-accent)]" />
                      <p className="text-sm font-medium text-[var(--color-accent)]">{file.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatBytes(file.size)}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload
                        className={cn('h-8 w-8 transition-transform duration-200', fileDragDepth > 0 && 'scale-110')}
                        style={{ color: fileDragDepth > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                      />
                      <p className="text-sm font-medium" style={{ color: fileDragDepth > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                        {fileDragDepth > 0 ? 'Drop file to upload' : 'Click or drag & drop a .txt or .md file'}
                      </p>
                      {fileDragDepth > 0 && (
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Release to add</p>
                      )}
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            )}

            {ingestResult && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                style={ingestResult.ok
                  ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#16a34a' }
                  : { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}
              >
                {ingestResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {ingestResult.message}
                <button onClick={() => setIngestResult(null)} className="ml-auto opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <Button type="submit" disabled={ingesting || !canIngest}>
              {ingesting
                ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</>
                : mode === 'url'
                  ? <><Globe className="h-4 w-4" />Fetch &amp; Ingest URL</>
                  : <><Upload className="h-4 w-4" />Ingest Document</>}
            </Button>
          </form>
          )}
        </div>

        {/* ── Document list / Connected APIs ── */}
        <div className="dashboard-card rounded-xl overflow-hidden" style={panel}>
          <div
            className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderBottom: '1px solid var(--color-border-default)' }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                  Knowledge library
                </h2>
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {docsPanelTab === 'connected-apis'
                    ? `${riserPolicyDocs.length} Riser polic${riserPolicyDocs.length !== 1 ? 'ies' : 'y'}`
                    : `${docs.length} document${docs.length !== 1 ? 's' : ''}`}
                </span>
                {docsPanelTab === 'documents' ? (
                  <span
                    className="text-xs"
                    style={{ color: 'var(--color-text-primary)' }}
                    title="Short policies produce 1 chunk; longer ones split into multiple. All are used by the Assistant."
                  >
                    (1 chunk = short policy; normal)
                  </span>
                ) : null}
              </div>
            </div>
            <SlidingSegmentedControl
              options={[
                { value: 'documents', label: 'Documents' },
                { value: 'connected-apis', label: 'Connected APIs' },
              ]}
              value={docsPanelTab}
              onChange={(v) => setDocsPanelTab(v as DocsPanelTab)}
              aria-label="Knowledge base section"
              size="md"
              className="w-full shrink-0 sm:w-auto"
            />
          </div>
          {docsPanelTab === 'documents' ? (
            <div className="px-6 pt-2 pb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Only documents that are <span className="font-semibold text-[var(--color-accent)]">indexed</span> and{' '}
              <span className="font-semibold text-[var(--color-accent)]">active</span> are used by the Assistant and Handbook chat.
            </div>
          ) : null}

          {docsPanelTab === 'connected-apis' ? (
            <div className="px-6 pt-2 pb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Riser policies synced into the knowledge base. To add or refresh policies, use{' '}
              <span className="font-semibold text-[var(--color-text-primary)]">Add Knowledge Document</span> →{' '}
              <span className="font-semibold text-[var(--color-accent)]">Connect API</span> and run Sync.
            </div>
          ) : null}

          {docsPanelTab === 'documents' ? (
            isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
                <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3" style={{ color: 'var(--color-text-muted)' }}>
                <BookOpen className="h-8 w-8" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm font-medium text-[var(--color-text-primary)]">No documents yet</p>
                <p className="text-xs text-center max-w-sm">Add your first document above to power the Assistant and Handbook.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-content-header)' }}>
                  {['Title', 'Source', 'Doc type', 'Chunks', 'Size', 'Uploaded by', 'Added', 'Policy meta', 'Index status', 'Active', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-primary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let trN = 0;
                  const rowBorderTop = () =>
                    trN++ > 0 ? '1px solid var(--color-border-subtle)' : undefined;

                  const renderDocRow = (doc: DocRow, nested?: boolean) => (
                    <KbLibraryDocRow
                      key={doc.id}
                      doc={doc}
                      nested={nested}
                      borderTop={rowBorderTop()}
                      reindexPending={reindexMut.isPending}
                      onReindex={(id) => reindexMut.mutate(id)}
                      onToggleActive={(id, isActive) => toggleMut.mutate({ id, isActive })}
                      onDelete={(id) => deleteMut.mutate(id)}
                    />
                  );

                  return (
                    <>
                      {roviHelpDocs.length > 0 ? (
                        <>
                          <tr
                            className="hover:bg-[var(--color-bg-surface)]"
                            style={{
                              borderTop: rowBorderTop(),
                              background: 'var(--color-bg-surface-raised)',
                            }}
                          >
                            <td colSpan={11} className="p-0">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-surface)]"
                                style={{ color: 'var(--color-text-primary)' }}
                                aria-expanded={roviHelpOpen}
                                onClick={() => setRoviHelpOpen((o) => !o)}
                              >
                                {roviHelpOpen ? (
                                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                                )}
                                <Folder className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden />
                                <span className="text-sm font-semibold">Rovi Help</span>
                                <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
                                  {roviHelpDocs.length} article{roviHelpDocs.length !== 1 ? 's' : ''} · product help for the Assistant
                                </span>
                              </button>
                            </td>
                          </tr>
                          {roviHelpOpen ? roviHelpDocs.map((doc) => renderDocRow(doc, true)) : null}
                        </>
                      ) : null}
                      {otherDocs.map((doc) => renderDocRow(doc))}
                    </>
                  );
                })()}
              </tbody>
              </table>
            )
          ) : docsPanelTab === 'connected-apis' ? (
            isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
                <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : riserPolicyDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3" style={{ color: 'var(--color-text-muted)' }}>
                <Plug className="h-8 w-8" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm font-medium text-[var(--color-text-primary)]">No Riser policies in the library</p>
                <p className="text-xs text-center max-w-sm">Use Add Knowledge Document → Connect API above to sync policies from RiserU.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-content-header)' }}>
                    {['Title', 'Source', 'Doc type', 'Chunks', 'Size', 'Uploaded by', 'Added', 'Policy meta', 'Index status', 'Active', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-primary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riserPolicyDocs.map((doc, idx) => (
                    <KbLibraryDocRow
                      key={doc.id}
                      doc={doc}
                      borderTop={idx > 0 ? '1px solid var(--color-border-subtle)' : undefined}
                      reindexPending={reindexMut.isPending}
                      onReindex={(id) => reindexMut.mutate(id)}
                      onToggleActive={(id, isActive) => toggleMut.mutate({ id, isActive })}
                      onDelete={(id) => deleteMut.mutate(id)}
                    />
                  ))}
                </tbody>
              </table>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
