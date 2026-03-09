'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft, MessageSquare, CheckSquare, Clock,
  Send, Plus, User, Paperclip, Download, Trash2, Upload,
} from 'lucide-react';
import { ticketsApi, commentsApi, subtasksApi, usersApi, attachmentsApi } from '@/lib/api';
import type { TicketStatus, SubtaskStatus, Attachment } from '@/types';
import { Header } from '@/components/layout/Header';
import { SubtaskStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, Textarea, Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['TRIAGED', 'CLOSED'],
  TRIAGED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_ON_REQUESTER', 'WAITING_ON_VENDOR', 'RESOLVED'],
  WAITING_ON_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  WAITING_ON_VENDOR: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

// Reusable dark panel style
const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };
const panelSection = { borderTop: '1px solid #2a2a2a' };

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [activeTab, setActiveTab] = useState<'subtasks' | 'comments' | 'submission' | 'history'>('subtasks');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ticketRes, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(id),
  });
  const ticket = ticketRes?.data;

  // Stage 6: deep link to subtask from #subtask-xxx or ?subtask=xxx
  useEffect(() => {
    if (!ticket) return;
    const fromQuery = searchParams.get('subtask');
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const fromHash = hash.startsWith('#subtask-') ? hash.slice('#subtask-'.length) : null;
    const subtaskId = fromQuery ?? fromHash;
    if (!subtaskId) return;
    const hasSubtask = ticket.subtasks.some((s) => s.id === subtaskId);
    if (!hasSubtask) return;
    setActiveTab('subtasks');
    const scrollToSubtask = () => {
      const el = document.getElementById(`subtask-${subtaskId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    const t = setTimeout(scrollToSubtask, 100);
    return () => clearTimeout(t);
  }, [ticket, searchParams]);

  const { data: subtasksListRes } = useQuery({
    queryKey: ['ticket', id, 'subtasks'],
    queryFn: () => subtasksApi.list(id),
    enabled: activeTab === 'subtasks' && !!id,
  });
  const subtasksList = subtasksListRes?.data ?? null;

  const { data: historyRes } = useQuery({
    queryKey: ['ticket', id, 'history'],
    queryFn: () => ticketsApi.history(id),
    enabled: activeTab === 'history',
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER',
  });
  const agents = (usersData?.data ?? []).filter((u) => u.role === 'DEPARTMENT_USER' || u.role === 'ADMIN');

  const transitionMut = useMutation({
    mutationFn: (status: TicketStatus) => ticketsApi.transition(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const assignMut = useMutation({
    mutationFn: (ownerId: string) => ticketsApi.assign(id, ownerId || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const commentMut = useMutation({
    mutationFn: () => commentsApi.create(id, { body: commentBody, isInternal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      setCommentBody('');
    },
  });

  const subtaskMut = useMutation({
    mutationFn: () => subtasksApi.create(id, { title: newSubtask }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['ticket', id, 'subtasks'] });
      setNewSubtask('');
    },
  });

  const subtaskStatusMut = useMutation({
    mutationFn: ({ subtaskId, status }: { subtaskId: string; status: SubtaskStatus }) =>
      subtasksApi.update(id, subtaskId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['ticket', id, 'subtasks'] });
    },
  });

  const watchMut = useMutation({
    mutationFn: () => ticketsApi.watch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const unwatchMut = useMutation({
    mutationFn: () => ticketsApi.unwatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const { data: attachmentsRes } = useQuery({
    queryKey: ['ticket', id, 'attachments'],
    queryFn: () => attachmentsApi.list(id),
    enabled: activeTab === 'submission' && !!id,
  });
  const attachments: Attachment[] = attachmentsRes?.data ?? [];

  const deleteAttachmentMut = useMutation({
    mutationFn: (attachmentId: string) => attachmentsApi.delete(attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id, 'attachments'] }),
  });

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const urlRes = await attachmentsApi.requestUploadUrl(id, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      const { uploadUrl, s3Key } = urlRes.data;
      await attachmentsApi.uploadToS3(uploadUrl, file);
      await attachmentsApi.confirmUpload(id, {
        s3Key,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      qc.invalidateQueries({ queryKey: ['ticket', id, 'attachments'] });
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const res = await attachmentsApi.getDownloadUrl(attachment.id);
      window.open(res.data.downloadUrl, '_blank');
    } catch {
      // no-op
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: '#000000' }}>
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
      </div>
    );
  }

  if (!ticket) {
    return <div className="p-6" style={{ color: '#666666' }}>Ticket not found.</div>;
  }

  const canManage = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const isStudioUser = user?.role === 'STUDIO_USER';
  const validTransitions = VALID_TRANSITIONS[ticket.status];
  const isWatching = ticket.watchers.some((w) => w.userId === user?.id);
  // Studio users see only non-internal comments (backend also filters on list endpoint; detail includes all, so filter here)
  const visibleComments = isStudioUser
    ? (ticket.comments ?? []).filter((c) => !(c as { isInternal?: boolean }).isInternal)
    : (ticket.comments ?? []);

  const subtaskDone = (ticket.subtasks ?? []).filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length;
  const subtaskTotal = (ticket.subtasks ?? []).length;
  const formResponses = (ticket as { formResponses?: { fieldKey: string; value: string }[] }).formResponses ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="Ticket" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-5">
          <Button variant="ghost" size="sm" onClick={() => router.push(isStudioUser ? '/portal' : '/tickets')}>
            <ArrowLeft className="h-4 w-4" />
            {isStudioUser ? 'Back to My Tickets' : 'Back to tickets'}
          </Button>

          {/* Stage 22: header — title, created, requester, location, progress; ticket ID demoted */}
          <div className="rounded-xl p-5 space-y-2" style={panel}>
            <h1 className="text-xl font-semibold text-gray-100">{ticket.title}</h1>
            <p className="text-sm" style={{ color: '#888888' }}>
              Created {format(new Date(ticket.createdAt), 'MMM d')} • Requested by {ticket.requester.displayName}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {(ticket as { studio?: { name: string } }).studio?.name && (
                <span style={{ color: '#666666' }}>{(ticket as { studio: { name: string } }).studio.name}</span>
              )}
              <span className="text-xs font-medium tabular-nums" style={{ color: '#14b8a6' }}>
                Progress {subtaskDone} / {subtaskTotal}
              </span>
            </div>
            <p className="text-xs" style={{ color: '#555555' }}>
              Ticket #{ticket.id.slice(0, 8)}
            </p>
          </div>

          {/* Tabs: Subtasks, Comments, Ticket Submission, History */}
          <div style={{ borderBottom: '1px solid #2a2a2a' }}>
            <nav className="flex gap-6">
              {(['subtasks', 'comments', 'submission', 'history'] as const).map((tab) => {
                const icons = {
                  subtasks: <CheckSquare className="h-4 w-4" />,
                  comments: <MessageSquare className="h-4 w-4" />,
                  submission: <User className="h-4 w-4" />,
                  history: <Clock className="h-4 w-4" />,
                };
                const labels = {
                  subtasks: `Subtasks (${ticket.subtasks?.length ?? 0})`,
                  comments: `Comments (${visibleComments.length})`,
                  submission: 'Ticket Submission',
                  history: 'History',
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="pb-3 text-sm font-medium border-b-2 transition-colors"
                    style={{
                      borderBottomColor: activeTab === tab ? '#14b8a6' : 'transparent',
                      color: activeTab === tab ? '#14b8a6' : '#666666',
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {icons[tab]}
                      {labels[tab]}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

            {/* ── Conversation (Updates & Replies) ─── */}
            {activeTab === 'comments' && (
              <div className="space-y-4">
                {visibleComments.length === 0 && (
                  <p className="text-sm text-center py-6" style={{ color: '#555555' }}>
                    {isStudioUser ? 'No updates yet.' : 'No replies yet.'}
                  </p>
                )}
                {visibleComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl p-4 space-y-2"
                    style={(comment as { isInternal?: boolean }).isInternal
                      ? { background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }
                      : panel}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-semibold">
                        {((comment.author as { displayName?: string; name?: string }).displayName ?? (comment.author as { displayName?: string; name?: string }).name ?? '?')[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-200">
                        {(comment.author as { displayName?: string; name?: string }).displayName ?? (comment.author as { displayName?: string; name?: string }).name ?? '—'}
                      </span>
                      {!isStudioUser && (comment as { isInternal?: boolean }).isInternal && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: '#d97706', background: 'rgba(234,179,8,0.15)' }}>
                          [Internal]
                        </span>
                      )}
                      <span className="ml-auto text-xs" style={{ color: '#555555' }}>
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: '#cccccc' }}>{comment.body}</p>
                  </div>
                ))}

                {/* Add reply: studio = studio-visible only; dept/admin = studio-visible reply or internal note */}
                <div className="rounded-xl p-4 space-y-3" style={panel}>
                  <Textarea
                    placeholder={isStudioUser ? 'Add an update...' : 'Reply (visible to studio) or check Internal note below...'}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    {canManage && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#888888' }}>
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="rounded"
                        />
                        Internal note (not visible to studio)
                      </label>
                    )}
                    <Button
                      size="sm"
                      onClick={() => commentMut.mutate()}
                      disabled={!commentBody.trim()}
                      loading={commentMut.isPending}
                      className="ml-auto"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {canManage ? (isInternal ? 'Add internal note' : 'Reply') : 'Add update'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Subtasks (Workflow Progress) ─── */}
            {activeTab === 'subtasks' && (
              <div className="space-y-3">
                {/* Progress header */}
                <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: '#111111', border: '1px solid #262626' }}>
                  {(() => {
                    const list = subtasksList ?? ticket.subtasks;
                    const total = list.length;
                    const done = list.filter((s) => s.status === 'DONE' || s.status === 'SKIPPED').length;
                    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                    return (
                      <>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#777777' }}>
                            Workflow Progress
                          </span>
                          <span className="text-sm font-medium" style={{ color: '#e5e5e5' }}>
                            {done} of {total} complete
                          </span>
                        </div>
                        <div className="flex items-center gap-3 w-64">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#1f2933' }}>
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
                          <span className="text-xs font-semibold tabular-nums" style={{ color: '#9ca3af' }}>
                            {percent}%
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {(subtasksList ?? ticket.subtasks).length === 0 && (
                  <p className="text-sm text-center py-6" style={{ color: '#555555' }}>No subtasks yet.</p>
                )}
                {(subtasksList ?? ticket.subtasks).map((subtask) => (
                  <div key={subtask.id} id={`subtask-${subtask.id}`} className="rounded-xl p-3 flex flex-wrap items-center gap-3" style={panel}>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', subtask.status === 'DONE' || subtask.status === 'SKIPPED' ? 'line-through' : 'text-gray-200')}
                        style={subtask.status === 'DONE' || subtask.status === 'SKIPPED' ? { color: '#555555', textDecoration: 'line-through' } : undefined}>
                        {subtask.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs" style={{ color: '#555555' }}>
                        {'department' in subtask && subtask.department && (
                          <span>{subtask.department.name}</span>
                        )}
                        {'owner' in subtask && subtask.owner && (
                          <span><User className="inline h-3 w-3 mr-1" />{subtask.owner.name}</span>
                        )}
                        {'dependencyFrom' in subtask && Array.isArray(subtask.dependencyFrom) && subtask.dependencyFrom.length > 0 && subtask.status === 'LOCKED' && (
                          <span className="text-amber-400">Blocked by dependency</span>
                        )}
                      </div>
                    </div>
                    {subtask.isRequired && (
                      <span className="text-xs font-medium shrink-0" style={{ color: '#f87171' }}>Required</span>
                    )}
                    <SubtaskStatusBadge status={subtask.status} />
                    {canManage && !['LOCKED'].includes(subtask.status) && (
                      <Select
                        value={subtask.status}
                        onChange={(e) =>
                          subtaskStatusMut.mutate({ subtaskId: subtask.id, status: e.target.value as SubtaskStatus })
                        }
                        className="w-36 text-xs"
                      >
                        <option value="READY">Ready</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="BLOCKED">Blocked</option>
                        <option value="DONE">Done</option>
                        <option value="SKIPPED">Skipped</option>
                      </Select>
                    )}
                  </div>
                ))}

                {canManage && (
                  <div className="rounded-xl p-3 flex gap-2" style={panel}>
                    <Input
                      placeholder="Add a subtask..."
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && newSubtask.trim() && subtaskMut.mutate()}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => subtaskMut.mutate()}
                      disabled={!newSubtask.trim()}
                      loading={subtaskMut.isPending}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Ticket Submission (read-only form data + attachments) ─── */}
            {activeTab === 'submission' && (
              <div className="space-y-4">
                {formResponses.length > 0 ? (
                  <div className="rounded-xl p-4 space-y-2" style={panel}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Submitted form data</p>
                    <dl className="space-y-1.5 text-sm">
                      {formResponses.map((r) => (
                        <div key={r.fieldKey} className="flex gap-2">
                          <dt className="shrink-0" style={{ color: '#888888' }}>
                            {r.fieldKey.split('_').join(' ').split(' ').map((s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '')).join(' ')}:
                          </dt>
                          <dd className="min-w-0 text-gray-200 break-words">{r.value || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <p className="text-sm py-4" style={{ color: '#555555' }}>No submitted form data.</p>
                )}

                <div className="rounded-xl p-4 space-y-3" style={panel}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Attachments</p>
                  <div
                    className="rounded-lg p-6 text-center cursor-pointer transition-colors"
                    style={{ background: '#111111', border: '2px dashed #333333' }}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#14b8a6')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333333')}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileUpload(file);
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
                        <p className="text-sm font-medium text-teal-400">Uploading…</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8" style={{ color: '#444444' }} />
                        <p className="text-sm font-medium" style={{ color: '#888888' }}>Click to upload or drag &amp; drop</p>
                        <p className="text-xs" style={{ color: '#555555' }}>Any file type · Max 25 MB</p>
                      </div>
                    )}
                  </div>
                  {uploadError && (
                    <div className="rounded-lg px-4 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                      {uploadError}
                    </div>
                  )}
                  {attachments.length === 0 && !uploading ? (
                    <p className="text-sm text-center py-2" style={{ color: '#555555' }}>No attachments yet.</p>
                  ) : (
                    <div className="rounded-lg overflow-hidden" style={{ background: '#111111', border: '1px solid #2a2a2a' }}>
                      {attachments.map((att, i) => (
                        <div key={att.id} className="flex items-center gap-3 px-4 py-3" style={i > 0 ? panelSection : undefined}>
                          <Paperclip className="h-4 w-4 shrink-0" style={{ color: '#555555' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-200 truncate">{att.filename}</p>
                            <p className="text-xs" style={{ color: '#555555' }}>{formatBytes(att.sizeBytes)} · {att.uploadedBy.name}</p>
                          </div>
                          <button type="button" onClick={() => handleDownload(att)} className="p-1.5 rounded transition-colors" style={{ color: '#555555' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#14b8a6')} onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')} title="Download">
                            <Download className="h-4 w-4" />
                          </button>
                          {canManage && (
                            <button type="button" onClick={() => deleteAttachmentMut.mutate(att.id)} disabled={deleteAttachmentMut.isPending} className="p-1.5 rounded transition-colors" style={{ color: '#555555' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')} onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── History ─── */}
            {activeTab === 'history' && (
              <div className="space-y-2">
                {(historyRes?.data ?? []).length === 0 && (
                  <p className="text-sm text-center py-6" style={{ color: '#555555' }}>No history yet.</p>
                )}
                {(historyRes?.data ?? []).map((entry) => (
                  <div key={entry.id} className="flex gap-3 text-sm">
                    <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: '#333333' }} />
                    <div>
                      <span className="font-medium text-gray-300">{entry.actor?.displayName ?? 'System'}</span>
                      {' '}
                      <span style={{ color: '#666666' }}>{entry.action.toLowerCase().split('_').join(' ')}</span>
                      <span className="block text-xs" style={{ color: '#555555' }}>
                        {format(new Date(entry.createdAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
