'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  X, MessageSquare, CheckSquare, Paperclip,
  Clock, Lock, Send, Plus, User, Download, Trash2, Upload, Eye,
} from 'lucide-react';
import { ticketsApi, commentsApi, subtasksApi, usersApi, attachmentsApi } from '@/lib/api';
import type { TicketStatus, SubtaskStatus, Attachment } from '@/types';
import { StatusBadge, PriorityBadge, SubtaskStatusBadge } from '@/components/ui/Badge';
import { SlaBadge, SlaProgressBar } from '@/components/ui/SlaBadge';
import { Button } from '@/components/ui/Button';
import { Select, Textarea, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

// ── Color tokens ────────────────────────────────────────────────────────────
// Tier 1 – primary content    → #f0f0f0
// Tier 2 – secondary content  → #aaaaaa
// Tier 3 – muted / labels     → #666666
// Surfaces: panel #141414, content area #111111, sidebar #0f0f0f, card #1e1e1e

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['TRIAGED', 'CLOSED'],
  TRIAGED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR', 'RESOLVED'],
  WAITING_ON_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  WAITING_ON_VENDOR: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

interface Props {
  ticketId: string | null;
  onClose: () => void;
}

export function TicketDrawer({ ticketId, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const open = !!ticketId;

  const [activeTab, setActiveTab] = useState<'comments' | 'subtasks' | 'attachments' | 'history'>('comments');
  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab('comments');
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

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER',
  });
  const agents = (usersData?.data ?? []);

  const { data: attachmentsRes } = useQuery({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: () => attachmentsApi.list(ticketId!),
    enabled: !!ticketId && activeTab === 'attachments',
  });
  const attachments: Attachment[] = attachmentsRes?.data ?? [];

  const transitionMut = useMutation({ mutationFn: (s: TicketStatus) => ticketsApi.transition(ticketId!, s), onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId] }) });
  const assignMut     = useMutation({ mutationFn: (ownerId: string) => ticketsApi.assign(ticketId!, ownerId || null), onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId] }) });
  const commentMut    = useMutation({ mutationFn: () => commentsApi.create(ticketId!, { body: commentBody, isInternal }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket', ticketId] }); setCommentBody(''); } });
  const subtaskMut    = useMutation({ mutationFn: () => subtasksApi.create(ticketId!, { title: newSubtask }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket', ticketId] }); setNewSubtask(''); } });
  const subtaskStMut  = useMutation({ mutationFn: ({ subtaskId, status }: { subtaskId: string; status: SubtaskStatus }) => subtasksApi.update(ticketId!, subtaskId, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId] }) });
  const watchMut      = useMutation({ mutationFn: () => ticketsApi.watch(ticketId!), onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId] }) });
  const unwatchMut    = useMutation({ mutationFn: () => ticketsApi.unwatch(ticketId!), onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId] }) });
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
  const validTransitions = ticket ? VALID_TRANSITIONS[ticket.status] : [];
  const isWatching = ticket?.watchers.some((w) => w.userId === user?.id) ?? false;

  const TABS = [
    { key: 'comments' as const,    label: `Comments${ticket ? ` (${ticket.comments.length})` : ''}`,  icon: MessageSquare },
    { key: 'subtasks' as const,    label: `Subtasks${ticket ? ` (${ticket.subtasks.length})` : ''}`,   icon: CheckSquare },
    { key: 'attachments' as const, label: 'Attachments', icon: Paperclip },
    { key: 'history' as const,     label: 'History',     icon: Clock },
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
          className="flex items-center justify-between px-6 h-14 shrink-0"
          style={{ background: '#111111', borderBottom: '1px solid #252525' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tracking-wider px-2 py-0.5 rounded" style={{ background: '#1e1e1e', color: '#666666', border: '1px solid #2a2a2a' }}>
              #{ticketId?.slice(0, 8)}
            </span>
            {ticket && (
              <div className="flex items-center gap-2">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} muted={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
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

              {/* Ticket title block */}
              <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid #1e1e1e' }}>
                <h2
                  className="text-xl font-bold leading-snug"
                  style={{ color: '#f0f0f0', letterSpacing: '-0.01em' }}
                >
                  {ticket.title}
                </h2>

                {/* Meta row */}
                <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                  {ticket.category && (
                    <span
                      className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                      style={{ background: '#252525', color: '#e0e0e0', border: '1px solid #333333' }}
                    >
                      {ticket.category.name}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: '#888888' }}>
                    Opened by{' '}
                    <strong style={{ color: '#d0d0d0', fontWeight: 600 }}>{ticket.requester.displayName}</strong>
                    {' · '}
                    {format(new Date(ticket.createdAt), 'MMM d, yyyy · h:mm a')}
                  </span>
                </div>

                {/* Description */}
                {ticket.description && (
                  <p
                    className="mt-3 text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ color: '#d0d0d0' }}
                  >
                    {ticket.description}
                  </p>
                )}
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

                {/* ── Attachments ── */}
                {activeTab === 'attachments' && (
                  <>
                    <div
                      className="rounded-xl p-6 text-center cursor-pointer transition-all"
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
                          <Upload className="h-7 w-7" style={{ color: '#3a3a3a' }} />
                          <p className="text-sm font-medium" style={{ color: '#777777' }}>Click or drag to upload</p>
                          <p className="text-xs" style={{ color: '#555555' }}>Max 25 MB</p>
                        </div>
                      )}
                    </div>
                    {uploadError && (
                      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{uploadError}</div>
                    )}
                    {attachments.length > 0 && (
                      <div className="rounded-xl overflow-hidden" style={{ background: '#1a1a1a', border: '1px solid #252525' }}>
                        {attachments.map((att, i) => (
                          <div key={att.id} className="flex items-center gap-3 px-4 py-3" style={i > 0 ? { borderTop: '1px solid #222222' } : undefined}>
                            <Paperclip className="h-4 w-4 shrink-0" style={{ color: '#555555' }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>{att.filename}</p>
                              <p className="text-xs" style={{ color: '#888888' }}>{fmt(att.sizeBytes)} · {att.uploadedBy.name}</p>
                            </div>
                            <button onClick={() => handleDownload(att)} className="p-1.5 rounded transition-colors" style={{ color: '#555555' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#14b8a6')} onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}><Download className="h-4 w-4" /></button>
                            {canManage && <button onClick={() => delAttachMut.mutate(att.id)} className="p-1.5 rounded transition-colors" style={{ color: '#555555' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')} onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}><Trash2 className="h-4 w-4" /></button>}
                          </div>
                        ))}
                      </div>
                    )}
                    {attachments.length === 0 && !uploading && (
                      <p className="text-sm text-center py-4" style={{ color: '#777777' }}>No attachments yet.</p>
                    )}
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

            {/* ── Right sidebar ─────────────────────────────────────────── */}
            <div
              className="w-60 shrink-0 flex flex-col overflow-y-auto py-4 px-3 gap-3"
              style={{ background: '#0f0f0f', borderLeft: '1px solid #1e1e1e' }}
            >
              {/* Status transitions */}
              {canManage && validTransitions.length > 0 && (
                <SideSection label="Move to">
                  <div className="flex flex-col gap-1.5">
                    {validTransitions.map((status) => (
                      <Button
                        key={status}
                        variant="secondary"
                        size="sm"
                        loading={transitionMut.isPending}
                        onClick={() => transitionMut.mutate(status)}
                        className="justify-start text-xs"
                      >
                        <StatusBadge status={status} />
                      </Button>
                    ))}
                  </div>
                </SideSection>
              )}

              {/* Assignment */}
              {canManage && (
                <SideSection label="Assigned to">
                  <AssigneeSelector
                    currentOwner={ticket.owner ? { id: ticket.owner.id, displayName: ticket.owner.displayName ?? ticket.owner.name ?? ticket.owner.email } : undefined}
                    agents={agents}
                    onAssign={(ownerId) => assignMut.mutate(ownerId ?? '')}
                  />
                </SideSection>
              )}

              {/* SLA */}
              {ticket.sla && (
                <SideSection label="SLA">
                  <div className="space-y-2.5">
                    <SlaBadge sla={ticket.sla} showTime={ticket.sla.status !== 'RESOLVED'} />
                    <SlaProgressBar sla={ticket.sla} />
                    <div className="space-y-1 text-xs" style={{ color: '#888888' }}>
                      <div className="flex justify-between"><span>Target</span><span style={{ color: '#e0e0e0' }}>{ticket.sla.targetHours}h</span></div>
                      <div className="flex justify-between"><span>Elapsed</span><span style={{ color: '#e0e0e0' }}>{ticket.sla.elapsedHours.toFixed(1)}h</span></div>
                      {ticket.sla.status !== 'RESOLVED' && ticket.sla.remainingHours > 0 && (
                        <div className="flex justify-between"><span>Remaining</span><span style={{ color: '#e0e0e0' }}>{ticket.sla.remainingHours.toFixed(1)}h</span></div>
                      )}
                    </div>
                  </div>
                </SideSection>
              )}

              {/* Details */}
              <SideSection label="Details">
                <div className="space-y-2 text-xs">
                  {[
                    ticket.studio  && { label: 'Studio',   value: ticket.studio.name },
                    ticket.market  && { label: 'Market',   value: ticket.market.name },
                    { label: 'Created',  value: format(new Date(ticket.createdAt), 'MMM d, yyyy') },
                    ticket.resolvedAt && { label: 'Resolved', value: format(new Date(ticket.resolvedAt), 'MMM d, yyyy') },
                  ].filter(Boolean).map((row) => row && (
                    <div key={row.label} className="flex justify-between gap-2">
                      <span style={{ color: '#888888' }}>{row.label}</span>
                      <span style={{ color: '#e0e0e0', textAlign: 'right' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </SideSection>

              {/* Watchers */}
              <SideSection label="Watchers">
                {ticket.watchers.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {ticket.watchers.map((w) => (
                      <span key={w.userId} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#222222', color: '#d0d0d0', border: '1px solid #2a2a2a' }}>
                        {w.user.displayName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs mb-2" style={{ color: '#888888' }}>No watchers</p>
                )}
                <Button variant="ghost" size="sm" onClick={() => isWatching ? unwatchMut.mutate() : watchMut.mutate()} className="w-full">
                  <Eye className="h-3.5 w-3.5" />
                  {isWatching ? 'Unwatch' : 'Watch'}
                </Button>
              </SideSection>
            </div>
          </div>
        )}
      </div>
  );
}

// ── Sidebar section wrapper ─────────────────────────────────────────────────
function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3.5 space-y-2.5" style={{ background: '#1a1a1a', border: '1px solid #242424' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#666666' }}>{label}</p>
      {children}
    </div>
  );
}

interface AssigneeSelectorProps {
  currentOwner: { id: string; displayName: string } | null | undefined;
  agents: Array<{ id: string; displayName: string }>;
  onAssign: (ownerId: string | null) => void;
}

function AssigneeSelector({ currentOwner, agents, onAssign }: AssigneeSelectorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const displayLabel = currentOwner?.displayName ?? 'Unassigned';
  const filtered = agents.filter((a) => {
    const name = (a.displayName ?? '').toLowerCase();
    return name.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-1">
      <div
        className="rounded-lg px-2 py-1 text-xs"
        style={{ background: '#111111', border: '1px solid #2a2a2a', color: '#999999' }}
      >
        Current: <span style={{ color: '#e5e5e5' }}>{displayLabel}</span>
      </div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Type a name…"
          className="w-full rounded-md px-3 py-1.5 text-sm bg-[#111111] text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ border: '1px solid #2a2a2a' }}
        />
        {open && (
          <div
            className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md shadow-lg text-sm"
            style={{ background: '#111111', border: '1px solid #2a2a2a' }}
          >
            <button
              type="button"
              onClick={() => { onAssign(null); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#222222] text-gray-300"
            >
              Unassigned
            </button>
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onAssign(a.id); setQuery(''); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#222222] text-gray-300"
              >
                {a.displayName}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-1.5 text-gray-500">
                No matches
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
