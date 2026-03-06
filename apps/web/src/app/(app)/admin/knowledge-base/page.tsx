'use client';

import { useState, useRef, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { BookOpen, Upload, Trash2, Eye, EyeOff, FileText, Plus, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { aiApi } from '@/lib/api';

type IngestMode = 'text' | 'file' | 'pdf';

interface DocRow {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  documentType: string | null;
  isActive: boolean;
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
    manual: { label: 'Text',  style: { background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' } },
    file:   { label: 'File',  style: { background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)' } },
    url:    { label: 'URL',   style: { background: 'rgba(34,197,94,0.15)',  color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)'  } },
  };
  const cfg = map[type] ?? { label: type, style: { background: '#222222', color: '#888888', border: '1px solid #2a2a2a' } };
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={cfg.style}>
      {cfg.label}
    </span>
  );
}

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

export default function KnowledgeBasePage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<IngestMode>('text');
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ ok: boolean; message: string } | null>(null);
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
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => aiApi.toggleDocument(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-documents'] }),
  });

  const handleIngest = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (mode === 'text' && !textContent.trim()) return;
    if (mode === 'file' && !file) return;
    if (mode === 'pdf' && !pdfFile) return;

    setIngesting(true);
    setIngestResult(null);

    try {
      let res: { data: { documentId: string; chunksCreated: number } };
      if (mode === 'text') {
        res = await aiApi.ingestText(title.trim(), textContent.trim());
      } else if (mode === 'pdf') {
        res = await aiApi.ingestPdf(title.trim(), pdfFile!);
      } else {
        res = await aiApi.ingestFile(title.trim(), file!);
      }
      setIngestResult({ ok: true, message: `✓ Ingested "${title}" — ${res.data.chunksCreated} chunks created` });
      setTitle(''); setTextContent(''); setFile(null); setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['ai-documents'] });
    } catch {
      setIngestResult({ ok: false, message: 'Ingestion failed. Check the API logs for details.' });
    } finally {
      setIngesting(false);
    }
  };

  const docs: DocRow[] = data ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="Knowledge Base" />

      <div className="flex-1 p-6 space-y-6 overflow-auto">

        {/* ── Ingest panel ── */}
        <div className="rounded-xl p-6" style={panel}>
          <h2 className="text-base font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-teal-500" />
            Add Knowledge Document
          </h2>

          {/* Mode toggle */}
          <div className="flex rounded-lg p-1 mb-4 w-fit gap-1" style={{ background: '#111111', border: '1px solid #2a2a2a' }}>
            {(['text', 'file', 'pdf'] as IngestMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setIngestResult(null); }}
                className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                style={mode === m
                  ? { background: '#14b8a6', color: '#ffffff' }
                  : { color: '#666666' }}
              >
                {m === 'text' ? 'Paste Text' : m === 'pdf' ? 'Handbook PDF' : 'Upload File'}
              </button>
            ))}
          </div>

          <form onSubmit={handleIngest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Document Title</label>
              <Input
                placeholder="e.g. HVAC Maintenance Procedure"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full max-w-lg"
                required
              />
            </div>

            {mode === 'text' ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Content</label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your document text here…"
                  rows={8}
                  className="w-full rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono resize-y"
                  style={{ background: '#111111', border: '1px solid #2a2a2a' }}
                  required
                />
                <p className="text-xs mt-1" style={{ color: '#555555' }}>{textContent.length.toLocaleString()} characters</p>
              </div>
            ) : mode === 'pdf' ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Handbook PDF (max 15 MB)</label>
                <p className="text-xs mb-2" style={{ color: '#555555' }}>Uploaded PDFs are ingested as handbook documents and appear in the Studio Handbook chat.</p>
                <div
                  onClick={() => pdfInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg p-6 cursor-pointer transition-colors"
                  style={pdfFile
                    ? { background: 'rgba(20,184,166,0.08)', border: '2px dashed #14b8a6' }
                    : { background: '#111111', border: '2px dashed #333333' }}
                  onMouseEnter={(e) => { if (!pdfFile) e.currentTarget.style.borderColor = '#14b8a6'; }}
                  onMouseLeave={(e) => { if (!pdfFile) e.currentTarget.style.borderColor = '#333333'; }}
                >
                  {pdfFile ? (
                    <>
                      <FileText className="h-8 w-8 text-teal-400" />
                      <p className="text-sm font-medium text-teal-300">{pdfFile.name}</p>
                      <p className="text-xs" style={{ color: '#666666' }}>{formatBytes(pdfFile.size)}</p>
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
                      <Upload className="h-8 w-8" style={{ color: '#444444' }} />
                      <p className="text-sm" style={{ color: '#888888' }}>Click to select a PDF file</p>
                    </>
                  )}
                  <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">File (.txt or .md, max 10 MB)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg p-6 cursor-pointer transition-colors"
                  style={file
                    ? { background: 'rgba(20,184,166,0.08)', border: '2px dashed #14b8a6' }
                    : { background: '#111111', border: '2px dashed #333333' }}
                  onMouseEnter={(e) => { if (!file) e.currentTarget.style.borderColor = '#14b8a6'; }}
                  onMouseLeave={(e) => { if (!file) e.currentTarget.style.borderColor = '#333333'; }}
                >
                  {file ? (
                    <>
                      <FileText className="h-8 w-8 text-teal-400" />
                      <p className="text-sm font-medium text-teal-300">{file.name}</p>
                      <p className="text-xs" style={{ color: '#666666' }}>{formatBytes(file.size)}</p>
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
                      <Upload className="h-8 w-8" style={{ color: '#444444' }} />
                      <p className="text-sm" style={{ color: '#888888' }}>Click to select a .txt or .md file</p>
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
                  ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }
                  : { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
              >
                {ingestResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {ingestResult.message}
                <button onClick={() => setIngestResult(null)} className="ml-auto opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <Button type="submit" disabled={ingesting}>
              {ingesting ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : <><Upload className="h-4 w-4" />Ingest Document</>}
            </Button>
          </form>
        </div>

        {/* ── Document list ── */}
        <div className="rounded-xl overflow-hidden" style={panel}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #2a2a2a' }}>
            <h2 className="text-base font-semibold text-gray-100 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-teal-500" />
              Documents
            </h2>
            <span className="text-sm" style={{ color: '#555555' }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: '#555555' }}>
              <BookOpen className="h-8 w-8" style={{ color: '#333333' }} />
              <p className="text-sm">No documents yet — add one above</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                  {['Title', 'Type', 'Doc type', 'Chunks', 'Size', 'Uploaded by', 'Added', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, i) => (
                  <tr
                    key={doc.id}
                    style={{ borderTop: i > 0 ? '1px solid #222222' : undefined }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#222222')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 font-medium text-gray-200 max-w-xs">
                      <span className="line-clamp-1">{doc.title}</span>
                    </td>
                    <td className="px-4 py-3"><SourceTypeBadge type={doc.sourceType} /></td>
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: doc.documentType === 'handbook' ? '#14b8a6' : '#666666' }}>
                        {doc.documentType === 'handbook' ? 'Handbook' : 'General'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: '#888888' }}>{doc._count.chunks}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#666666' }}>{formatBytes(doc.sizeBytes)}</td>
                    <td className="px-4 py-3" style={{ color: '#888888' }}>{doc.uploadedBy.name}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#666666' }}>
                      {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                        style={doc.isActive
                          ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80' }
                          : { background: '#222222', color: '#666666' }}
                      >
                        {doc.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          title={doc.isActive ? 'Disable' : 'Enable'}
                          onClick={() => toggleMut.mutate({ id: doc.id, isActive: !doc.isActive })}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: '#555555' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#cccccc')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
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
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: '#555555' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
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
