'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  X, MessageSquare, CheckSquare, Paperclip,
  Clock, Lock, Send, Plus, User, Download, Trash2, Upload,
} from 'lucide-react';
import { ticketsApi, commentsApi, subtasksApi, attachmentsApi } from '@/lib/api';
import type { SubtaskStatus, Attachment } from '@/types';
import { SubtaskStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Textarea, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

// ── Color tokens ────────────────────────────────────────────────────────────
// Tier 1 – primary content    → #f0f0f0
// Tier 2 – secondary content  → #aaaaaa
// Tier 3 – muted / labels     → #666666
// Surfaces: panel #141414, content area #111111, sidebar #0f0f0f, card #1e1e1e

interface Props {
  ticketId: string | null;
  onClose: () => void;
}

export function TicketDrawer({ ticketId, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const open = !!ticketId;

  const [activeTab, setActiveTab] = useState<'subtasks' | 'comments' | 'submission' | 'history'>('subtasks');
  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab('subtasks');
    setCommentBody('');
    setIsInternal(false);
    setNewSubtask('');
    setUploadError(null);
  }, [ticketId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data: ticketRes, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => ticketsApi.get(ticketId!),
    enabled: !!ticketId,
  });
  const ticket = ticketRes?.data;

  const { data: historyRes } = useQuery({
    queryKey: ['ticket', ticketId, 'history'],
    queryFn: () => ticketsApi.history(ticketId!),
    enabled: !!ticketId && activeTab === 'history',
  });

  const { data: attachmentsRes } = useQuery({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: () => attachmentsApi.list(ticketId!),
    enabled: !!ticketId && activeTab === 'submission',
  });
  const attachments: Attachment[] = attachmentsRes?.data ?? [];

  const commentMut    = useMutation({ mutationFn: () => commentsApi.create(ticketId!, { body: commentBody, isInternal }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket', ticketId] }); setCommentBody(''); } });
  const subtaskMut    = useMutation({ mutationFn: () => subtasksApi.create(ticketId!, { title: newSubtask }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket', ticketId] }); setNewSubtask(''); } });
  const subtaskStMut  = useMutation({ mutationFn: ({ subtaskId, status }: { subtaskId: string; status: SubtaskStatus }) => subtasksApi.update(ticketId!, subtaskId, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId] }) });
  const delAttachMut  = useMutation({ mutationFn: (id: string) => attachmentsApi.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId, 'attachments'] }) });

  const handleFileUpload = async (file: File) => {
    setUploading(true); setUploadError(null);
    try {
      const { data: { uploadUrl, s3Key } } = await attachmentsApi.requestUploadUrl(ticketId!, { filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size });
      await attachmentsApi.uploadToS3(uploadUrl, file);
      await attachmentsApi.confirmUpload(ticketId!, { s3Key, filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size });
      qc.invalidateQueries({ queryKey: ['ticket', ticketId, 'attachments'] });
    } catch (err) { setUploadError(err instanceof Error ? err.message : 'Upload failed.'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDownload = async (att: Attachment) => {
    try { const res = await attachmentsApi.getDownloadUrl(att.id); window.open(res.data.downloadUrl, '_blank'); } catch {}
  };

  const fmt = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const canManage = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const formResponses = (ticket as { formResponses?: { fieldKey: string; value: string }[] })?.formResponses ?? [];

  const TABS = [
    { key: 'subtasks' as const,   label: `Subtasks${ticket ? ` (${ticket.subtasks.length})` : ''}`, icon: CheckSquare },
    { key: 'comments' as const,  label: `Comments${ticket ? ` (${ticket.comments.length})` : ''}`,  icon: MessageSquare },
    { key: 'submission' as const, label: 'Ticket Submission', icon: User },
    { key: 'history' as const,    label: 'History',         icon: Clock },
  ];

  return (
      /* Drawer — no backdrop so the ticket list stays fully interactive */
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col transition-transform duration-300 ease-out"
        style={{
          width: 'min(920px, 76vw)',
          background: '#141414',
          borderLeft: '1px solid #2a2a2a',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          boxShadow: open ? '-16px 0 60px rgba(0,0,0,0.6)' : 'none',
        }}
      >
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-end px-6 h-12 shrink-0"
          style={{ background: '#111111', borderBottom: '1px solid #252525' }}
        >
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#555555' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center" style={{ background: '#141414' }}>
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
          </div>
        )}

        {/* ── Main content ────────────────────────────────────────────────── */}
        {ticket && !isLoading && (
          <div className="flex-1 overflow-hidden flex">

            {/* ── Left: main column ──────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#111111' }}>

              {/* Header: title, created, requester, location, progress, ticket # */}
              <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                <h2 className="text-xl font-bold leading-snug" style={{ color: '#f0f0f0', letterSpacing: '-0.01em' }}>
                  {ticket.title}
                </h2>
                <p className="text-sm mt-1.5" style={{ color: '#aaaaaa' }}>
                  Created {format(new Date(ticket.createdAt), 'MMM d')} · Requested by {ticket.requester?.displayName ?? '—'}
                </p>
                {(ticket.studio?.name ?? ticket.market?.name) && (
                  <p className="text-sm mt-0.5" style={{ color: '#888888' }}>
                    {[ticket.studio?.name, ticket.market?.name].filter(Boolean).join(' · ')}
                  </p>
                )}
                {(() => {
                  const total = ticket.subtasks?.length ?? 0;
                  const done = ticket.subtasks?.filter((s: { status: string }) => s.status === 'DONE' || s.status === 'SKIPPED').length ?? 0;
                  return (
                    <p className="text-sm mt-1" style={{ color: '#888888' }}>
                      Progress {done} / {total}
                    </p>
                  );
                })()}
                <p className="text-xs mt-2" style={{ color: '#666666' }}>
                  Ticket #{ticket.id?.slice(0, 8) ?? ticketId?.slice(0, 8)}
                </p>
              </div>

              {/* Tab bar — pill-style active state */}
              <div className="px-6 shrink-0" style={{ background: '#111111', borderBottom: '1px solid #1e1e1e' }}>
                <nav className="flex gap-1 py-2">
                  {TABS.map(({ key, label, icon: Icon }) => {
                    const active = activeTab === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                        style={{
                          background: active ? '#1e1e1e' : 'transparent',
                          color: active ? '#14b8a6' : '#999999',
                          border: active ? '1px solid #2a2a2a' : '1px solid transparent',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#dddddd'; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#999999'; }}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {label}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Scrollable tab content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">

                {/* ── Comments ── */}
                {activeTab === 'comments' && (
                  <>
                    {ticket.comments.length === 0 && (
                      <p className="text-sm text-center py-10" style={{ color: '#777777' }}>No comments yet.</p>
                    )}

                    {ticket.comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl p-4 space-y-2.5"
                        style={c.isInternal
                          ? { background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.22)' }
                          : { background: '#1a1a1a', border: '1px solid #252525' }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(c.author.displayName?.[0] ?? '?').toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold" style={{ color: '#e0e0e0' }}>{c.author.displayName}</span>
                          {c.isInternal && (
                            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ color: '#d97706', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.25)' }}>
                              <Lock className="h-2.5 w-2.5" /> Internal
                            </span>
                          )}
                          <span className="ml-auto text-xs shrink-0" style={{ color: '#777777' }}>
                            {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap pl-9" style={{ color: '#e8e8e8' }}>
                          {c.body}
                        </p>
                      </div>
                    ))}

                    {/* Comment compose box */}
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderLeft: '3px solid #14b8a6' }}
                    >
                      <Textarea
                        placeholder="Write a comment…"
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        rows={3}
                        style={{ background: 'transparent', border: 'none', borderRadius: 0 } as React.CSSProperties}
                      />
                      <div
                        className="flex items-center justify-between px-3 py-2"
                        style={{ borderTop: '1px solid #252525', background: '#161616' }}
                      >
                        {canManage ? (
                          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: '#aaaaaa' }}>
                            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" />
                            Internal note
                          </label>
                        ) : <div />}
                        <Button size="sm" onClick={() => commentMut.mutate()} disabled={!commentBody.trim()} loading={commentMut.isPending}>
                          <Send className="h-3.5 w-3.5" /> Add Comment
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Subtasks ── */}
                {activeTab === 'subtasks' && (
                  <>
                    {/* Progress header */}
                    <div className="rounded-xl px-3.5 py-3 mb-2 flex items-center justify-between" style={{ background: '#151515', border: '1px solid #252525' }}>
                      {(() => {
                        const total = ticket.subtasks.length;
                        const done = ticket.subtasks.filter((s) => s.status === 'DONE').length;
                        const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                        return (
                          <>
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#777777' }}>
                                Subtask Progress
                              </span>
                              <span className="text-xs font-medium" style={{ color: '#e5e5e5' }}>
                                {done} of {total} complete
                              </span>
                            </div>
                            <div className="flex items-center gap-3 w-52">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1f2933' }}>
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${percent}%`,
                                    background:
                                      percent === 100
                                        ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                                        : 'linear-gradient(90deg,#22c55e,#4ade80)',
                                  }}
                                />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#9ca3af' }}>
                                {percent}%
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    {ticket.subtasks.length === 0 && (
                      <p className="text-sm text-center py-10" style={{ color: '#777777' }}>No subtasks yet.</p>
                    )}
                    {ticket.subtasks.map((s) => (
                      <div key={s.id} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: s.status === 'DONE' ? '#555555' : '#f0f0f0', textDecoration: s.status === 'DONE' ? 'line-through' : 'none' }}
                          >
                            {s.title}
                          </p>
                          {s.owner && (
                            <p className="text-xs mt-0.5" style={{ color: '#888888' }}>
                              <User className="inline h-3 w-3 mr-1" />{s.owner.name}
                            </p>
                          )}
                        </div>
                        {s.isRequired && <span className="text-xs font-semibold shrink-0" style={{ color: '#f87171' }}>Required</span>}
                        <SubtaskStatusBadge status={s.status} />
                        {canManage && (
                          <Select value={s.status} onChange={(e) => subtaskStMut.mutate({ subtaskId: s.id, status: e.target.value as SubtaskStatus })} className="w-32 text-xs">
                            <option value="TODO">TODO</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="BLOCKED">Blocked</option>
                            <option value="DONE">Done</option>
                          </Select>
                        )}
                      </div>
                    ))}
                    {canManage && (
                      <div className="rounded-xl p-3 flex gap-2" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
                        <Input
                          placeholder="Add a subtask…"
                          value={newSubtask}
                          onChange={(e) => setNewSubtask(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && newSubtask.trim() && subtaskMut.mutate()}
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => subtaskMut.mutate()} disabled={!newSubtask.trim()} loading={subtaskMut.isPending}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* ── Ticket Submission (form data + attachments) ── */}
                {activeTab === 'submission' && (
                  <>
                    {/* Read-only form data */}
                    <div className="rounded-xl overflow-hidden space-y-1" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
                      <div className="px-4 py-3" style={{ borderBottom: '1px solid #252525' }}>
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#888888' }}>Submission data</span>
                      </div>
                      {formResponses.length === 0 && (
                        <p className="px-4 py-6 text-sm" style={{ color: '#777777' }}>No form data.</p>
                      )}
                      {formResponses.map((r) => (
                        <div key={r.fieldKey} className="flex gap-3 px-4 py-3" style={{ borderTop: '1px solid #222222' }}>
                          <span className="text-sm shrink-0 w-36" style={{ color: '#888888' }}>{r.fieldKey}</span>
                          <span className="text-sm min-w-0 break-words" style={{ color: '#e8e8e8' }}>{r.value ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                    {/* Attachments section */}
                    <div className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
                      <div className="px-4 py-3" style={{ borderBottom: '1px solid #252525' }}>
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#888888' }}>Attachments</span>
                      </div>
                      <div
                        className="mx-4 mt-3 mb-2 rounded-lg p-4 text-center cursor-pointer transition-all"
                        style={{ background: '#161616', border: '2px dashed #2a2a2a' }}
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#14b8a6')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                      >
                        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                        {uploading ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
                            <p className="text-sm text-teal-400 font-medium">Uploading…</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Upload className="h-6 w-6" style={{ color: '#3a3a3a' }} />
                            <p className="text-sm font-medium" style={{ color: '#777777' }}>Click or drag to upload</p>
                            <p className="text-xs" style={{ color: '#555555' }}>Max 25 MB</p>
                          </div>
                        )}
                      </div>
                      {uploadError && (
                        <div className="mx-4 mb-2 rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{uploadError}</div>
                      )}
                      {attachments.length > 0 && (
                        <div className="px-4 pb-4 space-y-1">
                          {attachments.map((att, i) => (
                            <div key={att.id} className="flex items-center gap-3 py-2" style={i > 0 ? { borderTop: '1px solid #222222' } : undefined}>
                              <Paperclip className="h-4 w-4 shrink-0" style={{ color: '#555555' }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>{att.filename}</p>
                                <p className="text-xs" style={{ color: '#888888' }}>{fmt(att.sizeBytes)} · {att.uploadedBy?.name ?? '—'}</p>
                              </div>
                              <button onClick={() => handleDownload(att)} className="p-1.5 rounded transition-colors" style={{ color: '#555555' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#14b8a6')} onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}><Download className="h-4 w-4" /></button>
                              {canManage && <button onClick={() => delAttachMut.mutate(att.id)} className="p-1.5 rounded transition-colors" style={{ color: '#555555' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')} onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}><Trash2 className="h-4 w-4" /></button>}
                            </div>
                          ))}
                        </div>
                      )}
                      {attachments.length === 0 && !uploading && (
                        <p className="px-4 pb-4 text-sm" style={{ color: '#777777' }}>No attachments yet.</p>
                      )}
                    </div>
                  </>
                )}

                {/* ── History ── */}
                {activeTab === 'history' && (
                  <div className="space-y-1">
                    {(historyRes?.data ?? []).length === 0 && (
                      <p className="text-sm text-center py-10" style={{ color: '#777777' }}>No history yet.</p>
                    )}
                    {(historyRes?.data ?? []).map((entry) => (
                      <div key={entry.id} className="flex gap-3 py-2 text-sm" style={{ borderBottom: '1px solid #1a1a1a' }}>
                        <div className="mt-2 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: '#555555' }} />
                        <div>
                          <span className="font-semibold" style={{ color: '#e8e8e8' }}>{entry.actor?.displayName ?? 'System'}</span>
                          {' '}
                          <span style={{ color: '#aaaaaa' }}>{entry.action.toLowerCase().replace(/_/g, ' ')}</span>
                          <span className="block text-xs mt-0.5" style={{ color: '#777777' }}>
                            {format(new Date(entry.createdAt), 'MMM d, yyyy · h:mm a')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
