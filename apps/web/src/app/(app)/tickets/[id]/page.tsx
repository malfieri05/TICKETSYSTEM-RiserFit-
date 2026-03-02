'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft, MessageSquare, CheckSquare, Eye, Clock,
  Lock, Send, Plus, User, Paperclip, Download, Trash2, Upload,
} from 'lucide-react';
import { ticketsApi, commentsApi, subtasksApi, usersApi, attachmentsApi } from '@/lib/api';
import type { TicketStatus, SubtaskStatus, Attachment } from '@/types';
import { Header } from '@/components/layout/Header';
import { StatusBadge, PriorityBadge, SubtaskStatusBadge } from '@/components/ui/Badge';
import { SlaBadge, SlaProgressBar } from '@/components/ui/SlaBadge';
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

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'subtasks' | 'attachments' | 'history'>('comments');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ticketRes, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(id),
  });
  const ticket = ticketRes?.data;

  const { data: historyRes } = useQuery({
    queryKey: ['ticket', id, 'history'],
    queryFn: () => ticketsApi.history(id),
    enabled: activeTab === 'history',
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: user?.role === 'ADMIN' || user?.role === 'AGENT',
  });
  const agents = (usersData?.data ?? []).filter((u) => u.role === 'AGENT' || u.role === 'ADMIN');

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
      setNewSubtask('');
    },
  });

  const subtaskStatusMut = useMutation({
    mutationFn: ({ subtaskId, status }: { subtaskId: string; status: SubtaskStatus }) =>
      subtasksApi.update(id, subtaskId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const watchMut = useMutation({
    mutationFn: () => ticketsApi.watch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  const unwatchMut = useMutation({
    mutationFn: () => ticketsApi.unwatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  });

  // ── Attachments ────────────────────────────────────────────────────────────

  const { data: attachmentsRes } = useQuery({
    queryKey: ['ticket', id, 'attachments'],
    queryFn: () => attachmentsApi.list(id),
    enabled: activeTab === 'attachments',
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
      // Step 1: get presigned upload URL
      const urlRes = await attachmentsApi.requestUploadUrl(id, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      const { uploadUrl, s3Key } = urlRes.data;

      // Step 2: upload directly to S3
      await attachmentsApi.uploadToS3(uploadUrl, file);

      // Step 3: confirm with API to save DB record
      await attachmentsApi.confirmUpload(id, {
        s3Key,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });

      qc.invalidateQueries({ queryKey: ['ticket', id, 'attachments'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setUploadError(msg);
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
      // no-op: presigned URL fetch failed
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!ticket) {
    return <div className="p-6 text-gray-500">Ticket not found.</div>;
  }

  const canManage = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const validTransitions = VALID_TRANSITIONS[ticket.status];
  const isWatching = ticket.watchers.some((w) => w.userId === user?.id);

  return (
    <div className="flex flex-col h-full">
      <Header title={`Ticket #${ticket.id.slice(0, 8)}`} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 flex gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-5">
            <Button variant="ghost" size="sm" onClick={() => router.push('/tickets')}>
              <ArrowLeft className="h-4 w-4" />
              Back to tickets
            </Button>

            {/* Ticket header */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-start gap-3 flex-wrap">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                {ticket.category && (
                  <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">
                    {ticket.category.name}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-semibold text-gray-900">{ticket.title}</h1>
              {ticket.description && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{ticket.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-400 pt-1">
                <span>Opened by <strong className="text-gray-600">{ticket.requester.displayName}</strong></span>
                <span>{format(new Date(ticket.createdAt), 'MMM d, yyyy h:mm a')}</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="flex gap-6">
                <button
                  onClick={() => setActiveTab('comments')}
                  className={cn(
                    'pb-3 text-sm font-medium border-b-2 transition-colors',
                    activeTab === 'comments'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" />
                    Comments ({ticket.comments.length})
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('subtasks')}
                  className={cn(
                    'pb-3 text-sm font-medium border-b-2 transition-colors',
                    activeTab === 'subtasks'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <CheckSquare className="h-4 w-4" />
                    Subtasks ({ticket.subtasks.length})
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('attachments')}
                  className={cn(
                    'pb-3 text-sm font-medium border-b-2 transition-colors',
                    activeTab === 'attachments'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4" />
                    Attachments
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className={cn(
                    'pb-3 text-sm font-medium border-b-2 transition-colors',
                    activeTab === 'history'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    History
                  </span>
                </button>
              </nav>
            </div>

            {/* Comments tab */}
            {activeTab === 'comments' && (
              <div className="space-y-4">
                {ticket.comments.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No comments yet.</p>
                )}
                {ticket.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={cn(
                      'bg-white rounded-xl border p-4 space-y-2',
                      comment.isInternal ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
                        {comment.author.displayName[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{comment.author.displayName}</span>
                      {comment.isInternal && (
                        <span className="flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                          <Lock className="h-3 w-3" /> Internal
                        </span>
                      )}
                      <span className="ml-auto text-xs text-gray-400">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                  </div>
                ))}

                {/* Add comment */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                  <Textarea
                    placeholder="Write a comment..."
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    {canManage && (
                      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="rounded"
                        />
                        Internal note
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
                      Add Comment
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Subtasks tab */}
            {activeTab === 'subtasks' && (
              <div className="space-y-3">
                {ticket.subtasks.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No subtasks yet.</p>
                )}
                {ticket.subtasks.map((subtask) => (
                  <div key={subtask.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', subtask.status === 'DONE' && 'line-through text-gray-400')}>
                        {subtask.title}
                      </p>
                      {subtask.owner && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          <User className="inline h-3 w-3 mr-1" />{subtask.owner.displayName}
                        </p>
                      )}
                    </div>
                    {subtask.isRequired && (
                      <span className="text-xs text-red-600 font-medium shrink-0">Required</span>
                    )}
                    <SubtaskStatusBadge status={subtask.status} />
                    {canManage && (
                      <Select
                        value={subtask.status}
                        onChange={(e) =>
                          subtaskStatusMut.mutate({ subtaskId: subtask.id, status: e.target.value as SubtaskStatus })
                        }
                        className="w-36 text-xs"
                      >
                        <option value="TODO">TODO</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="BLOCKED">Blocked</option>
                        <option value="DONE">Done</option>
                      </Select>
                    )}
                  </div>
                ))}

                {canManage && (
                  <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-2">
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

            {/* Attachments tab */}
            {activeTab === 'attachments' && (
              <div className="space-y-4">
                {/* Upload area */}
                <div
                  className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                  onClick={() => !uploading && fileInputRef.current?.click()}
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
                      <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 border-t-transparent" />
                      <p className="text-sm text-indigo-600 font-medium">Uploading…</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-gray-300" />
                      <p className="text-sm font-medium text-gray-600">
                        Click to upload or drag &amp; drop
                      </p>
                      <p className="text-xs text-gray-400">Any file type · Max 25 MB</p>
                    </div>
                  )}
                </div>

                {uploadError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
                    {uploadError}
                  </div>
                )}

                {/* File list */}
                {attachments.length === 0 && !uploading ? (
                  <p className="text-sm text-gray-400 text-center py-4">No attachments yet.</p>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-3 px-4 py-3">
                        <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{att.filename}</p>
                          <p className="text-xs text-gray-400">
                            {formatBytes(att.sizeBytes)} · uploaded by {att.uploadedBy.name}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownload(att)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50 transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {canManage && (
                          <button
                            onClick={() => deleteAttachmentMut.mutate(att.id)}
                            disabled={deleteAttachmentMut.isPending}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* History tab */}
            {activeTab === 'history' && (
              <div className="space-y-2">
                {(historyRes?.data ?? []).map((entry) => (
                  <div key={entry.id} className="flex gap-3 text-sm">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-gray-300 shrink-0" />
                    <div>
                      <span className="font-medium text-gray-700">{entry.actor?.displayName ?? 'System'}</span>
                      {' '}
                      <span className="text-gray-500">{entry.action.toLowerCase().replace(/_/g, ' ')}</span>
                      <span className="block text-xs text-gray-400">
                        {format(new Date(entry.createdAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                  </div>
                ))}
                {(historyRes?.data ?? []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No history yet.</p>
                )}
              </div>
            )}
          </div>

          {/* Sidebar panel */}
          <div className="w-64 shrink-0 space-y-4">
            {/* Status transition */}
            {canManage && validTransitions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Move to</p>
                <div className="flex flex-col gap-1.5">
                  {validTransitions.map((status) => (
                    <Button
                      key={status}
                      variant="secondary"
                      size="sm"
                      loading={transitionMut.isPending}
                      onClick={() => transitionMut.mutate(status)}
                      className="justify-start"
                    >
                      <StatusBadge status={status} />
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Assignment */}
            {canManage && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned to</p>
                <Select
                  value={ticket.owner?.id ?? ''}
                  onChange={(e) => assignMut.mutate(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.displayName}</option>
                  ))}
                </Select>
              </div>
            )}

            {/* SLA Status */}
            {ticket.sla && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SLA</p>
                  <SlaBadge sla={ticket.sla} showTime={ticket.sla.status !== 'RESOLVED'} />
                </div>
                <SlaProgressBar sla={ticket.sla} />
                <div className="text-xs text-gray-400 space-y-0.5">
                  <div>Target: {ticket.sla.targetHours}h resolution</div>
                  <div>Elapsed: {ticket.sla.elapsedHours.toFixed(1)}h</div>
                  {ticket.sla.status !== 'RESOLVED' && ticket.sla.remainingHours > 0 && (
                    <div>Remaining: {ticket.sla.remainingHours.toFixed(1)}h</div>
                  )}
                </div>
              </div>
            )}

            {/* Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</p>
              <div className="space-y-2 text-gray-600">
                {ticket.studio && <div><span className="text-gray-400">Studio:</span> {ticket.studio.name}</div>}
                {ticket.market && <div><span className="text-gray-400">Market:</span> {ticket.market.name}</div>}
                <div><span className="text-gray-400">Created:</span> {format(new Date(ticket.createdAt), 'MMM d, yyyy')}</div>
                {ticket.resolvedAt && <div><span className="text-gray-400">Resolved:</span> {format(new Date(ticket.resolvedAt), 'MMM d, yyyy')}</div>}
              </div>
            </div>

            {/* Watchers */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Watchers</p>
              {ticket.watchers.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {ticket.watchers.map((w) => (
                    <span key={w.userId} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {w.user.displayName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No watchers</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => isWatching ? unwatchMut.mutate() : watchMut.mutate()}
                className="w-full mt-1"
              >
                <Eye className="h-3.5 w-3.5" />
                {isWatching ? 'Unwatch' : 'Watch'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
