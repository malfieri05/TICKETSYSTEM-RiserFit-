'use client';

import { useState, useRef, FormEvent, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { BookOpen, Upload, Trash2, Eye, EyeOff, FileText, Plus, Loader2, CheckCircle, AlertCircle, X, RefreshCw, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { aiApi } from '@/lib/api';
import { HeaderInfoButton, InfoExplainerModal } from '@/components/ui/InfoExplainer';

type IngestMode = 'text' | 'file' | 'pdf' | 'url';

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

const INGEST_MODE_ORDER = ['pdf', 'text', 'file', 'url'] as const satisfies readonly IngestMode[];

function ingestModeLabel(m: IngestMode): string {
  if (m === 'text') return 'Paste Text';
  if (m === 'pdf') return 'Handbook PDF';
  if (m === 'url') return 'Website URL';
  return 'Upload File';
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
    mutationFn: () => aiApi.syncRiserPolicies(),
    onSuccess: (res) => {
      const { synced, skipped, failed, configMissing, details } = res.data;
      if (configMissing) {
        setSyncResult(
          'Riser sync not configured. Set RISER_API_BASE_URL, RISER_API_KEY, and RISER_POLICY_IDS (comma-separated policy IDs) in apps/api/.env.',
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
    onError: () => {
      setSyncResult('Riser sync failed unexpectedly. Check API logs for details.');
    },
  });

  const handleIngest = async (e: FormEvent) => {
    e.preventDefault();
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

  const canIngest =
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
            }}
            aria-label="Document ingest method"
            size="md"
            className="mb-4 w-fit"
          />

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
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg p-6 cursor-pointer transition-colors',
                    !pdfFile && 'hover:border-[var(--color-accent)]',
                  )}
                  style={pdfFile
                    ? { background: 'rgba(52,120,196,0.08)', border: '2px dashed var(--color-accent)' }
                    : { background: 'var(--color-bg-surface)', border: '2px dashed var(--color-border-default)' }}
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
                      <Upload className="h-8 w-8" style={{ color: 'var(--color-text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Click to select a PDF file</p>
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
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg p-6 cursor-pointer transition-colors',
                    !file && 'hover:border-[var(--color-accent)]',
                  )}
                  style={file
                    ? { background: 'rgba(52,120,196,0.08)', border: '2px dashed var(--color-accent)' }
                    : { background: 'var(--color-bg-surface)', border: '2px dashed var(--color-border-default)' }}
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
                      <Upload className="h-8 w-8" style={{ color: 'var(--color-text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Click to select a .txt or .md file</p>
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
        </div>

        {/* ── Document list ── */}
        <div className="dashboard-card rounded-xl overflow-hidden" style={panel}>
          <div className="px-6 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[var(--color-accent)]" />
                Documents
              </h2>
              <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-primary)' }} title="Short policies produce 1 chunk; longer ones split into multiple. All are used by the Assistant.">
                (1 chunk = short policy; normal)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Riser policies are the primary knowledge source. Manual uploads are for exceptional internal docs only.
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => riserSyncMut.mutate()}
                disabled={riserSyncMut.isPending}
              >
                {riserSyncMut.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Sync Riser policies
                  </>
                )}
              </Button>
            </div>
          </div>
          {syncResult && (
            <div className="px-6 pt-2 pb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {syncResult}
            </div>
          )}
          <div className="px-6 pt-2 pb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Only documents that are <span className="font-semibold text-[var(--color-accent)]">indexed</span> and <span className="font-semibold text-[var(--color-accent)]">active</span> are used by the Assistant and Handbook chat.
          </div>

          {isLoading ? (
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
                {docs.map((doc, i) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-[var(--color-bg-surface)]"
                    style={{ borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : undefined }}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-text-primary)] max-w-xs">
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
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
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
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          title="Re-index document"
                          disabled={doc.ingestionStatus === 'indexing' || reindexMut.isPending}
                          onClick={() => reindexMut.mutate(doc.id)}
                          className="p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:text-[var(--color-accent)]"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <button
                          title={doc.isActive ? 'Disable' : 'Enable'}
                          onClick={() => toggleMut.mutate({ id: doc.id, isActive: !doc.isActive })}
                          className="p-1.5 rounded-md transition-colors hover:text-[var(--color-text-secondary)]"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {doc.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          title="Delete permanently"
                          onClick={() => {
                            if (window.confirm(`Delete "${doc.title}" and all its chunks? This cannot be undone.`)) {
                              deleteMut.mutate(doc.id);
                            }
                          }}
                          className="p-1.5 rounded-md transition-colors hover:text-red-600"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
