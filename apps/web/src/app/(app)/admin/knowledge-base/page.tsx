'use client';

import { useState, useRef, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  BookOpen,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  FileText,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { aiApi } from '@/lib/api';

type IngestMode = 'text' | 'file';

interface DocRow {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
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
  const map: Record<string, { label: string; className: string }> = {
    manual: { label: 'Text', className: 'bg-blue-50 text-blue-700' },
    file: { label: 'File', className: 'bg-purple-50 text-purple-700' },
    url: { label: 'URL', className: 'bg-green-50 text-green-700' },
  };
  const cfg = map[type] ?? { label: type, className: 'bg-gray-50 text-gray-600' };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export default function KnowledgeBasePage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<IngestMode>('text');
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleIngest = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (mode === 'text' && !textContent.trim()) return;
    if (mode === 'file' && !file) return;

    setIngesting(true);
    setIngestResult(null);

    try {
      let res: { data: { documentId: string; chunksCreated: number } };
      if (mode === 'text') {
        res = await aiApi.ingestText(title.trim(), textContent.trim());
      } else {
        res = await aiApi.ingestFile(title.trim(), file!);
      }
      setIngestResult({
        ok: true,
        message: `✓ Ingested "${title}" — ${res.data.chunksCreated} chunks created`,
      });
      setTitle('');
      setTextContent('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['ai-documents'] });
    } catch {
      setIngestResult({ ok: false, message: 'Ingestion failed. Check the API logs for details.' });
    } finally {
      setIngesting(false);
    }
  };

  const docs: DocRow[] = data ?? [];

  return (
    <div className="flex flex-col h-full">
      <Header title="Knowledge Base" />

      <div className="flex-1 p-6 space-y-6 overflow-auto">

        {/* ── Ingest panel ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-600" />
            Add Knowledge Document
          </h2>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 p-1 mb-4 w-fit gap-1">
            {(['text', 'file'] as IngestMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setIngestResult(null); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === m ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'text' ? 'Paste Text' : 'Upload File'}
              </button>
            ))}
          </div>

          <form onSubmit={handleIngest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste your document text here…"
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">{textContent.length.toLocaleString()} characters</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File (.txt or .md, max 10 MB)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                    file ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
                  }`}
                >
                  {file ? (
                    <>
                      <FileText className="h-8 w-8 text-indigo-600" />
                      <p className="text-sm font-medium text-indigo-700">{file.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400" />
                      <p className="text-sm text-gray-500">Click to select a .txt or .md file</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            )}

            {ingestResult && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                ingestResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {ingestResult.ok ? (
                  <CheckCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                {ingestResult.message}
                <button onClick={() => setIngestResult(null)} className="ml-auto">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <Button type="submit" disabled={ingesting}>
              {ingesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Ingest Document
                </>
              )}
            </Button>
          </form>
        </div>

        {/* ── Document list ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              Documents
            </h2>
            <span className="text-sm text-gray-400">{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <BookOpen className="h-8 w-8" />
              <p className="text-sm">No documents yet — add one above</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Chunks</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded by</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                      <span className="line-clamp-1">{doc.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceTypeBadge type={doc.sourceType} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{doc._count.chunks}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatBytes(doc.sizeBytes)}</td>
                    <td className="px-4 py-3 text-gray-600">{doc.uploadedBy.name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          doc.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {doc.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          title={doc.isActive ? 'Disable' : 'Enable'}
                          onClick={() => toggleMut.mutate({ id: doc.id, isActive: !doc.isActive })}
                          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
